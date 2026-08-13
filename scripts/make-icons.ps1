# App icons, cut from the client's own wordmark.
#
# The "Q" glyph alone, centred on the catalogue navy. The full lockup is 2.2:1
# and turns to mush in a square icon; the Q is the part people recognise on a
# home screen anyway.
#
# The maskable variant carries much more padding: Android crops maskable icons
# to whatever shape the launcher uses, and a tight glyph loses its edges.
#
#   powershell -File scripts/make-icons.ps1
param(
  [string]$Logo   = "$PSScriptRoot\..\assets\logo.png",
  [string]$OutDir = "$PSScriptRoot\..\assets\icons"
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$navy = [System.Drawing.Color]::FromArgb(11, 27, 43)
$src  = [System.Drawing.Bitmap]::FromFile($Logo)

# The Q occupies roughly the left fifth of the wordmark; take a square of it.
$qw = [int]($src.Width * 0.215)
$qh = $src.Height
$qx = 0
$qy = 0

function New-Icon {
  param([int]$Size, [double]$Inset, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size,
           [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($navy)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $box = $Size * (1 - 2 * $Inset)
  $scale = [Math]::Min($box / $qw, $box / $qh)
  $dw = $qw * $scale; $dh = $qh * $scale
  $g.DrawImage($src,
    (New-Object System.Drawing.Rectangle(
       [int](($Size - $dw) / 2), [int](($Size - $dh) / 2), [int]$dw, [int]$dh)),
    (New-Object System.Drawing.Rectangle($qx, $qy, $qw, $qh)),
    [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0,-26} {1}x{1}" -f (Split-Path $Path -Leaf), $Size
}

New-Icon -Size 192 -Inset 0.18 -Path "$OutDir\icon-192.png"
New-Icon -Size 512 -Inset 0.18 -Path "$OutDir\icon-512.png"
New-Icon -Size 512 -Inset 0.30 -Path "$OutDir\icon-maskable-512.png"   # launcher crops this
New-Icon -Size 180 -Inset 0.18 -Path "$OutDir\icon-180.png"            # iOS home screen

$src.Dispose()
