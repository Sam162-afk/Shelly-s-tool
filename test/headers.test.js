'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PPScoring } = require('./helpers/load');
const { masterHeaderRow } = require('./helpers/builders');

test('finds all 100 items in the real master layout (items in columns 7-106)', () => {
  const layout = PPScoring.locateItemColumns(masterHeaderRow());
  assert.deepStrictEqual(layout.missing, []);
  assert.deepStrictEqual(layout.duplicates, []);
  assert.strictEqual(layout.columns[0], 6);    // item 1 -> column 7 (index 6)
  assert.strictEqual(layout.columns[99], 105); // item 100 -> column 106 (index 105)
});

test('tolerates the form quirks: stray leading spaces (items 77, 80) and "others\'s" (item 64)', () => {
  const header = masterHeaderRow();
  assert.ok(header.some((h) => h === "I tend to be dismissive of others's concerns."));
  assert.ok(header.some((h) => h === ' I am always on the go.'));
  assert.deepStrictEqual(PPScoring.locateItemColumns(header).missing, []);
});

test('finds items wherever they are: order of columns does not matter', () => {
  const header = masterHeaderRow();
  const items = header.slice(6, 106).reverse();
  const shuffled = [...header.slice(0, 6), ...items, ...header.slice(106)];
  const layout = PPScoring.locateItemColumns(shuffled);
  assert.deepStrictEqual(layout.missing, []);
  assert.strictEqual(layout.columns[0], 105); // item 1 now sits in the last item column
});

test('Birth Month at the end, the stray "Column 106" header and PP columns are ignored', () => {
  const header = [...masterHeaderRow(), ...PPScoring.OUTPUT_HEADERS];
  const layout = PPScoring.locateItemColumns(header);
  assert.deepStrictEqual(layout.missing, []);
  assert.ok(layout.columns.every((c) => c >= 6 && c <= 105));
});

test('a missing or reworded item header is reported by item number', () => {
  const header = masterHeaderRow();
  header[6 + 11] = 'I warm up to new people slowly.'; // item 12 reworded
  header[6 + 49] = '';                                // item 50 blank
  const layout = PPScoring.locateItemColumns(header);
  assert.deepStrictEqual(layout.missing, [12, 50]);
});

test('a duplicated item header is reported', () => {
  const header = masterHeaderRow();
  header.push(header[6]); // item 1 appears twice
  assert.deepStrictEqual(PPScoring.locateItemColumns(header).duplicates, [1]);
});

test('curly apostrophes and extra spaces do not break matching', () => {
  const header = masterHeaderRow().map((h) => h.replace(/'/g, '’').replace(/ /g, '  '));
  assert.deepStrictEqual(PPScoring.locateItemColumns(header).missing, []);
});
