# 知识库管理系统（Vue 3 + Vite）

一个基于 Vue 3 的现代化知识库管理系统，支持富文本、Markdown、块式编辑与代码编辑器，并提供完整的文档 CRUD、搜索筛选与批量操作能力。

## 技术栈

- 前端框架：Vue 3 + Composition API
- 构建工具：Vite
- UI 组件库：Element Plus
- 状态管理：Pinia
- 路由管理：Vue Router
- 样式预处理：SCSS
- 编辑器：Quill.js、Monaco Editor、Marked（集成 highlight.js 语法高亮）

## 功能概览

- 现代化响应式布局（可折叠侧边栏、顶部导航含面包屑/用户信息/快捷操作）
- 仪表板：统计概览、快速操作、最近文档
- 文档列表管理：搜索、标签筛选、批量删除/导出、文档复制
- 编辑器功能：
  - 富文本编辑器：工具栏、格式化、自动保存
  - Markdown 编辑器：实时预览、语法高亮、分屏模式
  - 块式编辑器：类似 Notion 的拖拽块编辑体验（段落/标题/引用/代码块）
  - 代码编辑器：Monaco Editor 集成，多语言支持、主题切换
- 文档管理：完整 CRUD、导出选中为 JSON、复制文档
- 网站收藏夹：添加/删除、分组/标签、快速搜索、批量导入/导出、重复校验、网站图标与预览
  - 添加时支持选择/创建分组与多个标签
  - 顶部工具区提供搜索、分组筛选、标签筛选和总数统计
  - 导入/导出使用 JSON，导入过程自动按 URL 去重

## 生产部署（Docker 一体化）

- 构建镜像（前后端合并）：

```bash
docker build -t zhishiku .
```

- 运行容器（Windows PowerShell 示例，挂载宿主机数据目录）：

```powershell
docker run -d --name zhishiku `
  -p 3000:3000 `
  -v D:\data:/data `
  -e DATABASE_URL="file:/data/dev.db" `
  -e ZSK_UPLOADS_DIR="/data/uploads" `
  -e ZSK_LISTEN_HOST="0.0.0.0" `
  -e SERVER_ORIGIN="http://localhost:3000" `
  zhishiku
```

- 访问地址：
  - 前端站点：`http://localhost:3000/`
  - 健康检查：`http://localhost:3000/api/health`
  - 后端接口：`http://localhost:3000/api/...`
  - 附件资源：`http://localhost:3000/uploads/...`


说明：Docker 部署下无需分别运行本地后端与前端开发服务器。


## 本地开发（可选）

如需在本机进行代码调试与开发，可使用以下命令：

```bash
npm install
npm run server      # 启动后端（http://localhost:3000）
npm run dev         # 启动前端（http://localhost:5173）
npm run build       # 构建前端产物到 dist-web
npm run preview     # 预览构建产物
```

## 项目结构

```
├─ README.md                                   # 项目说明与使用文档
├─ index.html                                  # 开发入口模板
├─ package.json                                # 项目与构建配置
├─ vite.config.js                              # Vite 构建配置
 
├─ prisma/
│  ├─ schema.prisma                           # Prisma schema（SQLite）
│  ├─ dev.db                                  # 开发环境数据库（示例）
│  └─ migrations/                             # 数据库迁移记录
├─ scripts/
│  ├─ reset-db.js                             # 清空测试数据与上传目录
│  └─ normalize-sqlite-fields.js              # 辅助脚本（可选）
├─ server/
│  ├─ index.js                                # Express + Prisma API
│  ├─ uploads/                                # 上传文件存储（桌面版运行时指向用户目录）
│  └─ data/                                   # 历史遗留目录（当前不使用）
├─ src/
│  ├─ main.js                                 # 前端入口
│  ├─ App.vue                                  # 布局与全局框架
│  ├─ styles/main.scss                         # 全局样式
│  ├─ router/index.js                         # 路由配置
│  ├─ services/api.js                         # 前端 API 封装，`BASE=http://localhost:3000/api`
│  ├─ store/
│  │  ├─ documents.js                         # 文档状态
│  │  └─ bookmarks.js                         # 书签状态
│  ├─ components/
│  │  ├─ Sidebar.vue                          # 侧边菜单（含系统设置入口）
│  │  └─ TopBar.vue                           # 顶部栏
│  └─ pages/
│     ├─ Dashboard.vue                         # 仪表板
│     ├─ DocumentsList.vue                     # 文档列表
│     ├─ DocumentView.vue                      # 文档查看与导出
│     ├─ Bookmarks.vue                          # 网站收藏夹
│     ├─ Categories.vue                         # 分类管理
│     ├─ Editor.vue                             # 文档编辑器
│     └─ Login.vue                              # 登录页
```

## 说明

- 数据持久化：Prisma + SQLite。
  - Docker 部署时建议挂载宿主机数据目录到容器 `/data`：数据库 `file:/data/dev.db`、附件目录 `/data/uploads`。
- 前端 API 地址：`src/services/api.js` 自动检测，默认 `http://localhost:3000/api`；Docker 环境下建议设置 `SERVER_ORIGIN` 为宿主机可达地址。
- 批量导出：选中后导出为 JSON 文件。
- 自动保存：编辑器内容变更后延迟自动保存（约 800ms）。
- 编辑器：Quill（富文本）、Marked（Markdown）+ highlight.js、Monaco（代码）。
- 时间格式：统一显示为 `YYYY-MM-DD HH:mm`（分钟级）；后端存储为秒级时间戳字符串。


## 当前后端架构（Prisma + SQLite）

- 已接入 Prisma + SQLite（数据库位于 `prisma/dev.db`），并提供身份认证、文档与书签等 API。
- 常用命令：
  - 生成客户端：`npm run db:generate`
  - 开发迁移：`npm run db:migrate`

## 清空测试数据

开发或演示前需要清空所有测试数据与测试用户时：

- 运行：`npm run reset:db`
- 作用：清空 SQLite 中所有表的数据，并清理 `server/uploads/` 目录中的上传文件。
- 注意：清空后系统中不再有任何用户，需要重新注册。

## 系统设置（侧边栏）

- 入口：左侧菜单“系统设置”，路由 `#/settings`
- 功能：
  - 系统数据备份（数据库 + 附件）：下载 ZIP
  - 系统数据导入（ZIP）：从备份恢复（导入后建议重启应用）
  - 默认允许局域网访问：直接使用 `http://<本机IP>:<端口>` 访问
 - 健康检查：登录页左上角状态栏显示后端地址与健康状态，点击“刷新”调用 `GET /api/health`。

## PDF 导出说明

- 网页版：新窗口写入 HTML 后手动打印，行为与浏览器设置相关

## 常见问题（FAQ）

- 前端无法访问 API？
  - Docker：确认容器运行且健康检查为 `ok`；`SERVER_ORIGIN` 指向宿主机地址而非容器内网 IP。
  - 本地开发：确认后端运行在 `http://localhost:3000`，`src/services/api.js` 的基址正确。
 

- 登录报 401 或“用户名或密码错误”？
  - 确认已注册用户；若你刚运行了 `reset:db`，需要重新注册。
  - 凭证错误会显示中文提示；依旧异常可检查后端日志（终端输出）。

- 如何查看当前注册用户数量？
  - 运行 `npx prisma studio` 在浏览器查看 `User` 表条目数。
  - 或写脚本统计：`prisma.user.count()`（详见前述说明）。

  - 端口冲突或需要修改端口？
    - Docker：改映射端口，例如 `-p 3001:3000` 并同时设置 `SERVER_ORIGIN="http://localhost:3001"`。
    - 本地开发：后端 `PORT=3001`，前端在 `vite.config.js` 调整 `server.port`。


  - 备份提示失败？
  - 在登录页点击“刷新”查看健康状态；检查 `server.log` 是否有 `add db to zip failed` / `add uploads to zip failed` 日志
  - 确认数据库与附件目录存在（见上文“系统设置（侧边栏）”数据位置）

  - 导入提示失败？
  - 请使用系统设置中备份生成的 ZIP；单次导入建议小于 100MB
  - 仍失败时查看 `server.log` 错误信息并反馈

## 局域网访问配置

- 后端（IP 与端口）：
  - 监听地址：默认 `0.0.0.0`，已启用局域网访问（`server/index.js:618`）。
  - 端口：默认 `3000`，可通过环境变量 `PORT` 调整（`server/index.js:617`）。
  - 上传地址基准：设置 `SERVER_ORIGIN` 为服务器 IP，保证附件 URL 使用服务器 IP。例如 PowerShell：
    - `$env:PORT=3000; $env:SERVER_ORIGIN="http://<服务器IP>:3000"; npm run server`
    - 参考实现位置：`server/index.js:33`（自动选择局域网 IPv4）与上传接口返回绝对 URL：`server/index.js:216`。

- 前端（开发模式）：
  - 访问地址：`http://<服务器IP>:5173/`（`vite.config.js` 已配置 `host: '0.0.0.0'`）。
  - API 基址自动检测：登录页健康检查会写入 `window.ZSK_SERVER_ORIGIN`，前端默认无需硬编码 IP（`src/services/api.js:1`）。如需手动指定，可在运行前设置：
    - `$env:VITE_API_BASE="http://<服务器IP>:3000"; npm run dev`

- 附件（uploads）：
  - 静态路径：后端提供 `/uploads/...` 静态访问（`server/index.js:622`）。
  - URL 构造：上传接口返回 `${SERVER_ORIGIN}/uploads/...`，确保局域网访问统一使用服务器 IP（`server/index.js:216`）。

- 数据库（dev.db）：
  - 位置：本地文件，默认 `prisma/dev.db`（`server/index.js:661` 的解析逻辑）。
  - 修改：通过环境变量 `DATABASE_URL` 指定，例如 `file:C:\path\to\dev.db`。数据库文件不应通过前端或 HTTP 暴露，不涉及 IP 配置。

- 生产环境建议（可选）：
  - 单端口部署：由后端同时托管构建产物与 `/uploads`，统一使用 `http://<服务器IP>:3000`，避免跨端口与硬编码。
