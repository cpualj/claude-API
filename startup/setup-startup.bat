@echo off
chcp 65001 >nul
echo Setting up Claude API auto-startup...

echo Creating startup task in Task Scheduler...
schtasks /create /tn "Claude API Services" /tr "C:\Users\jiang\claude API\startup\ClaudeAPI.vbs" /sc onstart /ru "%USERNAME%" /rl highest /f

if %errorlevel% equ 0 (
    echo Auto-startup configured successfully!
    echo The services will start automatically when Windows boots.
) else (
    echo Failed to configure auto-startup. Please run as administrator.
)

echo.
echo Manual start: Double-click ClaudeAPI.vbs
echo Manual stop: Run stop-services.bat
timeout /t 3 /nobreak >nul