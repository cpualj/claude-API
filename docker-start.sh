#!/bin/bash

# Claude Multi-Account Docker 启动脚本
# 自动配置和启动 Docker 容器

set -e

echo "🚀 Claude Multi-Account Docker Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装。请先安装 Docker Desktop。"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装。"
    exit 1
fi

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo "📝 创建 .env 配置文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，配置您的 Claude 账号信息"
    echo "   然后重新运行此脚本"
    exit 0
fi

# 检查必要的环境变量
source .env
if [ -z "$CLAUDE_EMAIL_1" ] || [ -z "$CLAUDE_EMAIL_2" ]; then
    echo "❌ 请在 .env 文件中配置至少 2 个 Claude 账号"
    exit 1
fi

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p claude-configs/account1
mkdir -p claude-configs/account2
mkdir -p claude-configs/account3

# 构建镜像
echo "🔨 构建 Docker 镜像..."
docker-compose -f docker-compose-multi-account.yml build

# 启动基础服务
echo "🔧 启动基础服务 (Redis, PostgreSQL)..."
docker-compose -f docker-compose-multi-account.yml up -d redis postgres

# 等待数据库就绪
echo "⏳ 等待数据库就绪..."
sleep 10

# 初始化数据库
echo "🗄️ 初始化数据库..."
docker exec -i claude-postgres psql -U claude_user -d claude_api < init.sql || true

# 启动 Worker 和 Orchestrator
echo "🤖 启动 Worker 节点..."
docker-compose -f docker-compose-multi-account.yml up -d claude-worker-account1 claude-worker-account2

# 检查是否有第三个账号
if [ ! -z "$CLAUDE_EMAIL_3" ]; then
    echo "🤖 启动第三个 Worker 节点..."
    docker-compose -f docker-compose-multi-account.yml --profile multi-account up -d claude-worker-account3
fi

# 启动 Orchestrator
echo "🎯 启动负载均衡器..."
docker-compose -f docker-compose-multi-account.yml up -d orchestrator

# 启动前端
echo "🌐 启动前端界面..."
docker-compose -f docker-compose-multi-account.yml up -d frontend

# 等待服务就绪
echo "⏳ 等待所有服务就绪..."
sleep 10

# 检查服务状态
echo ""
echo "✅ 检查服务状态..."
docker-compose -f docker-compose-multi-account.yml ps

# 健康检查
echo ""
echo "🏥 执行健康检查..."
curl -s http://localhost:3000/health | python3 -m json.tool || echo "⚠️  健康检查失败，请稍后重试"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Claude Multi-Account 系统已启动！"
echo ""
echo "🌐 前端界面: http://localhost:3030"
echo "🔌 API 端点: http://localhost:3000"
echo "📊 健康检查: http://localhost:3000/health"
echo "📊 Worker 状态: http://localhost:3000/api/workers"
echo ""
echo "查看日志: docker-compose -f docker-compose-multi-account.yml logs -f"
echo "停止服务: docker-compose -f docker-compose-multi-account.yml down"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"