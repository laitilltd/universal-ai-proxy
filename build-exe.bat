@echo off
echo Compiling start.exe...
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /win32icon:"%~dp0app.ico" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Management.dll /out:"%~dp0start.exe" "%~dp0TrayApp.cs"
if %ERRORLEVEL% EQU 0 (
    echo Successfully compiled start.exe!
) else (
    echo Compilation failed.
)
