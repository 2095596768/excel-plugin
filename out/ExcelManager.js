"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcelManager = void 0;
class ExcelManager {
    headers = [];
    rows = [];
    currentFile = '';
    constructor() { }
    /**
     * 设置数据
     */
    setData(headers, rows, currentFile) {
        this.headers = headers;
        this.rows = rows;
        this.currentFile = currentFile;
    }
    /**
     * 设置行数据
     */
    setRows(rows) {
        this.rows = rows;
    }
    /**
     * 获取表头
     */
    getHeaders() {
        return this.headers;
    }
    /**
     * 获取所有行数据
     */
    getRows() {
        return this.rows;
    }
    /**
     * 获取当前文件路径
     */
    getCurrentFile() {
        return this.currentFile;
    }
    /**
     * 获取指定行的数据
     */
    getRowData(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.rows.length) {
            return {};
        }
        const row = this.rows[rowIndex];
        const rowData = {};
        this.headers.forEach((header, index) => {
            rowData[header] = row[index] || '';
        });
        return rowData;
    }
}
exports.ExcelManager = ExcelManager;
//# sourceMappingURL=ExcelManager.js.map