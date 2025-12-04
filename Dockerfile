# syntax=docker/dockerfile:1

FROM node:18-alpine AS builder
WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma Client（使用 dev 依赖的 prisma）
RUN npm run prisma:generate

# 构建前端
RUN npm run build


FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_CLIENT_ENGINE_TYPE=library

# 安装运行时依赖（Prisma 引擎需要 OpenSSL）
RUN apk add --no-cache openssl

# 安装仅生产依赖（不复制构建阶段的 node_modules）
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force

# 移除运行阶段的 Prisma 生成（已在构建阶段生成并复制）

# 复制必要文件
COPY server ./server
COPY prisma ./prisma
COPY dist-web ./dist-web

# 复制已生成的 Prisma Client 到独立目录，并设置加载目录
# 将构建阶段生成的 Prisma Client 与引擎复制到运行阶段的 node_modules 中
COPY --from=builder /app/node_modules/@prisma/client /app/node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma/client /app/node_modules/.prisma/client

# 默认运行配置（可在 docker run 时覆盖）
ENV PORT=3000
ENV ZSK_LISTEN_HOST=0.0.0.0
ENV DATABASE_URL=file:/data/dev.db
ENV ZSK_UPLOADS_DIR=/data/uploads
# 在容器环境下建议显式设置对外可达地址，例如 http://<宿主机IP>:3000
# 不设置则后端会尝试自动推断，但在 Docker 内通常会得到容器内网 IP
ENV SERVER_ORIGIN=

EXPOSE 3000

CMD ["node", "server/index.js"]
