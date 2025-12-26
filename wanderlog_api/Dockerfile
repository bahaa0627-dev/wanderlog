# 使用 Node.js 20 Alpine 镜像
FROM node:20-alpine

WORKDIR /app

# 破坏缓存用的时间戳（每次修改这行）
RUN echo "CACHE_BUST=2025-12-26-v4"

# 复制 package 文件和 prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# 安装所有依赖
RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 删除 devDependencies
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
