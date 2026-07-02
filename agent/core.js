/**
 * Agent 引擎 — 基于 pi-agent-core 的 Agent 类
 *
 * 架构：
 *   每个 wxid 一个 Agent 实例（session）
 *   Agent 内置 history + tool calling loop
 *   Tools 通过 agent.state.tools 注入
 *
 * 预处理（不进 LLM）：
 *   - 文件/图片：先落盘，再以文字摘要喂给 Agent
 *
 * Side-effect 钩子：
 *   - delete_file 二次确认（beforeToolCall）
 *
 * 错误兜底 + 重试：
 *   - LLM 调用失败时自动重试（429/500/超时/网络错误），最多 3 次，指数退避
 *   - 不可恢复错误（400/401/403）不重试
 *   - 所有重试失败后返回友好回复，不抛异常
 *
 * 流式：
 *   - 支持 onDelta 回调（每次 LLM 生成新文本时调用）
 *   - 由 WeChat 层决定怎么利用（占位消息 / 编辑 / 累积后发）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Tesseract from 'tesseract.js';
import { Agent } from '@earendil-works/pi-agent-core';
import { createFamilyModels } from './models.js';
import { runAgentOnce } from './runOnce.js';
import { loadTools } from './tools/index.js';
import { paths } from '../api/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// 入站媒体处理开关（后续可以在 config / .env 里改）
// VOICE_SUPPORT: 'reject' = 回复"暂不支持"；'transcribe' = 调用 SDK 转文字后走文本路径
// IMAGE_AI: 'off' = 只落盘+回复；'ocr' = Tesseract.js 识别图片文字存入 content 字段；'vision' = 下载后喂给多模态模型
const MEDIA_CONFIG = {
  voice: process.env.VOICE_SUPPORT || 'reject',
  image: process.env.IMAGE_AI || 'off',
};

const SYSTEM_PROMPT = `你是「小满」，家里 NAS 上的智能管家。帮全家人存东西、找东西、发文件。

## 风格
- 回复 1-2 句话，30 字以内。工具成功只说"好啦"，不复述返回内容
- 不用 markdown，列表用数字+中文句号。emoji 可用 ✅❌📝📁📋🔐⏰🔗
- 不要主动问"还有别的需要吗"

## 工具使用（优先专用工具，query_db 只做兜底）
存东西：
- 文件/笔记/图片 → save_file
- 密码 → store_password
- 链接 → save_link
- 提醒/待办 → add_todo

查询（优先用专用工具，查不到再用 query_db）：
- 搜文件/笔记/密码/链接 → search_file（keyword 必传；按人搜传 owner；密码传 source='passwords'；链接传 fileType='link'；按时间传 sinceDate/untilDate）
- 查待办/提醒 → list_todos（支持按成员、时间筛选）
- 查家庭成员 → get_members（按名字或 wxid 查）
- 查不到或需要统计 → query_db（只读 SELECT）

发文件：
- 搜到后回复里加 [SEND_FILE:id=X,name=Y]

时间：
- 涉及"今天/昨天/本周"时，先用 get_current_date 获取当前北京时间，日期格式 YYYY-MM-DD

## 多人提醒
- "提醒我 X" → 不传 assignee（默认本人）
- "提醒老公/妈妈 X" → assignee=该名字
- "提醒全家 X" → assignee="all"
- remindAt 必须基于 get_current_date 计算，ISO 格式带 +08:00
- 周期：daily / weekly / workdays / monthly

## 链接
- 发 http 链接 → save_link，自动识别平台
- 查链接 → search_file 传 fileType='link'

## 安全
- 密码用 store_password，不用 store_note
- 家人可以看密码原文。不发给非家庭成员
- 删除操作前必须文字确认

## 媒体处理（handle 层预处理）
- 语音：暂不支持
- 图片：OCR 模式下自动识别图片文字并存入文件索引，搜索可搜到；其他模式只落盘
- 视频/文件：落盘 + 摘要

## 发文件协议
回复末尾加 [SEND_FILE:id=123,name=文件名]，外层负责发文件`;

export async function initAgent(db) {
  const { models, model } = createFamilyModels(db);
  const tools = await loadTools(db);

  const sessions = new Map();
  const agentWxidMap = new WeakMap();
  const agentMemberNameMap = new WeakMap();

  function getOrCreateAgent(wxid, memberName) {
    if (sessions.has(wxid)) return sessions.get(wxid);

    const agent = new Agent({
      initialState: {
        systemPrompt: `${SYSTEM_PROMPT}\n\n当前对话人：${memberName}`,
        model,
        tools,
      },
      streamFn: (m, ctx, opts) => models.streamSimple(m, ctx, opts),
      maxRetryDelayMs: 30000,

      transformContext: async (messages) => {
        const KEEP = 10;
        if (messages.length <= KEEP + 2) return messages;
        const system = messages.find((m) => m.role === 'system');
        const tail = messages.slice(-KEEP);
        const dropped = messages.slice(0, messages.length - KEEP);
        // 从丢弃的消息中提取关键信息
        const userMsgs = dropped.filter(m => m.role === 'user').map(m => {
          const c = Array.isArray(m.content) ? m.content.map(x => x.text || '').join('') : m.content || '';
          return c.slice(0, 30);
        }).filter(Boolean);
        const toolMsgs = dropped.filter(m => m.role === 'tool').map(m => {
          const c = Array.isArray(m.content) ? m.content.map(x => x.text || '').join('') : m.content || '';
          return c.slice(0, 30);
        }).filter(Boolean);
        const parts = [`之前聊过 ${dropped.length} 条消息`];
        if (userMsgs.length) parts.push(`用户说过: ${userMsgs.slice(-3).join('；')}`);
        if (toolMsgs.length) parts.push(`最近操作: ${toolMsgs.slice(-3).join('；')}`);
        const summaryMsg = { role: 'user', content: `[历史摘要] ${parts.join('。')}` };
        return [system, summaryMsg, ...tail].filter(Boolean);
      },

      // 注入 wxid/memberName 到当前 tool
      beforeToolCall: async ({ toolCall, args, context }) => {
        const currentWxid = agentWxidMap.get(agent);
        let currentName = agentMemberNameMap.get(agent);
        if (!currentName && currentWxid) {
          const m = db.get('SELECT name FROM members WHERE wxid = ?', [currentWxid]);
          if (m) {
            currentName = m.name;
            agentMemberNameMap.set(agent, currentName);
          }
        }
        const toolName = toolCall?.name;
        if (currentWxid && toolName) {
          const tool = tools.find(t => t.name === toolName);
          if (tool) {
            tool.wxid = currentWxid;
            if (currentName) tool.memberName = currentName;
          }
        }

        if (toolName !== 'delete_file') return undefined;
        const lastUserText = [...context.messages].reverse()
          .find((m) => m.role === 'user')?.content
          || '';
        const text = (Array.isArray(lastUserText) ? lastUserText.map((c) => c.text || '').join('') : lastUserText).toString();
        const confirmed = /(确认|确定|是的|删吧|可以)/.test(text);
        if (confirmed) return undefined;
        return {
          block: true,
          reason: `用户还没有明确确认删除。请先用 search_file 找到文件，问用户「确认删除XXX吗？」，等用户回复"确认"或"确定"后再调用 delete_file。`,
        };
      },
    });

    // 从 DB 恢复 session
    try {
      const row = db.get('SELECT messages FROM sessions WHERE wxid = ?', [wxid]);
      if (row?.messages) {
        const msgs = JSON.parse(row.messages);
        if (Array.isArray(msgs) && msgs.length > 0) {
          agent.state.messages = msgs;
          process.stderr.write(`♻️ [${memberName}] 恢复 session ${msgs.length} 条消息\n`);
        }
      }
    } catch (e) {
      process.stderr.write(`⚠️ session 恢复失败: ${e.message}\n`);
    }

    // 保存 session 到 DB
    agent._saveSession = () => {
      try {
        const msgs = agent.state.messages;
        if (msgs && msgs.length > 0) {
          db.exec('INSERT OR REPLACE INTO sessions (wxid, messages, updated_at) VALUES (?,?,?)',
            [wxid, JSON.stringify(msgs), Date.now()]);
        }
      } catch {}
    };

    agentWxidMap.set(agent, wxid);
    agentMemberNameMap.set(agent, memberName);
    sessions.set(wxid, agent);
    return agent;
  }

  function ensureMember(wxid) {
    if (!db.get('SELECT id FROM members WHERE wxid = ?', [wxid])) {
      db.exec('INSERT INTO members (wxid, name, role) VALUES (?,?,?)',
        [wxid, `用户${wxid.slice(-4)}`, 'member']);
    }
  }
  function getMember(wxid) {
    return db.get('SELECT name FROM members WHERE wxid = ?', [wxid]);
  }
  function saveMsg(wxid, name, text, reply, type) {
    const r = typeof reply === 'string' ? reply : (reply?.text || '');
    db.exec('INSERT INTO messages (wxid, name, text, reply, type) VALUES (?,?,?,?,?)',
      [wxid, name, text || '', r, type || 'text']);
  }

  async function storeFile(msg, memberName) {
    const date = new Date().toISOString().slice(0, 10);
    const dir = path.join(paths.dataDir, 'files', memberName, date);
    await fs.mkdir(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = msg.file?.name ? path.extname(msg.file.name) : '.jpg';
    const fileName = msg.file?.name || `${ts}${ext}`;
    const filePath = path.join(dir, fileName);
    if (msg.file?.data) await fs.writeFile(filePath, msg.file.data);

    const fileSize = msg.file?.data?.length || 0;
    db.exec('INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)',
      [fileName, filePath, memberName, date, msg.file?.type || msg.type, '', fileSize]);
    const row = db.get('SELECT last_insert_rowid() as id')?.id;
    if (row) db.indexItem('files', row, fileName, '', memberName, 'family');

    const TYPE_LABELS = { image: '图片', video: '视频', file: '文件', voice: '语音', text: '文本' };
    const fileType = TYPE_LABELS[msg.file?.type || msg.type] || '文件';
    return { fileName, filePath, fileId: row, typeLabel: fileType };
  }

  // 判断是否为可恢复错误
  function isRetryable(error) {
    const msg = (error.message || '').toLowerCase();
    const status = error.status || error.statusCode || error.code;
    // 429 rate limit / 500 server error / 超时 / 网络错误 → 可重试
    if (status === 429 || status === 500) return true;
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network')) return true;
    if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
    // 400 bad request / 401 auth / 403 forbidden → 不重试
    if (status === 400 || status === 401 || status === 403) return false;
    // 其他 HTTP 4xx → 不重试
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
    // 未知错误默认重试（DeepSeek 偶发 502 等）
    return true;
  }

  // 内部统一：跑 Agent + 重试 + 兜底 + 流式回调
  async function runWithFallback(agent, input, opts) {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000; // 1s, 2s, 4s 指数退避
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await runAgentOnce(agent, input, opts);
        if (agent._saveSession) agent._saveSession();
        return result;
      } catch (e) {
        lastError = e;
        const remaining = MAX_RETRIES - attempt;
        // 不可恢复错误或已用完重试次数 → 直接 break
        if (!isRetryable(e) || remaining === 0) break;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.error(`🔄 LLM 重试 ${attempt + 1}/3: ${e.message}（${delay}ms 后重试）`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.error(`❌ Agent 调用失败: ${lastError.message}`);
    const fallback = `抱歉，小满脑子打结了😅（${lastError.message?.slice(0, 60) || '未知错误'}）\n稍后再试一次？`;
    opts?.onFinal?.(fallback);
    return { text: fallback, toolCalls: [] };
  }

  return {
    /**
     * 处理一条消息，返回最终回复文本。
     *
     * opts.onDelta(delta)        — 流式：每生成一段新文字
     * opts.onIntermediate(text)  — 中间回复：比如"先发个收到啦～"
     * opts.onFinal(text)         — 最终回复
     */
    async handle(msg, opts = {}) {
      const start = Date.now();
      const { text, type, fromUserId } = msg;

      ensureMember(fromUserId);
      const member = getMember(fromUserId);
      const memberName = member?.name || '访客';

      // ── 语音：reject 或 transcribe ──
      if (type === 'voice') {
        if (MEDIA_CONFIG.voice === 'reject') {
          const reply = '暂不支持语音，发文字或文件给我吧～';
          saveMsg(fromUserId, memberName, '[语音]', reply, 'voice');
          process.stderr.write(`⏱️ [${memberName}] 语音拒绝 ${Date.now() - start}ms\n`);
          return reply;
        }
        if (MEDIA_CONFIG.voice === 'transcribe') {
          // 超长语音提示（>60秒）
          const dur = msg.raw?.voices?.[0]?.durationMs || 0;
          if (dur > 60000) {
            const reply = '语音太长了，打字或分几条发吧～';
            saveMsg(fromUserId, memberName, '[语音]', reply, 'voice');
            return reply;
          }
          const sdkText = msg.text?.trim();
          if (!sdkText) {
            const reply = '没听清，再说一次？';
            saveMsg(fromUserId, memberName, '[语音]', reply, 'voice');
            return reply;
          }
          process.stderr.write(`🎙️ [${memberName}] 语音→"${sdkText}" ${Date.now() - start}ms\n`);
          const agent = getOrCreateAgent(fromUserId, memberName);
          const { text: reply } = await runWithFallback(agent, sdkText, opts);
          saveMsg(fromUserId, memberName, `[语音]${sdkText}`, reply, 'voice');
          process.stderr.write(`🤖 [${memberName}] 语音Agent ${Date.now() - start}ms\n`);
          return reply;
        }
        // passthrough 预留
        return '语音处理暂未实现。';
      }

      // ── 图片处理 ──
      if (type === 'image' || msg.file?.type === 'image') {
        // 表情包检测：小图不落盘
        const w = msg.file?.width || 0;
        const h = msg.file?.height || 0;
        if (w > 0 && h > 0 && (w < 200 || h < 200)) {
          const reply = '😄';
          saveMsg(fromUserId, memberName, '[表情]', reply, 'image');
          process.stderr.write(`😄 [${memberName}] 表情包 ${w}x${h} 不落盘 ${Date.now() - start}ms\n`);
          return reply;
        }

        if (MEDIA_CONFIG.image === 'off') {
          const stored = await storeFile(msg, memberName);
          const reply = `收到图片「${stored.fileName}」📷 已存。`;
          saveMsg(fromUserId, memberName, '[图片]', reply, 'image');
          process.stderr.write(`📷 [${memberName}] 图片落盘 → ${stored.fileName} ${Date.now() - start}ms\n`);
          return reply;
        }
        if (MEDIA_CONFIG.image === 'ocr') {
          const stored = await storeFile(msg, memberName);
          let ocrText = '';
          try {
            const { data } = await Tesseract.recognize(stored.filePath, 'chi_sim+eng');
            ocrText = data.text?.trim() || '';
            if (ocrText) {
              db.exec('UPDATE files SET content = ? WHERE id = ?', [ocrText, stored.fileId]);
              db.indexItem('files', stored.fileId, stored.fileName, ocrText, memberName, 'family');
            }
          } catch (e) {
            console.error(`❌ OCR 失败: ${e.message}`);
          }
          const reply = ocrText
            ? `收到图片「${stored.fileName}」📷 已存，文字已识别。`
            : `收到图片「${stored.fileName}」📷 已存。`;
          saveMsg(fromUserId, memberName, '[图片]', reply, 'image');
          process.stderr.write(`📷 [${memberName}] 图片OCR → ${stored.fileName} ${Date.now() - start}ms\n`);
          return reply;
        }
        // vision = 下载后 base64 喂给多模态模型（后续实现）
      }

      // ── 视频 / 文件：落盘 + 喂 Agent ──
      if (type !== 'text') {
        const stored = await storeFile(msg, memberName);
        const summary = `[${stored.typeLabel}] 用户刚发了一个${stored.typeLabel}「${stored.fileName}」，已存到 ${stored.filePath}。请简短确认并问用户要不要改名。`;
        const agent = getOrCreateAgent(fromUserId, memberName);
        const { text: reply } = await runWithFallback(agent, summary, opts);
        saveMsg(fromUserId, memberName, `[${type}]`, reply, type);
        process.stderr.write(`📂 [${memberName}] 文件落盘 → ${stored.fileName} ${Date.now() - start}ms → Agent\n`);
        return reply;
      }
      let inputText = text;
      if (msg.quotedMessage) {
        const q = msg.quotedMessage;
        process.stderr.write(`📎 [${memberName}] 引用消息: title="${q.title || ''}" text="${(q.text || '').slice(0, 100)}" type="${q.type || ''}"\n`);
        const quotedText = q.text || q.title || '';
        if (quotedText) {
          inputText = `[用户引用了一条消息："${quotedText.slice(0, 200)}"]\n用户说：${text}`;
          const agent = getOrCreateAgent(fromUserId, memberName);
          const { text: reply } = await runWithFallback(agent, inputText, opts);
          saveMsg(fromUserId, memberName, text, reply, type);
          process.stderr.write(`🤖 [${memberName}] 引用回复 Agent ${Date.now() - start}ms\n`);
          return reply;
        }
      }

      // ── 快速通道：简单消息不走 LLM ──
      const t = text.trim();
      const QUICK_REPLIES = {
        '你好': '嗨～', '嗨': '嗨～', 'hi': '嗨～', 'hello': '嗨～',
        '谢谢': '不客气～', '谢啦': '不客气～', '感谢': '不客气～',
        '好的': '👌', '好': '👌', 'ok': '👌', '嗯': '👌',
        '收到': '👌', '知道了': '👌', '了解': '👌',
      };
      if (QUICK_REPLIES[t]) {
        const reply = QUICK_REPLIES[t];
        saveMsg(fromUserId, memberName, text, reply, 'text');
        process.stderr.write(`⚡ [${memberName}] 快速回复 ${Date.now() - start}ms\n`);
        return reply;
      }

      // ── 文本：喂 Agent ──
      const agent = getOrCreateAgent(fromUserId, memberName);
      const { text: reply } = await runWithFallback(agent, inputText, opts);
      saveMsg(fromUserId, memberName, text, reply, type);
      process.stderr.write(`🤖 [${memberName}] Agent ${Date.now() - start}ms\n`);
      return reply;
    },

    async send(wxid, text, opts = {}) {
      ensureMember(wxid);
      const member = getMember(wxid);
      const agent = getOrCreateAgent(wxid, member?.name || '访客');
      return runWithFallback(agent, text, opts);
    },
  };
}