@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ╔════════════════════════════════════════════╗
echo ║     Claude API Wrapper 启动脚本            ║
echo ╚════════════════════════════════════════════╝
echo.

:: 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker 未运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

:: 检查是否存在 .env 文件
if not exist .env (
    echo 📝 未找到 .env 文件，正在从 .env.example 创建...
    copy .env.example .env >nul
    echo ✅ 已创建 .env 文件，请编辑配置后重新运行
    echo.
    echo 重要配置项：
    echo   - CLAUDE_API_KEY: 你的 Claude API Key
    echo   - JWT_SECRET: JWT 密钥（用于安全认证）
    echo   - ADMIN_PASSWORD: 管理员密码
    echo.
    pause
    exit /b 0
)

:menu
cls
echo ╔════════════════════════════════════════════╗
echo ║     Claude API Wrapper 控制面板            ║
echo ╚════════════════════════════════════════════╝
echo.
echo 请选择操作：
echo.
echo   [1] 🚀 启动基础模式 (单个 Worker)
echo   [2] 🚀 启动高级模式 (多个 Worker)
echo   [3] 🔧 启动开发模式 (显示日志)
echo   [4] 🛑 停止所有服务
echo   [5] 📊 查看服务状态
echo   [6] 🔄 重启所有服务
echo   [7] 📝 查看日志
echo   [8] 🗑️  重置数据库 (危险!)
echo   [9] 退出
echo.
set /p choice="请输入选项 [1-9]: "

if "%choice%"=="1" goto start_basic
if "%choice%"=="2" goto start_advanced
if "%choice%"=="3" goto start_dev
if "%choice%"=="4" goto stop
if "%choice%"=="5" goto status
if "%choice%"=="6" goto restart
if "%choice%"=="7" goto logs
if "%choice%"=="8" goto reset
if "%choice%"=="9" goto end

echo ❌ 无效选项
pause
goto menu

:start_basic
echo.
echo 🚀 启动基础模式...
docker-compose up -d postgres redis backend worker1 frontend nginx
echo.
echo ✅ 服务已启动！
goto show_info

:start_advanced
echo.
echo 🚀 启动高级模式...
docker-compose --profile multi-worker up -d
echo.
echo ✅ 所有服务已启动！
goto show_info

:start_dev
echo.
echo 🚀 启动开发模式...
docker-compose up
goto menu

:stop
echo.
echo 🛑 停止所有服务...
docker-compose down
echo.
echo ✅ 服务已停止
pause
goto menu

:status
echo.
echo 📊 服务状态：
echo.
docker-compose ps
echo.
pause
goto menu

:restart
echo.
echo 🔄 重启所有服务...
docker-compose restart
echo.
echo ✅ 服务已重启
pause
goto menu

:logs
echo.
echo 选择要查看的服务日志：
echo   [1] 后端 (backend)
echo   [2] Worker 1
echo   [3] 前端 (frontend)
echo   [4] 数据库 (postgres)
echo   [5] Redis
echo   [6] 所有服务
echo.
set /p log_choice="请输入选项 [1-6]: "

if "%log_choice%"=="1" docker-compose logs -f backend
if "%log_choice%"=="2" docker-compose logs -f worker1
if "%log_choice%"=="3" docker-compose logs -f frontend
if "%log_choice%"=="4" docker-compose logs -f postgres
if "%log_choice%"=="5" docker-compose logs -f redis
if "%log_choice%"=="6" docker-compose logs -f

goto menu

:reset
echo.
echo ⚠️  警告：这将删除所有数据！
set /p confirm="确定要重置数据库吗？(yes/no): "
if /i "%confirm%"=="yes" (
    docker-compose down -v
    echo.
    echo ✅ 数据库已重置
) else (
    echo ❌ 操作已取消
)
pause
goto menu

:show_info
echo.
echo ════════════════════════════════════════════
echo 🎉 Claude API Wrapper 已成功启动！
echo.
echo 访问地址：
echo   - 管理界面: http://localhost
echo   - API 端点: http://localhost/api
echo   - 健康检查: http://localhost/health
echo.
echo 默认管理员账号：
echo   - 邮箱: admin@example.com
echo   - 密码: 查看 .env 文件
echo.
echo 快捷操作：
echo   - 查看日志: docker-compose logs -f [服务名]
echo   - 停止服务: docker-compose down
echo   - 重启服务: docker-compose restart
echo ════════════════════════════════════════════
echo.
pause
goto menu

:end
exit /b 0