/**
 * runAgentOnce — 给 Agent 发一条消息，等回复。
 *
 * 选项：
 *   onDelta(delta)         — LLM 每生成一段文字时调用（流式）
 *   onToolCall({...})      — 工具开始/结束时调用
 *
 * 出错：抛异常，由调用方决定怎么回复用户
 */

export async function runAgentOnce(agent, input, opts = {}) {
  const { signal, onDelta, onToolCall } = opts;

  let finalText = '';
  const toolCalls = [];

  const unsub = agent.subscribe(async (event) => {
    // 流式：LLM 每生成一个字/一段话
    if (event.type === 'message_update') {
      const sub = event.assistantMessageEvent;
      if (sub?.type === 'text_delta' && sub.delta) {
        onDelta?.(sub.delta);
      }
      return;
    }

    // 一条 assistant 消息结束
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const msg = event.message;
      // LLM 出错时 stopReason='error' + errorMessage 有具体原因，转化为异常让上层兑底
      if (msg.stopReason === 'error' && msg.errorMessage) {
        throw new Error(msg.errorMessage);
      }
      const texts = (msg.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text);
      finalText = texts.join('\n').trim();
      for (const c of msg.content || []) {
        if (c.type === 'toolCall') {
          toolCalls.push({ name: c.name, args: c.arguments });
        }
      }
      return;
    }

    if (event.type === 'tool_execution_start') {
      onToolCall?.({ phase: 'start', name: event.toolName, args: event.args });
    } else if (event.type === 'tool_execution_end') {
      onToolCall?.({ phase: 'end', name: event.toolName, isError: event.isError });
    }
  });

  try {
    await agent.prompt(input, undefined, signal);
    await agent.waitForIdle();
  } finally {
    unsub();
  }

  return { text: finalText, toolCalls };
}