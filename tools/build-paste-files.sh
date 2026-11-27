#!/bin/sh
# Rebuild the two paste-into-Apps-Script files from src/. Edit src/, never these outputs.
#   rehearsal/PP_Scorer_AllInOne.txt          scoring only (use with appsscript.json)
#   rehearsal/PP_Scorer_Reports_AllInOne.txt  scoring + PDF reports (use with appsscript.reports.json)
set -eu
cd "$(dirname "$0")/.."
build() { # output, label, files...
  out=$1; label=$2; shift 2
  { echo "/* Peaceful Pathway scorer: ALL-IN-ONE paste file ($label). Source of truth: src/. */"
    for f in "$@"; do echo; echo "/* ---------------- $f ---------------- */"; cat "src/$f"; done; } > "$out"
}
build rehearsal/PP_Scorer_AllInOne.txt "scoring only" Key.js Scoring.js Sheet.js
build rehearsal/PP_Scorer_Reports_AllInOne.txt "scoring + PDF reports" Key.js Scoring.js Report.js ReportDoc.js ReportSheet.js Sheet.js
wc -c rehearsal/PP_Scorer_AllInOne.txt rehearsal/PP_Scorer_Reports_AllInOne.txt
