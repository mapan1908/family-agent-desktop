/**
 * 保存文件 — 通用存文件工具
 *
 * 设计原则：
 *   - 文本类（.txt/.md/.json/.csv 等）→ type='note'，content 字段存正文
 *   - 二进制类（.jpg/.png/.mp4/.pdf/.zip 等）→ type 推断为 image/video/file，content 字段为空
 *
 * 文件本身始终落盘到 data/files/{owner}/{date}/
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Type } from '@earendil-works/pi-ai';

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yaml', '.yml']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']);

/** 根据文件名推断 type */
function detectType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (TEXT_EXTS.has(ext)) return 'note';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'file';
}

export default {
  name: 'save_file',
  label: '保存文件',
  description: '把一段内容存为文件。文本类（.txt/.md 等）会索引到 FTS，二进制文件只落盘。',
  parameters: Type.Object({
    content: Type.String({ description: '文件内容（文本）' }),
    fileName: Type.String({ description: '文件名，含扩展名，如"笔记.txt"' }),
    owner: Type.Optional(Type.String({ description: '存到谁的目录，缺省为"家庭"' })),
  }),

  async execute(toolCallId, params) {
    const owner = params.owner || '家庭';
    const date = new Date().toISOString().slice(0, 10);
    const dir = path.join(this.dataDir, 'files', owner, date);
    await fs.mkdir(dir, { recursive: true });
    const fp = path.join(dir, params.fileName);
    await fs.writeFile(fp, params.content);

    const fileType = detectType(params.fileName);
    // 只有文本类才存 content + FTS 索引正文
    const storeContent = fileType === 'note' ? params.content : '';

    const fileSize = Buffer.byteLength(params.content, 'utf-8');
    this.db.exec(
      'INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)',
      [params.fileName, fp, owner, date, fileType, storeContent, fileSize]
    );
    const id = this.db.get('SELECT last_insert_rowid() as id')?.id;
    if (id) {
      this.db.indexItem('files', id, params.fileName, storeContent, owner, 'family');
    }

    return {
      content: [{ type: 'text', text: `📁 已存「${params.fileName}」（${fileType}）到 ${owner}` }],
      details: { id, name: params.fileName, path: fp, type: fileType },
    };
  },
};