'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PPScoring, PP_CONFIG, sheetFns } = require('./helpers/load');
const { FakeSheet } = require('./helpers/fakeSheet');
const { answersForSums, masterHeaderRow, masterRow } = require('./helpers/builders');

const H = PPScoring.OUTPUT_HEADERS;
const JORDAN = { O: 84, C: 62, E: 46, A: 80, N: 60 };

function masterSheet(rows) {
  // The real master: 108 columns, header only, no spare grid columns.
  return new FakeSheet([masterHeaderRow(), ...rows], 108);
}
const col = (cols, header) => cols[H.indexOf(header)];

test('output columns are added after the last used column (109 onward), once', () => {
  const sheet = masterSheet([]);
  const cols = sheetFns.ensureOutputColumns(sheet);
  assert.deepStrictEqual(cols, H.map((_, i) => 109 + i));
  assert.strictEqual(sheet.getMaxColumns(), 108 + 21);
  const again = sheetFns.ensureOutputColumns(sheet);
  assert.deepStrictEqual(again, cols);
  assert.strictEqual(sheet.getLastColumn(), 129); // no duplicates added
});

test('scoring a row fills only the PP columns and leaves every original cell alone', () => {
  const sheet = masterSheet([masterRow('Jordan R.', answersForSums(JORDAN))]);
  const before = sheet.getRange(1, 1, 2, 108).getValues();
  const result = sheetFns.scoreRows(sheet, 2, 2);
  assert.deepStrictEqual(result, { scored: 1, errors: 0 });
  assert.deepStrictEqual(sheet.getRange(1, 1, 2, 108).getValues(), before);

  const header = sheet.getRange(1, 1, 1, 129).getValues()[0];
  const row = sheet.getRange(2, 1, 1, 129).getValues()[0];
  const cols = H.map((h) => header.indexOf(h) + 1);
  const at = (h) => row[col(cols, h) - 1];
  assert.strictEqual(at('PP First Name'), 'Jordan');
  assert.strictEqual(at('PP O Sum'), 84);
  assert.strictEqual(at('PP O Avg'), 4.2);
  assert.strictEqual(at('PP E Level'), 'Low');
  assert.strictEqual(at('PP Ranking'), 'O > A > C > N > E');
  assert.strictEqual(at('PP Main Pair Key'), 'O(H)+A(H)');
  assert.strictEqual(at('PP Second Pair Key'), 'O(H)+E(L)');
  assert.strictEqual(at('PP Closing Key'), 'O(H)');
  assert.strictEqual(at('PP Scoring Status'), 'OK');
});

test('answers that arrive as text ("3") are scored the same as numbers', () => {
  const answers = answersForSums(JORDAN).map(String);
  const sheet = masterSheet([masterRow('Jordan R.', answers)]);
  assert.deepStrictEqual(sheetFns.scoreRows(sheet, 2, 2), { scored: 1, errors: 0 });
});

test('a bad row gets an error status and nothing else; good rows around it still score', () => {
  const bad = answersForSums(JORDAN); bad[11] = 7;
  const sheet = masterSheet([
    masterRow('Jordan R.', answersForSums(JORDAN)),
    masterRow('Casey T.', bad),
    new Array(108).fill(''),
    masterRow('Maya P.', answersForSums({ O: 60, C: 88, E: 44, A: 64, N: 40 }))
  ]);
  const result = sheetFns.scoreRows(sheet, 2, 5);
  assert.deepStrictEqual(result, { scored: 2, errors: 1 });
  const header = sheet.getRange(1, 1, 1, 129).getValues()[0];
  const status = header.indexOf('PP Scoring Status') + 1;
  const main = header.indexOf('PP Main Pair Key') + 1;
  const statusOf = (r) => sheet.getRange(r, status, 1, 1).getValues()[0][0];
  assert.strictEqual(statusOf(2), 'OK');
  assert.match(statusOf(3), /^ERROR: .*item 12/);
  assert.strictEqual(sheet.getRange(3, main, 1, 1).getValues()[0][0], '');
  assert.strictEqual(statusOf(4), ''); // blank row stays blank
  assert.strictEqual(statusOf(5), 'OK');
  assert.strictEqual(sheet.getRange(5, main, 1, 1).getValues()[0][0], 'A(M)+C(H)');
});

test('if the form headers no longer match the key, rows are flagged, not guessed', () => {
  const header = masterHeaderRow();
  header[6 + 11] = 'I warm up to new people slowly.';
  const sheet = new FakeSheet([header, masterRow('Jordan R.', answersForSums(JORDAN))], 108);
  const result = sheetFns.scoreRows(sheet, 2, 2);
  assert.deepStrictEqual(result, { scored: 0, errors: 1 });
  const h = sheet.getRange(1, 1, 1, 129).getValues()[0];
  const status = sheet.getRange(2, h.indexOf('PP Scoring Status') + 1, 1, 1).getValues()[0][0];
  assert.match(status, /^ERROR: .*missing item\(s\): 12/);
});

test('re-scoring is repeatable and picks up corrected answers', () => {
  const bad = answersForSums(JORDAN); bad[11] = 7;
  const sheet = masterSheet([masterRow('Casey T.', bad)]);
  sheetFns.scoreRows(sheet, 2, 2);
  const fixed = answersForSums(JORDAN);
  sheet.getRange(2, 7, 1, 100).setValues([fixed]);
  assert.deepStrictEqual(sheetFns.scoreRows(sheet, 2, 2), { scored: 1, errors: 0 });
  assert.strictEqual(sheet.getLastColumn(), 129);
});

// ---- entry points, with Google services replaced by recording fakes ----

function installFakes(sheet) {
  const log = { alerts: [], locks: [], triggers: [], deleted: [], menu: [] };
  const existing = [{ getHandlerFunction: () => 'handleFormSubmit' }, { getHandlerFunction: () => 'somethingElse' }];
  globalThis.LockService = { getScriptLock: () => ({ waitLock: () => log.locks.push('wait'), releaseLock: () => log.locks.push('release') }) };
  globalThis.ScriptApp = {
    getProjectTriggers: () => existing,
    deleteTrigger: (t) => log.deleted.push(t.getHandlerFunction()),
    newTrigger: (name) => ({
      forSpreadsheet: () => ({ onFormSubmit: () => ({ create: () => log.triggers.push(name) }) })
    })
  };
  const ui = {
    alert: (...a) => log.alerts.push(a.join(' | ')),
    ButtonSet: { OK: 'OK' },
    createMenu: (title) => {
      const m = { addItem: (label, fn) => { log.menu.push([title, label, fn]); return m; }, addToUi: () => {} };
      return m;
    }
  };
  globalThis.SpreadsheetApp = {
    getUi: () => ui,
    getActive: () => ({ getSheetByName: (n) => (n === PP_CONFIG.SHEET_NAME ? sheet : null) })
  };
  return log;
}

test('form-submit trigger scores just the new row, under a lock', () => {
  const sheet = masterSheet([masterRow('Jordan R.', answersForSums(JORDAN)), masterRow('Maya P.', answersForSums({ O: 60, C: 88, E: 44, A: 64, N: 40 }))]);
  const log = installFakes(sheet);
  sheetFns.handleFormSubmit({ range: { getRow: () => 3, getSheet: () => sheet } });
  assert.deepStrictEqual(log.locks, ['wait', 'release']);
  const h = sheet.getRange(1, 1, 1, 129).getValues()[0];
  const main = h.indexOf('PP Main Pair Key') + 1;
  assert.strictEqual(sheet.getRange(2, main, 1, 1).getValues()[0][0], '');          // row 2 not touched
  assert.strictEqual(sheet.getRange(3, main, 1, 1).getValues()[0][0], 'A(M)+C(H)'); // row 3 scored
});

test('lock is released even when scoring throws', () => {
  const sheet = masterSheet([]);
  const log = installFakes(sheet);
  assert.throws(() => sheetFns.handleFormSubmit({ range: { getRow: () => 2, getSheet: () => null } }));
  assert.deepStrictEqual(log.locks, ['wait', 'release']);
});

test('menu "Re-score all rows" scores every row and reports counts', () => {
  const bad = answersForSums(JORDAN); bad[0] = 9;
  const sheet = masterSheet([masterRow('Jordan R.', answersForSums(JORDAN)), masterRow('Casey T.', bad)]);
  const log = installFakes(sheet);
  sheetFns.rescoreAllRows();
  assert.strictEqual(log.alerts.length, 1);
  assert.match(log.alerts[0], /Scored 1 row\(s\)\. 1 row\(s\) had errors/);
});

test('re-score on an empty sheet says there is nothing to score and adds nothing', () => {
  const sheet = masterSheet([]);
  const log = installFakes(sheet);
  sheetFns.rescoreAllRows();
  assert.match(log.alerts[0], /no responses/);
  assert.strictEqual(sheet.getLastColumn(), 108);
});

test('install trigger replaces any old scoring trigger and leaves other triggers alone', () => {
  const log = installFakes(masterSheet([]));
  sheetFns.installTrigger();
  assert.deepStrictEqual(log.deleted, ['handleFormSubmit']);
  assert.deepStrictEqual(log.triggers, ['handleFormSubmit']);
});

test('menu has the three items', () => {
  const log = installFakes(masterSheet([]));
  sheetFns.onOpen();
  assert.deepStrictEqual(log.menu.map((m) => m[2]), ['rescoreAllRows', 'checkSetup', 'installTrigger']);
});

test('setup check reports what it finds without changing the sheet', () => {
  const sheet = masterSheet([]);
  const log = installFakes(sheet);
  sheetFns.checkSetup();
  assert.match(log.alerts[0], /Answer columns found: 100 of 100/);
  assert.match(log.alerts[0], /First-name column: found/);
  assert.match(log.alerts[0], /Score columns present: 0 of 21/);
  assert.match(log.alerts[0], /Auto-scoring trigger: installed/);
  assert.strictEqual(sheet.getLastColumn(), 108);
});

test('the code makes no network requests and sends no email', () => {
  const fs = require('fs');
  for (const f of ['Key.js', 'Scoring.js', 'Sheet.js']) {
    const code = fs.readFileSync(require('path').join(__dirname, '..', 'src', f), 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    for (const banned of ['UrlFetchApp', 'MailApp', 'GmailApp', 'DocumentApp', 'DriveApp', 'fetch(', 'XMLHttpRequest']) {
      assert.ok(!code.includes(banned), f + ' must not use ' + banned);
    }
  }
});
