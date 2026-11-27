'use strict';
// A small stand-in for a Google Sheet tab. Like the real thing, it throws if a
// range falls outside the grid, so tests catch code that forgets to add columns.
class FakeSheet {
  constructor(rows, maxCols) {
    this.grid = rows.map((r) => r.slice());
    this.maxCols = Math.max(maxCols || 0, ...rows.map((r) => r.length));
    this.grid.forEach((r) => { while (r.length < this.maxCols) r.push(''); });
  }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(position, howMany) {
    this.maxCols += howMany;
    this.grid.forEach((r) => { while (r.length < this.maxCols) r.push(''); });
  }
  getLastColumn() {
    let last = 0;
    for (const r of this.grid) for (let c = 0; c < r.length; c++) if (r[c] !== '') last = Math.max(last, c + 1);
    return last;
  }
  getLastRow() {
    let last = 0;
    this.grid.forEach((r, i) => { if (r.some((v) => v !== '')) last = i + 1; });
    return last;
  }
  getDataRange() {
    const rows = this.getLastRow();
    const cols = this.getLastColumn();
    return this.getRange(1, 1, Math.max(rows, 1), Math.max(cols, 1));
  }
  getRange(row, col, numRows, numCols) {
    numRows = numRows || 1; numCols = numCols || 1;
    if (row < 1 || col < 1 || col + numCols - 1 > this.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    while (this.grid.length < row + numRows - 1) this.grid.push(new Array(this.maxCols).fill(''));
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) out.push(self.grid[row - 1 + r].slice(col - 1, col - 1 + numCols));
        return out;
      },
      setValues(values) {
        if (values.length !== numRows || values.some((v) => v.length !== numCols)) {
          throw new Error('The number of rows or columns in the data does not match the range.');
        }
        for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) self.grid[row - 1 + r][col - 1 + c] = values[r][c];
      }
    };
  }
}
module.exports = { FakeSheet };
