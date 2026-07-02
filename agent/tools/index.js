/**
 * 工具加载器
 *
 * 自动扫描 agent/tools/ 目录，加载所有工具。
 * 每个工具文件 export default 一个 AgentTool 格式的对象：
 *   { name, label, description, parameters, execute(toolCallId, params, signal, onUpdate) }
 *
 * 同时把 db / dataDir / paths 注入到 tool 上（通过 this 访问）
 */

import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../api/paths.js';

export async function loadTools(db) {
  const dir = import.meta.dirname;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js');

  const tools = [];
  for (const file of files) {
    const mod = await import(path.join(dir, file));
    const tool = mod.default;
    if (!tool?.name) continue; // 跳过非工具文件
    // 注入 db / dataDir / paths（execute 内通过 this 访问）
    tool.db = db;
    tool.dataDir = paths.dataDir;
    tool.paths = paths;
    tools.push(tool);
  }
  return tools;
}