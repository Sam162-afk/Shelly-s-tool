'use strict';
// Report layer on a fake sheet and fake Google services, using synthetic placeholder wording.
const test = require('node:test');
const assert = require('node:assert');
const { PPScoring, PPReport, PP_REPORT, sheetFns } = require('./helpers/load');
const { FakeSheet } = require('./helpers/fakeSheet');
const { FakeGoogle } = require('./helpers/fakeGoogle');
const { fakeTabs } = require('./helpers/fakeContent');
const { answersForSums, masterHeaderRow, masterRow } = require('./helpers/builders');

const JORDAN = { O: 84, C: 62, E: 46, A: 80, N: 60 };
const MAYA = { O: 60, C: 88, E: 44, A: 64, N: 40 };

function setup({ rows, configured = true, auto = true } = {}) {
  const data = rows || [masterRow('Jordan R.', answersForSums(JORDAN))];
  const sheet = new FakeSheet([masterHeaderRow(), ...data], 108);
  const g = new FakeGoogle().install(sheet);
  g.setContent(fakeTabs());
  if (configured) {
    sheetFns.setUpReports();
    if (auto) g.props.PP_REPORT_AUTO = 'on';
  }
  g.alerts.length = 0;
  return { sheet, g };
}
const submit = (sheet, row) => sheetFns.handleFormSubmit({ range: { getRow: () => row, getSheet: () => sheet } });
const colOf = (sheet, header) => sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].indexOf(header) + 1;
const cell = (sheet, row, header) => sheet.getRange(row, colOf(sheet, header), 1, 1).getValues()[0][0];
const status = (sheet, row) => cell(sheet, row, 'PP Report Status');
const link = (sheet, row) => cell(sheet, row, 'PP Report Link');
const fileIn = (g, url) => g.files.get(/\/d\/([^/]+)/.exec(url)[1]);

test('set up creates a private folder and a placeholder template that only uses known placeholders', () => {
  const { g } = setup({ configured: false });
  sheetFns.setUpReports();
  const folders = g.live('folder');
  assert.strictEqual(folders.length, 1);
  assert.strictEqual(folders[0].name, 'Peaceful Pathway Reports');
  const template = g.live('doc')[0];
  assert.strictEqual(template.parent, folders[0].id);
  assert.deepStrictEqual(PPReport.unknownPlaceholders(g.docText(template)), []);

  // every placeholder is present, and the only static words are her two column names
  const texts = template.paras.map((p) => p.text);
  for (const name of PPReport.placeholderNames()) {
    if (name.startsWith('{{FIRST_NAME') || /^\{\{(OPENING|MAIN_PAIR_TEXT|SECOND_PAIR_TEXT|CLOSING)\}\}$/.test(name)) continue;
    assert.ok(texts.includes(name), 'template is missing ' + name);
  }
  const staticWords = texts.filter((t) => !t.startsWith('{{'));
  assert.deepStrictEqual([...new Set(staticWords)].sort(), ['Gifts', 'Growth Edge']);
  assert.strictEqual(texts[texts.length - 1], '{{PORTRAIT}}');
  assert.strictEqual(texts[0], '{{O_NAME}}');
  assert.ok(template.paras.every((p) => p.attrs && p.attrs.FONT_FAMILY === 'Poppins'));
  assert.strictEqual(template.paras[0].attrs.FOREGROUND_COLOR, '#1F5C3E');
  assert.match(g.alerts.join(), /private to this account/);
});

test('set up can be repeated without making a second folder or template', () => {
  const { g } = setup();
  sheetFns.setUpReports();
  assert.strictEqual(g.live('folder').length, 1);
  assert.strictEqual(g.live('doc').length, 1);
  assert.match(g.alerts[0], /already set up/);
});

test('a submitted response gets scored, then a PDF made in the folder and linked in the row', () => {
  const { sheet, g } = setup();
  const answersBefore = sheet.getRange(2, 1, 1, 108).getValues();
  submit(sheet, 2);

  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.strictEqual(status(sheet, 2), 'OK');
  const pdf = fileIn(g, link(sheet, 2));
  assert.strictEqual(pdf.kind, 'pdf');
  assert.strictEqual(pdf.name, 'Jordan R. - Peaceful Pathway Report.pdf');
  assert.strictEqual(pdf.parent, g.live('folder')[0].id);
  assert.deepStrictEqual(sheet.getRange(2, 1, 1, 108).getValues(), answersBefore); // answers untouched

  const lines = pdf.text.split('\n');
  assert.strictEqual(lines.length, 46);
  assert.deepStrictEqual(lines.slice(0, 9), ['TXT|NAME|O', 'TXT|DEF|O', 'High', 'TXT|LABEL|O|High',
    'TXT|PARA|O|High', 'Gifts', 'TXT|GIFTS|O|High', 'Growth Edge', 'TXT|EDGE|O|High']);
  // level line of each trait block (9 lines per block): O High, C Medium, E Low, A High, N Medium
  assert.deepStrictEqual([2, 11, 20, 29, 38].map((i) => lines[i]), ['High', 'Medium', 'Low', 'High', 'Medium']);
  assert.strictEqual(lines[45],
    "Jordan, here's what makes you, you. TXT|PORTRAIT|O(H)+A(H) TXT|PORTRAIT|O(H)+E(L) TXT|CLOSING|O(H)");
  assert.ok(!pdf.text.includes('{{'));

  // only the PDF and the template remain; the working copy is trashed
  assert.strictEqual(g.live('pdf').length, 1);
  assert.strictEqual(g.live('doc').length, 1);
});

test('the PDF text contains nothing but placeholder tokens, level words, her two labels and the opening', () => {
  const { sheet, g } = setup();
  submit(sheet, 2);
  const lines = fileIn(g, link(sheet, 2)).text.split('\n');
  for (const line of lines) {
    const ok = /^TXT\|/.test(line) || ['Low', 'Medium', 'High', 'Gifts', 'Growth Edge'].includes(line) ||
      line.startsWith("Jordan, here's what makes you, you. TXT|");
    assert.ok(ok, 'unexpected text in report: ' + line);
  }
});

test('with automatic reports off, submitting scores and marks the row PENDING; the menu then makes it', () => {
  const { sheet, g } = setup({ auto: false });
  submit(sheet, 2);
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.strictEqual(status(sheet, 2), 'PENDING');
  assert.strictEqual(g.live('pdf').length, 0);

  sheetFns.generatePendingReports();
  assert.strictEqual(status(sheet, 2), 'OK');
  assert.strictEqual(g.live('pdf').length, 1);
  assert.match(g.alerts[0], /Reports: 1 made, 0 with errors/);
});

test('re-scoring replaces the report: new PDF, link updated, old PDF in the trash', () => {
  const { sheet, g } = setup();
  submit(sheet, 2);
  const first = link(sheet, 2);
  sheetFns.rescoreAllRows();
  const second = link(sheet, 2);
  assert.notStrictEqual(second, first);
  assert.strictEqual(status(sheet, 2), 'OK');
  assert.strictEqual(fileIn(g, first).trashed, true);
  assert.strictEqual(fileIn(g, second).trashed, false);
  assert.strictEqual(g.live('pdf').length, 1);
  assert.match(g.alerts[0], /Scored 1 row\(s\)\. 0 row\(s\) had errors.*Reports: 1 made/);
});

test('a row that cannot be scored is skipped, and the good rows around it still get reports', () => {
  const bad = answersForSums(JORDAN); bad[0] = 9;
  const { sheet, g } = setup({ rows: [masterRow('Jordan R.', answersForSums(JORDAN)), masterRow('Casey T.', bad), masterRow('Maya P.', answersForSums(MAYA))] });
  sheetFns.rescoreAllRows();
  assert.deepStrictEqual([2, 3, 4].map((r) => status(sheet, r)), ['OK', 'SKIPPED: scoring error', 'OK']);
  assert.strictEqual(link(sheet, 3), '');
  assert.strictEqual(g.live('pdf').length, 2);
  assert.strictEqual(fileIn(g, link(sheet, 4)).name, 'Maya P. - Peaceful Pathway Report.pdf');
  assert.match(fileIn(g, link(sheet, 4)).text, /TXT\|PORTRAIT\|A\(M\)\+C\(H\)/);
});

test('a missing content tab flags the row but never undoes the score, and a retry works once it is fixed', () => {
  const { sheet, g } = setup();
  const saved = g.tabs['Portrait Closings'];
  delete g.tabs['Portrait Closings'];
  assert.doesNotThrow(() => submit(sheet, 2));
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.match(status(sheet, 2), /^ERROR: Content tab "Portrait Closings" not found/);
  assert.strictEqual(g.live('pdf').length, 0);

  g.tabs['Portrait Closings'] = saved;
  sheetFns.generatePendingReports();
  assert.strictEqual(status(sheet, 2), 'OK');
  assert.strictEqual(g.live('pdf').length, 1);
});

test('a typo placeholder in the template stops the run before any PDF is made', () => {
  const { sheet, g } = setup();
  g.live('doc')[0].paras[6].text = '{{O_GIFT}}';
  submit(sheet, 2);
  assert.match(status(sheet, 2), /^ERROR: .*not recognised: \{\{O_GIFT\}\}/);
  assert.strictEqual(g.live('pdf').length, 0);
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
});

test('if Drive fails while making the PDF, the row shows the error, scoring stands and nothing is left behind', () => {
  const { sheet, g } = setup();
  g.failPdf = true;
  submit(sheet, 2);
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.strictEqual(status(sheet, 2), 'ERROR: Service error: Drive');
  assert.strictEqual(g.live('pdf').length, 0);
  assert.strictEqual(g.live('doc').length, 1); // only the template; working copy trashed
  g.failPdf = false;
  sheetFns.generatePendingReports(); // errors are retried
  assert.strictEqual(status(sheet, 2), 'OK');
});

test('a lock timeout while making the report leaves the row PENDING; the score is unaffected', () => {
  const { sheet, g } = setup();
  g.failLockAfter = 1; // scoring takes lock #1; claiming the row for its report would be #2
  submit(sheet, 2);
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.strictEqual(status(sheet, 2), 'PENDING');
  assert.strictEqual(g.live('pdf').length, 0);
});

test('a run that runs out of time leaves the remaining rows PENDING for the next run', () => {
  const rows = [masterRow('Jordan R.', answersForSums(JORDAN)), masterRow('Maya P.', answersForSums(MAYA))];
  const { sheet, g } = setup({ rows, auto: false });
  sheetFns.rescoreAllRows();
  PP_REPORT.TIME_BUDGET_MS = -1;
  try {
    sheetFns.generatePendingReports();
  } finally {
    PP_REPORT.TIME_BUDGET_MS = 270000;
  }
  assert.deepStrictEqual([2, 3].map((r) => status(sheet, r)), ['PENDING', 'PENDING']);
  assert.match(g.alerts[g.alerts.length - 1], /2 still pending/);
  sheetFns.generatePendingReports();
  assert.deepStrictEqual([2, 3].map((r) => status(sheet, r)), ['OK', 'OK']);
});

test('wording with a "$" is refused for that row instead of being mangled', () => {
  const { sheet, g } = setup();
  g.tabs['Portrait Closings'] = new FakeSheet(fakeTabs().closings.map((r, i) => (i === 0 ? r : [r[0], r[1], r[2], r[3] + ' costs $1'])));
  submit(sheet, 2);
  assert.match(status(sheet, 2), /^ERROR: .*contains a "\$" or "\\" character/);
  assert.strictEqual(g.live('pdf').length, 0);
});

test('rows scored before reports were set up get one from "Generate pending reports"; finished ones are left alone', () => {
  const rows = [masterRow('Jordan R.', answersForSums(JORDAN)), masterRow('Maya P.', answersForSums(MAYA))];
  const { sheet, g } = setup({ rows, configured: false });
  sheetFns.rescoreAllRows();                     // scorer only: no report columns yet
  assert.strictEqual(colOf(sheet, 'PP Report Status'), 0);
  sheetFns.setUpReports();
  sheetFns.generatePendingReports();
  assert.deepStrictEqual([2, 3].map((r) => status(sheet, r)), ['OK', 'OK']);
  const before = link(sheet, 2);
  sheetFns.generatePendingReports();             // nothing pending: no new PDFs
  assert.strictEqual(link(sheet, 2), before);
  assert.strictEqual(g.live('pdf').length, 2);
});

test('before set up, scoring behaves exactly as before: no report columns, no Drive calls', () => {
  const { sheet, g } = setup({ configured: false });
  g.live = () => { throw new Error('Drive must not be touched'); };
  submit(sheet, 2);
  assert.strictEqual(cell(sheet, 2, 'PP Scoring Status'), 'OK');
  assert.strictEqual(colOf(sheet, 'PP Report Status'), 0);
  assert.strictEqual(sheet.getLastColumn(), 108 + PPScoring.OUTPUT_HEADERS.length);
});

test('menu: auto reports can only be switched on after set up, and toggle on and off', () => {
  const { g } = setup({ configured: false });
  sheetFns.toggleAutoReports();
  assert.match(g.alerts[0], /Set up the report folder and template first/);
  sheetFns.setUpReports();
  sheetFns.toggleAutoReports();
  assert.strictEqual(g.props.PP_REPORT_AUTO, 'on');
  sheetFns.toggleAutoReports();
  assert.strictEqual(g.props.PP_REPORT_AUTO, 'off');
});

test('menu: switching templates checks the Doc first and changes nothing if it has a typo', () => {
  const { g } = setup();
  const original = g.props.PP_REPORT_TEMPLATE_ID;
  const make = (text) => {
    const doc = globalThis.DocumentApp.create('Designed');
    doc.getBody().appendParagraph(text);
    return doc.getId();
  };

  g.promptAnswer = 'not a link';
  sheetFns.chooseReportTemplate();
  assert.match(g.alerts.pop(), /does not look like a Google Doc link/);

  g.promptAnswer = 'https://docs.google.com/document/d/' + make('{{FIRST_NAME}} {{O_GIFTS_TYPO}}') + '/edit';
  sheetFns.chooseReportTemplate();
  assert.match(g.alerts.pop(), /not recognised: \{\{O_GIFTS_TYPO\}\}/);
  assert.strictEqual(g.props.PP_REPORT_TEMPLATE_ID, original);

  const good = make('{{OPENING}} {{O_NAME}}');
  g.promptAnswer = 'https://docs.google.com/document/d/' + good + '/edit';
  sheetFns.chooseReportTemplate();
  assert.strictEqual(g.props.PP_REPORT_TEMPLATE_ID, good);

  g.promptAnswer = null; // cancelled
  sheetFns.chooseReportTemplate();
  assert.strictEqual(g.props.PP_REPORT_TEMPLATE_ID, good);
});

test('a designed template is filled the same way: any layout, same exact text', () => {
  const { sheet, g } = setup();
  const doc = globalThis.DocumentApp.create('Designed');
  doc.getBody().appendParagraph('{{OPENING}}');
  doc.getBody().appendParagraph('{{MAIN_PAIR_TEXT}} / {{SECOND_PAIR_TEXT}} / {{CLOSING}} / {{O_LABEL}}');
  g.props.PP_REPORT_TEMPLATE_ID = doc.getId();
  submit(sheet, 2);
  assert.strictEqual(fileIn(g, link(sheet, 2)).text,
    "Jordan, here's what makes you, you.\nTXT|PORTRAIT|O(H)+A(H) / TXT|PORTRAIT|O(H)+E(L) / TXT|CLOSING|O(H) / TXT|LABEL|O|High");
});

test('setup check mentions the report setup', () => {
  const { g } = setup();
  globalThis.ScriptApp = { getProjectTriggers: () => [] };
  sheetFns.checkSetup();
  assert.match(g.alerts[0], /Report folder and template: set up/);
  assert.match(g.alerts[0], /Automatic reports: ON/);
});

test('a report that would still contain a {{token}} is never produced', () => {
  const { sheet, g } = setup();
  g.tabs['Portrait Closings'] = new FakeSheet(fakeTabs().closings.map((r, i) => (i === 0 ? r : [r[0], r[1], r[2], r[3] + ' {{LEFTOVER}}'])));
  submit(sheet, 2);
  assert.match(status(sheet, 2), /^ERROR: The template still has unfilled placeholder\(s\): \{\{LEFTOVER\}\}/);
  assert.strictEqual(g.live('pdf').length, 0);
  assert.strictEqual(link(sheet, 2), '');
});

test('the old-report cleanup only trashes a PDF inside the report folder, whatever the link cell says', () => {
  const { sheet, g } = setup();
  submit(sheet, 2);
  const linkCell = () => sheet.getRange(2, colOf(sheet, 'PP Report Link'), 1, 1);
  const outsider = g.add({ id: g.id('pdf'), name: 'Someone else', kind: 'pdf', text: 'private', parent: 'some-other-folder', trashed: false });
  const template = g.live('doc')[0];
  for (const target of [outsider, template]) {
    linkCell().setValues([[`https://drive.google.com/file/d/${target.id}/view`]]);
    sheetFns.rescoreAllRows();
    assert.strictEqual(target.trashed, false, target.name + ' must not be trashed');
    assert.strictEqual(status(sheet, 2), 'OK');
  }
  // a normal replace still cleans up its own old PDF
  const before = fileIn(g, link(sheet, 2));
  sheetFns.rescoreAllRows();
  assert.strictEqual(before.trashed, true);
});
