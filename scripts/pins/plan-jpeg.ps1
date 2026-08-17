# Turn a client drawing into the JPEG the app and the PDF actually ship.
#
# Two things this does that a plain resize does not, both learned the hard way
# on 2026-08-16:
#
#   FLATTEN THE ALPHA. The client's exports carry a transparent channel. Saved
#   straight to JPEG, which has no alpha, the transparent pixels come out black.
#   They are composited onto white first.
#
#   JPEG, NOT PNG. The composed plates are photographs and PNG'd to 4.2 MB each,
#   which pushed an offer from 4.9 to 8.4 MB. JPEG q92 is about 850 KB and is
#   indistinguishable at 7x zoom.
#
# Width is a judgement, not a constant: it has to survive the app's zoom. The
# drawing is shown at 732px, so an asset 4x that is crisp at 4x magnification.
param(
  [string]$In,
  [string]$Out,
  [int]$Width = 3600,
  [long]$Quality = 92
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($In)
$h = [int][Math]::Round($src.Height * ($Width / $src.Width))

$dst = New-Object System.Drawing.Bitmap($Width, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.Clear([System.Drawing.Color]::White)          # the flatten
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($src, 0, 0, $Width, $h)
$g.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, $Quality)
$dst.Save($Out, $codec, $params)

$kb = [int]((Get-Item $Out).Length / 1KB)
$dst.Dispose(); $src.Dispose()
"$Out  ${Width}x${h}  q$Quality  ${kb} KB  (from $In)"
