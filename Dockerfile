# Root Dockerfile - 指向 wanderlog_api 子目录
FROM node:20-alpine

WORKDIR /app

# 复制 wanderlog_api 目录
COPY wanderlog_api/package*.json ./
COPY wanderlog_api/prisma ./prisma/

# 安装依赖
RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY wanderlog_api/ .

# 构建 TypeScript
RUN npm run build

# 删除 devDependencies
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
