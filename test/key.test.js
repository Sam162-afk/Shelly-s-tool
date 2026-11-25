'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PP_ITEMS } = require('./helpers/load');

test('key has 100 items numbered 1-100 in order', () => {
  assert.strictEqual(PP_ITEMS.length, 100);
  PP_ITEMS.forEach((item, i) => assert.strictEqual(item.n, i + 1));
});

test('each trait has exactly 20 items', () => {
  for (const t of 'OCEAN') assert.strictEqual(PP_ITEMS.filter((i) => i.trait === t).length, 20);
});

test('reverse-keyed counts per trait match PP_Scoring_Template_v3 (O7 C8 E8 A9 N8)', () => {
  const rev = (t) => PP_ITEMS.filter((i) => i.trait === t && i.reverse).length;
  assert.deepStrictEqual({ O: rev('O'), C: rev('C'), E: rev('E'), A: rev('A'), N: rev('N') },
                         { O: 7, C: 8, E: 8, A: 9, N: 8 });
});

test('items follow the N, E, O, A, C rotation', () => {
  PP_ITEMS.forEach((item, i) => assert.strictEqual(item.trait, 'NEOAC'[i % 5]));
});

test('spot checks against the workbook', () => {
  const item = (n) => PP_ITEMS[n - 1];
  assert.deepStrictEqual([item(1).trait, item(1).reverse], ['N', false]);
  assert.deepStrictEqual([item(8).trait, item(8).reverse], ['O', true]);   // "I seldom daydream..."
  assert.deepStrictEqual([item(39).trait, item(39).reverse], ['A', true]); // "...ways around rules..."
  assert.deepStrictEqual([item(98).trait, item(98).reverse], ['O', false]);
  assert.deepStrictEqual([item(100).trait, item(100).reverse], ['C', false]);
});

test('item texts are unique', () => {
  assert.strictEqual(new Set(PP_ITEMS.map((i) => i.text)).size, 100);
});
