/**
 * LLM Provider — 用 pi-ai 的 createModels + createProvider 注册一个
 * OpenAI 兼容的 provider，兼容 .env / config 表的 LLM 配置。
 *
 * 不修改数据库、不修改 .env：
 *   - 优先从 db.config 表读（llmApiKey / llmBaseUrl / llmModel）
 *   - fallback 到 process.env
 */

import { createModels, createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/compat';

/**
 * 从 db + env 读取 LLM 配置
 */
function readLLMConfig(db) {
  const get = (key) => db?.get(`SELECT value FROM config WHERE key='${key}'`)?.value;
  return {
    apiKey:  get('llmApiKey')  || process.env.LLM_API_KEY,
    baseUrl: get('llmBaseUrl') || process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelId: get('llmModel')   || process.env.LLM_MODEL   || 'qwen-plus',
  };
}

/**
 * 构造一个静态 apiKeyAuth（直接用读到的 key，不依赖 env 自动发现）
 */
function staticApiKeyAuth(apiKey) {
  return {
    name: 'LLM API Key',
    resolve: async () => apiKey ? { auth: { apiKey }, source: 'config' } : undefined,
  };
}

/**
 * 注册自定义 LLM provider，返回 { models, model }。
 *   - models: 用于 Agent 的 streamSimple
 *   - model:  Model<"openai-completions"> 实例，赋给 Agent.state.model
 */
export function createFamilyModels(db) {
  const { apiKey, baseUrl, modelId } = readLLMConfig(db);

  if (!apiKey) {
    console.warn('⚠️ LLM_API_KEY 未配置（数据库 config 表和 .env 都没有）');
  }

  const models = createModels();

  const modelDef = {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'family-llm',
    baseUrl,
    reasoning: false,
    input: ['text'],
    // 费用不知道就全填 0，不影响功能
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };

  const provider = createProvider({
    id: 'family-llm',
    name: '家庭 LLM',
    baseUrl,
    auth: { apiKey: staticApiKeyAuth(apiKey) },
    models: [modelDef],
    api: openAICompletionsApi(),
  });

  models.setProvider(provider);

  const model = models.getModel('family-llm', modelId);
  if (!model) {
    throw new Error(`无法找到模型 family-llm/${modelId}`);
  }

  return { models, model };
}