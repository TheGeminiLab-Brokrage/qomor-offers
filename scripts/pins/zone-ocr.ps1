# OCR one small region at high zoom and report label positions normalised on
# the FULL drawing. Used to recover the handful of labels the tiled pass missed.
param(
  [string]$In,
  [double]$X, [double]$Y, [double]$W, [double]$H,
  [double]$Zoom = 4.0
)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($In)
$PW = $src.Width; $PH = $src.Height
$cx = [int]($X * $PW); $cy = [int]($Y * $PH)
$cw = [int]($W * $PW); $ch = [int]($H * $PH)

$tmp = [System.IO.Path]::GetTempFileName() + ".png"
$dst = New-Object System.Drawing.Bitmap([int]($cw * $Zoom), [int]($ch * $Zoom))
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $dst.Width, $dst.Height)),
             (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)),
             [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $dst.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $dst.Dispose()

$base = [System.IO.Path]::ChangeExtension($tmp, $null).TrimEnd('.')
& "C:\Program Files\Tesseract-OCR\tesseract.exe" $tmp $base --psm 11 tsv 2>$null

$tsv = "$base.tsv"
$rows = Import-Csv $tsv -Delimiter "`t"
"text    conf   normX    normY    h"
foreach ($r in $rows) {
  $t = $r.text.Trim()
  if ($t -notmatch '^\d{3}$') { continue }
  $nx = ($cx + ([double]$r.left + [double]$r.width / 2) / $Zoom) / $PW
  $ny = ($cy + ([double]$r.top + [double]$r.height / 2) / $Zoom) / $PH
  "{0,-7} {1,-6} {2:F4}  {3:F4}  {4:F1}" -f $t, [int][double]$r.conf, $nx, $ny, ([double]$r.height / $Zoom)
}
Remove-Item $tmp, $tsv -Force -ErrorAction SilentlyContinue
$src.Dispose()
