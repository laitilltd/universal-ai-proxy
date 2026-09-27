# Universal AI Proxy - Windows System Tray Launcher & Server Monitor
# Runs Node server in background and provides system tray menu.

param(
    [string]$Port = "3000"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Determine Port from env or .env file
if ($env:PORT) {
    $Port = $env:PORT
} elseif (Test-Path "$ScriptDir\.env") {
    $envLines = Get-Content "$ScriptDir\.env"
    foreach ($line in $envLines) {
        if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)["'']?') {
            $Port = $matches[1]
        }
    }
}

$ServerUrl = "http://localhost:$Port/"
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RegName = "UniversalAIProxy"
$VbsPath = "$ScriptDir\start.vbs"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Find Node executable path
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { $nodePath = "node" }

# Regex to match ONLY server.js (excluding custom-server.js)
$serverRegex = '(?i)(^|[\s\\/])server\.js(\s|"|$)'

# Check if node server.js is already running
$existingProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match $serverRegex }
$serverProcess = $null

if ($null -eq $existingProcs -or @($existingProcs).Count -eq 0) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodePath
    $psi.Arguments = "server.js"
    $psi.WorkingDirectory = $ScriptDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables["PORT"] = [string]$Port

    $serverProcess = [System.Diagnostics.Process]::Start($psi)
} else {
    $firstProc = @($existingProcs)[0]
    $serverProcess = Get-Process -Id $firstProc.ProcessId -ErrorAction SilentlyContinue
}

# Wait up to 6 seconds for server to be responsive on health endpoint
$serverReady = $false
for ($i = 0; $i -lt 12; $i++) {
    try {
        $req = [System.Net.WebRequest]::Create("http://localhost:$Port/health")
        $req.Timeout = 1000
        $resp = $req.GetResponse()
        if ($resp.StatusCode -eq [System.Net.HttpStatusCode]::OK) {
            $serverReady = $true
            $resp.Close()
            break
        }
        $resp.Close()
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

# System Tray Icon Setup (Use custom app.ico if available)
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$icoFile = Join-Path $ScriptDir "app.ico"
if (Test-Path $icoFile) {
    $notifyIcon.Icon = New-Object System.Drawing.Icon($icoFile)
} else {
    $nodeExePath = (Get-Process -Id $PID).Path
    $notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($nodeExePath)
}
$notifyIcon.Text = "Universal AI Proxy ($Port)"
$notifyIcon.Visible = $true

# Context Menu
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

# 1. Open Chat
$menuOpenChat = New-Object System.Windows.Forms.ToolStripMenuItem
$menuOpenChat.Text = "Open Chat"
$menuOpenChat.Font = New-Object System.Drawing.Font($menuOpenChat.Font, [System.Drawing.FontStyle]::Bold)
$menuOpenChat.Add_Click({
    [System.Diagnostics.Process]::Start($ServerUrl)
})
$contextMenu.Items.Add($menuOpenChat) | Out-Null

# 2. Auto Start Enable / Disable
$menuAutoStart = New-Object System.Windows.Forms.ToolStripMenuItem

function Update-AutoStartMenuState {
    $exists = Get-ItemProperty -Path $RegPath -Name $RegName -ErrorAction SilentlyContinue
    if ($null -ne $exists) {
        $menuAutoStart.Text = "Auto Start Enabled"
        $menuAutoStart.Checked = $true
    } else {
        $menuAutoStart.Text = "Auto Start Enable"
        $menuAutoStart.Checked = $false
    }
}

Update-AutoStartMenuState

$menuAutoStart.Add_Click({
    $exists = Get-ItemProperty -Path $RegPath -Name $RegName -ErrorAction SilentlyContinue
    if ($null -ne $exists) {
        Remove-ItemProperty -Path $RegPath -Name $RegName -ErrorAction SilentlyContinue
        $notifyIcon.ShowBalloonTip(3000, "Universal AI Proxy", "Auto Start on Windows boot disabled.", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $cmdToRun = "wscript.exe `"$VbsPath`""
        Set-ItemProperty -Path $RegPath -Name $RegName -Value $cmdToRun
        $notifyIcon.ShowBalloonTip(3000, "Universal AI Proxy", "Auto Start on Windows boot enabled!", [System.Windows.Forms.ToolTipIcon]::Info)
    }
    Update-AutoStartMenuState
})
$contextMenu.Items.Add($menuAutoStart) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# 3. Developers Contact
$menuContact = New-Object System.Windows.Forms.ToolStripMenuItem
$menuContact.Text = "Developers Contact"
$menuContact.Add_Click({
    [System.Diagnostics.Process]::Start("http://mahediazad.com")
})
$contextMenu.Items.Add($menuContact) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# 4. Quit
$menuQuit = New-Object System.Windows.Forms.ToolStripMenuItem
$menuQuit.Text = "Quit"
$menuQuit.Add_Click({
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()

    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        try { $serverProcess.Kill() } catch {}
    }

    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match $serverRegex } | ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }

    [System.Windows.Forms.Application]::Exit()
})
$contextMenu.Items.Add($menuQuit) | Out-Null

$notifyIcon.ContextMenuStrip = $contextMenu

# Double click tray icon opens Chat
$notifyIcon.Add_DoubleClick({
    [System.Diagnostics.Process]::Start($ServerUrl)
})

# Show startup balloon tip
if ($serverReady) {
    $notifyIcon.ShowBalloonTip(3000, "Universal AI Proxy Running", "Server active on $ServerUrl`nRight-click tray icon for options.", [System.Windows.Forms.ToolTipIcon]::Info)
} else {
    $notifyIcon.ShowBalloonTip(4000, "Universal AI Proxy Starting...", "Server starting on $ServerUrl...`nRight-click tray icon for options.", [System.Windows.Forms.ToolTipIcon]::Warning)
}

# Display startup information dialog to user
$popupText = "Universal AI Proxy server is running!`n`nURL: $ServerUrl`n`nSystem Tray: A tray icon has been added to your taskbar.`nRight-click the icon anytime to open chat, toggle auto-start, or quit.`n`nWould you like to open the Chat UI in your browser now?"
$popupTitle = "Universal AI Proxy - Server Running"
$dialogResult = [System.Windows.Forms.MessageBox]::Show($popupText, $popupTitle, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Information)

if ($dialogResult -eq [System.Windows.Forms.DialogResult]::Yes) {
    [System.Diagnostics.Process]::Start($ServerUrl)
}

[System.Windows.Forms.Application]::Run()
