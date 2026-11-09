# THE BLUE PAPER LAB — Aquarium 7-in-1 Strip Analysis Prototype (v1.4.5)

## Run locally
1. Extract the ZIP.
2. Open the `blue_paper_lab_strip_app` folder in VS Code.
3. Open `index.html` using Live Server, or open it directly in a modern browser.
4. Enter sample details and select the Aquarium Test Strips / 7-in-1 Water Test Strip profile.
5. Upload three separate reacted-strip images. Each image passes through the existing strip-pattern and focus/exposure gate.
6. Analyse each strip or use **Analyze all 3 strips**. The application detects seven pad regions, samples the central pad ROI and displays numbered markers.
7. Review the closest manufacturer chart levels and open **View colour-match diagnostics** to inspect the top three matches, ΔE00 values and best-to-second-best gap.
8. Review/edit the median selected result, save the record and download the HTML report.

## Fixed Aquarium 7-in-1 parameter order
The user-confirmed pad order from top to bottom is:
1. Nitrate (NO₃) — 0, 10, 25, 50, 100, 250 mg/L
2. Nitrite (NO₂) — 0, 1, 5, 10 mg/L
3. Chlorine (Cl₂) — 0, 0.8, 1.5, 3.0 mg/L
4. Total Hardness (GH) — 0, 25, 75, 150, 300 mg/L
5. Total Alkalinity (TA) — 0, 40, 80, 120, 180, 300 mg/L
6. Carbonate Hardness (KH) — 0, 40, 80, 120, 180, 300 mg/L
7. pH — 6.4, 6.8, 7.2, 7.6, 8.0, 8.4

Provisional reading times in prior chart notes: nitrate/nitrite 60 seconds; chlorine, GH, TA, KH and pH 15 seconds. Confirm against the printed package instructions.

## v1.4 changes
- Preserves the v1.3 interface, sample workflow, three-strip workflow, image verification, seven-pad detector, profile editor, browser-local records and report download.
- Retains sRGB → CIELAB (D65/2°) conversion and CIEDE2000 (ΔE00) as the primary chart-colour ranking method.
- Adds `matchAll()` ranking and exposes the three closest chart levels, each ΔE00 score, and the best-to-second-best score gap.
- Adds robust central-region median RGB sampling for detected pad regions instead of a simple average over a small square. The central ROI reduces edge contamination from shadows and strip boundaries; median channel values reduce the influence of isolated bright/dark pixels.
- Shows measured HEX, sampled pixel count, best/second-best scores and top-three reference levels on the replicate cards and in a collapsible diagnostic panel.
- Includes colour-match diagnostics in downloaded HTML reports.
- Adds the latest user-supplied bottle-chart photographs and reacted-strip example to the Reference charts gallery as source references.

## Important interpretation limits
- ΔE00 is a perceptual colour-difference metric. It identifies the closest photographed chart swatch; it does **not** directly establish analytical accuracy or chemical concentration.
- A small best-to-second-best ΔE00 gap indicates competing visual matches. v1.4 displays the gap but deliberately does not convert it into a percentage confidence score or apply an unvalidated universal pass/fail threshold.
- The reference HEX swatches remain visual approximations digitised from bottle-chart photographs. The new photographs are retained in the app for visual reference; they have not been used to claim instrument-grade chart calibration because lighting, perspective, gloss, print variation and camera white balance are uncontrolled.
- Multi-point/median extraction improves resistance to local pixel anomalies, but does not fully correct illumination gradients, camera colour response, glare or chemical interference.
- The strip photo supplied with this update is retained as a reference example; it is not a validated calibration standard or an instrument-verified sample.

## Existing verification and operating limits
`js/image-verifier.js` uses a rule-based shape/pattern heuristic to detect an elongated strip and seven pad regions, plus basic focus/exposure checks. It is not a trained semantic AI classifier and cannot guarantee rejection of every lookalike image. Technician inspection remains mandatory. It does not reliably identify all transparent oils, chemical interference, expiry or dirt.
- Three reacted-strip uploads per sample.
- Automatic seven-pad detection and numbered overlay.
- Editable manufacturer/model reference profiles and chart levels.
- Three-replicate readings, numerical median and range.
- Technician correction of final selected values.
- LocalStorage records, JSON export and HTML report download.
- Optional browser GPS coordinate capture.

## Validation required before operational use
- Digitise/calibrate chart swatches under controlled, repeatable lighting with a colour reference standard or calibrated capture setup.
- Capture replicate strips at the exact manufacturer-specified read times.
- Build a dataset across known concentrations, strip lots, phones/cameras and lighting conditions.
- Compare estimates against suitable reference analytical methods for each parameter; evaluate bias, repeatability, uncertainty and decision limits.
- Do not use this prototype to certify drinking-water safety or replace BIS/NABL-aligned analytical methods.

## Storage and limitations
- Front-end prototype; records are stored in browser LocalStorage on that device and do not sync between devices. Export JSON backups regularly.
- No backend database, authentication, multi-device sync, audit trail, instrument integration or trained image classifier.
- Main files: `index.html`, `css/style.css`, `js/script.js`, `js/image-verifier.js`, `js/image-engine.js`, `js/colour-matcher.js`, `js/replicate-analysis.js`, `js/chart-manager.js`, `js/report-generator.js`.


### Reliability update (v1.4.1)
- Pad colour extraction samples five internal regions and combines regional median RGB values (median-of-medians).
- Diagnostics show the number of sampled regions and RGB channel spread.
- Replicate uploads are checked for near-duplicate images using an 8x8 average-hash fingerprint; images with Hamming distance <= 3 are blocked as likely duplicates. Retake each replicate separately.
- A provisional ambiguous-match flag is shown when the best and second-best ΔE00 scores are within 1.0. This is a review trigger only, not a validated accuracy threshold.
- Reports include match assessment and replicate image fingerprint details.
- Manufacturer chart HEX values remain approximate until calibrated from controlled chart captures or known reference colour values.


## Version 1.4.2 — Strip orientation verification

Before concentration analysis, the app now compares the seven detected pad colours against the selected Aquarium 7-in-1 chart in both the expected order and the reversed order. The expected top-to-bottom order is Nitrate, Nitrite, Chlorine, GH, TA, KH, pH. If the reversed order matches substantially better, the upload is flagged as upside down and analysis is blocked. If the two orientation scores are too close, the app asks for a clearer correctly oriented image. The check is repeated immediately before analysis and saved in the report.

This is a conservative chart-consistency heuristic, not a trained visual classifier. Its thresholds require validation on a larger labelled image set. Existing CIEDE2000 matching, multi-region colour extraction, duplicate-image screening, and the existing UI/workflow are retained.

## Version 1.4.3 image-detection reliability update
If automatic pad detection cannot confidently locate all seven pads, the verification panel now offers **Mark 7 Pads Manually**. Click each pad centre in manufacturer order (Nitrate, Nitrite, Chlorine, GH, TA, KH, pH). The app checks that the points form one aligned, evenly spaced sequence and then runs the existing chart-based orientation check. A clearly reversed order is still blocked. If chart-based orientation is inconclusive, the technician may confirm the first pad visually.

Duplicate-photo similarity is now a warning rather than an automatic upload blocker because the previous small image hash could mistake different strip photographs with similar plain backgrounds as duplicates.


## Version 1.4.5 — Exact-file duplicate screening and robust strip detection
- Removed whole-scene perceptual-hash duplicate decisions. Similar backgrounds, camera positions, strip layouts and pad patterns no longer cause duplicate warnings or block separate uploads.
- Duplicate checking now compares exact source-file bytes using SHA-256 where Web Crypto is available (with a clearly labelled local checksum fallback). Only byte-identical uploads are flagged; Analyze All blocks exact same-file repeats so a single photo is not counted as multiple replicates.
- Improved pale-pad segmentation by lowering the chroma threshold, increasing detector working resolution, and modestly relaxing pad geometry tolerances. Seven-pad sequence alignment and spacing checks remain in place.
- Reduced strict image focus/exposure thresholds slightly to avoid rejecting usable images prematurely. Poor images still receive warnings and can use technician-assisted manual marking.
- Added a dashed strip-region boundary around the seven detected pads in the review overlay, in addition to numbered pad centres.
- Retained manual seven-pad marking, orientation review, CIEDE2000, multi-region median sampling, chart profiles, existing screens, records and report workflow.

Limitations: A photograph cannot reliably prove that two unmarked physical strips are different when their visible pad colours and geometry are identical. This build detects exact duplicate files; it does not claim physical-strip identity recognition. Automatic pad detection remains heuristic and requires technician review and browser testing across a larger labelled image set.
