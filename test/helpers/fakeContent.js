'use strict';
// Synthetic content tabs: every text cell is a unique token like "TXT|PORTRAIT|O(H)+C(H)".
// If a generated report contains anything that is not one of these tokens (or the
// opening line), the code added words of its own.
const { PPScoring } = require('./load');

const LEVELS = ['Low', 'Medium', 'High'];
const NAMES = {
  O: 'Openness to Experience', C: 'Conscientiousness', E: 'Extraversion',
  A: 'Agreeableness', N: 'Neuroticism'
};
const tok = (...parts) => 'TXT|' + parts.join('|').replace(/ /g, '_');

function fakeTabs() {
  const initialTest = [['Trait Code', 'Trait', 'Definition', 'Level', 'Label', 'Paragraph', 'Gifts', 'Growth Edge']];
  for (const t of PPScoring.TRAITS) {
    for (const l of LEVELS) {
      initialTest.push([t, tok('NAME', t), tok('DEF', t), l, tok('LABEL', t, l),
        tok('PARA', t, l), tok('GIFTS', t, l), tok('EDGE', t, l)]);
    }
  }
  const portraits = [['Pair', 'Trait 1', 'Trait 1 Level', 'Trait 2', 'Trait 2 Level', 'Lookup Key', 'Type Name', 'Text']];
  const P = PPScoring.PAIR_ORDER;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    for (const a of LEVELS) for (const b of LEVELS) {
      const key = `${P[i]}(${a[0]})+${P[j]}(${b[0]})`;
      portraits.push([`${P[i]}+${P[j]}`, P[i], a, P[j], b, key, tok('TYPE', key), tok('PORTRAIT', key)]);
    }
  }
  const closings = [['Highest Trait Code', 'Trait', 'Level', 'Closing Line']];
  for (const t of PPScoring.TRAITS) for (const l of LEVELS) {
    closings.push([t, NAMES[t], l, tok('CLOSING', `${t}(${l[0]})`)]);
  }
  return { initialTest, portraits, closings };
}

module.exports = { fakeTabs, tok, NAMES };
