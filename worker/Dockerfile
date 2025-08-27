# Worker Dockerfile
FROM node:20-slim

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 安装 Claude CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 创建 claude 数据目录
RUN mkdir -p /app/.claude

# 暴露端口
EXPOSE 3002

# 启动 Worker
CMD ["node", "worker.js"]