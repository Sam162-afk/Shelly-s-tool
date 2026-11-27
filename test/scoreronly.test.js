'use strict';
// The scorer-only build (Key.js + Scoring.js + Sheet.js, no report files) must still work
// exactly as before: that is the proven go-live path.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FakeSheet } = require('./helpers/fakeSheet');
const { answersForSums, masterHeaderRow, masterRow } = require('./helpers/builders');

function scorerOnlyContext(sheet, menu) {
  const ctx = vm.createContext({
    console,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {
      getUi: () => ({ createMenu: () => { const m = { addItem: (l, fn) => { menu.push(fn); return m; }, addToUi() {} }; return m; } })
    }
  });
  for (const f of ['Key.js', 'Scoring.js', 'Sheet.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

test('scorer-only build scores a submitted row and shows only the three scoring menu items', () => {
  const sheet = new FakeSheet([masterHeaderRow(), masterRow('Jordan R.', answersForSums({ O: 84, C: 62, E: 46, A: 80, N: 60 }))], 108);
  const menu = [];
  const ctx = scorerOnlyContext(sheet, menu);
  ctx.handleFormSubmit({ range: { getRow: () => 2, getSheet: () => sheet } });
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.strictEqual(sheet.getRange(2, header.indexOf('PP Main Pair Key') + 1, 1, 1).getValues()[0][0], 'O(H)+A(H)');
  assert.strictEqual(header.indexOf('PP Report Status'), -1);
  ctx.onOpen();
  assert.deepStrictEqual(menu, ['rescoreAllRows', 'checkSetup', 'installTrigger']);
});
