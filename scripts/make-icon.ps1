$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskAssets = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
New-Item -ItemType Directory -Force -Path $taskAssets | Out-Null
$taskImage = New-Object System.Drawing.Bitmap 1024,1024
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskImage)
$taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$taskGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#176a56'))
$taskPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White),40
$taskPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskGraphics.DrawEllipse($taskPen,232,232,560,560)
$taskGraphics.DrawLine($taskPen,512,512,512,350)
$taskGraphics.DrawLine($taskPen,512,512,642,580)
$taskGraphics.FillEllipse([System.Drawing.Brushes]::White,484,484,56,56)
$taskImage.Save((Join-Path $taskAssets 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$taskPen.Dispose(); $taskGraphics.Dispose(); $taskImage.Dispose()
