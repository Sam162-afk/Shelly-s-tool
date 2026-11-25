# Peaceful Pathway scorer

Scores the 100-item Peaceful Pathway Self-Discovery Assessment **inside the Google Sheet that receives the form responses**. When a response arrives, it writes the trait scores, levels, ranking and report **keys** into columns at the end of the same row.

It produces keys only. It contains no feedback text and generates none. A separate step (not built yet) turns keys into reports using Shelly's approved wording.

> **Status:** built and tested locally. **Not installed anywhere and not connected to any form or sheet.** Nothing runs until someone chooses *Peaceful Pathway → Install auto-scoring trigger* inside the sheet.

Owner: Peaceful Pathway, L.L.C. (per the developer handoff).

## What it writes

Scored columns are added after the last used column (for the current master sheet that is column 109 onward). Each header is found by name, so their position can change.

| Column | Example |
|---|---|
| `PP First Name` | Jordan |
| `PP O Sum`, `PP O Avg`, `PP O Level` (then C, E, A, N) | 84, 4.2, High |
| `PP Ranking` | O > A > C > N > E |
| `PP Main Pair Key` | `O(H)+A(H)` |
| `PP Second Pair Key` | `O(H)+E(L)` |
| `PP Closing Key` | `O(H)` |
| `PP Scoring Status` | `OK`, or `ERROR: ...` with the reason |

Keys match the **Lookup Key** column of the handoff workbook's *Combination Portraits* tab. The two traits in a pair key are always listed in the order **O, N, E, A, C**, which is how that tab is organized. The closing key is the top trait and its level; it matches the *Portrait Closings* tab's trait and level columns.

## Rules (from the developer handoff and PP_Scoring_Template_v3)

- Responses are whole numbers 1 to 5. Reverse-keyed items score 6 minus the response.
- Trait score = average of its 20 items. The code works with the exact integer sum: Low is a sum of 52 or less, Medium is 53 to 68, High is 69 or more. This equals the handoff's cutoffs (Low below 2.65, Medium 2.65 up to below 3.45, High 3.45 and up) for every possible score and avoids rounding errors.
- Ranking is highest score first; ties break in the order O, C, E, A, N.
- Main pair is ranks 1 and 2. Second pair is the top trait plus whichever of ranks 3 to 5 has the biggest level gap from it (ties go to the higher-ranked trait; if no gaps, rank 3). Closing is the top trait at its level.
- The 100 answer columns are found by matching the question text, not by position. The code tolerates the form's known quirks (stray spaces in items 77 and 80, the "others's" typo in item 64).

## Safety behavior

- If a header does not match the key, or an answer is not a whole number 1 to 5, the row is marked `ERROR` with the reason. Nothing is guessed.
- It only writes into its own `PP ...` columns and never edits answers or any other column.
- No network requests, email, Drive files or documents. The manifest requests only the narrow spreadsheet, menu and trigger permissions.
- No student data lives in this repo. `.gitignore` blocks `*.xlsx` and `*.csv`.

## Files

| File | Purpose |
|---|---|
| `src/Key.js` | The 100-item answer key, generated from the workbook's *Key Reference* tab |
| `src/Scoring.js` | Pure scoring logic |
| `src/Sheet.js` | Google Sheets glue: trigger, menu, column handling |
| `appsscript.json` | Apps Script manifest (V8 runtime, permission scopes) |
| `test/` | 46 tests, run with `npm test` (Node 22 or later, no dependencies) |

## Tests

`npm test` covers: the key (100 items, 20 per trait, reverse counts O7 C8 E8 A9 N8); reverse scoring; every cutoff edge; ties; the five Worked Examples from the handoff; an exhaustive run proving every possible result is a valid key and that there are exactly **1,620** distinct reports; the header matching; and the sheet layer against a fake sheet laid out exactly like the real master.

## Installing later (not done yet)

1. Open the response sheet. Extensions → Apps Script.
2. Create files `Key`, `Scoring` and `Sheet` and paste in the three files from `src/`. Replace the manifest with `appsscript.json` (Project Settings → show manifest file).
3. Reload the sheet. Use *Peaceful Pathway → Check setup*, then *Re-score all rows* on fake data, then *Install auto-scoring trigger*.
4. The trigger belongs to the account that installs it. If sheet ownership changes, the new owner should run *Install auto-scoring trigger* again.

## Known limits and open items

- **Not yet run inside Google.** The logic is tested against a faithful fake of the Sheets calls, not against Google itself. Expect to do a first run on a copy with fake rows before using it for real. If Google rejects the narrow `spreadsheets.currentonly` permission, switch it to `spreadsheets` in `appsscript.json`.
- **Adding questions to the form.** The current master has a stray `Column 106` header and Birth Month appended after the items, which shows Google adds late questions at the far right. Keep the form frozen once it is live. Nothing breaks if a question is added, since columns are found by name, but the answer headers must stay unchanged.
- **First name** is the text before the first space ("Mary Anne K." gives "Mary").
- **Student and adult forms** are separate forms with separate sheets. The adult key is identical, so the same code works on an adult sheet, but that has not been checked against the adult form's headers.
- The 100-item test only. Deep Dives are not included.
