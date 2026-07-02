/**
 * 读取文件
 */

import fs from 'node:fs/promises';
import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'read_file',
  label: '读取文件',
  description: '读取 NAS 上指定文件的内容。',
  parameters: Type.Object({
    filePath: Type.String({ description: '文件的完整路径' }),
  }),

  async execute(toolCallId, params) {
    try {
      const content = await fs.readFile(params.filePath, 'utf-8');
      return {
        content: [{ type: 'text', text: content.slice(0, 3000) + (content.length > 3000 ? '\n...(已截断)' : '') }],
        details: { length: content.length, path: params.filePath },
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `读取失败：${e.message}` }], details: null };
    }
  },
};