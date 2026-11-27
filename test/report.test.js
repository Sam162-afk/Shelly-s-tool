'use strict';
// Assembler tests using synthetic placeholder wording (always run; no real wording needed).
const test = require('node:test');
const assert = require('node:assert');
const { PPScoring, PPReport } = require('./helpers/load');
const { answersForSums } = require('./helpers/builders');
const { fakeTabs } = require('./helpers/fakeContent');

const content = () => PPReport.parseContent(fakeTabs());
const keysFor = (sums, firstName = 'Jordan') => {
  const r = PPScoring.score(answersForSums(sums));
  return { firstName, levels: r.levels, mainPairKey: r.mainPairKey,
           secondPairKey: r.secondPairKey, closingKey: r.closingKey };
};

test('parses 15 trait rows, 90 portraits and 15 closings', () => {
  const c = content();
  assert.strictEqual(Object.keys(c.traits).length * 3, 15);
  assert.strictEqual(Object.keys(c.portraits).length, 90);
  assert.strictEqual(Object.keys(c.closings).length, 15);
});

test('trait sections come in the order O, C, E, A, N with every field from the tab', () => {
  const report = PPReport.assemble(content(), keysFor({ O: 90, C: 60, E: 30, A: 88, N: 60 }));
  assert.deepStrictEqual(report.traits.map((t) => t.code), ['O', 'C', 'E', 'A', 'N']);
  const o = report.traits[0];
  assert.deepStrictEqual(o, {
    code: 'O', name: 'TXT|NAME|O', definition: 'TXT|DEF|O', level: 'High',
    label: 'TXT|LABEL|O|High', paragraph: 'TXT|PARA|O|High',
    gifts: 'TXT|GIFTS|O|High', growthEdge: 'TXT|EDGE|O|High'
  });
  assert.strictEqual(report.traits[2].level, 'Low');
  assert.strictEqual(report.traits[2].label, 'TXT|LABEL|E|Low');
});

test('portrait is exactly opening + main + second + closing, joined by single spaces, nothing else', () => {
  const keys = keysFor({ O: 90, C: 60, E: 30, A: 88, N: 60 });
  const p = PPReport.assemble(content(), keys).portrait;
  assert.strictEqual(p.opening, "Jordan, here's what makes you, you.");
  assert.strictEqual(p.text, [
    "Jordan, here's what makes you, you.",
    `TXT|PORTRAIT|${keys.mainPairKey}`,
    `TXT|PORTRAIT|${keys.secondPairKey}`,
    `TXT|CLOSING|${keys.closingKey}`
  ].join(' '));
});

test('no added words: after the opening, the portrait is made only of tab tokens', () => {
  const p = PPReport.assemble(content(), keysFor({ O: 70, C: 40, E: 90, A: 60, N: 30 }, 'Maya')).portrait;
  assert.ok(p.text.startsWith("Maya, here's what makes you, you. "));
  const rest = p.text.slice("Maya, here's what makes you, you. ".length).split(' ');
  assert.strictEqual(rest.length, 3);
  rest.forEach((piece) => assert.match(piece, /^TXT\|(PORTRAIT|CLOSING)\|/));
});

test('pair text is found by the key the scorer writes (O, N, E, A, C order)', () => {
  const keys = keysFor({ O: 40, C: 90, E: 60, A: 88, N: 30 });
  assert.strictEqual(keys.mainPairKey, 'A(H)+C(H)');
  const p = PPReport.assemble(content(), keys).portrait;
  assert.strictEqual(p.mainPair.text, 'TXT|PORTRAIT|A(H)+C(H)');
  assert.strictEqual(p.mainPair.typeName, 'TXT|TYPE|A(H)+C(H)');
});

test('a missing first name is an error, never a made-up greeting', () => {
  for (const bad of ['', '   ', undefined, null]) {
    assert.throws(() => PPReport.assemble(content(), { ...keysFor({ O: 60, C: 60, E: 60, A: 60, N: 60 }), firstName: bad }),
      /First name is missing/);
  }
});

test('an unknown key is an error that names the key', () => {
  const ok = keysFor({ O: 90, C: 60, E: 30, A: 88, N: 60 });
  assert.throws(() => PPReport.assemble(content(), { ...ok, mainPairKey: 'X(H)+Y(L)' }), /main pair portrait text for key "X\(H\)\+Y\(L\)"/);
  assert.throws(() => PPReport.assemble(content(), { ...ok, secondPairKey: '' }), /second pair portrait/);
  assert.throws(() => PPReport.assemble(content(), { ...ok, closingKey: 'O(X)' }), /closing line text for key "O\(X\)"/);
  assert.throws(() => PPReport.assemble(content(), { ...ok, mainPairKey: 'constructor' }), /main pair portrait/);
});

test('an invalid level is an error', () => {
  const ok = keysFor({ O: 90, C: 60, E: 30, A: 88, N: 60 });
  assert.throws(() => PPReport.assemble(content(), { ...ok, levels: { ...ok.levels, E: 'Mid' } }), /Level for E/);
  assert.throws(() => PPReport.assemble(content(), { ...ok, levels: undefined }), /Level for O/);
});

test('content problems are reported by tab, row and column', () => {
  const missingCol = fakeTabs();
  missingCol.initialTest[0][7] = 'Growth';
  assert.throws(() => PPReport.parseContent(missingCol), /"Initial Test" has no "Growth Edge" column/);

  const dupCol = fakeTabs();
  dupCol.closings[0][1] = 'Level';
  assert.throws(() => PPReport.parseContent(dupCol), /more than one "Level" column/);

  const emptyCell = fakeTabs();
  emptyCell.initialTest[4][6] = '  ';
  assert.throws(() => PPReport.parseContent(emptyCell), /"Initial Test" row 5: "Gifts" is empty/);

  const missingRow = fakeTabs();
  missingRow.portraits.splice(10, 1);
  assert.throws(() => PPReport.parseContent(missingRow), /"Combination Portraits" has no row for/);

  const dupRow = fakeTabs();
  dupRow.portraits[3] = dupRow.portraits[2].slice();
  assert.throws(() => PPReport.parseContent(dupRow), /appears twice/);

  const badLevel = fakeTabs();
  badLevel.closings[2][2] = 'Mid';
  assert.throws(() => PPReport.parseContent(badLevel), /"Level" must be Low, Medium or High/);

  const missingClosing = fakeTabs();
  missingClosing.closings.pop();
  assert.throws(() => PPReport.parseContent(missingClosing), /"Portrait Closings" has no row for/);
});

test('columns are found by header name, so reordered columns still work', () => {
  const tabs = fakeTabs();
  tabs.closings = tabs.closings.map((r) => [r[3], r[0], r[2], r[1]]); // shuffle columns
  const c = PPReport.parseContent(tabs);
  assert.strictEqual(c.closings['O(H)'], 'TXT|CLOSING|O(H)');
});

test('text is kept exactly as written (no trimming or cleanup of the wording)', () => {
  const tabs = fakeTabs();
  tabs.closings[1][3] = 'You  bring   spaces, "quotes" & trailing space. ';
  const c = PPReport.parseContent(tabs);
  assert.strictEqual(c.closings['O(L)'] === undefined, false);
  const exact = Object.values(c.closings).find((t) => t.startsWith('You  bring'));
  assert.strictEqual(exact, 'You  bring   spaces, "quotes" & trailing space. ');
});
