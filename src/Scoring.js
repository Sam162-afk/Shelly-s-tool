/**
 * Peaceful Pathway scoring core. Pure logic: no spreadsheet or network access.
 *
 * Rules implemented here come from PP_Feedback_Content_Developer_Handoff
 * (Read Me, Steps 1-4) and PP_Scoring_Template_v3:
 *   - responses are whole numbers 1-5; reverse-keyed items score 6 - response
 *   - trait score = average of its 20 items (kept here as an exact integer sum)
 *   - Low < 2.65, Medium 2.65 to < 3.45, High >= 3.45
 *   - rank traits by score, ties broken O, C, E, A, N
 *   - main pair = ranks 1 and 2
 *   - second pair = top trait + the trait in ranks 3-5 with the biggest level
 *     gap from it (ties go to the higher-ranked trait; if no gaps, rank 3)
 *   - closing = top trait at its level
 *
 * This module produces KEYS only. It never contains or generates feedback text.
 */
var PPScoring = (function () {
  'use strict';

  var TRAITS = ['O', 'C', 'E', 'A', 'N'];      // report order and tie-break order
  var PAIR_ORDER = ['O', 'N', 'E', 'A', 'C'];  // order used inside pair lookup keys
  var LEVELS = ['Low', 'Medium', 'High'];
  var ITEMS_PER_TRAIT = 20;

  // Cutoffs as whole-number sums of 20 items. Every possible 20-item average is
  // a multiple of 0.05, so "average < 2.65" is exactly "sum <= 52" and
  // "average < 3.45" is exactly "sum <= 68". Integers avoid rounding errors.
  var LOW_MAX_SUM = 52;
  var MEDIUM_MAX_SUM = 68;

  function levelForSum(sum) {
    if (sum <= LOW_MAX_SUM) return 'Low';
    if (sum <= MEDIUM_MAX_SUM) return 'Medium';
    return 'High';
  }

  function levelLetter(level) {
    return level.charAt(0); // Low -> L, Medium -> M, High -> H
  }

  function levelRank(level) {
    return LEVELS.indexOf(level); // Low 0, Medium 1, High 2
  }

  /** Make a form header or key text comparable (spaces, curly quotes, item 64 typo). */
  function normalizeText(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/others's/g, "others'"); // the live form prints "others's" in item 64
  }

  /**
   * Find the 100 answer columns in a header row by matching item text.
   * Returns { columns: [0-based index per item 1..100], missing: [item numbers],
   * duplicates: [item numbers] }. Columns not in the key (name, grade, email,
   * birth month, stray headers, scored columns) are ignored.
   */
  function locateItemColumns(headerRow) {
    var byText = {};
    for (var c = 0; c < headerRow.length; c++) {
      var key = normalizeText(headerRow[c]);
      if (key === '') continue;
      (byText[key] = byText[key] || []).push(c);
    }
    var columns = [];
    var missing = [];
    var duplicates = [];
    for (var i = 0; i < PP_ITEMS.length; i++) {
      var found = byText[normalizeText(PP_ITEMS[i].text)] || [];
      if (found.length === 0) {
        missing.push(PP_ITEMS[i].n);
        columns.push(-1);
      } else if (found.length > 1) {
        duplicates.push(PP_ITEMS[i].n);
        columns.push(found[0]);
      } else {
        columns.push(found[0]);
      }
    }
    return { columns: columns, missing: missing, duplicates: duplicates };
  }

  /** A response must be a whole number 1-5 (a number or a digit string). */
  function parseAnswer(value) {
    if (typeof value === 'number') {
      return value === Math.floor(value) && value >= 1 && value <= 5 ? value : null;
    }
    if (typeof value === 'string' && /^\s*[1-5]\s*$/.test(value)) {
      return parseInt(value, 10);
    }
    return null;
  }

  function pairKey(a, b, levels) {
    var first = PAIR_ORDER.indexOf(a) < PAIR_ORDER.indexOf(b) ? a : b;
    var second = first === a ? b : a;
    return first + '(' + levelLetter(levels[first]) + ')+' +
           second + '(' + levelLetter(levels[second]) + ')';
  }

  function closingKey(trait, levels) {
    return trait + '(' + levelLetter(levels[trait]) + ')';
  }

  /**
   * Score 100 raw answers (item 1 first). Throws an Error naming the problem if
   * the input is not exactly 100 whole numbers from 1 to 5; it never guesses.
   */
  function score(answers) {
    if (!answers || answers.length !== PP_ITEMS.length) {
      throw new Error('Expected ' + PP_ITEMS.length + ' answers, got ' +
                      (answers ? answers.length : 0));
    }
    var sums = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    var bad = [];
    for (var i = 0; i < PP_ITEMS.length; i++) {
      var value = parseAnswer(answers[i]);
      if (value === null) {
        bad.push('item ' + PP_ITEMS[i].n + ' ("' + answers[i] + '")');
        continue;
      }
      sums[PP_ITEMS[i].trait] += PP_ITEMS[i].reverse ? 6 - value : value;
    }
    if (bad.length > 0) {
      throw new Error('Answers must be whole numbers 1-5. Problem with: ' +
                      bad.slice(0, 5).join(', ') + (bad.length > 5 ? ', and ' + (bad.length - 5) + ' more' : ''));
    }

    var averages = {};
    var levels = {};
    TRAITS.forEach(function (t) {
      averages[t] = Math.round(sums[t] * 5) / 100; // sum / 20, exact to 2 decimals
      levels[t] = levelForSum(sums[t]);
    });

    var ranking = TRAITS.slice().sort(function (a, b) {
      return sums[b] - sums[a] || TRAITS.indexOf(a) - TRAITS.indexOf(b);
    });

    var top = ranking[0];
    var partner = ranking[2];
    var bestGap = Math.abs(levelRank(levels[top]) - levelRank(levels[partner]));
    for (var r = 3; r < ranking.length; r++) {
      var gap = Math.abs(levelRank(levels[top]) - levelRank(levels[ranking[r]]));
      if (gap > bestGap) { // strictly greater: ties keep the higher-ranked trait
        bestGap = gap;
        partner = ranking[r];
      }
    }

    return {
      sums: sums,
      averages: averages,
      levels: levels,
      ranking: ranking,
      mainPairKey: pairKey(ranking[0], ranking[1], levels),
      secondPairKey: pairKey(top, partner, levels),
      closingKey: closingKey(top, levels)
    };
  }

  /** First name = text before the first space in "first name and last initial". */
  function firstNameFrom(value) {
    var text = String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ').trim();
    return text === '' ? '' : text.split(' ')[0];
  }

  /** Column headers written to the sheet, in order. */
  var OUTPUT_HEADERS = (function () {
    var headers = ['PP First Name'];
    TRAITS.forEach(function (t) {
      headers.push('PP ' + t + ' Sum', 'PP ' + t + ' Avg', 'PP ' + t + ' Level');
    });
    headers.push('PP Ranking', 'PP Main Pair Key', 'PP Second Pair Key',
                 'PP Closing Key', 'PP Scoring Status');
    return headers;
  })();

  /** Values matching OUTPUT_HEADERS for a successful score. */
  function outputValues(result, firstName) {
    var values = [firstName];
    TRAITS.forEach(function (t) {
      values.push(result.sums[t], result.averages[t], result.levels[t]);
    });
    values.push(result.ranking.join(' > '), result.mainPairKey,
                result.secondPairKey, result.closingKey, 'OK');
    return values;
  }

  /** Values matching OUTPUT_HEADERS for a row that could not be scored. */
  function errorValues(firstName, message) {
    var values = [firstName];
    for (var i = 1; i < OUTPUT_HEADERS.length - 1; i++) values.push('');
    values.push('ERROR: ' + message);
    return values;
  }

  return {
    TRAITS: TRAITS,
    PAIR_ORDER: PAIR_ORDER,
    LEVELS: LEVELS,
    ITEMS_PER_TRAIT: ITEMS_PER_TRAIT,
    LOW_MAX_SUM: LOW_MAX_SUM,
    MEDIUM_MAX_SUM: MEDIUM_MAX_SUM,
    OUTPUT_HEADERS: OUTPUT_HEADERS,
    levelForSum: levelForSum,
    normalizeText: normalizeText,
    locateItemColumns: locateItemColumns,
    parseAnswer: parseAnswer,
    score: score,
    firstNameFrom: firstNameFrom,
    outputValues: outputValues,
    errorValues: errorValues
  };
})();
