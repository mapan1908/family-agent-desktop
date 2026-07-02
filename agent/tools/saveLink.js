/**
 * 保存链接
 *
 * 不落盘到文件系统，只存 db（files 表 type='link'）
 */

import { Type } from '@earendil-works/pi-ai';

// 简单的来源平台识别
function detectSource(url) {
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return '抖音';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return '小红书';
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'B站';
  if (/tmall\.com|taobao\.com|t\.cn/i.test(url)) return '淘宝';
  if (/jd\.com/i.test(url)) return '京东';
  if (/weixin\.qq\.com|mp\.weixin\.qq\.com/i.test(url)) return '微信';
  if (/zhihu\.com/i.test(url)) return '知乎';
  if (/github\.com/i.test(url)) return 'GitHub';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/twitter\.com|x\.com/i.test(url)) return 'Twitter';
  if (/weibo\.com/i.test(url)) return '微博';
  return '网页';
}

export default {
  name: 'save_link',
  label: '存链接',
  description: '把一条链接（URL）存起来。会自动识别来源平台（抖音/小红书/B站/淘宝等）。',
  parameters: Type.Object({
    url: Type.String({ description: '链接地址' }),
    title: Type.Optional(Type.String({ description: '链接标题（可选，不传则用域名）' })),
    source: Type.Optional(Type.String({ description: '来源平台（可选，自动识别）' })),
    note: Type.Optional(Type.String({ description: '备注（可选，附加说明）' })),
    owner: Type.Optional(Type.String({ description: '谁的，缺省从上下文取' })),
  }),

  async execute(toolCallId, params) {
    if (!params.url?.trim()) {
      return { content: [{ type: 'text', text: '链接不能为空' }], details: null };
    }

    // 简单 URL 校验
    if (!/^https?:\/\//i.test(params.url)) {
      return { content: [{ type: 'text', text: `链接必须以 http:// 或 https:// 开头：${params.url}` }], details: null };
    }

    const owner = params.owner || '家庭';
    const date = new Date().toISOString().slice(0, 10);
    const title = params.title?.trim() || params.url;
    const source = params.source?.trim() || detectSource(params.url);
    const content = params.note?.trim() || '';

    // name 用标题 + URL（看起来像可读的文件名）
    const name = source + ': ' + title;
    // path 是虚拟路径（不落盘）
    const path = '(virtual)';

    this.db.exec(
      'INSERT INTO files (name, path, from_user, date, type, content, url, link_title, link_source) VALUES (?,?,?,?,?,?,?,?,?)',
      [name, path, owner, date, 'link', content, params.url, title, source]
    );
    const id = this.db.get('SELECT last_insert_rowid() as id')?.id;
    if (id) {
      // 索引里加 title + url + source
      this.db.indexItem('files', id, `${title} ${source} ${params.url}`, content, owner, 'family');
    }

    return {
      content: [{ type: 'text', text: `🔗 已存${source}链接：${title}` }],
      details: { id, url: params.url, title, source, name },
    };
  },
};