/**
 * Google Sheets glue for the Peaceful Pathway scorer (bound Apps Script).
 *
 * What it does: when a new form response arrives (or when "Re-score all rows"
 * is chosen), it scores the row and writes the keys, scores and levels into
 * columns at the end of the same tab. It only ever writes into its own
 * "PP ..." columns. It never edits answers or any other column, never creates
 * documents, never sends email, and makes no network requests.
 *
 * Nothing here runs until someone chooses "Install auto-scoring trigger" from
 * the Peaceful Pathway menu in the sheet.
 */
var PP_CONFIG = {
  SHEET_NAME: 'Form Responses 1',
  MENU_TITLE: 'Peaceful Pathway',
  NAME_HEADER_PREFIX: 'your first name',
  TRIGGER_HANDLER: 'handleFormSubmit'
};

/* ---------- helpers (trailing underscore = private in Apps Script) ---------- */

function ppReadHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  return lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
}

function ppFindNameColumn_(header) {
  for (var c = 0; c < header.length; c++) {
    if (PPScoring.normalizeText(header[c]).toLowerCase().indexOf(PP_CONFIG.NAME_HEADER_PREFIX) === 0) {
      return c;
    }
  }
  return -1;
}

/** Plain-language description of a header problem, or '' when the headers are fine. */
function ppSetupProblem_(layout) {
  var parts = [];
  if (layout.missing.length > 0) {
    parts.push('form headers do not match the answer key; missing item(s): ' + layout.missing.join(', '));
  }
  if (layout.duplicates.length > 0) {
    parts.push('duplicate header(s) for item(s): ' + layout.duplicates.join(', '));
  }
  return parts.join('; ');
}

/**
 * Make sure every "PP ..." output column exists, adding any that are missing
 * after the last used column. Returns the 1-based column number of each output
 * header, in PPScoring.OUTPUT_HEADERS order. Safe to call repeatedly.
 */
function ppEnsureOutputColumns_(sheet) {
  var wanted = PPScoring.OUTPUT_HEADERS;
  var lastCol = sheet.getLastColumn();
  var header = ppReadHeader_(sheet);
  var cols = [];
  var missing = [];
  wanted.forEach(function (h) {
    var idx = header.indexOf(h);
    if (idx < 0) { missing.push(h); }
    cols.push(idx < 0 ? null : idx + 1);
  });
  if (missing.length === 0) { return cols; }

  var firstNew = lastCol + 1;
  var lastNeeded = lastCol + missing.length;
  var maxCols = sheet.getMaxColumns();
  if (lastNeeded > maxCols) {
    sheet.insertColumnsAfter(maxCols, lastNeeded - maxCols);
  }
  sheet.getRange(1, firstNew, 1, missing.length).setValues([missing]);
  var k = 0;
  for (var i = 0; i < cols.length; i++) {
    if (cols[i] === null) { cols[i] = firstNew + k; k++; }
  }
  return cols;
}

/** Write rows of values into the given (1-based) columns, one block per run of adjacent columns. */
function ppWriteColumns_(sheet, firstRow, cols, rows) {
  var i = 0;
  while (i < cols.length) {
    var j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) { j++; }
    var block = rows.map(function (r) { return r.slice(i, j + 1); });
    sheet.getRange(firstRow, cols[i], rows.length, j - i + 1).setValues(block);
    i = j + 1;
  }
}

function ppIsBlankRow_(row) {
  for (var c = 0; c < row.length; c++) {
    if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { return false; }
  }
  return true;
}

/**
 * Score rows firstRow..lastRow (1-based, header is row 1) and write the results.
 * A row that cannot be scored gets "ERROR: ..." in its status column.
 * Returns { scored, errors }.
 */
function ppScoreRows_(sheet, firstRow, lastRow) {
  if (firstRow < 2) { firstRow = 2; }
  if (lastRow < firstRow) { return { scored: 0, errors: 0 }; }

  var outCols = ppEnsureOutputColumns_(sheet);
  var lastCol = sheet.getLastColumn();
  var header = ppReadHeader_(sheet);
  var layout = PPScoring.locateItemColumns(header);
  var problem = ppSetupProblem_(layout);
  var nameCol = ppFindNameColumn_(header);

  var count = lastRow - firstRow + 1;
  var data = sheet.getRange(firstRow, 1, count, lastCol).getValues();
  var out = [];
  var scored = 0;
  var errors = 0;

  data.forEach(function (row) {
    if (ppIsBlankRow_(row)) {
      out.push(PPScoring.OUTPUT_HEADERS.map(function () { return ''; }));
      return;
    }
    var firstName = nameCol >= 0 ? PPScoring.firstNameFrom(row[nameCol]) : '';
    if (problem !== '') {
      out.push(PPScoring.errorValues(firstName, problem));
      errors++;
      return;
    }
    try {
      var answers = layout.columns.map(function (c) { return row[c]; });
      out.push(PPScoring.outputValues(PPScoring.score(answers), firstName));
      scored++;
    } catch (err) {
      out.push(PPScoring.errorValues(firstName, err.message));
      errors++;
    }
  });

  ppWriteColumns_(sheet, firstRow, outCols, out);
  return { scored: scored, errors: errors };
}

function ppGetResponsesSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(PP_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Could not find a tab named "' + PP_CONFIG.SHEET_NAME + '".');
  }
  return sheet;
}

/** Text for the "Check setup" dialog. Does not change the sheet. */
function ppSetupReport_(header, triggerInstalled) {
  var layout = PPScoring.locateItemColumns(header);
  var found = PPScoring.OUTPUT_HEADERS.filter(function (h) { return header.indexOf(h) >= 0; }).length;
  var lines = [];
  lines.push('Answer columns found: ' + (100 - layout.missing.length) + ' of 100');
  if (layout.missing.length > 0) { lines.push('  Missing items: ' + layout.missing.join(', ')); }
  if (layout.duplicates.length > 0) { lines.push('  Duplicate items: ' + layout.duplicates.join(', ')); }
  lines.push('First-name column: ' + (ppFindNameColumn_(header) >= 0 ? 'found' : 'NOT found'));
  lines.push('Score columns present: ' + found + ' of ' + PPScoring.OUTPUT_HEADERS.length +
             (found === 0 ? ' (they are added on the first scoring run)' : ''));
  lines.push('Auto-scoring trigger: ' + (triggerInstalled ? 'installed' : 'NOT installed'));
  return lines.join('\n');
}

/* ---------- entry points ---------- */

/** Installable trigger: runs once for every new form submission. */
function handleFormSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var row = e.range.getRow();
    ppScoreRows_(e.range.getSheet(), row, row);
  } finally {
    lock.releaseLock();
  }
}

/** Menu: score every response row again (safe to run any time). */
function rescoreAllRows() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = ppGetResponsesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      ui.alert('There are no responses to score yet.');
      return;
    }
    var result = ppScoreRows_(sheet, 2, lastRow);
    ui.alert('Scored ' + result.scored + ' row(s). ' + result.errors +
             ' row(s) had errors (see the "PP Scoring Status" column).');
  } finally {
    lock.releaseLock();
  }
}

/** Menu: report on the sheet's setup without changing anything. */
function checkSetup() {
  var ui = SpreadsheetApp.getUi();
  var sheet = ppGetResponsesSheet_();
  var installed = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === PP_CONFIG.TRIGGER_HANDLER;
  });
  ui.alert('Peaceful Pathway setup check', ppSetupReport_(ppReadHeader_(sheet), installed), ui.ButtonSet.OK);
}

/**
 * Menu: turn on automatic scoring. The trigger belongs to whoever runs this,
 * so after a change of sheet owner the new owner should run it again.
 */
function installTrigger() {
  var ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === PP_CONFIG.TRIGGER_HANDLER) { ScriptApp.deleteTrigger(t); }
  });
  ScriptApp.newTrigger(PP_CONFIG.TRIGGER_HANDLER)
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
  ui.alert('Automatic scoring is now on. New form responses will be scored as they arrive.');
}

/** Adds the menu when the sheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(PP_CONFIG.MENU_TITLE)
    .addItem('Re-score all rows', 'rescoreAllRows')
    .addItem('Check setup', 'checkSetup')
    .addItem('Install auto-scoring trigger', 'installTrigger')
    .addToUi();
}
