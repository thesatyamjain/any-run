Add-Type -AssemblyName System.Drawing

function Generate-AppIcon($outputDir) {
  $size = 512
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # 1. Background squircle
  $rect = New-Object System.Drawing.Rectangle(16, 16, 480, 480)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 100
  $path.AddArc(16, 16, $r, $r, 180, 90)
  $path.AddArc(496 - $r, 16, $r, $r, 270, 90)
  $path.AddArc(496 - $r, 496 - $r, $r, $r, 0, 90)
  $path.AddArc(16, 496 - $r, $r, $r, 90, 90)
  $path.CloseFigure()

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 20, 23, 28), [System.Drawing.Color]::FromArgb(255, 12, 14, 17), 45)
  $g.FillPath($bgBrush, $path)
  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 37, 43, 52), 6)
  $g.DrawPath($borderPen, $path)

  # 2. Golden Energy Bolt
  [System.Drawing.PointF[]]$boltPoints = @(
    [System.Drawing.PointF]::new(278, 74),
    [System.Drawing.PointF]::new(116, 280),
    [System.Drawing.PointF]::new(252, 280),
    [System.Drawing.PointF]::new(234, 438),
    [System.Drawing.PointF]::new(396, 232),
    [System.Drawing.PointF]::new(260, 232)
  )
  $boltPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $boltPath.AddPolygon($boltPoints)

  $boltBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(116, 74, 280, 364)),
    [System.Drawing.Color]::FromArgb(255, 251, 191, 36),
    [System.Drawing.Color]::FromArgb(255, 217, 119, 6),
    65
  )
  $g.FillPath($boltBrush, $boltPath)
  $boltPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 253, 230, 138), 3)
  $g.DrawPath($boltPen, $boltPath)

  # 3. Cyan Pulse Beacon
  $cyanGlowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 6, 182, 212))
  $g.FillEllipse($cyanGlowBrush, 365, 365, 50, 50)
  $cyanDotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
  $g.FillEllipse($cyanDotBrush, 377, 377, 26, 26)
  $cyanBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 236, 254, 255), 3)
  $g.DrawEllipse($cyanBorder, 377, 377, 26, 26)

  $pngPath = Join-Path $outputDir "icon.png"
  $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

  # Generate 256x256 for ICO
  $icoBmp = New-Object System.Drawing.Bitmap($bmp, 256, 256)
  $hIcon = $icoBmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($hIcon)
  $icoPath = Join-Path $outputDir "icon.ico"
  $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
  $icon.Save($fs)
  $fs.Close()

  $g.Dispose()
  $bmp.Dispose()
  $icoBmp.Dispose()
  Write-Host "Icons generated successfully at $outputDir"
}

Generate-AppIcon "e:\any-run\src\desktop\assets"
