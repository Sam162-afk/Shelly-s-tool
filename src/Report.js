/**
 * Peaceful Pathway report assembler. Pure logic: no spreadsheet, Drive or network access.
 *
 * It turns the KEYS written by the scorer into an ordered set of report pieces, using
 * ONLY text read from Shelly's content tabs (PP_Feedback_Content_Developer_Handoff).
 * The one string that does not come from a tab is the opening pattern from Read Me
 * Step 4e: "[First name], here's what makes you, you."
 *
 * Rules implemented (Read Me, Steps 3 and 4):
 *   - Step 3: for O, C, E, A, N in that order: trait name, definition, level, label,
 *     paragraph, Gifts, Growth Edge (tab: Initial Test).
 *   - Step 4e: portrait = opening + main pair text + second pair text + closing line,
 *     joined by single spaces. "Do not add, rewrite, or generate any other text."
 *
 * Nothing is guessed. A missing tab column, a missing or duplicate row, an empty text
 * cell or an unknown key throws an Error that says what is wrong.
 *
 * Needs Scoring.js (PPScoring) loaded first.
 */
var PPReport = (function () {
  'use strict';

  var LEVELS = ['Low', 'Medium', 'High'];
  var OPENING_SUFFIX = ", here's what makes you, you.";

  function headerKey(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Map each wanted header name to its column index; throw if absent or repeated. */
  function columnsFor(rows, wanted, tabName) {
    if (!rows || rows.length < 1) {
      throw new Error('Content tab "' + tabName + '" is empty');
    }
    var header = rows[0].map(headerKey);
    var cols = {};
    wanted.forEach(function (name) {
      var first = header.indexOf(headerKey(name));
      if (first === -1) {
        throw new Error('Content tab "' + tabName + '" has no "' + name + '" column');
      }
      if (header.indexOf(headerKey(name), first + 1) !== -1) {
        throw new Error('Content tab "' + tabName + '" has more than one "' + name + '" column');
      }
      cols[name] = first;
    });
    return cols;
  }

  function isBlankRow(row) {
    return row.every(function (c) { return String(c === null || c === undefined ? '' : c).trim() === ''; });
  }

  /** Exact cell text (never edited). Throws if the cell is empty. */
  function textCell(row, cols, name, tabName, rowNumber) {
    var value = row[cols[name]];
    var text = value === null || value === undefined ? '' : String(value);
    if (text.trim() === '') {
      throw new Error('Content tab "' + tabName + '" row ' + rowNumber + ': "' + name + '" is empty');
    }
    return text;
  }

  function levelCell(row, cols, name, tabName, rowNumber) {
    var level = textCell(row, cols, name, tabName, rowNumber).trim();
    if (LEVELS.indexOf(level) === -1) {
      throw new Error('Content tab "' + tabName + '" row ' + rowNumber + ': "' + name +
                      '" must be Low, Medium or High (got "' + level + '")');
    }
    return level;
  }

  function levelLetter(level) { return level.charAt(0); }

  function parseTraits(rows) {
    var tab = 'Initial Test';
    var cols = columnsFor(rows, ['Trait Code', 'Trait', 'Definition', 'Level', 'Label',
                                 'Paragraph', 'Gifts', 'Growth Edge'], tab);
    var traits = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (isBlankRow(row)) continue;
      var n = r + 1;
      var code = textCell(row, cols, 'Trait Code', tab, n).trim();
      if (PPScoring.TRAITS.indexOf(code) === -1) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': unknown trait code "' + code + '"');
      }
      var level = levelCell(row, cols, 'Level', tab, n);
      var name = textCell(row, cols, 'Trait', tab, n);
      var definition = textCell(row, cols, 'Definition', tab, n);
      var trait = traits[code] || (traits[code] = { name: name, definition: definition, levels: {} });
      if (trait.name !== name || trait.definition !== definition) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': trait name or definition for ' +
                        code + ' differs between its rows');
      }
      if (trait.levels[level]) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': ' + code + ' ' + level + ' appears twice');
      }
      trait.levels[level] = {
        label: textCell(row, cols, 'Label', tab, n),
        paragraph: textCell(row, cols, 'Paragraph', tab, n),
        gifts: textCell(row, cols, 'Gifts', tab, n),
        growthEdge: textCell(row, cols, 'Growth Edge', tab, n)
      };
    }
    PPScoring.TRAITS.forEach(function (code) {
      LEVELS.forEach(function (level) {
        if (!traits[code] || !traits[code].levels[level]) {
          throw new Error('Content tab "' + tab + '" has no row for ' + code + ' ' + level);
        }
      });
    });
    return traits;
  }

  function parsePortraits(rows) {
    var tab = 'Combination Portraits';
    var cols = columnsFor(rows, ['Lookup Key', 'Type Name', 'Text'], tab);
    var portraits = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (isBlankRow(row)) continue;
      var n = r + 1;
      var key = textCell(row, cols, 'Lookup Key', tab, n).trim();
      if (portraits[key]) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': key ' + key + ' appears twice');
      }
      portraits[key] = {
        typeName: textCell(row, cols, 'Type Name', tab, n),
        text: textCell(row, cols, 'Text', tab, n)
      };
    }
    // Every pair the scorer can produce must exist, so a gap shows up at load time.
    var P = PPScoring.PAIR_ORDER;
    for (var i = 0; i < P.length; i++) {
      for (var j = i + 1; j < P.length; j++) {
        LEVELS.forEach(function (a) {
          LEVELS.forEach(function (b) {
            var key = P[i] + '(' + levelLetter(a) + ')+' + P[j] + '(' + levelLetter(b) + ')';
            if (!portraits[key]) {
              throw new Error('Content tab "' + tab + '" has no row for ' + key);
            }
          });
        });
      }
    }
    return portraits;
  }

  function parseClosings(rows) {
    var tab = 'Portrait Closings';
    var cols = columnsFor(rows, ['Highest Trait Code', 'Level', 'Closing Line'], tab);
    var closings = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (isBlankRow(row)) continue;
      var n = r + 1;
      var code = textCell(row, cols, 'Highest Trait Code', tab, n).trim();
      if (PPScoring.TRAITS.indexOf(code) === -1) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': unknown trait code "' + code + '"');
      }
      var key = code + '(' + levelLetter(levelCell(row, cols, 'Level', tab, n)) + ')';
      if (closings[key]) {
        throw new Error('Content tab "' + tab + '" row ' + n + ': ' + key + ' appears twice');
      }
      closings[key] = textCell(row, cols, 'Closing Line', tab, n);
    }
    PPScoring.TRAITS.forEach(function (code) {
      LEVELS.forEach(function (level) {
        var key = code + '(' + levelLetter(level) + ')';
        if (!closings[key]) {
          throw new Error('Content tab "' + tab + '" has no row for ' + key);
        }
      });
    });
    return closings;
  }

  /**
   * Read the three content tabs (each an array of rows, header row first, as returned
   * by Range.getValues()) into one lookup structure. Columns are found by header name.
   * Text is kept exactly as written.
   */
  function parseContent(tabs) {
    return {
      traits: parseTraits(tabs.initialTest),
      portraits: parsePortraits(tabs.portraits),
      closings: parseClosings(tabs.closings)
    };
  }

  function lookup(table, key, what) {
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(table, key)) {
      throw new Error('No ' + what + ' text for key "' + key + '"');
    }
    return table[key];
  }

  /**
   * Assemble one report from scorer output.
   * input: { firstName, levels: {O,C,E,A,N: 'Low'|'Medium'|'High'},
   *          mainPairKey, secondPairKey, closingKey }
   * Returns { firstName, traits: [...in O,C,E,A,N order], portrait: { opening,
   *   mainPair, secondPair, closing, text } }. Throws if anything is missing.
   */
  function assemble(content, input) {
    var firstName = input && typeof input.firstName === 'string' ? input.firstName.trim() : '';
    if (firstName === '') {
      throw new Error('First name is missing, so the opening line cannot be written');
    }

    var traits = PPScoring.TRAITS.map(function (code) {
      var level = input.levels ? input.levels[code] : undefined;
      if (LEVELS.indexOf(level) === -1) {
        throw new Error('Level for ' + code + ' must be Low, Medium or High (got "' + level + '")');
      }
      var trait = content.traits[code];
      var texts = trait.levels[level];
      return {
        code: code,
        name: trait.name,
        definition: trait.definition,
        level: level,
        label: texts.label,
        paragraph: texts.paragraph,
        gifts: texts.gifts,
        growthEdge: texts.growthEdge
      };
    });

    var main = lookup(content.portraits, input.mainPairKey, 'main pair portrait');
    var second = lookup(content.portraits, input.secondPairKey, 'second pair portrait');
    var closingText = lookup(content.closings, input.closingKey, 'closing line');

    var opening = firstName + OPENING_SUFFIX;
    return {
      firstName: firstName,
      traits: traits,
      portrait: {
        opening: opening,
        mainPair: { key: input.mainPairKey, typeName: main.typeName, text: main.text },
        secondPair: { key: input.secondPairKey, typeName: second.typeName, text: second.text },
        closing: { key: input.closingKey, text: closingText },
        text: [opening, main.text, second.text, closingText].join(' ')
      }
    };
  }

  /* ---------- template placeholders (used by the Docs layer) ---------- */

  // Per-trait placeholders look like {{O_NAME}}, {{C_GROWTH_EDGE}}. Trait order is fixed
  // (O, C, E, A, N), so a template simply has five blocks.
  var TRAIT_FIELDS = [
    ['NAME', 'name'], ['DEFINITION', 'definition'], ['LEVEL', 'level'], ['LABEL', 'label'],
    ['PARAGRAPH', 'paragraph'], ['GIFTS', 'gifts'], ['GROWTH_EDGE', 'growthEdge']
  ];

  /** Every placeholder a template may use. */
  function placeholderNames() {
    var names = ['{{FIRST_NAME}}', '{{OPENING}}', '{{MAIN_PAIR_TEXT}}', '{{SECOND_PAIR_TEXT}}',
                 '{{CLOSING}}', '{{PORTRAIT}}'];
    PPScoring.TRAITS.forEach(function (code) {
      TRAIT_FIELDS.forEach(function (f) { names.push('{{' + code + '_' + f[0] + '}}'); });
    });
    return names;
  }

  /** Map each placeholder to its text for one assembled report. Text is passed through unchanged. */
  function placeholders(report) {
    var map = {
      '{{FIRST_NAME}}': report.firstName,
      '{{OPENING}}': report.portrait.opening,
      '{{MAIN_PAIR_TEXT}}': report.portrait.mainPair.text,
      '{{SECOND_PAIR_TEXT}}': report.portrait.secondPair.text,
      '{{CLOSING}}': report.portrait.closing.text,
      '{{PORTRAIT}}': report.portrait.text
    };
    report.traits.forEach(function (t) {
      TRAIT_FIELDS.forEach(function (f) { map['{{' + t.code + '_' + f[0] + '}}'] = t[f[1]]; });
    });
    return map;
  }

  /** Every {{...}} token found in a piece of text (document text), in order. */
  function findPlaceholders(text) {
    return String(text === null || text === undefined ? '' : text).match(/\{\{[^{}]*\}\}/g) || [];
  }

  /** Tokens in the text that are not a known placeholder (typos in a template), without repeats. */
  function unknownPlaceholders(text) {
    var known = placeholderNames();
    var seen = {};
    return findPlaceholders(text).filter(function (token) {
      if (known.indexOf(token) !== -1 || seen[token]) { return false; }
      seen[token] = true;
      return true;
    });
  }

  return {
    LEVELS: LEVELS,
    OPENING_SUFFIX: OPENING_SUFFIX,
    parseContent: parseContent,
    assemble: assemble,
    placeholderNames: placeholderNames,
    placeholders: placeholders,
    findPlaceholders: findPlaceholders,
    unknownPlaceholders: unknownPlaceholders
  };
})();
