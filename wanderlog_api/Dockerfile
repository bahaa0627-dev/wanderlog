# 使用 Node.js 20 Alpine 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY prisma ./prisma/

# 安装依赖（使用 npm install 而不是 npm ci，因为可能没有 package-lock.json）
RUN npm install --omit=dev

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build 2>/dev/null || echo "No build script"

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]
