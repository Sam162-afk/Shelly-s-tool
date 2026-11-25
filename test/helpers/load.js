'use strict';
// Loads the Apps Script source files into this process the way Apps Script does:
// as plain scripts sharing one global scope, in this order.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['Key.js', 'Scoring.js', 'Sheet.js'];

for (const file of FILES) {
  const full = path.join(__dirname, '..', '..', 'src', file);
  vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
}

module.exports = {
  PPScoring: globalThis.PPScoring,
  PP_ITEMS: globalThis.PP_ITEMS,
  PP_CONFIG: globalThis.PP_CONFIG,
  sheetFns: {
    ensureOutputColumns: globalThis.ppEnsureOutputColumns_,
    scoreRows: globalThis.ppScoreRows_,
    setupReport: globalThis.ppSetupReport_,
    handleFormSubmit: globalThis.handleFormSubmit,
    rescoreAllRows: globalThis.rescoreAllRows,
    checkSetup: globalThis.checkSetup,
    installTrigger: globalThis.installTrigger,
    onOpen: globalThis.onOpen
  }
};
