'use strict';
// Assembler tests against Shelly's REAL wording (test/fixtures/handoff.json, gitignored).
// Build the fixture with: python3 -I tools/make-fixture.py <handoff workbook .xlsx>
// Without the fixture these tests are skipped (loudly), not silently passed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PPScoring, PPReport } = require('./helpers/load');
const { answersForSums } = require('./helpers/builders');

const FIXTURE = path.join(__dirname, 'fixtures', 'handoff.json');
const have = fs.existsSync(FIXTURE);
const opts = have ? {} : { skip: 'test/fixtures/handoff.json not found (see tools/make-fixture.py)' };
const fixture = have ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : null;
const content = () => PPReport.parseContent({
  initialTest: fixture['Initial Test'],
  portraits: fixture['Combination Portraits'],
  closings: fixture['Portrait Closings']
});

function resultFor(sums) {
  const r = PPScoring.score(answersForSums(sums));
  return { levels: r.levels, mainPairKey: r.mainPairKey, secondPairKey: r.secondPairKey, closingKey: r.closingKey };
}

test('her workbook parses: 15 trait rows, 90 portraits, 15 closings', opts, () => {
  const c = content();
  assert.strictEqual(Object.keys(c.traits).length, 5);
  assert.strictEqual(Object.keys(c.portraits).length, 90);
  assert.strictEqual(Object.keys(c.closings).length, 15);
});

test('the five Worked Examples match word for word, including both pair type names', opts, () => {
  const c = content();
  const rows = fixture['Worked Examples'].slice(1);
  assert.strictEqual(rows.length, 5);
  for (const [name, scores, mainType, secondType, expected] of rows) {
    const sums = {};
    const levels = {};
    for (const m of scores.matchAll(/([OCEAN]) (\d\.\d) \((Low|Medium|High)\)/g)) {
      sums[m[1]] = Math.round(parseFloat(m[2]) * 20);
      levels[m[1]] = m[3];
    }
    assert.strictEqual(Object.keys(sums).length, 5, name);
    const keys = resultFor(sums);
    assert.deepStrictEqual(keys.levels, levels, name + ' levels');
    const report = PPReport.assemble(c, { firstName: name, ...keys });
    assert.strictEqual(report.portrait.mainPair.typeName, mainType, name + ' main pair type');
    assert.strictEqual(report.portrait.secondPair.typeName, secondType, name + ' second pair type');
    assert.strictEqual(report.portrait.text, expected, name + ' full portrait');
  }
});

test('every possible result finds all its text, and every piece is her exact wording', opts, () => {
  const c = content();
  const portraitTexts = new Set(Object.values(c.portraits).map((p) => p.text));
  const closingTexts = new Set(Object.values(c.closings));
  const traitTexts = new Set();
  for (const t of Object.values(c.traits)) {
    traitTexts.add(t.name); traitTexts.add(t.definition);
    for (const l of Object.values(t.levels)) Object.values(l).forEach((s) => traitTexts.add(s));
  }

  const perms = (arr) => arr.length <= 1 ? [arr] :
    arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  const order = { Low: 0, Medium: 1, High: 2 };
  const base = { High: 90, Medium: 60, Low: 30 };
  const lv5 = (() => { const out = []; const go = (acc) => acc.length === 5 ? out.push(acc) : ['Low', 'Medium', 'High'].forEach((l) => go([...acc, l])); go([]); return out; })();

  const seen = new Set();
  const opening = PPReport.OPENING_SUFFIX;
  for (const lv of lv5) {
    const levels = { O: lv[0], C: lv[1], E: lv[2], A: lv[3], N: lv[4] };
    for (const perm of perms(['O', 'C', 'E', 'A', 'N'])) {
      if (perm.some((t, i) => i < 4 && order[levels[t]] < order[levels[perm[i + 1]]])) continue;
      const sums = {};
      perm.forEach((t, i) => { sums[t] = base[levels[t]] - i; });
      const keys = resultFor(sums);
      const report = PPReport.assemble(c, { firstName: 'Sam', ...keys });
      const p = report.portrait;

      // portrait = "Sam" + opening + main text + second text + closing, nothing between or after
      assert.ok(portraitTexts.has(p.mainPair.text) && portraitTexts.has(p.secondPair.text));
      assert.ok(closingTexts.has(p.closing.text));
      assert.strictEqual(p.text, `Sam${opening} ${p.mainPair.text} ${p.secondPair.text} ${p.closing.text}`);
      assert.notStrictEqual(p.mainPair.key, p.secondPair.key);

      // trait sections: every string is a cell from the Initial Test tab
      assert.strictEqual(report.traits.length, 5);
      for (const t of report.traits) {
        for (const s of [t.name, t.definition, t.label, t.paragraph, t.gifts, t.growthEdge]) {
          assert.ok(traitTexts.has(s), 'not from her tab: ' + s);
        }
      }
      seen.add([lv.join(','), keys.mainPairKey, keys.secondPairKey, keys.closingKey].join('|'));
    }
  }
  assert.strictEqual(seen.size, 1620);
});
