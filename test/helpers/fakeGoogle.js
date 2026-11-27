'use strict';
// Stand-ins for Drive, Docs, Properties, Lock and the Spreadsheet app, just detailed enough
// to run the report code. Documents are lists of paragraphs; a "PDF" keeps the document's
// text so tests can read exactly what a student would get.
const { FakeSheet } = require('./fakeSheet');

class FakeGoogle {
  constructor() {
    this.files = new Map();   // id -> { id, name, kind: 'folder'|'doc'|'pdf', paras, text, parent, trashed }
    this.props = {};
    this.alerts = [];
    this.locks = [];
    this.failLockAfter = Infinity;   // waitLock throws once this many locks were taken
    this.tabs = {};                  // content tab name -> FakeSheet
    this.responses = null;
    this.prompts = [];
    this.n = 0;
  }
  id(prefix) { return prefix + String(++this.n).padStart(28, 'x'); }
  add(file) { this.files.set(file.id, file); return file; }
  live(kind) { return [...this.files.values()].filter((f) => f.kind === kind && !f.trashed); }

  fileApi(f) {
    const g = this;
    return {
      getId: () => f.id, getName: () => f.name,
      getUrl: () => `https://drive.google.com/file/d/${f.id}/view?usp=drivesdk`,
      setName(n) { f.name = n; return this; },
      setTrashed(t) { f.trashed = t; return this; },
      moveTo(folder) { f.parent = folder.getId(); return this; },
      makeCopy(name, folder) {
        return g.fileApi(g.add({ ...f, id: g.id('doc'), name, paras: f.paras.map((p) => ({ ...p })), parent: folder.getId(), trashed: false }));
      },
      getAs() {
        const blob = { name: f.name, text: g.docText(f), setName(n) { this.name = n; return this; } };
        return blob;
      }
    };
  }
  folderApi(f) {
    const g = this;
    return {
      getId: () => f.id, getName: () => f.name, getUrl: () => `https://drive.google.com/drive/folders/${f.id}`,
      createFile(blob) {
        if (g.failPdf) throw new Error('Service error: Drive');
        return g.fileApi(g.add({ id: g.id('pdf'), name: blob.name, kind: 'pdf', text: blob.text, parent: f.id, trashed: false }));
      }
    };
  }
  docText(f) { return f.paras.map((p) => p.text).join('\n'); }
  docApi(f) {
    const g = this;
    const body = {
      clear() { f.paras = []; return body; },
      appendParagraph(text) {
        const p = { text, attrs: null };
        f.paras.push(p);
        return { setAttributes(a) { p.attrs = a; return this; } };
      },
      replaceText(pattern, value) {
        const re = new RegExp(pattern, 'g');
        f.paras.forEach((p) => { p.text = p.text.replace(re, () => value); });
        return body;
      },
      getText: () => g.docText(f)
    };
    return { getId: () => f.id, getBody: () => body, saveAndClose() {} };
  }

  install(sheet) {
    const g = this;
    g.responses = sheet;
    globalThis.PropertiesService = {
      getDocumentProperties: () => ({ getProperty: (k) => (k in g.props ? g.props[k] : null), setProperty: (k, v) => { g.props[k] = v; } })
    };
    globalThis.LockService = {
      getScriptLock: () => ({
        waitLock() { g.locks.push('wait'); if (g.locks.filter((x) => x === 'wait').length > g.failLockAfter) throw new Error('Could not obtain lock'); },
        releaseLock() { g.locks.push('release'); }
      })
    };
    globalThis.DriveApp = {
      createFolder: (name) => g.folderApi(g.add({ id: g.id('fld'), name, kind: 'folder', trashed: false })),
      getFolderById: (id) => g.folderApi(g.files.get(id)),
      getFileById: (id) => { if (!g.files.has(id)) throw new Error('No item with the given ID'); return g.fileApi(g.files.get(id)); }
    };
    globalThis.DocumentApp = {
      Attribute: { FONT_FAMILY: 'FONT_FAMILY', FONT_SIZE: 'FONT_SIZE', BOLD: 'BOLD', ITALIC: 'ITALIC', FOREGROUND_COLOR: 'FOREGROUND_COLOR' },
      create: (name) => g.docApi(g.add({ id: g.id('doc'), name, kind: 'doc', paras: [], parent: 'root', trashed: false })),
      openById: (id) => {
        const f = g.files.get(id);
        if (!f || f.kind !== 'doc') throw new Error('Document is missing (perhaps it was deleted, or you do not have read access?)');
        return g.docApi(f);
      }
    };
    const ui = {
      alert: (...a) => g.alerts.push(a.join(' | ')),
      prompt: (...a) => { g.prompts.push(a[0]); return { getSelectedButton: () => (g.promptAnswer === null ? 'CANCEL' : 'OK'), getResponseText: () => g.promptAnswer }; },
      ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK' },
      createMenu: () => { const m = { items: [], addItem(l, fn) { m.items.push(fn); return m; }, addSeparator() { return m; }, addToUi() { g.menu = m.items; } }; return m; }
    };
    globalThis.SpreadsheetApp = {
      getUi: () => ui,
      getActive: () => ({ getSheetByName: (n) => (n === 'Form Responses 1' ? g.responses : g.tabs[n] || null) })
    };
    return g;
  }
  setContent(tabs) {
    this.tabs = {
      'Initial Test': new FakeSheet(tabs.initialTest),
      'Combination Portraits': new FakeSheet(tabs.portraits),
      'Portrait Closings': new FakeSheet(tabs.closings)
    };
  }
}
module.exports = { FakeGoogle };
