# Floor-plan pin extraction

Reads the unit pins in `js/plan.js` off the floor drawings automatically. Needs
[Tesseract](https://github.com/UB-Mannheim/tesseract) at
`C:\Program Files\Tesseract-OCR` (`winget install UB-Mannheim.TesseractOCR`).

## Why this works at all

An earlier note in `plan.js` said the pins could not be lifted automatically
because the drawings carry no text layer. That is true of the PDFs and
irrelevant to the PNGs. The drawings label every unit with a **large,
horizontal, zero-padded 3-digit number** (`018`), and label everything else
either much smaller (`AREA : 22.50 M2`) or with a decimal point (`208.00`).
Font height alone separates the two populations, so the labels can be read
straight off the raster. The pin is the centre of the label, which is inside the
room by construction.

## Running it

```powershell
# 1. OCR each drawing in overlapping tiles (~35s per drawing)
.\scripts\pins\tile-ocr.ps1 -In assets\plans\SP.png   -OutDir scripts\pins\tiles-SP
.\scripts\pins\tile-ocr.ps1 -In assets\plans\FT.png   -OutDir scripts\pins\tiles-FT
.\scripts\pins\tile-ocr.ps1 -In assets\plans\SETH.png -OutDir scripts\pins\tiles-SETH
```

```bash
# 2. Assemble one building. Prints COMPLETE or the exact gaps.
node scripts/pins/pins.js Q
node scripts/pins/pins.js --clusters SP   # inspect the raw clusters first
```

```powershell
# 3. ALWAYS check by eye before trusting the result
.\scripts\pins\overlay.ps1 -Plan assets\plans\SP.png -Pins scripts\pins\q-SP.json `
    -Out check.png -X 0.12 -Y 0.25 -W 0.28 -H 0.38 -Zoom 1.15 -Highlight "33,34,35,40,41"
```

`overlay.ps1` draws every pin as a numbered dot on the drawing. A pin in the
wrong room is glaringly obvious there and completely invisible in a test — this
step is the actual verification, not the counts.

## Traps

1. **Whole-page OCR silently drops labels.** One `--psm 11` pass over the full
   9934x7018 upscale lost `050`, `052`, `053`, `054` and `056` from Q's spine on
   the SE drawing while reading their neighbours at confidence 96. Nothing
   errors; the labels are just absent. Tiling fixed it and raised SE from 167 to
   182 labels — exactly the 182 units the sheet reports. Always tile.

2. **Every building restarts at 001.** A bare number identifies nothing. A label
   only becomes a pin once its spatial cluster is matched against the count the
   live sheet reports for that building and floor, and the cluster's numbers are
   exactly `1..N` with no duplicates. `pins.js` reports gaps; it never fills
   them in.

3. **Q is the leftmost block on all three drawings**, which is why `assemble()`
   seeds from the leftmost cluster. M, O and R are not leftmost — check
   `--clusters` output and give them their own seed before trusting the result.

4. **PowerShell parameter variables keep their type for life**, and variable
   names are case-insensitive. `$pins = ... | ConvertFrom-Json` inside a script
   with a `[string]$Pins` parameter silently coerces the parsed array back to a
   string and the loop draws nothing. Do not name a local after a parameter.

5. `zone-ocr.ps1` re-reads one small region at 4x to recover a label the tiled
   pass missed. Two pins on FT (`055`, `015`) came from it. Anything recovered
   this way belongs in the `RECOVERED` table in `pins.js`, so it stays obvious
   which pins did not come from the main pass.

## Regenerating `js/plan.js`

`pins.js` writes `Q-pins.json`; `js/plan.js` is generated from it, not typed by
hand — 207 coordinate pairs transcribed manually is a transcription error
waiting to happen. To confirm the file still matches the pipeline:

```bash
node scripts/pins/pins.js Q   # then diff Q-pins.json against PLANS in js/plan.js
```

At the time of writing that comparison is 207 pins, 0 differences.

## State

| Building | Pinned | Note |
|---|---|---|
| Q | 207 / 207 | Complete on SP, FT, SE. Verified by eye. |
| M | 0 / 88 | Held — the sheet shows 88 of 88 available, which the client must confirm before the pins are worth placing. |
| O | 0 / 87 | 100% sold, so nothing reaches the UI. |
| R | 0 / 148 | 100% sold, so nothing reaches the UI. |

The `tiles-*` directories are the cached OCR output. Delete them to force a
re-read; they are cheap to regenerate (~35s each).
