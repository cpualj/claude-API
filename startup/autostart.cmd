@echo off
title Claude API Manager

:menu
cls
echo.
echo ==============================
echo  Claude API Manager
echo ==============================
echo.
echo [1] Install Auto-Startup
echo [2] Remove Auto-Startup  
echo [3] Start Services
echo [4] Stop Services
echo [5] Exit
echo.
set /p choice=Choose option: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto remove
if "%choice%"=="3" goto start
if "%choice%"=="4" goto stop
if "%choice%"=="5" goto exit
echo Invalid choice!
pause
goto menu

:install
echo.
echo Cleaning old tasks...
schtasks /delete /tn "ClaudeAPI-AutoStart" /f >nul 2>&1
schtasks /delete /tn "ClaudeAPI-Silent-AutoStart" /f >nul 2>&1
schtasks /delete /tn "ClaudeAPI" /f >nul 2>&1

echo Creating startup script...
echo Set WshShell = CreateObject("WScript.Shell") > startup.vbs
echo WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API\backend"" && node server-smart-claude.js", 0, False >> startup.vbs
echo WScript.Sleep 5000 >> startup.vbs  
echo WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API"" && yarn dev", 0, False >> startup.vbs
echo Set WshShell = Nothing >> startup.vbs

echo Installing auto-startup task...
schtasks /create /tn "ClaudeAPI" /tr "wscript.exe \"%~dp0startup.vbs\"" /sc onlogon /ru "%USERNAME%" /f >nul 2>&1

if %errorlevel% equ 0 (
    echo SUCCESS: Auto-startup installed!
    echo Services will start automatically after login
) else (
    echo ERROR: Need administrator rights
    echo Right-click this file and select "Run as administrator"
)
pause
goto menu

:remove
echo.
echo Removing all auto-startup tasks...
schtasks /delete /tn "ClaudeAPI" /f >nul 2>&1
schtasks /delete /tn "ClaudeAPI-AutoStart" /f >nul 2>&1  
schtasks /delete /tn "ClaudeAPI-Silent-AutoStart" /f >nul 2>&1
del startup.vbs >nul 2>&1
echo All auto-startup tasks removed!
pause
goto menu

:start
echo.
echo Starting services...
if not exist startup.vbs (
    echo Set WshShell = CreateObject("WScript.Shell") > startup.vbs
    echo WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API\backend"" && node server-smart-claude.js", 0, False >> startup.vbs
    echo WScript.Sleep 5000 >> startup.vbs
    echo WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API"" && yarn dev", 0, False >> startup.vbs
    echo Set WshShell = Nothing >> startup.vbs
)
wscript startup.vbs
echo Services started! Check http://localhost:3030
pause
goto menu

:stop
echo.
echo Stopping services...
taskkill /f /im node.exe >nul 2>&1
echo Services stopped!
pause
goto menu

:exit
exit