@echo off
REM Claude 多账号配置脚本
REM 为每个账号创建独立的配置目录

echo ======================================
echo   Claude 多账号配置工具
echo ======================================
echo.
echo 此脚本将帮助你配置多个 Claude 账号
echo 每个账号将保存在独立的配置目录中
echo.

REM 创建配置根目录
set CONFIG_ROOT=C:\Users\jiang\claude-configs
if not exist "%CONFIG_ROOT%" mkdir "%CONFIG_ROOT%"

echo 请选择操作：
echo 1. 配置账号 1
echo 2. 配置账号 2
echo 3. 配置账号 3
echo 4. 配置所有账号
echo 5. 查看已配置账号
echo 6. 测试账号
echo 0. 退出
echo.

set /p choice="请输入选项 (0-6): "

if "%choice%"=="1" goto ACCOUNT1
if "%choice%"=="2" goto ACCOUNT2
if "%choice%"=="3" goto ACCOUNT3
if "%choice%"=="4" goto ALL_ACCOUNTS
if "%choice%"=="5" goto CHECK_ACCOUNTS
if "%choice%"=="6" goto TEST_ACCOUNTS
if "%choice%"=="0" exit /b
echo 无效选项！
pause
exit /b

:ACCOUNT1
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 配置账号 1
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account1
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
echo 配置目录: %CLAUDE_CONFIG_DIR%
echo.
echo Claude 将打开浏览器进行登录
echo 请使用你的第一个 Claude 账号登录
echo.
pause
claude login
echo.
echo ✅ 账号 1 配置完成！
echo.
pause
exit /b

:ACCOUNT2
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 配置账号 2
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account2
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
echo 配置目录: %CLAUDE_CONFIG_DIR%
echo.
echo Claude 将打开浏览器进行登录
echo 请使用你的第二个 Claude 账号登录
echo.
pause
claude login
echo.
echo ✅ 账号 2 配置完成！
echo.
pause
exit /b

:ACCOUNT3
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 配置账号 3
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account3
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"
echo 配置目录: %CLAUDE_CONFIG_DIR%
echo.
echo Claude 将打开浏览器进行登录
echo 请使用你的第三个 Claude 账号登录
echo.
pause
claude login
echo.
echo ✅ 账号 3 配置完成！
echo.
pause
exit /b

:ALL_ACCOUNTS
call :ACCOUNT1
call :ACCOUNT2
call :ACCOUNT3
echo.
echo ✅ 所有账号配置完成！
pause
exit /b

:CHECK_ACCOUNTS
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 检查已配置账号
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

if exist "%CONFIG_ROOT%\account1\claude\config.json" (
    echo ✅ 账号 1: 已配置
) else (
    echo ❌ 账号 1: 未配置
)

if exist "%CONFIG_ROOT%\account2\claude\config.json" (
    echo ✅ 账号 2: 已配置
) else (
    echo ❌ 账号 2: 未配置
)

if exist "%CONFIG_ROOT%\account3\claude\config.json" (
    echo ✅ 账号 3: 已配置
) else (
    echo ❌ 账号 3: 未配置
)

echo.
pause
exit /b

:TEST_ACCOUNTS
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 测试账号
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 选择要测试的账号:
echo 1. 测试账号 1
echo 2. 测试账号 2
echo 3. 测试账号 3
echo.

set /p test_choice="请输入选项 (1-3): "

if "%test_choice%"=="1" (
    set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account1
    echo 使用账号 1 配置...
) else if "%test_choice%"=="2" (
    set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account2
    echo 使用账号 2 配置...
) else if "%test_choice%"=="3" (
    set CLAUDE_CONFIG_DIR=%CONFIG_ROOT%\account3
    echo 使用账号 3 配置...
) else (
    echo 无效选项！
    pause
    exit /b
)

echo.
echo 发送测试消息...
claude --print "Hello, this is a test message. Please respond with OK."
echo.
echo 测试完成！
pause
exit /b