# 使用 Node.js 20 Alpine 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY prisma ./prisma/

# 安装所有依赖（包括 devDependencies，因为需要 prisma CLI 和 typescript）
RUN npm install

# 使用项目安装的 prisma 版本生成 Client
RUN ./node_modules/.bin/prisma generate

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 验证构建产物存在
RUN ls -la dist/ && echo "✅ Build artifacts verified"

# 删除 devDependencies 减小镜像体积（但保留 @prisma/client）
RUN npm prune --omit=dev

# 暴露端口
EXPOSE 3000

# 诊断启动命令
CMD ["sh", "-c", "set -ex; pwd; ls -la; ls -la dist; echo PORT=$PORT; echo '--- dist/index.js head ---'; head -n 50 dist/index.js; echo '--- run ---'; node dist/index.js"]
