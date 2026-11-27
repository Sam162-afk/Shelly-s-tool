/**
 * Google Docs / Drive layer for the report PDFs (bound Apps Script).
 *
 * This is the ONLY file that touches Drive or Docs. It makes no network requests and
 * sends no email. Per report it: copies a template Doc, swaps each {{PLACEHOLDER}} for
 * the exact text from PPReport, exports the copy as a PDF into one folder, and trashes
 * the working copy. It adds no wording: the only static text it ever writes is in the
 * placeholder template below ("Gifts" and "Growth Edge", Shelly's own column names).
 *
 * Needs the broader Drive and Docs permissions listed in appsscript.reports.json.
 */
var PP_REPORT = {
  LINK_HEADER: 'PP Report Link',
  STATUS_HEADER: 'PP Report Status',
  PROP_FOLDER: 'PP_REPORT_FOLDER_ID',
  PROP_TEMPLATE: 'PP_REPORT_TEMPLATE_ID',
  PROP_AUTO: 'PP_REPORT_AUTO',
  FOLDER_NAME: 'Peaceful Pathway Reports',
  TEMPLATE_NAME: 'PP Report Template (placeholders)',
  PDF_NAME_SUFFIX: ' - Peaceful Pathway Report',
  // Stop starting new reports after this long so one run stays inside Apps Script's
  // 6-minute limit; anything left stays PENDING for "Generate pending reports".
  TIME_BUDGET_MS: 270000,
  GREEN: '#1F5C3E',    // student materials (Read Me, Brand)
  FONT: 'Poppins',
  // Content tabs, copied from Shelly's workbook into the same sheet under her tab names.
  CONTENT_TABS: {
    initialTest: 'Initial Test',
    portraits: 'Combination Portraits',
    closings: 'Portrait Closings'
  },
  // The only static words in the placeholder template: her own column names.
  LABEL_GIFTS: 'Gifts',
  LABEL_GROWTH_EDGE: 'Growth Edge'
};

function ppEscapeRegex_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace every occurrence of a placeholder with the given text, keeping the
 * placeholder's formatting. Refuses text containing "$" or "\" because replaceText
 * treats those as special; it fails loudly rather than mangle her wording.
 */
function ppReplaceLiteral_(body, token, value) {
  var text = String(value);
  if (/[$\\]/.test(text)) {
    throw new Error('The text for ' + token + ' contains a "$" or "\\" character, which the ' +
                    'template filler cannot place safely');
  }
  body.replaceText(ppEscapeRegex_(token), text);
}

/* ---------- folder and placeholder template ---------- */

/** Create the (private) report folder in the signed-in account's My Drive. */
function ppCreateFolder_(name) {
  var folder = DriveApp.createFolder(name);
  return { id: folder.getId(), url: folder.getUrl() };
}

function ppTemplateStyles_() {
  var A = DocumentApp.Attribute;
  function style(size, bold, italic, color) {
    var s = {};
    s[A.FONT_FAMILY] = PP_REPORT.FONT;
    s[A.FONT_SIZE] = size;
    s[A.BOLD] = bold;
    s[A.ITALIC] = italic;
    s[A.FOREGROUND_COLOR] = color;
    return s;
  }
  return {
    traitName: style(18, true, false, PP_REPORT.GREEN),
    definition: style(10, false, true, '#555555'),
    level: style(12, true, false, PP_REPORT.GREEN),
    label: style(12, true, false, '#222222'),
    subheading: style(11, true, false, PP_REPORT.GREEN),
    body: style(11, false, false, '#222222')
  };
}

/** The placeholder template: five trait blocks in O, C, E, A, N order, then the portrait. */
function ppTemplateParagraphs_() {
  var paragraphs = [];
  PPScoring.TRAITS.forEach(function (code) {
    var p = function (field) { return '{{' + code + '_' + field + '}}'; };
    paragraphs.push([p('NAME'), 'traitName']);
    paragraphs.push([p('DEFINITION'), 'definition']);
    paragraphs.push([p('LEVEL'), 'level']);
    paragraphs.push([p('LABEL'), 'label']);
    paragraphs.push([p('PARAGRAPH'), 'body']);
    paragraphs.push([PP_REPORT.LABEL_GIFTS, 'subheading']);
    paragraphs.push([p('GIFTS'), 'body']);
    paragraphs.push([PP_REPORT.LABEL_GROWTH_EDGE, 'subheading']);
    paragraphs.push([p('GROWTH_EDGE'), 'body']);
  });
  paragraphs.push(['{{PORTRAIT}}', 'body']);
  return paragraphs;
}

/**
 * Build the plain placeholder template (green, Poppins) in the report folder and return
 * its id. Shelly's designed template can replace it later with no code change.
 */
function ppBuildTemplate_(folderId) {
  var doc = DocumentApp.create(PP_REPORT.TEMPLATE_NAME);
  var body = doc.getBody();
  var styles = ppTemplateStyles_();
  body.clear();
  ppTemplateParagraphs_().forEach(function (entry) {
    body.appendParagraph(entry[0]).setAttributes(styles[entry[1]]);
  });
  doc.saveAndClose();
  var id = doc.getId();
  DriveApp.getFileById(id).moveTo(DriveApp.getFolderById(folderId));
  return id;
}

/** Unrecognised {{...}} tokens in a template Doc (typos that would print literally). */
function ppTemplateProblems_(templateId) {
  var doc = DocumentApp.openById(templateId);
  return PPReport.unknownPlaceholders(doc.getBody().getText());
}

/* ---------- rendering ---------- */

/**
 * Make one PDF: copy the template, fill it from the assembled report, export to PDF in
 * the folder, trash the working copy. Returns { id, url }. Throws (and leaves nothing
 * behind but a trashed copy) if anything goes wrong or a placeholder is left unfilled.
 */
function ppRenderPdf_(report, pdfName, templateId, folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var copy = DriveApp.getFileById(templateId).makeCopy('PP working copy - delete me', folder);
  var copyId = copy.getId();
  try {
    var doc = DocumentApp.openById(copyId);
    var body = doc.getBody();
    var values = PPReport.placeholders(report);
    Object.keys(values).forEach(function (token) { ppReplaceLiteral_(body, token, values[token]); });
    var leftover = PPReport.findPlaceholders(body.getText());
    if (leftover.length > 0) {
      throw new Error('The template still has unfilled placeholder(s): ' + leftover.slice(0, 5).join(', '));
    }
    doc.saveAndClose();
    var blob = DriveApp.getFileById(copyId).getAs('application/pdf').setName(pdfName + '.pdf');
    var file = folder.createFile(blob);
    return { id: file.getId(), url: file.getUrl() };
  } finally {
    try { DriveApp.getFileById(copyId).setTrashed(true); } catch (ignore) { /* already gone */ }
  }
}

/** Move the old report PDF behind a stored link to the trash. Never throws. */
function ppTrashByUrl_(url) {
  var match = /\/d\/([A-Za-z0-9_-]+)/.exec(String(url));
  if (!match) { return false; }
  try {
    DriveApp.getFileById(match[1]).setTrashed(true);
    return true;
  } catch (ignore) {
    return false;
  }
}
