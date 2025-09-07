Set WshShell = CreateObject("WScript.Shell") 
WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API\backend"" && node server-smart-claude.js", 0, False 
WScript.Sleep 5000   
WshShell.Run "cmd /c cd /d ""C:\Users\jiang\claude API"" && yarn dev", 0, False 
Set WshShell = Nothing 
