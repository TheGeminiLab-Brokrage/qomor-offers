# Build assets/renders/ from the client's supplied artwork.
#
# The originals are enormous (04.png is 8128x5120 / 66 MB) and PNG. Dropping
# them into a PDF at that size makes a document nobody can send on WhatsApp,
# which is where these offers actually travel. So every render is resampled to
# a sane width and re-encoded as JPEG. The cover and the location map come out
# of the client's catalogue PDF, which is vector, so they are rendered rather
# than lifted.
#
# Re-run after replacing any source. Sources live outside the repo (the client
# sent them to Downloads); paths are listed here so it is obvious what fed what.
#
#   powershell -File scripts/make-renders.ps1
param(
  [string]$Src      = "$env:USERPROFILE\Downloads",
  [string]$Catalogue = "$env:USERPROFILE\Downloads\cataloue qomor arabic partneres final (1).pdf",
  [string]$OutDir   = "$PSScriptRoot\..\assets\renders"
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$tmp = Join-Path $env:TEMP "qomor-renders"
if (-not (Test-Path $tmp)) { New-Item -ItemType Directory -Path $tmp -Force | Out-Null }

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
             Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Jpeg {
  param([System.Drawing.Bitmap]$Bmp, [string]$Path, [int]$Quality)
  $p = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
  $Bmp.Save($Path, $jpegCodec, $p)
}

# Resample to a target width, optionally cropping a normalised sub-rectangle
# first, then write JPEG. Everything is flattened onto black: some sources carry
# alpha, and JPEG has none, so an unflattened save would come out with white
# fringes on the dark pages these sit on.
function Convert-Render {
  param(
    [string]$In, [string]$Out, [int]$Width, [int]$Quality = 82,
    [double]$CropX = 0, [double]$CropY = 0, [double]$CropW = 1, [double]$CropH = 1
  )
  $src = [System.Drawing.Bitmap]::FromFile($In)
  try {
    $cx = [int]($CropX * $src.Width);  $cy = [int]($CropY * $src.Height)
    $cw = [int]($CropW * $src.Width);  $ch = [int]($CropH * $src.Height)
    $scale = [Math]::Min(1.0, $Width / [double]$cw)
    $ow = [int][Math]::Round($cw * $scale); $oh = [int][Math]::Round($ch * $scale)

    $dst = New-Object System.Drawing.Bitmap($ow, $oh,
             [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.Clear([System.Drawing.Color]::Black)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $ow, $oh)),
                 (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)),
                 [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    Save-Jpeg -Bmp $dst -Path $Out -Quality $Quality
    $dst.Dispose()
    $kb = [math]::Round((Get-Item $Out).Length / 1KB)
    "{0,-16} {1,5}x{2,-5} {3,6} KB   <- {4}" -f (Split-Path $Out -Leaf), $ow, $oh, $kb, (Split-Path $In -Leaf)
  } finally { $src.Dispose() }
}

# --- pages out of the catalogue (vector: render, do not lift a bitmap) --------
& pdftoppm -png -r 200 -f 1  -l 1  $Catalogue (Join-Path $tmp "cat") 2>$null
& pdftoppm -png -r 200 -f 7  -l 7  $Catalogue (Join-Path $tmp "cat") 2>$null

# Cover: the client's own title slide. 16:9 cover-fitted to A4 landscape crops
# ~6% off each side; the lockup is centred, so it survives untouched.
Convert-Render -In (Join-Path $tmp "cat-01.png") -Out "$OutDir\cover.jpg" -Width 2400 -Quality 88

# Location: the Badr City map, without the Arabic caption band beneath it.
# Line art on flat navy, so it gets a higher quality than the photographic
# renders — JPEG ringing shows badly on hairlines.
Convert-Render -In (Join-Path $tmp "cat-07.png") -Out "$OutDir\location.jpg" `
               -Width 2400 -Quality 92 -CropH 0.663

# --- photographic renders ----------------------------------------------------
# Night and day are kept as separate sets so an offer can lead with whichever
# suits: the night shots sell the lighting, the day shots sell the scale.
Convert-Render -In "$Src\01.png"      -Out "$OutDir\night-1.jpg" -Width 2200   # plaza, Qomor sign lit
Convert-Render -In "$Src\07.png"      -Out "$OutDir\night-2.jpg" -Width 2200   # courtyard, panda + balloon
Convert-Render -In "$Src\04.png"      -Out "$OutDir\night-3.jpg" -Width 2200   # aerial, wet street
Convert-Render -In "$Src\Badr Mall Shots\Shot_11.png" -Out "$OutDir\day-1.jpg" -Width 2200
Convert-Render -In "$Src\Badr Mall Shots\Shot_01.png" -Out "$OutDir\day-2.jpg" -Width 2200
Convert-Render -In "$Src\Badr Mall Shots\Shot_05.png" -Out "$OutDir\day-3.jpg" -Width 2200

# --- clinic interiors, used only when the unit's Type is Medical -------------
Convert-Render -In "$Src\CLINIC.png"           -Out "$OutDir\clinic-1.jpg" -Width 2000
Convert-Render -In "$Src\CLINICS ENTRANCE.png" -Out "$OutDir\clinic-2.jpg" -Width 1200

Remove-Item (Join-Path $tmp "cat-*.png") -Force -ErrorAction SilentlyContinue
"`ntotal: {0} KB" -f [math]::Round((Get-ChildItem $OutDir -File | Measure-Object Length -Sum).Sum / 1KB)
