/**
 * 家庭 Agent — 主入口（多 Bot 架构）
 */

import path from 'node:path';
import dotenv from 'dotenv';
process.on('unhandledRejection', (r) => console.error('未处理异常:', r?.message || r));
process.on('uncaughtException', (e) => console.error('未捕获异常:', e.message));

import express from 'express';
import { initDB } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { initAgent } from './agent/core.js';
import { createBotsPool } from './wechat/client.js';
import { startCron } from './cron/index.js';
import { router as wechatRouter } from './api/wechat.js';
import { paths, logPaths } from './api/paths.js';
import { runStartupScan, walk as scanWalk, indexFile as scanIndexFile, cleanupOrphans } from './agent/startupScan.js';

// 配置加载顺序：
// 1) 项目根 .env（旧部署兼容）
// 2) 平台默认路径 .env（开发模式 ./config/.env、桌面端 ~/Library/.../config/.env、Docker /config/.env）
//    override: true 让平台路径优先于项目根 .env
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: paths.envFile, override: true });

logPaths();
const db = await initDB(paths.dbFile);
runMigrations(db);
const agent = await initAgent(db);

// 启动扫描：后台跑，不阻塞首条消息
runStartupScan(db, paths).catch((e) => console.error('❌ 启动扫描失败:', e.message));

// 多 Bot 池
const pool = createBotsPool();
pool.setDB(db);

// 任何成员登录成功时触发
pool.onReady(async ({ memberId, memberName, creds }) => {
  const userId = creds?.userId;
  if (!memberName || !userId) return;

  // 关联 wxid
  const existing = db.get('SELECT id FROM members WHERE id = ?', [memberId]);
  if (existing) {
    db.exec('UPDATE members SET wxid = ? WHERE id = ?', [userId, memberId]);
    console.log(`✅ ${memberName} 已绑定: ${userId}`);
  }

  // 新绑定的成员：启动消息监听
  await pool.startAfterBind(memberId);
});

// 消息处理（回复异步，不阻塞后续消息）
pool.onMessage(async (msg) => {
  const t0 = Date.now();

  // 流式状态
  let placeholderSent = false;
  let finalText = '';
  let accumulated = ''; // 累积 LLM delta

  async function sendIntermediate(text) {
    placeholderSent = true;
    try { await pool.reply(msg, text); } catch (e) { console.error('中间回复失败:', e.message); }
  }

  async function sendFinal(text) {
    finalText = text;
    if (!text) return;

    // 长回复分片：微信单消息限制约 2000 字符
    const MAX_LEN = 1800;
    const chunks = [];
    let remaining = text;
    while (remaining.length > MAX_LEN) {
      // 在最近的换行符或句号处切分
      let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
      if (splitAt < MAX_LEN * 0.5) splitAt = remaining.lastIndexOf('。', MAX_LEN);
      if (splitAt < MAX_LEN * 0.5) splitAt = MAX_LEN;
      chunks.push(remaining.slice(0, splitAt + 1));
      remaining = remaining.slice(splitAt + 1);
    }
    if (remaining) chunks.push(remaining);

    for (const chunk of chunks) {
      console.log(`📤 [${msg.memberName}] 调用 pool.reply: ${chunk.slice(0, 60)}`);
      try {
        await pool.reply(msg, chunk);
        console.log(`✅ [${msg.memberName}] pool.reply 成功`);
      } catch (e) {
        console.error(`❌ [${msg.memberName}] 回复失败:`, e.message);
      }
    }
  }

  // 预留接口位置（当前不发中间状态，避免产生重复消息）
  function scheduleIntermediate() {
    // 当前策略：不发中间状态，避免“抱抱”、“抱歉”这种碎屝被多次推送
    // 后续可根据场景重新启用流式
  }

  // 从回复里抽 [SEND_FILE:id=X,name=Y] 标记、发文件
  async function maybeSendFiles(text) {
    const re = /\[SEND_FILE:id=(\d+),name=([^\]]+)\]/g;
    let match;
    const sent = [];
    while ((match = re.exec(text)) !== null) {
      const id = parseInt(match[1]);
      const name = match[2];
      const row = db.get('SELECT * FROM files WHERE id = ?', [id]);
      if (!row) continue;
      try {
        const fs = await import('node:fs/promises');
        const data = await fs.readFile(row.path);
        // 判断是否是图片（用 caption 带说明）
        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name || row.name);
        if (isImage) {
          await pool.reply(msg, { image: data, caption: name || row.name });
        } else {
          await pool.reply(msg, { file: data, fileName: name || row.name });
        }
        sent.push(match[0]);
      } catch (e) {
        console.error('发文件失败:', e.message);
      }
    }
    // 从文本里除掉标记
    return text.replace(re, '').trim();
  }

  try {
    const reply = await agent.handle(msg, {
      onDelta: (delta) => { accumulated += delta; scheduleIntermediate(); },
      onIntermediate: (text) => sendIntermediate(text),
      onFinal: (text) => { /* fallback 会调，这里是预留 */ },
    });
    const t1 = Date.now();

    if (reply) {
      let text = typeof reply === 'string' ? reply : (reply.text || '');
      // 抽文件标记 + 发文件
      const filesBefore = (text.match(/\[SEND_FILE:[^\]]+\]/g) || []).length;
      text = await maybeSendFiles(text);
      const filesSent = filesBefore - (text.match(/\[SEND_FILE:[^\]]+\]/g) || []).length;

      // 发文字（如果有剩余）或文件附带说明
      if (text) {
        await sendFinal(text);
      }
      process.stderr.write(`📤 [${msg.memberName}] 回复: ${(text || '').slice(0, 100)}\n`);
      if (filesSent > 0) process.stderr.write(`📎 [${msg.memberName}] 发了 ${filesSent} 个文件\n`);
    } else if (!placeholderSent) {
      process.stderr.write(`⏱️ [${msg.memberName}] 处理${t1 - t0}ms 无回复\n`);
    }

    process.stderr.write(`⏱️ [${msg.memberName}] 总计${Date.now() - t0}ms\n`);
  } catch (e) {
    console.error('处理错误:', e.message);
    if (!placeholderSent) {
      try { await pool.reply(msg, '抱歉，小满出错了😢 稍后再试'); } catch {}
    }
  }
});

// 启动时自动上线所有已绑定成员
await pool.autoLoginAll();

// Web
const app = express();
app.use(express.json());
// CORS: 允许 Tauri 开发环境跨域
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static('./web'));
app.use('/api/config',  (await import('./api/config.js')).router(db));
app.use('/api/wechat',  wechatRouter(pool));
app.use('/api/members', (await import('./api/members.js')).router(db));
app.use('/api/messages', (await import('./api/messages.js')).router(db));
app.use('/api/upgrade', (await import('./api/upgrade.js')).router(db));

// 扫描接口（SSE 流式进度）
app.get('/api/scan/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const row = db.get("SELECT value FROM config WHERE key='scanPaths'");
    const rawPaths = row?.value || paths.scanPaths.join(',') || '';
    const scanPaths = rawPaths.split(',').map(s => s.trim()).filter(Boolean);
    if (scanPaths.length === 0) {
      send('done', { ok: true, message: '未配置扫描路径', total: 0, inserted: 0, skipped: 0, removed: 0 });
      return res.end();
    }
    const dataDirRow = db.get("SELECT value FROM config WHERE key='dataDir'");
    const dataDir = dataDirRow?.value || './data';

    let total = 0, inserted = 0, skipped = 0;
    const errors = [];

    for (const dir of scanPaths) {
      send('dir', { path: dir, status: 'scanning' });
      const files = await scanWalk(dir);
      send('dir', { path: dir, status: 'walking', fileCount: files.length });

      for (const filePath of files) {
        total++;
        try {
          const r = await scanIndexFile(filePath, dataDir, db);
          if (r.action === 'insert') inserted++;
          else skipped++;
        } catch (e) { errors.push(filePath + ': ' + e.message); }
        // 每 10 个文件推送一次进度
        if (total % 10 === 0) {
          send('progress', { total, inserted, skipped, errors: errors.length });
        }
      }
      send('dir', { path: dir, status: 'done', total, inserted, skipped });
    }

    // 清理孤儿
    send('cleanup', { status: 'cleaning' });
    const removed = await cleanupOrphans(db, dataDir);
    send('cleanup', { status: 'done', removed });

    send('done', { ok: true, message: `扫描完成: 总 ${total}, 新增 ${inserted}, 跳过 ${skipped}, 清理 ${removed}`, total, inserted, skipped, removed, errors: errors.length });
  } catch (e) {
    send('error', { ok: false, message: '扫描失败: ' + e.message });
  }
  res.end();
});

// 扫描接口（兼容旧调用，返回最终结果）
app.post('/api/scan', async (_req, res) => {
  try {
    const row = db.get("SELECT value FROM config WHERE key='scanPaths'");
    const rawPaths = row?.value || paths.scanPaths.join(',') || '';
    const scanPaths = rawPaths.split(',').map(s => s.trim()).filter(Boolean);
    if (scanPaths.length === 0) return res.json({ ok: true, message: '未配置扫描路径', total: 0, inserted: 0, skipped: 0 });
    const dataDirRow = db.get("SELECT value FROM config WHERE key='dataDir'");
    const dataDir = dataDirRow?.value || './data';
    let total = 0, inserted = 0, skipped = 0;
    const errors = [];
    for (const dir of scanPaths) {
      const files = await scanWalk(dir);
      for (const filePath of files) {
        total++;
        try {
          const r = await scanIndexFile(filePath, dataDir, db);
          if (r.action === 'insert') inserted++;
          else skipped++;
        } catch (e) { errors.push(filePath + ': ' + e.message); }
      }
    }
    const removed = await cleanupOrphans(db, dataDir);
    res.json({ ok: true, message: `扫描完成: 总 ${total}, 新增 ${inserted}, 跳过 ${skipped}, 清理 ${removed}`, total, inserted, skipped, removed, errors: errors.length });
  } catch (e) {
    res.status(500).json({ ok: false, message: '扫描失败: ' + e.message });
  }
});
app.listen(paths.port, () => console.log(`🌐 面板: http://0.0.0.0:${paths.port}`));

// 注入 push 回调：cron 直接通过 pool.send 给指定 wxid 发消息（不经过 LLM）
startCron(db, {
  push: async (wxid, text) => {
    try {
      await pool.send(wxid, text);
    } catch (e) {
      console.error('Cron push 失败:', e.message);
    }
  },
});
console.log('🏠 Agent 已启动');
