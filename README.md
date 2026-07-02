# 🏠 Family Agent

> 部署在家里 NAS / 旧电脑上的微信家庭管家。  
> 全家人在微信里发消息、发图片，Agent 自动识别内容、分类存储、对话确认。

---

## 目录

- [架构概览](#架构概览)
- [快速开始（NAS Docker 部署）](#快速开始nas-docker-部署)
- [5 种部署形态对比](#5-种部署形态对比)
- [开发者模式](#开发者模式)
- [数据库表](#数据库表)
- [API 端点](#api-端点)
- [目录结构](#目录结构)
- [当前功能](#当前功能)
- [注意事项](#注意事项)

---

## 架构概览

```
微信 App                     NAS / 旧电脑（你的部署点）
───────                     ─────────────────────────
 妈妈 ──→ 发消息 ──→        WeChat Bot（妈妈独立实例）
 我   ──→ 发消息 ──→        WeChat Bot（我的独立实例）     ←每人一个长轮询连接
                              │
                              ▼
                         Agent 引擎（agent/core.js）
                         · 17 个 Tools
                         · SQLite + FTS5 全文索引
                              │
                              ▼
                         数据存储（api/paths.js 适配）
                         · 数据库 · 文件 · 笔记 · 凭证
```

### 为什么每人一个 Bot 实例？

WeChatBot SDK 一次只能登录一个微信账号。为了让家里多个人同时收发消息，每个家庭成员跑一个独立的 Bot 实例，各自有自己的微信凭证。

### 平台路径适配层

业务代码（agent/tools/db/api/wechat）不直接写死路径，全部走 `api/paths.js`：

| 部署形态 | 配置目录 | 数据目录 |
|---|---|---|
| **开发模式** | `./config` | `./data` |
| **NAS Docker** | `/config` | `/data` |
| **macOS 桌面** | `~/Library/Application Support/family-agent` | 同上 |
| **Windows 桌面** | `%APPDATA%\family-agent` | 同上 |
| **Linux 桌面** | `~/.config/family-agent` | `~/.local/share/family-agent` |

可被环境变量 `FAMILY_CONFIG_DIR` / `FAMILY_DATA_DIR` / `SCAN_PATHS` 覆盖。

---

## 快速开始（NAS Docker 部署）

> **推荐方式**：5 分钟跑起来，备份方便，升级简单。

### 前提

- NAS 或旧电脑一台（群晖/Unraid/TrueNAS/Ubuntu 都可以）
- 安装了 Docker / Docker Compose
- 一个微信小号（专门用于 Bot 登录）
- LLM API Key（推荐千问、DeepSeek）

### 1. 拉取代码

```bash
git clone <你的仓库> /volume1/docker/family-agent
cd /volume1/docker/family-agent
```

### 2. 编辑 docker-compose.yml

只改两处（卷路径）：

```yaml
volumes:
  - /volume1/家庭:/data/files      # ← 改成你 NAS 的家庭共享文件夹
  - /volume1/笔记:/data/notes      # ← 改成你 NAS 的笔记共享文件夹
```

**查 PUID**（宿主机用户 uid，决定容器内文件属主）：

```bash
id <你的用户名>
# 例：uid=1026(admin) gid=100(users)
# 把 docker-compose.yml 里的 PUID=1026 PGID=100 改成你的
```

### 3. 启动

```bash
docker compose up -d
docker compose logs -f    # 看启动日志
```

启动成功后，访问 `http://<NAS_IP>:3099` 看 Web 面板。

### 4. 填 LLM Key

```bash
# 编辑配置文件
nano ./config/.env

# 填入（其他默认即可）：
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
```

改完重启：

```bash
docker compose restart
```

### 5. 绑定家庭成员

1. 打开 `http://<NAS_IP>:3099`
2. 在「家庭成员」添加成员（妈妈、爸爸、孩子...）
3. 点「生成绑定码」→ 截图发对方 → 对方微信扫码
4. 重复以上，绑定所有家人

每个家庭成员**独立登录一个微信小号**，凭证存在 `./wechat-creds/`（已 mount 到容器内 `/root/.wechatbot`）。

### 6. 升级

```bash
cd /volume1/docker/family-agent
docker compose pull              # 拉新镜像
docker compose up -d             # 重启
# 或者用本地源码：
git pull && docker compose up -d --build
```

**数据不丢**：所有数据都在 `./config`、`./wechat-creds` 和 mount 的共享文件夹里。

---

## 5 种部署形态对比

| 形态 | 适合谁 | 打包产物 | 配置文件 | 数据位置 |
|---|---|---|---|---|
| **NAS Docker** | 群晖/Unraid/旧电脑 + Docker 用户 | Docker 镜像 | `./config/.env` | mount 的卷 |
| **macOS 桌面** | 苹果电脑用户 | `.dmg`（GitHub Actions build） | `~/Library/Application Support/family-agent/config/.env` | 同上 home 下 |
| **Windows 桌面** | Windows 电脑用户 | `.exe`（GitHub Actions build） | `%APPDATA%\family-agent\config\.env` | 同上 AppData 下 |
| **Linux 桌面** | Ubuntu 旧电脑用户 | `.AppImage` / `.deb`（GitHub Actions build） | `~/.config/family-agent/config/.env` | `~/.local/share/family-agent` |
| **开发者模式** | 开发者本人 | 无（git + npm） | `./.env` 或 `./config/.env` | `./data/` |

### 桌面安装包

桌面端用 **Tauri 2.0** 打包（Rust 壳 + Node.js 后端），体验对比：

- 托盘图标：macOS 状态栏 / Windows 系统托盘
- 左键托盘 = 打开 Web 面板
- 右键托盘 = 菜单（打开面板 / 配置目录 / 重启 / 退出）
- Node.js 后端挂了自动重启
- 开机自启（macOS LaunchAgent / Windows 注册表 / Linux systemd）

**下载安装包**：从 [GitHub Releases](https://github.com/yourname/family-agent/releases) 拉最新 `.exe` / `.dmg` / `.AppImage`。

**首次启动**：
1. 双击安装（NSIS 向导 / DMG 拖拽 / AppImage 给执行权限）
2. 应用启动 → 系统托盘出现图标
3. 浏览器自动打开 `http://localhost:3099`（首次会弹配置向导）
4. 填 LLM API key → 开始使用

**配置文件位置**（按平台自动选）：
- macOS: `~/Library/Application Support/family-agent/config/.env`
- Windows: `%APPDATA%\family-agent\config\.env`
- Linux: `~/.config/family-agent/config/.env`

**打安装包**（开发者）：
```bash
git tag v0.1.0
git push origin v0.1.0
# GitHub Actions 自动 build 三平台安装包
```

---

## 开发者模式

> 适合改代码、调工具、调试。

### 前提

- Node.js ≥ 20
- 一个 LLM API Key
- 一个微信小号

### 启动

```bash
git clone <你的仓库>
cd family-agent
npm install

# 方式 A：项目根 .env（兼容旧部署）
cp .env.example .env
# 编辑 .env，填 LLM_API_KEY 等

# 方式 B：config/.env（推荐）
mkdir -p config
cp .env.example config/.env
# 编辑 config/.env

npm run dev
```

访问 `http://localhost:3099`。

### 启动扫描

开发模式默认自动扫描 `./data/files` 和 `./data/notes`：

```
📂 启动扫描：2 个目录
   /Users/.../data/files: 总 12，新增 0，跳过 12
   /Users/.../data/notes: 总 5，新增 0，跳过 5
```

如果想扫其他目录，在 `config/.env` 里加：

```bash
SCAN_PATHS=./data/files,./data/notes,/Users/me/Documents/书库
```

### 重启微信

```bash
# Web 面板里点重启
# 或
pkill -f "node.*index.js"
npm run dev
```

---

## 数据库表

| 表 | 存什么 |
|---|---|
| `members` | 家庭成员（名字、角色、wxid） |
| `messages` | 全部微信对话记录 |
| `files` | 图片/文件/笔记/链接（type 区分） |
| `todos` | 待办提醒 |
| `passwords` | 密码/Token/密钥 |
| `config` | LLM 配置等 |
| `idx_search` | FTS5 全文索引（跨 files + passwords + todos） |

### Agent 的判断流程

```
收到消息
  │
  ├─ 有待确认事项？ ──→ 处理为对上一条的回复（改名/存密码/取消）
  │
  ├─ 图片/文件？ ──→ 落盘 → 询问「要改名字吗？」
  │
  └─ 文字消息
       │
       ├─ 像密码/Token/地址？ ──→ 询问「这是什么？要我存吗？」
       │                               → 用户回复 → 存 passwords 或 notes
       │
       ├─ 像待办提醒？ ──→ 直接存 todos
       │
       └─ 日常闲聊 ──→ LLM 以「小满」身份自然回复
```

---

## API 端点

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/config` | GET/POST | AI 配置读写 |
| `/api/wechat/bind` | POST | 为成员生成绑定二维码 |
| `/api/wechat/status` | GET | 当前绑定状态 |
| `/api/wechat/bots` | GET | 所有 Bot 状态 |
| `/api/members` | GET/POST | 家庭成员管理 |
| `/api/messages` | GET | 聊天记录查询 |

---

## 目录结构

```
family-agent/
├── index.js              # 主入口
├── agent/
│   ├── core.js           # Agent 引擎
│   ├── models.js         # LLM 模型配置
│   ├── runOnce.js        # Agent 单次运行封装
│   └── tools/            # 17 个工具
├── api/
│   ├── paths.js          # 平台路径适配层（5 种部署形态）
│   ├── config.js         # LLM 配置读写
│   ├── members.js        # 成员管理 API
│   ├── messages.js       # 消息记录 API
│   └── wechat.js         # 微信 API
├── wechat/
│   └── client.js         # 多 Bot 池管理
├── db/
│   ├── schema.sql        # 数据库建表
│   └── index.js          # better-sqlite3 封装
├── web/
│   └── index.html        # Web 管理面板
├── cron/                 # 定时任务
├── data/                 # 运行时数据（gitignore）
│   ├── agent.db
│   ├── files/            # 用户上传的文件
│   └── notes/            # 笔记
├── skills/               # Skill 说明书（暂未启用）
├── Dockerfile            # Docker 镜像构建
├── docker-compose.yml    # Docker Compose 部署
├── .env.example          # 配置模板
├── README.md             # 本文件
└── TODO.md               # 待办清单
```

---

## 当前功能

- ✅ 多成员独立微信 Bot，同时在线
- ✅ 图片/文件/笔记/链接 自动分类存储
- ✅ 疑似密码/Token 自动识别并确认存储
- ✅ 待办提醒（add_todo，支持指定 assignee / 提前提醒 / 周期提醒）
- ✅ 文件搜索（search_file，支持 FTS5 全文 + 时间范围过滤）
- ✅ 启动自动扫描（按 path 去重 + owner 路径推断）
- ✅ 闲聊对话（以「小满」身份）
- ✅ 聊天记录全量存储
- ✅ Web 面板管理
- ✅ 定时任务（待办提醒、周报）
- ✅ 平台路径适配（5 种部署形态，代码不变）
- ✅ Docker 部署（Dockerfile + docker-compose.yml）
- 🚧 桌面端安装包（.dmg / .exe / .AppImage）

---

## 注意事项

1. **微信小号**：Bot 需要登录微信，建议注册专用小号，不要用主号
2. **凭证安全**：微信凭证存在 `./wechat-creds/`，权限 600，不要泄露
3. **PUID/PGID**：docker-compose.yml 里的 PUID/PGID 必须改成你 NAS 用户的 uid/gid，否则落盘文件属主是 root
4. **模型选择**：建议用 `qwen-plus` 或 `deepseek-chat`，**不要用推理模型**（如 `deepseek-reasoner`），否则回复可能为空
5. **端口冲突**：不要用 `PORT` 环境变量（会被其他服务污染），本项目用 `FAMILY_PORT`
6. **数据备份**：定期备份 `./config` 目录（含数据库），其他文件在 NAS 共享文件夹里已有 RAID 保护
