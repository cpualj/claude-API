@echo off
REM Claude Multi-Account Docker 启动脚本 (Windows)
REM 自动配置和启动 Docker 容器

echo 🚀 Claude Multi-Account Docker Setup
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker 未安装。请先安装 Docker Desktop。
    pause
    exit /b 1
)

REM 检查 Docker Compose 是否安装
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose 未安装。
    pause
    exit /b 1
)

REM 创建 .env 文件（如果不存在）
if not exist .env (
    echo 📝 创建 .env 配置文件...
    copy .env.example .env
    echo ⚠️  请编辑 .env 文件，配置您的 Claude 账号信息
    echo    然后重新运行此脚本
    pause
    exit /b 0
)

REM 创建必要的目录
echo 📁 创建必要的目录...
if not exist claude-configs\account1 mkdir claude-configs\account1
if not exist claude-configs\account2 mkdir claude-configs\account2
if not exist claude-configs\account3 mkdir claude-configs\account3

REM 构建镜像
echo 🔨 构建 Docker 镜像...
docker-compose -f docker-compose-multi-account.yml build

REM 启动基础服务
echo 🔧 启动基础服务 (Redis, PostgreSQL)...
docker-compose -f docker-compose-multi-account.yml up -d redis postgres

REM 等待数据库就绪
echo ⏳ 等待数据库就绪...
timeout /t 10 /nobreak >nul

REM 初始化数据库
echo 🗄️ 初始化数据库...
docker exec -i claude-postgres psql -U claude_user -d claude_api < init.sql 2>nul

REM 启动 Worker 和 Orchestrator
echo 🤖 启动 Worker 节点...
docker-compose -f docker-compose-multi-account.yml up -d claude-worker-account1 claude-worker-account2

REM 启动 Orchestrator
echo 🎯 启动负载均衡器...
docker-compose -f docker-compose-multi-account.yml up -d orchestrator

REM 启动前端
echo 🌐 启动前端界面...
docker-compose -f docker-compose-multi-account.yml up -d frontend

REM 等待服务就绪
echo ⏳ 等待所有服务就绪...
timeout /t 10 /nobreak >nul

REM 检查服务状态
echo.
echo ✅ 检查服务状态...
docker-compose -f docker-compose-multi-account.yml ps

REM 健康检查
echo.
echo 🏥 执行健康检查...
curl -s http://localhost:3000/health 2>nul

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ✨ Claude Multi-Account 系统已启动！
echo.
echo 🌐 前端界面: http://localhost:3030
echo 🔌 API 端点: http://localhost:3000
echo 📊 健康检查: http://localhost:3000/health
echo 📊 Worker 状态: http://localhost:3000/api/workers
echo.
echo 查看日志: docker-compose -f docker-compose-multi-account.yml logs -f
echo 停止服务: docker-compose -f docker-compose-multi-account.yml down
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pause