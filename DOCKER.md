# 在 Docker 环境下运行 ZSK（前后端合并镜像）

本文档说明如何在 Docker 中构建与运行一个同时包含前端与后端的单镜像，镜像名称为 `zhishiku`。

## 构建镜像

- 构建命令：

```bash
docker build -t zhishiku .
docker build -t zhishiku:alpine .
```

镜像构建过程包含：
- 安装依赖并生成 Prisma Client
- 构建前端产物 `dist-web`
- 将后端 `server/index.js` 与前端静态站点打包到同一镜像中

## 运行容器

- 推荐将数据库与附件目录挂载到宿主机，避免数据随容器删除而丢失：

```bash
# Linux/macOS 示例（宿主机路径 /opt/zsk-data）
docker run -d --name zhishiku \
  -p 3000:3000 \
  -v /opt/zsk-data:/data \
  -e DATABASE_URL="file:/data/dev.db" \
  -e ZSK_UPLOADS_DIR="/data/uploads" \
  -e ZSK_LISTEN_HOST="0.0.0.0" \
  -e SERVER_ORIGIN="http://<宿主机IP>:3000" \
  zhishiku
```

> Windows PowerShell 示例：将 `-v` 改为宿主机本地路径，例如 `D:\data:/data`。
>
> 示例：
>
> ```powershell
> docker run -d --name zhishiku `
>   -p 3000:3000 `
>   -v D:\data:/data `
>   -e DATABASE_URL="file:/data/dev.db" `
>   -e ZSK_UPLOADS_DIR="/data/uploads" `
>   -e ZSK_LISTEN_HOST="0.0.0.0" `
>   -e SERVER_ORIGIN="http://<宿主机IP>:3000" `
>   zhishiku
> ```

### 环境变量说明
- `PORT`：后端监听端口（默认 `3000`）。
- `ZSK_LISTEN_HOST`：绑定主机地址（默认 `0.0.0.0`）。
- `DATABASE_URL`：SQLite 数据库文件路径，建议使用挂载卷（示例 `file:/data/dev.db`）。
- `ZSK_UPLOADS_DIR`：附件上传目录，建议使用挂载卷（示例 `/data/uploads`）。
- `SERVER_ORIGIN`：服务对外可达的完整地址（含协议与端口），用于生成附件访问 URL。Docker 环境内自动检测到的是容器内网 IP，通常不可直接访问，建议显式设置为 `http://<宿主机IP>:3000`。

### 目录挂载
- 建议将宿主机目录（例如 `/opt/zsk-data` 或 `D:\data`）映射为容器内 `/data`：
  - 数据库文件：`/data/dev.db`
  - 附件目录：`/data/uploads`

### 访问地址
- 前后端合并后，直接访问：
  - `http://<宿主机IP>:3000/` 前端站点
  - `http://<宿主机IP>:3000/api/...` 后端接口
  - `http://<宿主机IP>:3000/uploads/...` 附件静态资源

## 备份与恢复
- 在前端系统设置中可下载备份 ZIP（数据库+附件）。
- 也可使用容器卷在宿主机直接备份 `/opt/zsk-data`（或 `D:\data`）。

## 更新镜像
- 拉取最新代码后重新构建：

```bash
docker build -t zhishiku .
```

- 滚动更新（保留数据卷）：

```bash
docker rm -f zhishiku
# 重新运行同样的 docker run 命令（卷仍然挂载到同一宿主机目录）
```

## 可选：使用 docker-compose

```yaml
services:
  zhishiku:
    image: zhishiku
    build: .
    container_name: zhishiku
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      ZSK_LISTEN_HOST: 0.0.0.0
      DATABASE_URL: file:/data/dev.db
      ZSK_UPLOADS_DIR: /data/uploads
      SERVER_ORIGIN: http://<宿主机IP>:3000
    volumes:
      - /opt/zsk-data:/data
    restart: unless-stopped
```

> 将 `/opt/zsk-data` 替换为宿主机实际数据目录；Windows 请改为 `D:\data:/data`。

---

完成以上步骤后，即可在 Docker 中以单镜像运行 ZSK，前端与后端统一通过 `http://<宿主机IP>:3000` 提供服务。

## 健康检查与接口说明
- 健康检查：`GET /api/health`，返回 `{"ok":true,"prismaOk":true,...}` 表示就绪。
- `GET /api` 或 `GET /api/auth/login` 返回 "Cannot GET ..." 属于正常，这些为 POST 接口；登录与注册由前端发起 `POST /api/auth/login`、`POST /api/auth/register`。

## 故障排查
- Prisma 引擎不匹配：
  - Debian 基镜像需 `debian-openssl-3.0.x`；Alpine 基镜像需 `linux-musl-openssl-3.0.x`。
  - 本项目的多阶段构建已在构建阶段生成并复制正确的 Prisma 引擎到运行阶段（`@prisma/client` 与 `.prisma/client`）。
- 容器内网 IP：
  - 在 Docker 内自动检测的可能是容器内网地址，前端不可直接访问；请设置 `SERVER_ORIGIN` 为宿主机可达地址（如 `http://localhost:3000` 或 `http://<宿主机IP>:3000`）。
