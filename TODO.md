# Family Agent — 待办清单

> 整理当前所有未完成 / 待优化 / 待讨论的事项。
> 优先级：🔴 高 / 🟡 中 / 🟢 低

---

## 🏛️ 架构原则（重要决策记录）

本项目遵循以下设计原则，决定了哪些做、哪些不做。

### 1. Skills 整体不做框架
- **不实现 Skills 加载机制**（system prompt 不装载 SKILL.md）
- **不做 Skills 调度/编排逻辑**
- Skill 文件夹（如 `skills/learning-cards/`）是未来**针对特定用户需求定制**的能力，写完一个定制一个
- 现在**只准备通用原子工具**（move/dedupe/hash/rename 等），不调它们不装配

### 2. Tools 是项目主体
- 所有日常能力都以 Tool 形式存在
- Tool 可以被 LLM 自由调用，不限于某个 Skill
- Tool 之间不互相依赖（独立原子能力）

### 3. 存储重构现不冲动
- 单一 `DATA_DIR` 够用，多根目录以后再说
- 不搞 docker / tauri / 多平台打包，除非有明确需求

### 4. 用户不会装 Node.js 服务
- 目标用户不会 `git clone`、`npm install`、编辑 .env
- 必须提供**开箱即用的安装包**
- 桌面端 App 启动后可能最小化到状态栏，不需要聊天 UI
- 微信仍然是唯一聊天入口

### 5. 数据库不被破坏
- 所有迁移 / 重构动作必须保留现有数据
- 重要操作前手动验证

---

## 🚧 核心待办（按用户场景分组）

### 🔴 P0 — 替换文件传输助手的基础能力

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-001 | **Web 面板：文件浏览/搜索界面** | 待做 | 现状：只能配 LLM / 看聊天记录。要能：浏览、按关键词搜、按时间筛、看缩略图 |
| TOD-002 | **Web 面板：待办管理** | 待做 | 列待办 / 标完成 / 设提醒 |
| TOD-003 | **Web 面板：密码查看** | 待做 | 区分家庭成员可见范围 |
| TOD-004 | **Web 面板：统计页** | 待做 | file_stats 数据可视化 |

### 🔴 P0 — 时间维度索引

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-005 | **search_file 支持 sinceDate / untilDate** | ✅ 已完成 | 加了 fileType/source 拆开、加空 keyword 走 SQL 列表 |
| TOD-006 | **system prompt 加时间表达示例** | ✅ 已完成 | 加了完整时间表达映射表 + keyword 选取规则 |

### 🔴 P0 — 预热/初始化扫描

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-007 | **scan_directory tool** | ✅ 已完成 | agent/tools/scanDirectory.js，LLM 可调 + 启动自动调用 |
| TOD-008 | **启动时自动扫描** | ✅ 已完成 | index.js 调 runStartupScan，后台异步跑不阻塞首条消息 |
| TOD-009 | **扫描时按 path 去重** | ✅ 已完成 | 应用层 SELECT + db 层 partial UNIQUE INDEX 双保险 |
| TOD-010 | **owner 推断（从路径里提取）** | ✅ 已完成 | scanDirectory.inferOwner：files/notes 子目录第一段，或路径第一段兑底 |
| TOD-011 | **scan_paths 配置（env 驱动）** | ✅ 已完成 | SCAN_PATHS 逗号分隔，多路径支持；现在走 env，后续可迁 config 表 |

### 🟡 P1 — 链接管理

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-012 | **save_link tool** | ✅ 已完成 | agent/tools/saveLink.js |
| TOD-013 | **files 表新增 url / source / title 字段** | ✅ 已完成 | schema + ALTER，link 虚拟路径 path='(virtual)' |
| TOD-014 | **LLM 识别链接的来源平台** | ✅ 已完成 | detectSource() 支持 11 个平台，URL 校验+title 兑底 |
| TOD-015 | **链接预览抓取（og:title / og:image）** | 待做 | 可选增强，需要 HTTP 请求 |

### 🟡 P1 — 文件整理能力（仅通用工具，Skills 以后定制）

> **设计原则**：Skills 整体不做。这部分仅保留“通用原子能力”工具，便于未来按用户需求定制 Skill。

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-073 | **需求梳理：书库整理场景** | ✅ 已讨论 | 分类/去重/重命名/提取元数据 |
| TOD-074 | ~~move_files tool~~ | ❎ 取消 | 不做 |
| TOD-075 | ~~dedupe_files tool~~ | ❎ 取消 | 不做 |
| TOD-076 | ~~batch_rename tool~~ | ❎ 取消 | 不做 |
| TOD-077 | **get_file_hash tool** | 待做 | md5/sha256（通用可用） |
| TOD-078 | **extract_metadata tool（PDF/EPUB）** | 待做 | ISBN/作者/出版年/出版社 |
| TOD-079 | **read_pdf tool** | 待做 | 读 PDF 正文 |
| TOD-080 | **read_epub tool** | 待做 | 读 EPUB 正文 |

### 🟡 P1 — 增强体验

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-100 | ~~扫描快捷指令~~ | ❎ 取消 | Web 后台做 | "扫描一下"→ 扫默认目录 |
| TOD-101 | ~~配置管理~~ | ❎ 取消 | Web 后台做 | 微信端改 API key / model，需权限控制 |
| TOD-102 | ~~成员绑定流程~~ | ❎ 取消 | Web 后台做 | 新成员加微信→发"我是妈妈"→绑定 wxid→管理员确认 |
| TOD-016 | **OCR 图片文字（Tesseract.js）** | ✅ 已完成 | IMAGE_AI='ocr' 模式，识别文字存 content |
| TOD-017 | **IMAGE_AI='vision' 视觉 LLM** | 待做 | 可选，配置 vision API 后 LLM 看图理解内容 |
| TOD-018 | ~~语音转文字~~ | ✅ 已完成 | 微信 SDK 自带转文字，不需要额外模型 |
| TOD-019 | **批量文件操作（按时间范围）** | 待做 | "这周的照片打包发我" |
| TOD-110 | **表情包检测** | ✅ 已完成 | 小图 (<200x200) 不落盘，回 emoji |
| TOD-111 | **超长语音提示** | ✅ 已完成 | >60 秒提示"太长了，打字吧" |
| TOD-112 | **引用回复** | ✅ 已完成 | msg.quotedMessage 作为上下文喂给 Agent |
| TOD-113 | **stripMarkdown** | ✅ 已完成 | 回复前自动去掉 markdown 格式 |
| TOD-114 | **caption 发图带说明** | ✅ 已完成 | 发图片用 {image, caption} 一条消息 |
| TOD-115 | **typing indicator** | ✅ 已完成 | 收到消息立即发"正在输入" |
| TOD-116 | **query_db 通用查询** | ✅ 已完成 | 只读 SELECT + 数据地图 |
| TOD-117 | **Token 优化** | ✅ 已完成 | prompt 3000→620 token，KEEP 20→10，快速通道 |

### 🟢 P2 — 自动化

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-023 | **Cron：定时推送待办提醒** | ✅ 已完成 | pool.send 直接发微信，last_pushed_at 去重 |
| TOD-024 | **Cron：每周日周报** | 待做 | 同上 |
| TOD-025 | **Cron：自动清理过期临时文件** | 待做 | 比如 30 天前的旧图 |


### 🟡 P1 — 文件存储方式重构（你刚提的）

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-054 | **现状梳理：当前文件怎么存** | 待评估 | data/files/{user}/{date}/ + data/notes/{user}/
| TOD-055 | **设计根目录模型** | 待设计 | 用户是否能指定根目录？多硬盘怎么办？ |
| TOD-056 | **目录结构重构（按类型 vs 按用户 vs 按日期）** | 待设计 | 当前三维度叠加，复杂 |
| TOD-057 | **owner 从路径推断 vs 从成员表 join** | 待设计 | 当前两者并存 |
| TOD-058 | **跨盘存储抽象** | 待设计 | 单盘饱和后如何加盘 |
| TOD-059 | **文件路径迁移工具** | 待做 | 重组目录后能批量改 db |
| TOD-060 | **“我的文件” vs “家里的文件” 语义明确** | 待设计 | 多人混存场景里怎么分 |

### 🟡 P1 — 部署与打包（开箱即用版）

> **重新定位**：用户不会 git clone。必须提供安装包。
>
> **NAS 场景**：Docker 镜像（跨群晖/Unraid/Linux 都适用，不做 SPK）
> **桌面场景**：Tauri / Electron 打包成 .dmg / .exe / .AppImage
>
> 启动后可能是 menubar / 系统托盘应用，主交互仍走微信。

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-061 | **选型：Tauri 2.0 vs Electron** | ✅ 已决定 | Tauri 2.0（体积小、启动快、状态栏原生） |
| TOD-062 | **Tauri 2.0 桌面 App** | ✅ 已完成 | src-tauri/ Rust 壳 + 托盘 + 启动 Node.js 后端 |
| TOD-063 | **macOS .dmg 打包** | ✅ 已完成 | GitHub Actions 自动 build |
| TOD-064 | **Windows .exe / .msi 打包** | ✅ 已完成 | GitHub Actions 自动 build（NSIS 安装器） |
| TOD-065 | **Linux .deb / .AppImage** | 待做 | Ubuntu/旧电脑场景 |
| TOD-066 | **Docker 镜像（NAS 场景）** | 待做 | 跨群晖/Unraid/Ubuntu |
| TOD-067 | **首次启动向导** | 待做 | 填 LLM key / 绑微信 / 设置数据路径 |
| TOD-068 | **状态栏图标（菜单栏）** | 待做 | macOS menubar / Win 系统托盘 |
| TOD-069 | **后台静默运行** | 待做 | 启动后不弹窗 / 不调起聊天界面 |
| TOD-070 | **日志查看界面（轻量）** | 待做 | 用户看出错 |
| TOD-071 | **开机自启** | 待做 | macOS LaunchAgent / Win 服务 |
| TOD-072 | **资源占用评估** | 待做 | Tauri + Node.js 后台服务占多少 |
| TOD-073 | **跨平台路径处理** | ✅ 已完成 | api/paths.js 支持 5 种部署形态，环境变量可覆盖 |
| TOD-074 | **升级机制** | 待做 | App 内提示升级 / 静默升级 |
| TOD-075 | **文档：开发模式 vs 用户模式** | 待做 | README 说明 `npm run dev` / `npm run build:app` |
| TOD-076 | **部署方案规划** | ✅ 已完成 | 一套代码 + 平台适配层 + 3 种打包形态（架构已定型） |
| TOD-077 | **Dockerfile 多阶段构建** | ✅ 已完成 | node:20-bookworm-slim + 临时装 build-essential 编译 better-sqlite3 |
| TOD-078 | **docker-compose.yml 模板** | ✅ 已完成 | PUID/PGID/TZ + 4 个卷 + 端口 + 不同 NAS 示例 |
| TOD-079 | **README 部署文档** | ✅ 已完成 | 5 种部署形态对比 + Docker 详细步骤 + 开发者模式 |

### 🟢 P3 — 桌面端 Agent（本地文件 worker，远期）

> ~~这个是误解产生的项~~
>
> **真相**：同一个 agent，用户可选部署位置（NAS 或旧电脑）。不需要"桌面端 agent"和"NAS 端 agent"两套。
>
> 如果需要访问用户本地电脑的文件（书库等），同一个 agent 装在用户电脑上跑即可。

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-084 | ~~桌面端 vs NAS 端 划分~~ | ❎ 取消 | 同一个 agent |
| TOD-085 | ~~跨端通信协议~~ | ❎ 取消 | 不需要 |
| TOD-086 | **多用户多设备同 wxid 协调** | 待设计 | 同一个微信号在两台机器上登录会被踢 |

### 🟡 P1 — 家庭多成员提醒

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-046 | **待办支持指定提醒对象（assignee）** | ✅ 已完成 | add_todo 支持 assignee 参数 |
| TOD-047 | **assignee 区分创建者和提醒人** | ✅ 已完成 | created_by 记录创建者，assignee 记录提醒对象 |
| TOD-048 | **Cron：到期时推送给对应 assignee** | ✅ 已完成 | pool.send 直接发微信，不走 LLM |
| TOD-049 | **Cron：每日家庭晨会提醒** | 待做 | "今天家里有3件事…" 推送给所有人 |
| TOD-050 | **Cron：周期性提醒（每周/每天/工作日）** | ✅ 已完成 | nextRemindTime 支持 daily/weekly/workdays/monthly |
| TOD-051 | **提前提醒（remind_before_minutes）** | ✅ 已完成 | remind_before_minutes 字段已实现 |
| TOD-052 | **提醒正文/附加备注** | ✅ 已完成 | body 字段已实现 |
| TOD-053 | **群发 vs 个人发的语义** | ✅ 已完成 | assignee=all 群发，指定名字单发 |

---

## 🛠 工程质量（隐藏待办）

### 代码质量

| 编号 | 任务 | 优先级 | 状态 | 备注 |
|---|---|---|---|---|
| TOD-026 | **核心代码单元测试** | P2 | 待做 | 当前全靠手动测试 |
| TOD-027 | **LLM 错误重试** | 🔴 P0 | ✅ 已完成 | 3 次重试，指数退避 1s/2s/4s，429/500/超时可恢复 |
| TOD-028 | **session 持久化** | 🔴 P0 | ✅ 已完成 | sessions 表存 JSON，重启自动恢复对话历史 |

### 性能与体验

| 编号 | 任务 | 优先级 | 状态 | 备注 |
|---|---|---|---|---|
| TOD-029 | **流式回复重新设计** | P2 | 已修 | 之前重复发 3 条已修，但流式被关了 |
| TOD-030 | **LLM 重复 tool call 检测** | P2 | 待做 | LLM 经常重复 search_file 同样关键词 |
| TOD-035 | **长回复自动分片** | 🔴 P0 | ✅ 已完成 | >1800 字符按换行/句号切分，多条发送 |

### 配置与可观测性

## 🤔 用户体验待优化

| 编号 | 任务 | 状态 | 备注 |
|---|---|---|---|
| TOD-034 | ~~"对方正在输入中" 提示~~ | ✅ 已完成 | sendTyping/stopTyping |
| TOD-035 | **长回复自动分片（>1800 字符）** | 待做 | 微信单消息有长度限制 |
| TOD-036 | ~~stripMarkdown~~ | ✅ 已完成 | 回复前自动去格式 |
| TOD-037 | **保存截图/截图回显** | 待做 | LLM 生成图片时自动发给微信 |
| TOD-038 | **Agent "小满" 人设一致性** | 待做 | 当前偶有不稳定 |


## 📝 设计决策记录

| 决策点 | 选择 | 状态 |
|---|---|---|
| 密码直接显示给家人 | ✅ 是（家庭场景） | 已决定 |
| 图片处理模式 | off / ocr(Tesseract.js) / vision(可选) | 已决定 |
| 语音处理模式 | SDK 自带转文字，不需要 SenseVoice | 已决定 |
| 链接存储 | files 表 type=link | 已决定 |
| Tools 数量 | 10 个 core tools | 已决定 |
| Skills 框架 | 不实现，只做定制 | 已决定 |
| 部署方式 | Tauri 桌面 + Docker NAS | 已决定 |
| 隐私边界 | 全家可见 | 待确认 |

---

## ✅ 已完成（本轮改造记录）

| 任务 | 完成时间 |
|---|---|
| 基础能力：FTS5 搜索 / 10 个 Tools / 入站消息分流 | 早期 |
| 链接管理：save_link / detectSource / 查询 | 早期 |
| 平台路径适配层 / 启动扫描 / path 去重 | 早期 |
| 多成员提醒：assignee / pool.send / cron 周期性 / 提前 N 分钟 | 今日 |
| Cron 修复：last_pushed_at 去重 / repeat_rule / resolveAssignees | 今日 |
| OCR：Tesseract.js + IMAGE_AI='ocr' | 今日 |
| 语音：SDK 自带转文字 + 超长语音提示 | 今日 |
| 引用回复：msg.quotedMessage 作为 Agent 上下文 | 今日 |
| stripMarkdown：回复前自动去 markdown 格式 | 今日 |
| caption：发图片用 {image, caption} 一条消息 | 今日 |
| 表情包检测：小图 (<200x200) 不落盘 | 今日 |
| typing indicator：收到消息立即发"正在输入" | 今日 |
| query_db：只读 SQL 查询 + 数据地图 | 今日 |
| Token 优化：prompt 3000→620，KEEP 20→10，快速通道 | 今日 |
| beforeToolCall 修复：toolCall.name 替代 toolName | 今日 |
| Tools 精简：15→10 个 core tools | 今日 |
| SDK 升级：@wechatbot/wechatbot 2.2.0 | 今日 |
| 清理测试垃圾数据：53 个成员 + 老 todo | 今日 |
| LLM 错误重试（3 次指数退避，429/500/超时可恢复） | 今日 |
| session 持久化（sessions 表存 JSON，重启自动恢复） | 今日 |
| 长回复分片（>1800 字符按换行/句号切分多条发送） | 今日 |

---

## 📋 下一步

1. **TOD-100~102**（扫描快捷 / 配置管理 / 成员绑定）— 微信端管理能力
2. **TOD-001~004**（Web 面板）— 文件浏览 / 待办管理 / 密码查看 / 统计
3. **TOD-015**（链接预览抓取）— 可选增强
4. **TOD-049**（每日晨会提醒）— Cron 周报
5. **TOD-017**（vision LLM）— 可选，等用户有需求

---

**状态更新时间**：2026-07-02 下午 17:45（P0 稳定性三件套完成：重试 / session / 分片）
**维护者**：小满