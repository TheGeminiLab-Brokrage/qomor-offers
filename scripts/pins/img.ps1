# Crop / scale helper for the floor drawings. System.Drawing so there is no
# dependency to install.
#   img.ps1 -In SP.png -Out o.png -Scale 0.25
#   img.ps1 -In SP.png -Out o.png -X 0.18 -Y 0.50 -W 0.22 -H 0.12 -Zoom 2
param(
  [string]$In,
  [string]$Out,
  [double]$X = 0, [double]$Y = 0, [double]$W = 1, [double]$H = 1,
  [double]$Zoom = 1,
  [double]$Scale = 0
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile($In)
$cx = [int]($X * $src.Width); $cy = [int]($Y * $src.Height)
$cw = [int]($W * $src.Width); $ch = [int]($H * $src.Height)
if ($Scale -gt 0) { $ow = [int]($cw * $Scale); $oh = [int]($ch * $Scale) }
else { $ow = [int]($cw * $Zoom); $oh = [int]($ch * $Zoom) }
$dst = New-Object System.Drawing.Bitmap($ow, $oh)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $ow, $oh)),
             (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)),
             [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose(); $src.Dispose()
"$Out  ${ow}x${oh}  (crop ${cx},${cy} ${cw}x${ch} of $($src.Width)x$($src.Height))"
