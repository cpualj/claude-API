@echo off
chcp 65001 >nul
echo Stopping Claude API Services...

echo Stopping Node.js processes...
taskkill /f /im node.exe 2>nul

echo Stopping any remaining processes on ports 3030 and 3006...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3030') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3006') do taskkill /f /pid %%a 2>nul

echo Services stopped.
timeout /t 2 /nobreak >nul