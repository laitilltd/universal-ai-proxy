@echo off
echo Compiling UniversalAIProxy.exe...
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /win32icon:"%~dp0app.ico" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Management.dll /out:"%~dp0UniversalAIProxy.exe" "%~dp0TrayApp.cs"
if %ERRORLEVEL% EQU 0 (
    echo Successfully compiled UniversalAIProxy.exe!
) else (
    echo Compilation failed.
)
