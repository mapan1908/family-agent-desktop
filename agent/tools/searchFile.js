/**
 * 搜索文件 — 走 FTS5 全文索引 + 可选时间范围
 *
 * FTS5 索引不带时间字段，时间过滤在拿到 hits 后二次过滤
 */

import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'search_file',
  label: '搜索文件',
  description: '根据关键词搜索 NAS 上已存储的文件/笔记/密码。支持按人、按时间、按类型筛选。',
  parameters: Type.Object({
    keyword: Type.String({ description: '关键词，如"路由"、"宝宝疫苗"。不传关键词不能查' }),
    limit: Type.Optional(Type.Number({ description: '返回条数上限，默认 10' })),
    sinceDate: Type.Optional(Type.String({ description: '起始日期（YYYY-MM-DD），含。未转成日期不要传' })),
    untilDate: Type.Optional(Type.String({ description: '结束日期（YYYY-MM-DD），含。未转成日期不要传' })),
    source: Type.Optional(Type.String({ description: '限制来源：files / passwords / todos，默认全部' })),
    fileType: Type.Optional(Type.String({ description: '限制文件子类型：note / image / video / file，默认不限' })),
    owner: Type.Optional(Type.String({ description: '按存储人筛选，如"妈妈"、"爸爸"' })),
  }),

  async execute(toolCallId, params) {
    // 校验日期格式（YYYY-MM-DD），不合规直接报
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (params.sinceDate && !dateRe.test(params.sinceDate)) {
      return { content: [{ type: 'text', text: `sinceDate 必须是 YYYY-MM-DD 格式，传的是 "${params.sinceDate}"` }], details: null };
    }
    if (params.untilDate && !dateRe.test(params.untilDate)) {
      return { content: [{ type: 'text', text: `untilDate 必须是 YYYY-MM-DD 格式，传的是 "${params.untilDate}"` }], details: null };
    }

    const limit = params.limit || 20;

    // keyword 为空 → 走 SQL 列出路径（不靠 FTS）
    if (!params.keyword?.trim()) {
      return await this.listByFilter(params, limit);
    }

    const hits = this.db.ftsSearch(params.keyword, limit);

    if (hits.length === 0) {
      return { content: [{ type: 'text', text: `没找到关于「${params.keyword}」的内容` }], details: [] };
    }

    // 拿详情
    const items = [];
    for (const hit of hits) {
      if (params.source && hit.source_table !== params.source) continue;
      if (params.owner && hit.owner !== params.owner) continue;
      let date = null;
      if (hit.source_table === 'files') {
        const r = this.db.get('SELECT * FROM files WHERE id = ?', [hit.source_id]);
        if (r) {
          // 时间过滤
          if (params.sinceDate && r.date < params.sinceDate) continue;
          if (params.untilDate && r.date > params.untilDate) continue;
          // 文件子类型过滤
          if (params.fileType && r.type !== params.fileType) continue;
          date = r.date;
          const icon = r.type === 'note' ? '📝'
                    : r.type === 'link' ? '🔗'
                    : r.type === 'image' ? '🖼️'
                    : r.type === 'video' ? '🎬'
                    : '📁';
          items.push({ kind: 'file', icon, id: r.id, name: r.name, owner: r.from_user, date: r.date, type: r.type, content: r.content, path: r.path, url: r.url, linkTitle: r.link_title, linkSource: r.link_source });
        }
      } else if (hit.source_table === 'passwords') {
        const r = this.db.get('SELECT * FROM passwords WHERE id = ?', [hit.source_id]);
        if (r) items.push({ kind: 'password', icon: '🔐', id: r.id, name: r.name, owner: r.owner, value: r.value });
      } else if (hit.source_table === 'todos') {
        const r = this.db.get('SELECT * FROM todos WHERE id = ?', [hit.source_id]);
        if (r) {
          // todos 的时间是 created_at（毫秒时间戳），转成 YYYY-MM-DD 比较
          const todoDate = new Date(r.created_at).toISOString().slice(0, 10);
          if (params.sinceDate && todoDate < params.sinceDate) continue;
          if (params.untilDate && todoDate > params.untilDate) continue;
          items.push({ kind: 'todo', icon: '📋', id: r.id, name: r.title, owner: r.created_by, date: todoDate });
        }
      }
    }

    if (items.length === 0) {
      const rangeText = [
        params.sinceDate ? `从 ${params.sinceDate}` : '',
        params.untilDate ? `到 ${params.untilDate}` : '',
      ].filter(Boolean).join(' ');
      return {
        content: [{ type: 'text', text: `没找到「${params.keyword}」${rangeText ? `（${rangeText}）` : ''}的记录` }],
        details: [],
      };
    }

    const list = items.map((it, i) => {
      let line = `${i + 1}. ${it.icon} ${it.name}（${it.owner}${it.date ? ' ' + it.date : ''}）id=${it.id}`;
      if (it.kind === 'file' && it.type === 'note' && it.content) {
        const preview = it.content.length > 200 ? it.content.slice(0, 200) + '...' : it.content;
        line += `\n   正文：${preview}`;
      }
      if (it.kind === 'file' && it.type === 'link' && it.url) {
        line += `\n   链接：${it.url}`;
      }
      if (it.kind === 'password' && it.value) {
        line += `\n   值：${it.value}`;
      }
      return line;
    }).join('\n');

    const rangeText = [
      params.sinceDate ? `从 ${params.sinceDate}` : '',
      params.untilDate ? `到 ${params.untilDate}` : '',
    ].filter(Boolean).join(' ');
    return {
      content: [{ type: 'text', text: `找到 ${items.length} 条${rangeText ? `（${rangeText}）` : ''}：\n${list}` }],
      details: items,
    };
  },

  /**
   * keyword 为空时直接走 SQL 列表（不靠 FTS 召回）
   */
  async listByFilter(params, limit) {
    const items = [];

    if (!params.source || params.source === 'files') {
      let sql = "SELECT * FROM files WHERE 1=1";
      const binds = [];
      if (params.sinceDate) { sql += ' AND date >= ?'; binds.push(params.sinceDate); }
      if (params.untilDate) { sql += ' AND date <= ?'; binds.push(params.untilDate); }
      if (params.fileType) { sql += ' AND type = ?'; binds.push(params.fileType); }
      if (params.owner) { sql += ' AND from_user = ?'; binds.push(params.owner); }
      sql += ' ORDER BY date DESC, id DESC LIMIT ?';
      binds.push(limit);
      const rows = this.db.all(sql, binds);
      for (const r of rows) {
        const icon = r.type === 'note' ? '📝'
                  : r.type === 'link' ? '🔗'
                  : r.type === 'image' ? '🖼️'
                  : r.type === 'video' ? '🎬'
                  : '📁';
        items.push({ kind: 'file', icon, id: r.id, name: r.name, owner: r.from_user, date: r.date, type: r.type, content: r.content, path: r.path, url: r.url, linkTitle: r.link_title, linkSource: r.link_source });
      }
    }
    if (!params.source || params.source === 'passwords') {
      let sql = 'SELECT * FROM passwords WHERE 1=1';
      const binds = [];
      if (params.owner) { sql += ' AND owner = ?'; binds.push(params.owner); }
      sql += ' LIMIT ?';
      binds.push(limit);
      const pwds = this.db.all(sql, binds);
      for (const r of pwds) items.push({ kind: 'password', icon: '🔐', id: r.id, name: r.name, owner: r.owner, value: r.value });
    }

    if (!params.source || params.source === 'todos') {
      let sql = 'SELECT * FROM todos WHERE 1=1';
      const binds = [];
      if (params.sinceDate) { sql += ' AND substr(created_at,1,10) >= ?'; binds.push(params.sinceDate); }
      if (params.untilDate) { sql += ' AND substr(created_at,1,10) <= ?'; binds.push(params.untilDate); }
      if (params.owner) { sql += ' AND created_by = ?'; binds.push(params.owner); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(limit);
      const todos = this.db.all(sql, binds);
      for (const r of todos) {
        const todoDate = new Date(r.created_at).toISOString().slice(0, 10);
        items.push({ kind: 'todo', icon: '📋', id: r.id, name: r.title, owner: r.created_by, date: todoDate });
      }
    }

    if (items.length === 0) {
      return { content: [{ type: 'text', text: '没找到记录' }], details: [] };
    }

    const list = items.map((it, i) => {
      let line = `${i + 1}. ${it.icon} ${it.name}（${it.owner}${it.date ? ' ' + it.date : ''}）id=${it.id}`;
      if (it.kind === 'file' && it.type === 'note' && it.content) {
        const preview = it.content.length > 200 ? it.content.slice(0, 200) + '...' : it.content;
        line += `\n   正文：${preview}`;
      }
      if (it.kind === 'file' && it.type === 'link' && it.url) {
        line += `\n   链接：${it.url}`;
      }
      if (it.kind === 'password' && it.value) {
        line += `\n   值：${it.value}`;
      }
      return line;
    }).join('\n');

    const rangeText = [
      params.sinceDate ? `从 ${params.sinceDate}` : '',
      params.untilDate ? `到 ${params.untilDate}` : '',
    ].filter(Boolean).join(' ');
    return {
      content: [{ type: 'text', text: `找到 ${items.length} 条${rangeText ? `（${rangeText}）` : ''}：\n${list}` }],
      details: items,
    };
  },
};