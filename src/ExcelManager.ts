import * as vscode from 'vscode';

export class ExcelDocument {
  private uri: vscode.Uri;
  private content: string;
  private headers: string[] = [];
  private rows: any[][] = [];

  constructor(uri: vscode.Uri, content: string) {
    this.uri = uri;
    this.content = content;
    this.parseContent();
  }

  private parseContent(): void {
    const lines = this.content.split('\n');
    if (lines.length === 0) return;

    // 解析第一行作为表头
    const firstLine = lines[0];
    if (firstLine.includes('\t')) {
      this.headers = firstLine.split('\t').map(header => header.trim() || `Column ${this.headers.length + 1}`);
    } else if (firstLine.includes(',')) {
      this.headers = firstLine.split(',').map(header => header.trim() || `Column ${this.headers.length + 1}`);
    } else {
      this.headers = [firstLine.trim() || 'Column 1'];
    }

    // 解析数据行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;

      let cells: string[] = [];
      if (line.includes('\t')) {
        cells = line.split('\t');
      } else if (line.includes(',')) {
        cells = line.split(',');
      } else {
        cells = [line];
      }

      const row: any[] = [];
      for (let j = 0; j < this.headers.length; j++) {
        if (j < cells.length) {
          row.push(cells[j].trim());
        } else {
          row.push('');
        }
      }
      this.rows.push(row);
    }
  }

  public getPreviewContent(): string {
    // 返回一个简单的预览内容
    let preview = `Excel Preview - ${this.uri.fsPath}\n\n`;
    preview += `Headers: ${this.headers.join(', ')}\n`;
    preview += `Rows: ${this.rows.length}\n`;
    return preview;
  }

  public getRowCount(): number {
    // 返回总行数（表头+数据行）
    return 1 + this.rows.length; // 1 for header row
  }

  public getHeaders(): string[] {
    return this.headers;
  }

  public getRows(): any[][] {
    return this.rows;
  }

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