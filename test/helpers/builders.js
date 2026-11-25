'use strict';
const { PP_ITEMS } = require('./load');

/**
 * Build 100 raw answers whose SCORED item values add up to the requested sum for
 * each trait (sums between 20 and 100). Reverse-keyed items get 6 - value.
 */
function answersForSums(sums) {
  const used = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  return PP_ITEMS.map((item) => {
    const base = Math.floor(sums[item.trait] / 20);
    const extra = sums[item.trait] % 20;
    const scored = base + (used[item.trait] < extra ? 1 : 0);
    used[item.trait] += 1;
    return item.reverse ? 6 - scored : scored;
  });
}

/** Header row exactly as the real master sheet prints it (quirks included). */
function masterHeaderRow() {
  const items = PP_ITEMS.map((item) => {
    if (item.n === 64) return item.text.replace("others'", "others's"); // form typo
    if (item.n === 77 || item.n === 80) return ' ' + item.text;          // stray space
    return item.text;
  });
  return [
    'Timestamp',
    'Your first name and last initial (example: Shelly B.)',
    'Grade',
    'Email Address',
    ' I give Peaceful Pathway permission to contact me in the future (test wording)',
    'Date',
    ...items,
    'Column 106',
    'Birth Month and Year (example: February  2010) - no day needed to protect privacy'
  ];
}

/** One fake response row aligned with masterHeaderRow(). */
function masterRow(name, answers) {
  return ['11/25/2026 10:00:00', name, 11, 'fake@example.com', 'Yes', '11/25/2026',
          ...answers, '', 'February  2010'];
}

module.exports = { answersForSums, masterHeaderRow, masterRow };
