#!/bin/bash

# Claude API Wrapper 一键启动脚本

set -e

echo "╔════════════════════════════════════════════╗"
echo "║     Claude API Wrapper 启动脚本            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    echo "访问 https://docs.docker.com/get-docker/ 获取安装指南"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "📝 未找到 .env 文件，正在从 .env.example 创建..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑配置后重新运行"
    echo ""
    echo "重要配置项："
    echo "  - CLAUDE_API_KEY: 你的 Claude API Key"
    echo "  - JWT_SECRET: JWT 密钥（用于安全认证）"
    echo "  - ADMIN_PASSWORD: 管理员密码"
    echo ""
    exit 0
fi

# 选择启动模式
echo "请选择启动模式："
echo "1) 基础模式 (单个 Worker)"
echo "2) 高级模式 (多个 Worker，负载均衡)"
echo "3) 开发模式 (前台运行，显示日志)"
echo "4) 停止所有服务"
echo "5) 查看服务状态"
echo "6) 重置数据库"
echo ""
read -p "请输入选项 [1-6]: " choice

case $choice in
    1)
        echo "🚀 启动基础模式..."
        docker-compose up -d postgres redis backend worker1 frontend nginx
        echo "✅ 服务已启动！"
        ;;
    2)
        echo "🚀 启动高级模式..."
        docker-compose --profile multi-worker up -d
        echo "✅ 所有服务已启动！"
        ;;
    3)
        echo "🚀 启动开发模式..."
        docker-compose up
        ;;
    4)
        echo "🛑 停止所有服务..."
        docker-compose down
        echo "✅ 服务已停止"
        ;;
    5)
        echo "📊 服务状态："
        docker-compose ps
        ;;
    6)
        echo "⚠️  警告：这将删除所有数据！"
        read -p "确定要重置数据库吗？(yes/no): " confirm
        if [ "$confirm" == "yes" ]; then
            docker-compose down -v
            echo "✅ 数据库已重置"
        else
            echo "❌ 操作已取消"
        fi
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

# 显示访问信息
if [ "$choice" == "1" ] || [ "$choice" == "2" ]; then
    echo ""
    echo "════════════════════════════════════════════"
    echo "访问地址："
    echo "  - 前端界面: http://localhost"
    echo "  - API 文档: http://localhost/api/docs"
    echo "  - 健康检查: http://localhost/health"
    echo ""
    echo "默认管理员账号："
    echo "  - 邮箱: admin@example.com"
    echo "  - 密码: 查看 .env 文件中的 ADMIN_PASSWORD"
    echo ""
    echo "查看日志："
    echo "  docker-compose logs -f [service_name]"
    echo ""
    echo "停止服务："
    echo "  docker-compose down"
    echo "════════════════════════════════════════════"
fi