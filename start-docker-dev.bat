@echo off
REM Docker 开发环境启动脚本

echo ======================================
echo  Claude API Docker 开发环境启动
echo ======================================
echo.

REM 检查 Docker 是否运行
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker Desktop 未运行！
    echo.
    echo 请按以下步骤操作：
    echo 1. 手动启动 Docker Desktop
    echo 2. 等待 Docker 图标变为绿色
    echo 3. 重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo [✓] Docker Desktop 正在运行
echo.

REM 停止旧容器（如果存在）
echo 清理旧容器...
docker-compose -f docker-compose-dev.yml down >nul 2>&1

REM 构建镜像
echo 构建 Docker 镜像...
docker-compose -f docker-compose-dev.yml build

if %errorlevel% neq 0 (
    echo [错误] Docker 镜像构建失败！
    pause
    exit /b 1
)

echo.
echo 启动服务...
docker-compose -f docker-compose-dev.yml up -d

if %errorlevel% neq 0 (
    echo [错误] 服务启动失败！
    pause
    exit /b 1
)

echo.
echo 等待服务就绪...
timeout /t 10 /nobreak >nul

echo.
echo ======================================
echo  ✅ 服务启动成功！
echo ======================================
echo.
echo 服务地址：
echo   - Orchestrator API: http://localhost:3000
echo   - PostgreSQL:       localhost:5432
echo   - Redis:            localhost:6379
echo   - Test Worker:      localhost:4001
echo.
echo 健康检查：
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% eq 0 (
    echo   [✓] API 健康检查通过
) else (
    echo   [!] API 健康检查失败，请稍后重试
)

echo.
echo 常用命令：
echo   查看日志:  docker-compose -f docker-compose-dev.yml logs -f
echo   停止服务:  docker-compose -f docker-compose-dev.yml down
echo   重启服务:  docker-compose -f docker-compose-dev.yml restart
echo.
pause