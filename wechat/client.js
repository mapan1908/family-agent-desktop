/**
 * 微信接入 — 多 Bot 架构
 * 每个家庭成员拥有独立的 WeChatBot 实例和凭证存储
 */
import { WeChatBot, stripMarkdown } from '@wechatbot/wechatbot';
import { FileStorage } from '@wechatbot/wechatbot';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_DIR = path.join(os.homedir(), '.wechatbot');

// 全局状态（用于 API 轮询）
let bindState = { status: 'idle', qr: null, error: null, memberId: null, memberName: null };

export function createBotsPool() {
  const bots = new Map();        // memberId → { bot, creds, status, userId }
  // userId → botEntry 快速查找表
  const userIdMap = new Map();
  let db = null;                 // 由外部注入
  const readyHandlers = [];
  let messageHandler = null;

  function storageFor(memberId) {
    return new FileStorage(path.join(BASE_DIR, `member-${memberId}`));
  }

  function createBotInstance(memberId) {
    const bot = new WeChatBot({ storage: storageFor(memberId) });

    // 登录成功时更新 userId 索引
    bot.on('login', (creds) => {
      const entry = bots.get(memberId);
      if (entry) {
        if (entry.userId) userIdMap.delete(entry.userId);
        entry.creds = creds;
        entry.status = 'done';
        entry.userId = creds?.userId;
        if (entry.userId) userIdMap.set(entry.userId, entry);
      }
      readyHandlers.forEach(cb => cb({ memberId, memberName: entry?.memberName, creds }));
    });

    bot.on('message', async (raw) => {
      if (!messageHandler) return;
      const entry = bots.get(memberId);

      console.log(`📨 [${entry?.memberName || memberId}] 收到消息 type=${raw.type || 'text'} text=${JSON.stringify((raw.text || '').slice(0, 50))} fromUserId=${raw.userId}`);

      // 立即发"正在输入"状态，让用户知道 bot 在处理
      try { await bot.sendTyping(raw.userId); } catch {}

      // 下载图片/文件数据
      let file = null;
      if (raw.images?.[0] || raw.files?.[0]) {
        try {
          const media = await bot.download(raw);
          if (media) {
            file = {
              name: media.fileName || `${Date.now()}.jpg`,
              data: media.data,
              type: media.type,
              width: raw.images?.[0]?.width,
              height: raw.images?.[0]?.height,
            };
          }
        } catch (e) {
          console.error(`[${memberId}] 下载媒体失败:`, e.message);
        }
      }

      messageHandler({
        text: raw.text || '',
        type: file?.type || raw.type || 'text',
        fromUserId: raw.userId,
        contextToken: raw._contextToken,
        memberId,
        memberName: entry?.memberName,
        file,
        raw,
        quotedMessage: raw.quotedMessage,
      });
    });

    bot.on('error', (err) => {
      console.error(`[${memberId}] Bot 错误:`, err?.message || err);
    });

    return bot;
  }

  return {
    // 由 index.js 注入数据库引用
    setDB(d) { db = d; },

    // 获取所有 bot 状态映射
    getAllStates() {
      const result = {};
      for (const [id, entry] of bots) {
        result[id] = {
          memberName: entry.memberName,
          status: entry.status,
          userId: entry.userId,
          isRunning: entry.bot.isRunning,
        };
      }
      return result;
    },

    // 获取当前绑定状态（用于 API 轮询）
    getBindState() { return bindState; },

    // 自动登录所有已绑定成员（服务启动时调用，不阻塞）
    autoLoginAll() {
      if (!db) return;
      const members = db.all('SELECT * FROM members WHERE wxid IS NOT NULL');
      for (const m of members) {
        this.startBotForMember(m.id, m.name).catch(e => {
          console.error(`自动登录失败 [${m.name}]:`, e.message);
        });
      }
    },

    // 为已绑定成员启动 Bot（不弹码，用缓存凭证）
    async startBotForMember(memberId, memberName) {
      if (bots.has(memberId)) return;

      // 检查是否有缓存凭证文件
      const credsPath = path.join(BASE_DIR, `member-${memberId}`, 'credentials.json');
      if (!fs.existsSync(credsPath)) {
        console.log(`⚠️ ${memberName} 无缓存凭证，需通过面板重新绑定`);
        return;
      }
      
      const entry = { memberId, memberName, status: 'loading', creds: null, userId: null };
      bots.set(memberId, entry);
      
      const bot = createBotInstance(memberId);
      entry.bot = bot;

      try {
        await bot.login({ force: false });
        console.log(`🔗 ${memberName} (id=${memberId}) 凭证有效`);
      } catch (e) {
        entry.status = 'expired';
        bots.delete(memberId);
        console.log(`⚠️ ${memberName} 凭证失效，需要重新绑定`);
      }
    },

    // 为成员生成绑定码
    async startBindFor(memberId, memberName) {
      // 如果这个成员已经有 bot 且已上线，直接触发 ready
      const existing = bots.get(memberId);
      if (existing && existing.status === 'done' && existing.creds) {
        bindState = { status: 'done', qr: null, error: null, memberId, memberName };
        readyHandlers.forEach(cb => cb({ memberId, memberName, creds: existing.creds }));
        return;
      }

      // 已有绑定流程在进行
      if (bindState.status === 'qr' || bindState.status === 'loading') return;

      bindState = { status: 'loading', qr: null, error: null, memberId, memberName };

      const bot = new WeChatBot({ storage: storageFor(memberId) });
      
      // 如果存在旧 bot，先停掉
      if (existing?.bot) {
        try { existing.bot.stop(); } catch {}
      }

      const entry = { memberId, memberName, status: 'loading', creds: null, userId: null };
      bots.set(memberId, entry);
      entry.bot = bot;

      // 注册 login 事件
      bot.on('login', (creds) => {
        if (entry.userId) userIdMap.delete(entry.userId);
        entry.creds = creds;
        entry.status = 'done';
        entry.userId = creds?.userId;
        if (entry.userId) userIdMap.set(entry.userId, entry);
        bindState = { status: 'done', qr: null, error: null, memberId, memberName };
        readyHandlers.forEach(cb => cb({ memberId, memberName, creds }));
      });

      bot.on('message', async (raw) => {
        if (!messageHandler) return;

        console.log(`📨 [${memberName}] (绑定流程) 收到消息 type=${raw.type || 'text'} text=${JSON.stringify((raw.text || '').slice(0, 50))} fromUserId=${raw.userId}`);

        let file = null;
        if (raw.images?.[0] || raw.files?.[0]) {
          try {
            const media = await bot.download(raw);
            if (media) {
              file = {
                name: media.fileName || `${Date.now()}.jpg`,
                data: media.data,
                type: media.type,
              };
            }
          } catch (e) {
            console.error(`[${memberId}] 下载媒体失败:`, e.message);
          }
        }

        messageHandler({
          text: raw.text || '',
          type: file?.type || raw.type || 'text',
          fromUserId: raw.userId,
          contextToken: raw._contextToken,
          memberId,
          memberName,
          file,
          raw,
        });
      });

      try {
        await bot.login({
          force: true,  // 强制 QR 流程，不用缓存凭证
          callbacks: {
            onQrUrl: (url) => {
              bindState = { ...bindState, status: 'qr', qr: url };
            },
            onScanned: () => {
              bindState = { ...bindState, status: 'scanned' };
            },
            onExpired: () => {
              bindState = { ...bindState, status: 'expired', qr: null };
            },
          }
        });
      } catch (e) {
        bindState = { status: 'error', qr: null, error: e.message, memberId, memberName };
        entry.status = 'error';
        console.error(`绑定失败 [${memberName}]:`, e.message);
      }
    },

    // 绑定成功后启动消息监听
    async startAfterBind(memberId) {
      const entry = bots.get(memberId);
      if (!entry || !entry.bot) return;
      if (entry.bot.isRunning) return;
      try {
        await entry.bot.start();
        console.log(`🟢 ${entry.memberName} (id=${memberId}) 消息监听已启动`);
      } catch (e) {
        console.error(`启动失败 [${memberId}]:`, e.message);
      }
    },

    // 解绑成员：停 bot、清 wxid、移除索引
    async unbind(memberId) {
      const entry = bots.get(memberId);
      if (entry) {
        if (entry.userId) userIdMap.delete(entry.userId);
        if (entry.bot) {
          try { entry.bot.stop(); } catch {}
        }
        bots.delete(memberId);
      }
      // 清 DB 里的 wxid
      if (db) {
        db.exec('UPDATE members SET wxid = NULL WHERE id = ?', [memberId]);
      }
      console.log(`🔓 成员 ${memberId} 已解绑`);
      return true;
    },

    onReady: (cb) => readyHandlers.push(cb),
    onMessage: (handler) => { messageHandler = handler; },

    // 回复消息
    // 回复消息（带重试，支持文字和文件）
    async reply(msgOrRaw, content, retries = 2) {
      const entry = userIdMap.get(msgOrRaw.fromUserId);
      if (!entry?.bot) {
        console.error(`❌ 找不到对应的 bot 实例: ${msgOrRaw.fromUserId}`);
        return;
      }
      // 文字回复去掉 markdown 格式
      if (typeof content === 'string') {
        content = stripMarkdown(content);
      }
      const contentPreview = typeof content === 'string' ? content.slice(0, 60) : (content?.fileName || '[file]');
      console.log(`🔵 [${entry.memberName}] bot.reply 调用: ${contentPreview}`);
      for (let i = 0; i <= retries; i++) {
        try {
          await entry.bot.reply(msgOrRaw.raw || msgOrRaw, content);
          console.log(`🟢 [${entry.memberName}] bot.reply 成功`);
          try { await entry.bot.stopTyping(msgOrRaw.fromUserId); } catch {}
          return;
        } catch (e) {
          console.error(`🟡 [${entry.memberName}] bot.reply 失败 (重试 ${i}/${retries}):`, e.message);
          if (i === retries) throw e;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    },

    // 主动发消息给指定 wxid（不经过 LLM，用于 cron 推送等场景）
    async send(wxid, content, retries = 2) {
      const entry = userIdMap.get(wxid);
      if (!entry?.bot) {
        console.error(`❌ pool.send: 找不到 ${wxid} 对应的 bot 实例`);
        return false;
      }
      const contentPreview = typeof content === 'string' ? content.slice(0, 60) : (content?.fileName || '[file]');
      console.log(`📤 [${entry.memberName}] pool.send → ${wxid}: ${contentPreview}`);
      for (let i = 0; i <= retries; i++) {
        try {
          await entry.bot.send(wxid, content);
          console.log(`🟢 [${entry.memberName}] pool.send 成功`);
          return true;
        } catch (e) {
          console.error(`🟡 [${entry.memberName}] pool.send 失败 (重试 ${i}/${retries}):`, e.message);
          if (i === retries) return false;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    },
  };
}
