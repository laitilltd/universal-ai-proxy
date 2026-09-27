Add-Type -AssemblyName System.Drawing

$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Clear transparent background
$g.Clear([System.Drawing.Color]::Transparent)

# Dark high-contrast background circle (Black & White style)
$rect = New-Object System.Drawing.Rectangle 2, 2, 60, 60
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#09090b'))
$g.FillEllipse($bgBrush, $rect)

# Sharp white outer border
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#ffffff')), 2.5
$g.DrawEllipse($pen, 3, 3, 58, 58)

# Center text "UAI"
$fontFamily = New-Object System.Drawing.FontFamily("Arial")
$font = New-Object System.Drawing.Font($fontFamily, 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
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

Write-Host "app.ico generated successfully with text 'UAI' at $icoPath"
