import * as vscode from 'vscode';

export class ExcelManager {
  private headers: string[] = [];
  private rows: any[][] = [];
  private currentFile: string = '';
  
  constructor() {}
  
  /**
   * 设置数据
   */
  public setData(headers: string[], rows: any[][], currentFile: string): void {
    this.headers = headers;
    this.rows = rows;
    this.currentFile = currentFile;
  }
  
  /**
   * 设置行数据
   */
  public setRows(rows: any[][]): void {
    this.rows = rows;
  }
  
  /**
   * 获取表头
   */
  public getHeaders(): string[] {
    return this.headers;
  }
  
  /**
   * 获取所有行数据
   */
  public getRows(): any[][] {
    return this.rows;
  }
  
  /**
   * 获取当前文件路径
   */
  public getCurrentFile(): string {
    return this.currentFile;
  }
  
  /**
   * 获取指定行的数据
   */
  public getRowData(rowIndex: number): any {
    if (rowIndex < 0 || rowIndex >= this.rows.length) {
      return {};
    }
    
    const row = this.rows[rowIndex];
    const rowData: any = {};
    
    this.headers.forEach((header, index) => {
      rowData[header] = row[index] || '';
    });
    
    return rowData;
  }
}