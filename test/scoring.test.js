'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PPScoring, PP_ITEMS } = require('./helpers/load');
const { answersForSums } = require('./helpers/builders');

const ALL = (n) => ({ O: n, C: n, E: n, A: n, N: n });

test('all 3s: every trait sums to 60 (average 3.0, Medium)', () => {
  const r = PPScoring.score(new Array(100).fill(3));
  assert.deepStrictEqual(r.sums, ALL(60));
  assert.deepStrictEqual(r.averages, ALL(3));
  assert.deepStrictEqual(r.levels, ALL('Medium'));
});

test('reverse-keyed item scores 6 minus the response', () => {
  const answers = new Array(100).fill(3);
  answers[8 - 1] = 5; // item 8 is Openness, reverse-keyed: 5 -> 1
  assert.strictEqual(PPScoring.score(answers).sums.O, 19 * 3 + 1);
  answers[8 - 1] = 1; // 1 -> 5
  assert.strictEqual(PPScoring.score(answers).sums.O, 19 * 3 + 5);
});

test('normal item scores as answered', () => {
  const answers = new Array(100).fill(3);
  answers[3 - 1] = 5; // item 3 is Openness, normal
  assert.strictEqual(PPScoring.score(answers).sums.O, 19 * 3 + 5);
});

test('answering 5 on everything gives each trait 5 x normal + 1 x reverse items', () => {
  const r = PPScoring.score(new Array(100).fill(5));
  const expected = { O: 13 * 5 + 7, C: 12 * 5 + 8, E: 12 * 5 + 8, A: 11 * 5 + 9, N: 12 * 5 + 8 };
  assert.deepStrictEqual(r.sums, expected);
});

test('level cutoffs at the exact edges: 52 Low | 53 Medium | 68 Medium | 69 High', () => {
  const cases = [[20, 'Low'], [52, 'Low'], [53, 'Medium'], [60, 'Medium'], [68, 'Medium'], [69, 'High'], [100, 'High']];
  for (const [sum, level] of cases) {
    assert.strictEqual(PPScoring.levelForSum(sum), level, 'direct sum ' + sum);
    const r = PPScoring.score(answersForSums({ ...ALL(60), O: sum }));
    assert.strictEqual(r.sums.O, sum);
    assert.strictEqual(r.levels.O, level, 'scored sum ' + sum);
  }
});

test('cutoffs equal the handoff averages: 2.60 Low, 2.65 Medium, 3.40 Medium, 3.45 High', () => {
  const avgOf = (sum) => PPScoring.score(answersForSums({ ...ALL(60), O: sum }));
  const cases = [[52, 2.6, 'Low'], [53, 2.65, 'Medium'], [68, 3.4, 'Medium'], [69, 3.45, 'High']];
  for (const [sum, avg, level] of cases) {
    const r = avgOf(sum);
    assert.strictEqual(r.averages.O, avg);
    assert.strictEqual(r.levels.O, level);
  }
});

test('ranking: equal scores break ties in the order O, C, E, A, N', () => {
  const r = PPScoring.score(new Array(100).fill(3));
  assert.deepStrictEqual(r.ranking, ['O', 'C', 'E', 'A', 'N']);
  const r2 = PPScoring.score(answersForSums({ O: 70, C: 60, E: 70, A: 60, N: 60 }));
  assert.deepStrictEqual(r2.ranking, ['O', 'E', 'C', 'A', 'N']);
});

// The five Worked Examples in the handoff workbook (tab "Worked Examples").
// Scores there are shown to one decimal, so the sums are average x 20. The
// expected keys were checked against that tab's type names and portrait text.
const WORKED = [
  { name: 'Jordan', sums: { O: 84, C: 62, E: 46, A: 80, N: 60 },
    levels: { O: 'High', C: 'Medium', E: 'Low', A: 'High', N: 'Medium' },
    main: 'O(H)+A(H)', second: 'O(H)+E(L)', closing: 'O(H)' },
  { name: 'Maya', sums: { O: 60, C: 88, E: 44, A: 64, N: 40 },
    levels: { O: 'Medium', C: 'High', E: 'Low', A: 'Medium', N: 'Low' },
    main: 'A(M)+C(H)', second: 'E(L)+C(H)', closing: 'C(H)' },
  { name: 'Sam', sums: { O: 76, C: 48, E: 82, A: 60, N: 72 },
    levels: { O: 'High', C: 'Low', E: 'High', A: 'Medium', N: 'High' },
    main: 'O(H)+E(H)', second: 'E(H)+C(L)', closing: 'E(H)' },
  { name: 'Alex', sums: ALL(60),
    levels: ALL('Medium'),
    main: 'O(M)+C(M)', second: 'O(M)+E(M)', closing: 'O(M)' },
  { name: 'Riley', sums: { O: 44, C: 72, E: 66, A: 86, N: 88 },
    levels: { O: 'Low', C: 'High', E: 'Medium', A: 'High', N: 'High' },
    main: 'N(H)+A(H)', second: 'O(L)+N(H)', closing: 'N(H)' }
];
for (const w of WORKED) {
  test('Worked Example: ' + w.name, () => {
    const r = PPScoring.score(answersForSums(w.sums));
    assert.deepStrictEqual(r.sums, w.sums);
    assert.deepStrictEqual(r.levels, w.levels);
    assert.strictEqual(r.mainPairKey, w.main);
    assert.strictEqual(r.secondPairKey, w.second);
    assert.strictEqual(r.closingKey, w.closing);
  });
}

test('second pair: biggest level gap wins; a tie goes to the higher-ranked trait', () => {
  // Top O High; E Low and N Low both have gap 2 -> E ranks higher than N.
  const r = PPScoring.score(answersForSums({ O: 90, C: 85, E: 40, A: 75, N: 35 }));
  assert.deepStrictEqual(r.ranking, ['O', 'C', 'A', 'E', 'N']);
  assert.strictEqual(r.secondPairKey, 'O(H)+E(L)');
});

test('second pair: when no trait differs in level, use rank 3', () => {
  const r = PPScoring.score(answersForSums({ O: 80, C: 79, E: 78, A: 77, N: 76 }));
  assert.deepStrictEqual(r.ranking, ['O', 'C', 'E', 'A', 'N']);
  assert.strictEqual(r.mainPairKey, 'O(H)+C(H)');
  assert.strictEqual(r.secondPairKey, 'O(H)+E(H)');
});

test('pair keys always list traits in the order O, N, E, A, C', () => {
  const r = PPScoring.score(answersForSums({ O: 40, C: 90, E: 60, A: 88, N: 30 }));
  assert.strictEqual(r.mainPairKey, 'A(H)+C(H)');
  assert.strictEqual(r.closingKey, 'C(H)');
});

test('every possible result is one of the 90 pair keys and 15 closing keys; 1,620 distinct reports', () => {
  const pairs = [];
  const P = PPScoring.PAIR_ORDER;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
    for (const a of 'LMH') for (const b of 'LMH') pairs.push(`${P[i]}(${a})+${P[j]}(${b})`);
  const closings = [];
  for (const t of 'OCEAN') for (const l of 'LMH') closings.push(`${t}(${l})`);
  assert.strictEqual(pairs.length, 90);

  const perms = (arr) => arr.length <= 1 ? [arr] :
    arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  const order = { Low: 0, Medium: 1, High: 2 };
  const base = { High: 90, Medium: 60, Low: 30 };
  const seen = new Set();
  for (const lv of cartesian(['Low', 'Medium', 'High'], 5)) {
    const levels = { O: lv[0], C: lv[1], E: lv[2], A: lv[3], N: lv[4] };
    for (const perm of perms(['O', 'C', 'E', 'A', 'N'])) {
      if (perm.some((t, i) => i < 4 && order[levels[t]] < order[levels[perm[i + 1]]])) continue;
      const sums = {};
      perm.forEach((t, i) => { sums[t] = base[levels[t]] - i; });
      const r = PPScoring.score(answersForSums(sums));
      assert.deepStrictEqual(r.ranking, perm);
      assert.deepStrictEqual(r.levels, levels);
      assert.ok(pairs.includes(r.mainPairKey), r.mainPairKey);
      assert.ok(pairs.includes(r.secondPairKey), r.secondPairKey);
      assert.ok(closings.includes(r.closingKey), r.closingKey);
      seen.add([lv.join(','), r.mainPairKey, r.secondPairKey, r.closingKey].join('|'));
    }
  }
  assert.strictEqual(seen.size, 1620);
});

function cartesian(values, n) {
  let out = [[]];
  for (let i = 0; i < n; i++) out = out.flatMap((p) => values.map((v) => [...p, v]));
  return out;
}

test('answers must be whole numbers 1-5 (numbers or digit strings); anything else is an error', () => {
  const ok = new Array(100).fill(3);
  assert.doesNotThrow(() => PPScoring.score(ok.map(String)));
  for (const bad of [0, 6, 3.5, '', 'abc', null, undefined, '3.5', -1, NaN]) {
    const a = ok.slice(); a[11] = bad;
    assert.throws(() => PPScoring.score(a), /item 12/, 'value ' + String(bad));
  }
  assert.throws(() => PPScoring.score(new Array(99).fill(3)), /Expected 100 answers/);
  assert.throws(() => PPScoring.score(null), /Expected 100 answers/);
});

test('first name is the text before the first space', () => {
  const f = PPScoring.firstNameFrom;
  assert.strictEqual(f('Shelly B.'), 'Shelly');
  assert.strictEqual(f('  Shelly   B. '), 'Shelly');
  assert.strictEqual(f('Mary-Anne K.'), 'Mary-Anne');
  assert.strictEqual(f('Cher'), 'Cher');
  assert.strictEqual(f(''), '');
  assert.strictEqual(f(null), '');
});

test('output values line up with the output headers', () => {
  const H = PPScoring.OUTPUT_HEADERS;
  assert.strictEqual(H.length, 21);
  const r = PPScoring.score(answersForSums(WORKED[0].sums));
  const v = PPScoring.outputValues(r, 'Jordan');
  assert.strictEqual(v.length, H.length);
  assert.strictEqual(v[H.indexOf('PP First Name')], 'Jordan');
  assert.strictEqual(v[H.indexOf('PP O Sum')], 84);
  assert.strictEqual(v[H.indexOf('PP O Avg')], 4.2);
  assert.strictEqual(v[H.indexOf('PP O Level')], 'High');
  assert.strictEqual(v[H.indexOf('PP Ranking')], 'O > A > C > N > E');
  assert.strictEqual(v[H.indexOf('PP Main Pair Key')], 'O(H)+A(H)');
  assert.strictEqual(v[H.indexOf('PP Scoring Status')], 'OK');
  const e = PPScoring.errorValues('Jordan', 'boom');
  assert.strictEqual(e.length, H.length);
  assert.strictEqual(e[H.indexOf('PP Scoring Status')], 'ERROR: boom');
  assert.strictEqual(e[H.indexOf('PP Main Pair Key')], '');
});
