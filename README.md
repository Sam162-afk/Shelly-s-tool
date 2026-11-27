# Peaceful Pathway scorer

Scores the 100-item Peaceful Pathway Self-Discovery Assessment (student form) **inside the Google Sheet that receives the form responses**. When a response arrives, it writes the trait scores, levels, ranking and report **keys** into columns at the end of the same row.

It produces keys only. It contains no feedback text and generates none. A later step (not built yet) turns keys into reports using Shelly's approved wording.

Owner: Peaceful Pathway, L.L.C. (per the developer handoff).

---

## Where we are (as of 2026-11-27)

**Built, pushed, and proven on practice copies. Not yet connected to Shelly's real form.**

| Piece | Status |
|---|---|
| Scoring logic and answer key | Done. Tests pass (`npm test`). |
| Matches Shelly's own scoring workbook | Done. 1,610 test respondents (every possible score 20 to 100 for each trait, plus random and extreme patterns) run through her `PP_Scoring_Template_v3` formulas and compared to this code: 8,050 trait results, **0 differences**. (Recalculated in LibreOffice; the test files are not in the repo.) |
| Pair and closing keys | Reproduce all five Worked Examples in her handoff, and every possible result is a valid lookup key (1,620 distinct reports). |
| Runs in real Google Sheets | Done. 10 fake rows pasted into a practice copy, menu *Re-score all rows*: all 10 matched the expected answers, and the deliberately broken row was flagged `ERROR`. |
| Automatic trigger | Done on a practice copy. A fake response submitted through a copy of the student form was scored automatically within seconds and matched the expected keys. |
| Installed on Shelly's real form/sheet | **Not done.** Needs Shelly's account (see "Going live"). |
| Report assembler (`src/Report.js`) | Done and tested. Turns the scorer's keys into the report pieces using only Shelly's wording. Matches all five Worked Examples word for word; all 1,620 possible results resolve. |
| PDF report generation (`src/ReportDoc.js`, `src/ReportSheet.js`) | **Built and tested against fake Google services only. Not yet run in real Google.** Template Doc to PDF, link in the row, automatic on submit (switchable). Needs a practice-copy rehearsal before going near real data (see "Report generation"). |
| Adult form | Out of scope for now. |
| Deep Dives (60-item tests) | Out of scope for now. |

Nothing in this repo touches any real form or student data. All testing used fake data.

---

## Where we are going

### 1. Go live with Shelly (next)

The scorer must be installed from the **Peaceful Pathway account**, because the trigger runs as whoever installs it, and the handoff says real student data stays in the school's or Peaceful Pathway's Google account.

Meeting checklist:
1. Shelly links her student form to a **new restricted sheet** in her account (Form → Responses → Link to Sheets). Do this once only. Linking twice creates a second tab ("Form Responses 2").
2. Click once in the table, then **Format → Revert to unformatted data** (the purple table style that Google adds). Do **not** click *Delete table*; that deletes data.
3. Extensions → Apps Script. Paste `rehearsal/PP_Scorer_AllInOne.txt` into `Code.gs`. Show the manifest (Project Settings) and replace `appsscript.json` with the one in this repo.
4. Reload the sheet. *Peaceful Pathway → Check setup* (expect 100 of 100 answer columns). Approve the permissions (Advanced → Go to … (unsafe) → Allow; this is normal for your own unverified script).
5. *Install auto-scoring trigger*. Submit one fake test response through the form, confirm the scored columns fill in, then delete that test row.
6. If the nonprofit uses Google Workspace, an administrator may need to allow Apps Script or unverified apps.

Security for the live sheet (do before real responses arrive):
- Sharing set to **Restricted**, named people only; turn off "Editors can change permissions and share"; turn off viewer download/print/copy; never publish to the web.
- 2-Step Verification on every account with access, ideally passkeys or security keys. Each person uses their own account; no shared logins.
- Keep the form's collaborator list short (form editors can see responses). Keep the sheet out of any folder shared by link. (Some existing Peaceful Pathway Drive files, including a parent folder, are currently "anyone with the link can view"; the live sheet must not live in one.)
- Decide what to collect: the sheet holds names, emails, grade and birth month/year for minors. Ask the school about data rules (FERPA, state law) and set a retention and deletion plan.
- Never paste real student responses into AI tools or third-party services (handoff privacy rule).

### 2. Report generation (practice copy first)

**Decisions made (Sam, 2026-11-27):** the only delivery is the PDF **link in a column next to the row** (no email, no sharing logic); the PDF is named with the sheet's name field (e.g. `Jordan R. - Peaceful Pathway Report.pdf`); **re-scoring a row replaces its report** (new PDF, link updated, old PDF to the trash); a plain **placeholder template** ships now and Shelly's designed template drops in later; reports are made **automatically after scoring** with an on/off switch.

How it works (all in the sheet's own Google account; built, not yet proven in real Google):
- The wording is in three **content tabs copied from Shelly's workbook** into the same sheet, under her tab names: `Initial Test`, `Combination Portraits`, `Portrait Closings`. Edit wording there, never in code. The code only assembles it by her rules (Read Me, Steps 3 and 4) and adds no wording: the opening line pattern is hers, and the only static words in the placeholder template are her column names "Gifts" and "Growth Edge".
- Menu **Set up report folder and template** creates one private folder and a plain green Poppins template Doc (five trait blocks in O, C, E, A, N order, then the portrait). **Use a different report template** switches to a designed Doc (paste its link; it is checked for typos first).
- A template may use only these placeholders: `{{FIRST_NAME}}` `{{OPENING}}` `{{MAIN_PAIR_TEXT}}` `{{SECOND_PAIR_TEXT}}` `{{CLOSING}}` `{{PORTRAIT}}` (opening + main + second + closing, exactly as in her Worked Examples) and, for each trait letter X in O, C, E, A, N: `{{X_NAME}}` `{{X_DEFINITION}}` `{{X_LEVEL}}` `{{X_LABEL}}` `{{X_PARAGRAPH}}` `{{X_GIFTS}}` `{{X_GROWTH_EDGE}}`. An unknown `{{...}}` stops the run before any PDF is made; a report that would still contain a `{{...}}` is never produced.
- **Status flow** (column `PP Report Status`, link in `PP Report Link`): `PENDING` (scored, report due) to `MAKING` (claimed) to `OK`, or `ERROR: reason`; rows that did not score show `SKIPPED: scoring error`. Re-scoring sets rows back to `PENDING`.
- **Scoring is never held up by reports.** Scoring runs under the lock as before; the PDF is made afterwards, row by row. A failure (Drive error, missing content tab, template typo, lock timeout) is written into the row's status and the score stands. A run stops starting new reports after about 4.5 minutes (Apps Script's limit is 6); the rest stay `PENDING` for **Generate pending reports**, which also retries `ERROR` rows and makes reports for rows scored before setup.
- Menu **Turn automatic reports on or off**: off by default after setup. Reports go only to the person who took the test, by someone with access to the folder; nothing is shared or emailed by the code.
- Branding: student reports green (`#1F5C3E`), Poppins (adult blue `#014D86` later).

**Permissions (a real change from the scorer-only build).** Making Docs and PDFs needs the `documents` and `drive` scopes. Apps Script's Drive service has no narrower option (`drive.file` is not accepted by `DriveApp`), so this build can see the whole Drive of the account that approves it. The permission is a grant, not a limit: the code only touches the report folder, its template and PDFs (and trashes an old PDF only if it is a PDF inside that folder), but anyone who can edit the sheet can edit the script and use the same grant, so keep the sheet's editor list short. A narrower design exists (the Advanced Drive service with `drive.file`, folder and template created by the script) but is more work and untested. Use `appsscript.reports.json` and `rehearsal/PP_Scorer_Reports_AllInOne.txt` for it; the scorer-only manifest and paste file are unchanged and still need no Drive access.

**Not yet verified in real Google** (only fake services in tests): Poppins rendering in the exported PDF, `replaceText` keeping the template's formatting, PDF page layout with long texts, the daily document and run-time limits, `moveTo`/`makeCopy` behavior, and the permission prompt. Rehearse on a practice copy with fake rows: paste the report build, copy the three content tabs in, run *Set up report folder and template*, submit fake responses, open the PDFs and compare to the five Worked Examples.

### 3. Later (not planned yet)

Adult form (same key; headers unchecked), Deep Dives, and percentile reporting once enough responses exist.

---

## Open questions for Shelly

- Is there a reason for the stray `Column 106` header and Birth Month appended at the end of the old master sheet? A freshly linked copy of the form does not produce either, so it looks like a leftover in that sheet, not a form problem. (The scorer ignores both.)
- Her chat suggested 8 to 10 reverse-keyed Openness items; the key has 7 (O7 C8 E8 A9 N8). The key governs scoring and was not changed. Confirm that is intended.
- Keep email and birth month in the sheet? Is the form final (freeze it once live)?
- Report layout: visual design only (the Read Me, Step 3, already lists the fields: trait name, definition, level, label, paragraph, Gifts, Growth Edge). Does she have a designed template?
- Sign-off on unusual portrait cases her five examples do not cover (three-way ties, all one level, large gaps). A one-page review sheet for her to confirm is a good idea.

---

## What it writes

Scored columns are added after the last used column. Each header is found by name, so their position can change.

| Column | Example |
|---|---|
| `PP First Name` | Jordan |
| `PP O Sum`, `PP O Avg`, `PP O Level` (then C, E, A, N) | 84, 4.2, High |
| `PP Ranking` | O > A > C > N > E |
| `PP Main Pair Key` | `O(H)+A(H)` |
| `PP Second Pair Key` | `O(H)+E(L)` |
| `PP Closing Key` | `O(H)` |
| `PP Scoring Status` | `OK`, or `ERROR: ...` with the reason |
| `PP Report Link` | Link to the report PDF (only once reports are set up) |
| `PP Report Status` | `PENDING`, `MAKING`, `OK`, `ERROR: ...` or `SKIPPED: scoring error` (only once reports are set up) |

Keys match the **Lookup Key** column of the handoff workbook's *Combination Portraits* tab. The two traits in a pair key are always listed in the order **O, N, E, A, C**, which is how that tab is organized. The closing key is the top trait and its level (for example `O(H)`); the *Portrait Closings* tab has trait and level columns rather than a key, so that format is ours.

## Rules (from the developer handoff and PP_Scoring_Template_v3)

- Responses are whole numbers 1 to 5. Reverse-keyed items score 6 minus the response.
- Trait score = average of its 20 items. The code works with the exact integer sum: Low is a sum of 52 or less, Medium is 53 to 68, High is 69 or more. This equals the handoff's cutoffs (Low below 2.65, Medium 2.65 up to below 3.45, High 3.45 and up) for every possible score and avoids rounding errors.
- Ranking is highest score first; ties break in the order O, C, E, A, N.
- Main pair is ranks 1 and 2. Second pair is the top trait plus whichever of ranks 3 to 5 has the biggest level gap from it (ties go to the higher-ranked trait; if no gaps, rank 3). Closing is the top trait at its level.
- The 100 answer columns are found by matching the question text, not by position. The code tolerates the form's known quirks (stray spaces in items 77 and 80, the "others's" typo in item 64).

## Safety behavior

- If a header does not match the key, or an answer is not a whole number 1 to 5, the row is marked `ERROR` with the reason. Nothing is guessed.
- It only writes into its own `PP ...` columns and never edits answers or any other column.
- No network requests and no email, in any file (a test enforces it). The scorer-only build touches no Drive or Docs and its manifest requests only the narrow spreadsheet, menu and trigger permissions (this worked in real Google Sheets). Only `src/ReportDoc.js` may touch Drive and Docs (another test enforces that), and only the reports build asks for those permissions.
- A report problem never changes or blocks a score.
- No student data lives in this repo. `.gitignore` blocks `*.xlsx` and `*.csv`.

## Files

| File | Purpose |
|---|---|
| `src/Key.js` | The 100-item answer key, generated from the workbook's *Key Reference* tab |
| `src/Scoring.js` | Pure scoring logic |
| `src/Report.js` | Pure report assembler: reads the content tabs, looks up text by key, adds no wording; defines the template placeholders |
| `src/ReportDoc.js` | The only file that touches Drive and Docs: folder, placeholder template, fill template, export PDF, trash old PDF |
| `src/ReportSheet.js` | Report status flow in the sheet, settings, content-tab loading, report menu actions |
| `src/Sheet.js` | Google Sheets glue: trigger, menu, column handling; calls the report steps if present |
| `tools/make-fixture.py` | Converts the handoff workbook into `test/fixtures/handoff.json` (her wording; gitignored) for the real-wording tests |
| `appsscript.json` | Apps Script manifest for the scorer-only build (narrow scopes) |
| `appsscript.reports.json` | Manifest for the reports build: adds the `documents` and `drive` scopes |
| `rehearsal/PP_Scorer_AllInOne.txt` | Scorer only: `Key.js`, `Scoring.js`, `Sheet.js` joined for pasting into one `Code.gs` (or attaching to email; Gmail blocks `.js`) |
| `rehearsal/PP_Scorer_Reports_AllInOne.txt` | Scorer plus PDF reports: all six `src/` files joined in load order |
| `tools/build-paste-files.sh` | Rebuilds both paste files from `src/` |
| `test/` | 83 tests, run with `npm test` (Node 22 or later, no dependencies). The real-wording tests (`report.handoff.test.js`) are skipped, loudly, unless `test/fixtures/handoff.json` exists |

The paste files are **generated from `src/`; edit `src/`, not those files.** To rebuild both:

```bash
tools/build-paste-files.sh
```

## Tests

`npm test` covers: the key (100 items, 20 per trait, reverse counts O7 C8 E8 A9 N8); reverse scoring; every cutoff edge; ties; the five Worked Examples from the handoff; an exhaustive run proving every possible result is a valid key and that there are exactly **1,620** distinct reports; the header matching; and the sheet layer against a fake sheet laid out like the real master. For reports: the assembler against synthetic wording (proving no added words) and against her real wording (five Worked Examples word for word, all 1,620 results, every piece an exact string from her tabs); the report layer on fake Google services (status flow, replace-on-rescore, every failure mode leaving the score intact, template typos, the `$` and `{{...}}` guards, old-PDF cleanup limited to PDFs inside the report folder); and a check that the scorer-only build still works alone. The fakes mimic Google's services closely enough to test our logic, but they are not Google: see "Not yet verified in real Google".

## Known gotchas

- **Tab name.** The menu items (*Check setup*, *Re-score all rows*) look for a tab named exactly `Form Responses 1`. The automatic trigger does not care. If a form is linked twice, Google adds `Form Responses 2`; delete the unused tab and rename the real one to `Form Responses 1`. A planned improvement is to find the responses tab by its question headings instead of its name (requires re-pasting the code).
- **Trigger ownership.** The trigger belongs to the account that installed it. If the sheet changes owner, the new owner runs *Install auto-scoring trigger* again.
- **Form changes.** Keep the form frozen once live. Nothing breaks if a question is added, since columns are found by name, but the 100 answer headings must stay unchanged.
- **First name** is the text before the first space ("Mary Anne K." gives "Mary").
- **Table styling.** Google applies a purple "table" style to a newly linked sheet. Use *Revert to unformatted data*, never *Delete table*. Hiding the 100 answer columns makes the scored columns easier to read; hidden columns still score.
- **Practice artifacts** in Drive (fake data only; trash when finished): `PLAYGROUND - fake data only`, `TRIGGER TEST - fake data`, and the copied test form (turn off "Accepting responses").

## How to resume

1. Read this file, then run `npm test` (should show 83 passing; build the fixture first so none are skipped).
2. The sources of truth are Shelly's handoff workbook (`PP_Feedback_Content_Developer_Handoff`: Read Me rules, Combination Portraits, Portrait Closings, Initial Test, Worked Examples) and `PP_Scoring_Template_v3` (Key Reference). Neither is in this repo.
3. Next task: rehearse the reports build on a practice copy (fake rows only; see "Report generation"), get Shelly's layout decisions and sign-off on the untested portrait cases (three-way score ties, all-High or all-Low profiles), then the go-live checklist. Decide the Drive-permission question (full `drive` scope vs the narrower Advanced Drive design) before installing the reports build on real data.
