# 前端 Dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3030

# 启动开发服务器（生产环境应该先 build）
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]