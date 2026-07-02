/**
 * 定时任务
 *
 * 需要外部注入 push(wxid, text) 回调来发消息
 */

import cron from 'node-cron';

/**
 * 解析 assignee 字段成目标 wxid 列表
 *   NULL    → 推给创建者本人
 *   'all'   → 所有家庭成员
 *   '名字'  → 那个成员
 *   '名1,名2' → 多个成员
 */
function resolveAssignees(db, assignee, createdBy) {
  // 没指定 assignee → 推给创建者
  if (!assignee) {
    if (!createdBy) return [];
    // createdBy 可能是 wxid 或成员名，都试一下
    const m = db.get(
      'SELECT wxid, name FROM members WHERE (wxid = ? OR name = ?) AND wxid IS NOT NULL',
      [createdBy, createdBy]
    );
    return m ? [m] : [];
  }
  if (assignee === 'all') {
    return db.all("SELECT wxid, name FROM members WHERE wxid IS NOT NULL");
  }
  const names = assignee.split(',').map(s => s.trim());
  const result = [];
  for (const name of names) {
    const m = db.get('SELECT wxid, name FROM members WHERE name = ? AND wxid IS NOT NULL', [name]);
    if (m) result.push(m);
  }
  return result;
}

/**
 * 计算 repeat_rule 的下一次提醒时间
 *   daily     → 明天同一时间
 *   weekly    → 下周同一天同一时间
 *   workdays  → 下一个工作日（周一到周五）同一时间
 *   monthly   → 下月同一天同一时间
 */
function nextRemindTime(remindAt, repeatRule) {
  const d = new Date(remindAt);
  if (isNaN(d.getTime())) return null;

  switch (repeatRule) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'workdays': {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    }
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      // 自定义 cron 表达式暂不支持
      return null;
  }
  return d.toISOString();
}

export function startCron(db, { push } = {}) {
  // 每分钟检查一次：有没有需要提醒的 todo
  cron.schedule('* * * * *', () => {
    try {
      checkAndPushTodos(db, push);
    } catch (e) {
      console.error('Cron 错误:', e.message);
    }
  });

  // 每周日 10:00 生成周报
  cron.schedule('0 10 * * 0', () => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const newFiles = db.get("SELECT COUNT(*) as count FROM files WHERE date >= ?", [weekAgo]);
      console.log(`📊 本周新增 ${newFiles?.count || 0} 个文件`);
      // TODO: 周报推送
    } catch (e) {
      console.error('Cron 周报错误:', e.message);
    }
  });

  console.log('⏰ Cron 已启动（每分钟检查待办）');
}

/**
 * 检查需要推送的待办，按 assignee 推送给对应成员
 *
 * 触发条件：remind_at - remind_before_minutes <= now
 * 去重：用 last_pushed_at 防止同一分钟内重复推
 * 周期：repeat_rule 有值时，推完后计算下一次 remind_at
 */
async function checkAndPushTodos(db, push) {
  if (!push) return;

  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // 拉所有未完成且有提醒时间的 todo
  const todos = db.all("SELECT * FROM todos WHERE done = 0 AND remind_at IS NOT NULL");

  for (const todo of todos) {
    const remindMs = new Date(todo.remind_at).getTime();
    if (isNaN(remindMs)) continue;

    const offsetMs = (todo.remind_before_minutes || 0) * 60 * 1000;
    const triggerMs = remindMs - offsetMs;

    // 还没到时间
    if (triggerMs > now) continue;

    // 已推过且未超过 1 小时（防止同一轮重复推）
    const lastPushed = todo.last_pushed_at || 0;
    if (lastPushed > triggerMs && now - lastPushed < 60 * 60 * 1000) continue;

    // 已经过期太久（超过 1 小时）→ 对于非周期任务标 done，周期任务跳到下一轮
    if (now - triggerMs > 60 * 60 * 1000) {
      if (!todo.repeat_rule) {
        db.exec('UPDATE todos SET done = 1 WHERE id = ?', [todo.id]);
      } else {
        // 计算下一次
        const next = nextRemindTime(todo.remind_at, todo.repeat_rule);
        if (next) {
          db.exec('UPDATE todos SET remind_at = ?, last_pushed_at = 0 WHERE id = ?', [next, todo.id]);
        }
      }
      continue;
    }

    // 找接收人
    const targets = resolveAssignees(db, todo.assignee, todo.created_by);
    if (targets.length === 0) {
      console.log(`⚠️ 待办 "${todo.title}" 没有有效接收人，跳过`);
      continue;
    }

    // 构造消息
    let text = `⏰ 待办提醒：${todo.title}`;
    if (todo.body) text += `\n${todo.body}`;
    if (todo.assignee === 'all' || targets.length > 1) {
      text = `⏰ 全家待办：${todo.title}` + (todo.body ? `\n${todo.body}` : '');
    }

    // 推送（逐个发，await 确保错误被捕获）
    for (const target of targets) {
      console.log(`⏰ 推送给 ${target.name} (${target.wxid})：${todo.title}`);
      try {
        await push(target.wxid, text);
      } catch (e) {
        console.error(`⏰ 推送失败 ${target.name}:`, e.message);
      }
    }

    // 标记已推送
    db.exec('UPDATE todos SET last_pushed_at = ? WHERE id = ?', [now, todo.id]);

    // 周期任务：推完后计算下一次提醒时间
    if (todo.repeat_rule) {
      const next = nextRemindTime(todo.remind_at, todo.repeat_rule);
      if (next) {
        db.exec('UPDATE todos SET remind_at = ?, last_pushed_at = 0 WHERE id = ?', [next, todo.id]);
        console.log(`🔄 周期待办 "${todo.title}" 下次提醒: ${next}`);
      }
    } else {
      // 非周期任务：标完成
      db.exec('UPDATE todos SET done = 1 WHERE id = ?', [todo.id]);
    }
  }
}