# Draw pins onto a drawing so they can be checked by eye.
# A pin registry that is never looked at is a registry nobody should trust: the
# whole point is that a dot landing in the wrong room is obvious visually and
# invisible in a passing test.
param(
  [string]$Plan,        # source drawing
  [string]$Pins,        # json: [{num,x,y},...]
  [string]$Out,
  [double]$X = 0, [double]$Y = 0, [double]$W = 1, [double]$H = 1,
  [double]$Zoom = 1.0,
  [string]$Highlight = ""   # comma-separated unit numbers to draw in red
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$hl = @()
if ($Highlight) { $hl = $Highlight.Split(',') | ForEach-Object { [int]$_ } }

$src = [System.Drawing.Bitmap]::FromFile($Plan)
$PW = $src.Width; $PH = $src.Height
$cx = [int]($X * $PW); $cy = [int]($Y * $PH)
$cw = [int]($W * $PW); $ch = [int]($H * $PH)
$ow = [int]($cw * $Zoom); $oh = [int]($ch * $Zoom)

$dst = New-Object System.Drawing.Bitmap($ow, $oh)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $ow, $oh)),
             (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)),
             [System.Drawing.GraphicsUnit]::Pixel)

# NOT $pins: PowerShell variable names are case-insensitive, so $pins IS the
# [string]$Pins parameter, and a typed parameter keeps its type constraint for
# life — assigning the parsed array to it silently coerces it back to a string.
$json = (Get-Content $Pins -Raw) -replace "^\xEF\xBB\xBF", ""
$pinList = $json | ConvertFrom-Json

$rOk  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 0, 170, 90))
$rHi  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 220, 30, 30))
$pen  = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2
$font = New-Object System.Drawing.Font("Consolas", [float](9 * $Zoom), [System.Drawing.FontStyle]::Bold)
$txt  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

$rad = [int](9 * $Zoom)
$n = 0
foreach ($p in $pinList) {
  # pin coords are normalised on the FULL drawing; map into the crop
  $px = ($p.x * $PW - $cx) * $Zoom
  $py = ($p.y * $PH - $cy) * $Zoom
  if ($px -lt -20 -or $py -lt -20 -or $px -gt $ow + 20 -or $py -gt $oh + 20) { continue }
  $n++
  $brush = if ($hl -contains [int]$p.num) { $rHi } else { $rOk }
  $g.FillEllipse($brush, $px - $rad, $py - $rad, $rad * 2, $rad * 2)
  $g.DrawEllipse($pen, $px - $rad, $py - $rad, $rad * 2, $rad * 2)
  $s = "{0:d3}" -f [int]$p.num
  $sz = $g.MeasureString($s, $font)
  $g.DrawString($s, $font, $txt, $px - $sz.Width / 2, $py - $sz.Height / 2)
}
$g.Dispose()
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose(); $src.Dispose()
"$Out  ${ow}x${oh}  drew $n pins"
