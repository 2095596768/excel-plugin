import * as vscode from 'vscode';
import { ExcelDocument } from './ExcelManager';

export class ExcelProvider implements vscode.TextDocumentContentProvider {
  private documents = new Map<string, ExcelDocument>();
  
  constructor(private context: vscode.ExtensionContext) {}
  
  public provideTextDocumentContent(uri: vscode.Uri): string {
    const document = this.documents.get(uri.toString());
    return document ? document.getPreviewContent() : '';
  }
  
  private getDocument(uri: vscode.Uri): ExcelDocument | undefined {
    return this.documents.get(uri.toString());
  }
  
  public openDocument(uri: vscode.Uri, content: string): void {
    const document = new ExcelDocument(uri, content);
    this.documents.set(uri.toString(), document);
  }
  
  public getRowCount(uri: vscode.Uri): number {
    const document = this.documents.get(uri.toString());
    return document ? document.getRowCount() : 0;
  }

  public getCurrentRow(): number {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 0;
    
    const selection = editor.selection;
    const lineNumber = selection.active.line + 1; // Convert 0-based to 1-based
    return lineNumber;
  }
}