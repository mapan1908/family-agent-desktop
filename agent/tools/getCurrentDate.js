/**
 * 获取当前日期/时间
 *
 * 比让 LLM 写 SELECT datetime('now', '+8 hours') 更可靠。
 * 返回北京时间（UTC+8）。
 */

export default {
  name: 'get_current_date',
  label: '获取当前时间',
  description: '获取当前日期和时间（北京时间 UTC+8）。涉及"今天/昨天/本周"时先调这个。',

  async execute() {
    const now = new Date();
    // 北京时间 = UTC + 8h
    const offset = 8 * 60 * 60 * 1000;
    const bj = new Date(now.getTime() + offset);

    const date = bj.toISOString().slice(0, 10);       // YYYY-MM-DD
    const time = bj.toISOString().slice(11, 19);       // HH:mm:ss
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][bj.getUTCDay()];

    const text = `当前北京时间：${date} ${time} 星期${weekday}`;

    return {
      content: [{ type: 'text', text }],
      details: { date, time, weekday, iso: new Date(now.getTime() + offset).toISOString() },
    };
  },
};
