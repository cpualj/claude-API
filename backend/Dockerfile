# 后端 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["node", "server.js"]