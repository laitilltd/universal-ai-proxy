Add-Type -AssemblyName System.Drawing

$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Transparent background
$g.Clear([System.Drawing.Color]::Transparent)

# Dark background circle
$rect = New-Object System.Drawing.Rectangle 2, 2, 60, 60
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#09090b'))
$g.FillEllipse($bgBrush, $rect)

# Vibrant Colored Outer Border Ring (Electric Indigo / Cyan Gradient border)
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#6366f1')), 3.0
$g.DrawEllipse($pen, 3, 3, 58, 58)

# Inner accent ring (Cyan glow)
$innerPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#06b6d4')), 1.0
$g.DrawEllipse($innerPen, 5, 5, 54, 54)

# Bold white text "UAI" centered inside colored border
$fontFamily = New-Object System.Drawing.FontFamily("Arial Black")
$font = New-Object System.Drawing.Font($fontFamily, 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$textRect = New-Object System.Drawing.RectangleF 0, 0, 64, 64
$g.DrawString("UAI", $font, $textBrush, $textRect, $stringFormat)

# Convert to Icon
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) "app.ico"
if (Test-Path $icoPath) { Remove-Item $icoPath -Force }

$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()

$bmp.Dispose()
$g.Dispose()

Write-Host "app.ico updated with 'UAI' text and colored border at $icoPath"
