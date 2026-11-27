"""Convert the handoff workbook into test/fixtures/handoff.json (raw tab rows).

Usage: python3 -I tools/make-fixture.py path/to/PP_Feedback_Content_Developer_Handoff.xlsx
The output holds Shelly's wording, so it is gitignored. Nothing is edited or cleaned:
cells are copied exactly as they are in the workbook.
"""
import json, sys, os
import openpyxl

TABS = ["Initial Test", "Combination Portraits", "Portrait Closings", "Worked Examples"]
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for name in TABS:
    rows = []
    for r in wb[name].iter_rows(values_only=True):
        if any(c is not None and str(c).strip() != "" for c in r):
            rows.append(["" if c is None else str(c) for c in r])
    out[name] = rows
dest = os.path.join(os.path.dirname(__file__), "..", "test", "fixtures", "handoff.json")
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print({k: len(v) for k, v in out.items()}, "->", os.path.normpath(dest))
