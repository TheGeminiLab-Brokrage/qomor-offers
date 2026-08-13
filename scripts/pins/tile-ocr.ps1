# OCR a drawing in overlapping tiles.
#
# Whole-page --psm 11 on a 9934x7018 image silently drops scattered labels (on
# SETH it lost 050, 052, 053, 054, 056 from Q's spine while reading their
# neighbours at conf 96). Tesseract's layout analysis behaves far better on a
# smaller area, so tile it and merge. Overlap guarantees no label is orphaned by
# sitting on a seam; the merge step dedupes.
param(
  [string]$In,
  [string]$OutDir,
  [int]$Cols = 5,
  [int]$Rows = 4,
  [double]$Overlap = 0.06,
  [double]$Zoom = 2.0
)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
Get-ChildItem $OutDir -Filter "tile_*" -ErrorAction SilentlyContinue | Remove-Item -Force

$tess = "C:\Program Files\Tesseract-OCR\tesseract.exe"
$src = [System.Drawing.Bitmap]::FromFile($In)
$W = $src.Width; $H = $src.Height
$tw = [int]($W / $Cols); $th = [int]($H / $Rows)
$ox = [int]($tw * $Overlap); $oy = [int]($th * $Overlap)

$manifest = @()
for ($c = 0; $c -lt $Cols; $c++) {
  for ($r = 0; $r -lt $Rows; $r++) {
    $x0 = [Math]::Max(0, $c * $tw - $ox)
    $y0 = [Math]::Max(0, $r * $th - $oy)
    $x1 = [Math]::Min($W, ($c + 1) * $tw + $ox)
    $y1 = [Math]::Min($H, ($r + 1) * $th + $oy)
    $cw = $x1 - $x0; $ch = $y1 - $y0
    $name = "tile_${c}_${r}"
    $png = Join-Path $OutDir "$name.png"

    $dst = New-Object System.Drawing.Bitmap([int]($cw * $Zoom), [int]($ch * $Zoom))
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $dst.Width, $dst.Height)),
                 (New-Object System.Drawing.Rectangle($x0, $y0, $cw, $ch)),
                 [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $dst.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $dst.Dispose()

    & $tess $png (Join-Path $OutDir $name) --psm 11 tsv 2>$null
    Remove-Item $png -Force -ErrorAction SilentlyContinue
    $manifest += [pscustomobject]@{ name = $name; x0 = $x0; y0 = $y0; zoom = $Zoom }
  }
}
$src.Dispose()
$manifest | ConvertTo-Json | Out-File (Join-Path $OutDir "manifest.json") -Encoding utf8
"tiles: $($manifest.Count)  page: ${W}x${H}"
