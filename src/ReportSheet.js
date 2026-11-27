/**
 * Sheet side of report generation (bound Apps Script). Optional: nothing here runs
 * until someone chooses "Set up report folder and template" from the menu.
 *
 * Each response row carries a report status in "PP Report Status" and the PDF link in
 * "PP Report Link" (next to each other, after the scorer's columns):
 *   PENDING  scored OK, report not made yet (or the row was re-scored: it will be replaced)
 *   MAKING   a run has claimed the row and is making the PDF
 *   OK       report made; the link is in "PP Report Link"
 *   ERROR: ... the report could not be made; the reason follows
 *   SKIPPED: scoring error   the row did not score, so there is nothing to report on
 *
 * Re-scoring a row marks it PENDING; making the new PDF then moves the old one to the
 * trash and updates the link. Settings live in the sheet's document properties.
 */

/* ---------- settings ---------- */

/** Report settings; never throws (no settings means "not set up"). */
function ppReportSettings_() {
  var out = { folderId: '', templateId: '', auto: false, configured: false };
  try {
    var props = PropertiesService.getDocumentProperties();
    out.folderId = props.getProperty(PP_REPORT.PROP_FOLDER) || '';
    out.templateId = props.getProperty(PP_REPORT.PROP_TEMPLATE) || '';
    out.auto = props.getProperty(PP_REPORT.PROP_AUTO) === 'on';
  } catch (err) {
    return { folderId: '', templateId: '', auto: false, configured: false };
  }
  out.configured = out.folderId !== '' && out.templateId !== '';
  return out;
}

/** One-line summary of a generation run, for dialogs. */
function ppReportSummary_(result) {
  var text = 'Reports: ' + result.made + ' made, ' + result.errors + ' with errors';
  if (result.remaining > 0) {
    text += ', ' + result.remaining + ' still pending (choose "Generate pending reports" to continue)';
  }
  return text + '. See the "PP Report Status" column.';
}

function ppStatusIsRetriable_(status) {
  return status === 'PENDING' || status === 'MAKING' || status.indexOf('ERROR') === 0;
}

/* ---------- content tabs ---------- */

/** Read Shelly's wording from the three content tabs in this sheet. */
function ppLoadContent_() {
  var spreadsheet = SpreadsheetApp.getActive();
  function rowsOf(tabName) {
    var tab = spreadsheet.getSheetByName(tabName);
    if (!tab) {
      throw new Error('Content tab "' + tabName + '" not found. Copy it from the handoff workbook ' +
                      'into this sheet, keeping the same tab name.');
    }
    return tab.getDataRange().getValues();
  }
  return PPReport.parseContent({
    initialTest: rowsOf(PP_REPORT.CONTENT_TABS.initialTest),
    portraits: rowsOf(PP_REPORT.CONTENT_TABS.portraits),
    closings: rowsOf(PP_REPORT.CONTENT_TABS.closings)
  });
}

/* ---------- columns ---------- */

function ppReportColumns_(sheet) {
  return ppEnsureColumns_(sheet, [PP_REPORT.LINK_HEADER, PP_REPORT.STATUS_HEADER]);
}

/** 0-based column indexes of the scorer's output that a report needs. Throws if any is missing. */
function ppReportInputColumns_(header) {
  function need(name) {
    var idx = header.indexOf(name);
    if (idx < 0) {
      throw new Error('Column "' + name + '" not found. Score the rows first (Re-score all rows).');
    }
    return idx;
  }
  var cols = {
    firstName: need('PP First Name'),
    scoringStatus: need('PP Scoring Status'),
    mainPairKey: need('PP Main Pair Key'),
    secondPairKey: need('PP Second Pair Key'),
    closingKey: need('PP Closing Key'),
    levels: {},
    name: ppFindNameColumn_(header)
  };
  PPScoring.TRAITS.forEach(function (t) { cols.levels[t] = need('PP ' + t + ' Level'); });
  return cols;
}

function ppPdfName_(nameCell, firstName) {
  var name = String(nameCell === null || nameCell === undefined ? '' : nameCell)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name === '') { name = firstName; }
  return name.slice(0, 100) + PP_REPORT.PDF_NAME_SUFFIX;
}

/* ---------- status flow ---------- */

/**
 * After scoring: mark scored rows PENDING (or, with onlyBlank, only rows that have no
 * report status yet), and mark rows that did not score as skipped. Leaves links alone.
 */
function ppMarkReportsPending_(sheet, firstRow, lastRow, onlyBlank) {
  if (firstRow < 2) { firstRow = 2; }
  if (lastRow < firstRow) { return 0; }
  var cols = ppReportColumns_(sheet);
  var header = ppReadHeader_(sheet);
  var scoringCol = header.indexOf('PP Scoring Status');
  if (scoringCol < 0) { return 0; }
  var count = lastRow - firstRow + 1;
  var scoring = sheet.getRange(firstRow, scoringCol + 1, count, 1).getValues();
  var current = sheet.getRange(firstRow, cols[1], count, 1).getValues();
  var marked = 0;
  var out = scoring.map(function (s, i) {
    var scoringStatus = String(s[0]);
    var existing = String(current[i][0]);
    if (scoringStatus === '') { return [existing]; }
    if (scoringStatus !== 'OK') { return ['SKIPPED: scoring error']; }
    if (onlyBlank && existing !== '' && existing.indexOf('SKIPPED') !== 0) { return [existing]; }
    marked++;
    return ['PENDING'];
  });
  sheet.getRange(firstRow, cols[1], count, 1).setValues(out);
  return marked;
}

/** Wrapper used by Sheet.js after scoring: does nothing until reports are set up. */
function ppReportsMarkPending_(sheet, firstRow, lastRow) {
  if (!ppReportSettings_().configured) { return; }
  ppMarkReportsPending_(sheet, firstRow, lastRow, false);
}

/** Take a row from `expected` to MAKING under a brief lock; false if it changed or the lock timed out. */
function ppClaimRow_(sheet, rowNumber, statusCol, expected) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return false;
  }
  try {
    var cell = sheet.getRange(rowNumber, statusCol, 1, 1);
    if (String(cell.getValues()[0][0]) !== expected) { return false; }
    cell.setValues([['MAKING']]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Make the PDF for each wanted row in firstRow..lastRow. Wanted rows are PENDING ones, and
 * with opts.retry also MAKING and ERROR ones. Each row is written as soon as it finishes,
 * so a run that stops early loses nothing. Returns { made, errors, remaining }.
 * Throws (before touching any row) if reports are not set up or the setup is broken.
 */
function ppGenerateReports_(sheet, firstRow, lastRow, opts) {
  opts = opts || {};
  var settings = ppReportSettings_();
  if (!settings.configured) {
    throw new Error('Reports are not set up yet. Use the menu: Peaceful Pathway > Set up report folder and template.');
  }
  if (firstRow < 2) { firstRow = 2; }
  var result = { made: 0, errors: 0, remaining: 0 };
  if (lastRow < firstRow) { return result; }

  var cols = ppReportColumns_(sheet);
  var linkCol = cols[0];
  var statusCol = cols[1];
  var header = ppReadHeader_(sheet);
  var idx = ppReportInputColumns_(header);
  var count = lastRow - firstRow + 1;
  var data = sheet.getRange(firstRow, 1, count, sheet.getLastColumn()).getValues();

  var wanted = [];
  data.forEach(function (row, i) {
    var status = String(row[statusCol - 1]);
    if (status === 'PENDING' || (opts.retry && ppStatusIsRetriable_(status))) {
      wanted.push({ row: row, number: firstRow + i, status: status });
    }
  });
  if (wanted.length === 0) { return result; }

  var content = ppLoadContent_();
  var problems = ppTemplateProblems_(settings.templateId);
  if (problems.length > 0) {
    throw new Error('The report template has placeholder(s) that are not recognised: ' + problems.join(', '));
  }

  var started = new Date().getTime();
  wanted.forEach(function (item) {
    if (new Date().getTime() - started > PP_REPORT.TIME_BUDGET_MS ||
        !ppClaimRow_(sheet, item.number, statusCol, item.status)) {
      result.remaining++;
      return;
    }
    try {
      var levels = {};
      PPScoring.TRAITS.forEach(function (t) { levels[t] = item.row[idx.levels[t]]; });
      var firstName = String(item.row[idx.firstName]);
      var report = PPReport.assemble(content, {
        firstName: firstName,
        levels: levels,
        mainPairKey: item.row[idx.mainPairKey],
        secondPairKey: item.row[idx.secondPairKey],
        closingKey: item.row[idx.closingKey]
      });
      var nameCell = idx.name >= 0 ? item.row[idx.name] : '';
      var made = ppRenderPdf_(report, ppPdfName_(nameCell, firstName), settings.templateId, settings.folderId);
      var oldLink = String(item.row[linkCol - 1] || '');
      ppWriteColumns_(sheet, item.number, [linkCol, statusCol], [[made.url, 'OK']]);
      if (oldLink !== '' && oldLink !== made.url) { ppTrashByUrl_(oldLink); }
      result.made++;
    } catch (err) {
      ppWriteColumns_(sheet, item.number, [statusCol], [['ERROR: ' + err.message]]);
      result.errors++;
    }
  });
  return result;
}

/**
 * Wrapper used by Sheet.js after scoring: makes the reports for the just-scored rows if
 * automatic reports are on. A setup-level failure is written into the rows' status
 * instead of being lost. Returns the run result, or null if nothing was attempted.
 */
function ppReportsGenerate_(sheet, firstRow, lastRow) {
  var settings = ppReportSettings_();
  if (!settings.configured || !settings.auto) { return null; }
  try {
    return ppGenerateReports_(sheet, firstRow, lastRow);
  } catch (err) {
    var cols = ppReportColumns_(sheet);
    var count = lastRow - firstRow + 1;
    var range = sheet.getRange(firstRow, cols[1], count, 1);
    var flagged = range.getValues().map(function (r) {
      return [String(r[0]) === 'PENDING' ? 'ERROR: ' + err.message : r[0]];
    });
    range.setValues(flagged);
    return { made: 0, errors: flagged.filter(function (r) { return String(r[0]).indexOf('ERROR') === 0; }).length, remaining: 0 };
  }
}

/* ---------- menu actions ---------- */

/** Menu: create the (private) report folder and the placeholder template. Safe to repeat. */
function setUpReports() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getDocumentProperties();
  var lines = [];
  var folderId = props.getProperty(PP_REPORT.PROP_FOLDER);
  if (!folderId) {
    var folder = ppCreateFolder_(PP_REPORT.FOLDER_NAME);
    folderId = folder.id;
    props.setProperty(PP_REPORT.PROP_FOLDER, folderId);
    lines.push('Created the report folder "' + PP_REPORT.FOLDER_NAME + '" (private to this account until you share it):');
    lines.push(folder.url);
  } else {
    lines.push('The report folder is already set up.');
  }
  if (!props.getProperty(PP_REPORT.PROP_TEMPLATE)) {
    props.setProperty(PP_REPORT.PROP_TEMPLATE, ppBuildTemplate_(folderId));
    lines.push('Created a plain placeholder template in that folder. Use "Use a different report template" to switch to a designed one.');
  } else {
    lines.push('A report template is already set up.');
  }
  lines.push('Next: make sure the three content tabs (' +
             [PP_REPORT.CONTENT_TABS.initialTest, PP_REPORT.CONTENT_TABS.portraits, PP_REPORT.CONTENT_TABS.closings].join(', ') +
             ') are in this sheet, then "Generate pending reports". Automatic reports are off until you turn them on.');
  ui.alert('Report setup', lines.join('\n'), ui.ButtonSet.OK);
}

/** Menu: point reports at a designed template Doc (paste its link). */
function chooseReportTemplate() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Use a different report template',
    'Paste the link to the template Google Doc. It may only use the placeholders listed in the README.',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) { return; }
  var match = /[-\w]{25,}/.exec(answer.getResponseText());
  if (!match) {
    ui.alert('That does not look like a Google Doc link. Nothing was changed.');
    return;
  }
  var problems;
  try {
    problems = ppTemplateProblems_(match[0]);
  } catch (err) {
    ui.alert('Could not open that Doc: ' + err.message + '\nNothing was changed.');
    return;
  }
  if (problems.length > 0) {
    ui.alert('The template has placeholder(s) that are not recognised: ' + problems.join(', ') +
             '\nNothing was changed.');
    return;
  }
  PropertiesService.getDocumentProperties().setProperty(PP_REPORT.PROP_TEMPLATE, match[0]);
  ui.alert('The report template was updated. New reports will use it.');
}

/** Menu: turn automatic report-making on or off. */
function toggleAutoReports() {
  var ui = SpreadsheetApp.getUi();
  var settings = ppReportSettings_();
  if (!settings.configured) {
    ui.alert('Set up the report folder and template first.');
    return;
  }
  var turnOn = !settings.auto;
  PropertiesService.getDocumentProperties().setProperty(PP_REPORT.PROP_AUTO, turnOn ? 'on' : 'off');
  ui.alert(turnOn
    ? 'Automatic reports are ON. A report is made for each new response right after it is scored.'
    : 'Automatic reports are OFF. Use "Generate pending reports" to make them.');
}

/** Menu: make every report that is still PENDING (and retry ones that failed). */
function generatePendingReports() {
  var ui = SpreadsheetApp.getUi();
  var sheet = ppGetResponsesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('There are no responses yet.');
    return;
  }
  try {
    var backfilled = ppMarkReportsPending_(sheet, 2, lastRow, true);
    var result = ppGenerateReports_(sheet, 2, lastRow, { retry: true });
    ui.alert(ppReportSummary_(result) + (backfilled > 0 ? ' (' + backfilled + ' scored row(s) had no report yet.)' : ''));
  } catch (err) {
    ui.alert('Could not make reports: ' + err.message);
  }
}
