import * as vscode from 'vscode';
import { HtmlTemplateLoader } from './utils/HtmlTemplateLoader';

export class ExcelSidebarProvider {
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _templateLoader: HtmlTemplateLoader;
  private _formTemplateLoaded = false;
  private _pendingDataMessage: any = null;
  private _isExtensionActive: boolean = true;

  constructor(
    private readonly _viewId: string,
    private readonly _extensionContext: vscode.ExtensionContext,
    isActive: boolean = true
  ) {
    this._extensionUri = _extensionContext.extensionUri;
    this._isExtensionActive = isActive;
    this._templateLoader = new HtmlTemplateLoader(this._extensionUri, {
      enableLogging: false, // 禁用日志输出以提高性能
      cacheSize: 50, // 合理的缓存大小
      enableCache: true // 启用缓存以提高性能
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'webview')
      ]
    };

    console.log('[ExcelSidebarProvider] Webview options:', {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri.fsPath,
        vscode.Uri.joinPath(this._extensionUri, 'webview').fsPath
      ]
    });

    const html = this._getHtmlForWebview(webviewView.webview);
    console.log('[ExcelSidebarProvider] 设置 webview HTML');
    webviewView.webview.html = html;
    console.log('[ExcelSidebarProvider] webview HTML 已设置');

    webviewView.onDidChangeVisibility(() => {
      console.log('[ExcelSidebarProvider] Webview 可见性变化:', webviewView.visible);
      if (webviewView.visible && this._view) {
        console.log('[ExcelSidebarProvider] Webview 可见，发送保存的激活状态');
        // 发送保存的激活状态
        this._view.webview.postMessage({
          type: 'status',
          isExtensionActive: this._isExtensionActive
        });
        
        // 如果插件激活，加载表单模板
        if (this._isExtensionActive) {
          console.log('[ExcelSidebarProvider] Webview 可见且插件激活，加载表单模板');
          this._loadFormTemplate(this._view.webview);
        }
        
        // 触发 VSCode 命令重新初始化插件
        try {
          console.log('[ExcelSidebarProvider] 触发插件重新初始化');
          vscode.commands.executeCommand('excelPlugin.reinitialize');
        } catch (error) {
          console.error('[ExcelSidebarProvider] 触发插件重新初始化错误:', error);
        }
      }
    });

    webviewView.webview.onDidReceiveMessage(data => {
      console.log('[ExcelSidebarProvider] 收到消息:', data);
      this._handleMessage(data);
    });

    setTimeout(() => {
      console.log('[ExcelSidebarProvider] 延迟加载表单模板');
      this._loadFormTemplate(webviewView.webview);
      // 模板加载后发送激活状态
      setTimeout(() => {
        webviewView.webview.postMessage({
          type: 'status',
          isExtensionActive: this._isExtensionActive
        });
      }, 50);
    }, 100);
  }

  private _loadFormTemplate(webview: vscode.Webview): void {
    try {
      // 只有当插件激活时才加载表单模板
      if (!this._isExtensionActive) {
        console.log('[ExcelSidebarProvider] 插件未激活，跳过表单模板加载');
        return;
      }
      
      console.log('[ExcelSidebarProvider] 开始加载表单模板');
      const formTemplate = this._templateLoader.loadFormTemplate();
      console.log('[ExcelSidebarProvider] 表单模板加载完成，准备发送消息');
      webview.postMessage({
        type: 'loadFormTemplate',
        formTemplate: formTemplate
      });
      this._formTemplateLoaded = true;
      console.log('[ExcelSidebarProvider] 表单模板已加载');
      
      if (this._pendingDataMessage) {
        console.log('[ExcelSidebarProvider] 发送待处理的数据消息');
        this.postMessage(this._pendingDataMessage);
        this._pendingDataMessage = null;
      }
    } catch (error) {
      console.error('Failed to load form template:', error);
    }
  }

  private _handleMessage(message: any): void {
    try {
      switch (message.type) {
        case 'openExcel':
          vscode.commands.executeCommand('excelPlugin.openExcel');
          break;
        case 'addRow':
          vscode.commands.executeCommand('excelPlugin.addRow', message.rowData, message.copyCurrentRow);
          break;
        case 'updateCell':
          vscode.commands.executeCommand('excelPlugin.updateCell', message.lineNumber, message.column, message.value, message.columnIndex || 0);
          break;
        case 'headerRowChanged':
          vscode.commands.executeCommand('excelPlugin.headerRowChanged', message.headerRowIndex);
          break;
        case 'currentRowChanged':
          vscode.commands.executeCommand('excelPlugin.currentRowChanged', message.currentRowValue);
          break;
        case 'requestCurrentRowData':
          // 处理前端请求当前行数据的消息
          console.log('[ExcelSidebarProvider] 收到请求当前行数据的消息:', message.currentLine);
          // 触发编辑器变更事件，获取当前行数据
          vscode.commands.executeCommand('excelPlugin.updateCurrentLineData');
          break;
      }
    } catch (error) {
      console.error('[ExcelSidebarProvider] _handleMessage 错误:', error);
    }
  }

  public updateStatus(isActive: boolean): void {
    try {
      console.log('[ExcelSidebarProvider] 更新激活状态:', isActive);
      const wasActive = this._isExtensionActive;
      this._isExtensionActive = isActive;
      this.postMessage({
        type: 'status',
        isExtensionActive: isActive
      });
      
      // 如果从非激活状态切换到激活状态，加载表单模板
      if (!wasActive && isActive && this._view && this._view.webview) {
        console.log('[ExcelSidebarProvider] 从非激活状态切换到激活状态，加载表单模板');
        this._loadFormTemplate(this._view.webview);
      }
    } catch (error) {
      console.error('[ExcelSidebarProvider] updateStatus 错误:', error);
    }
  }

  public isWebviewVisible(): boolean {
    return !!this._view && this._view.visible;
  }

  public postMessage(message: any): void {
    try {
      if (!this._view || !this._view.webview || !this._view.visible) {
        console.warn('[ExcelSidebarProvider] Webview 不可用或不可见，消息未发送:', message.type);
        return;
      }
      console.log('[ExcelSidebarProvider] 发送消息:', message.type, message);
      this._view.webview.postMessage(message);
    } catch (error) {
      console.error('[ExcelSidebarProvider] postMessage 错误:', error);
    }
  }

  public setData(data: any, filePath: string, headerRowIndex?: number): void {
    // 获取当前编辑器的光标位置
    let currentLine = 0;
    const editor = vscode.window.activeTextEditor;
    
    // 计算总行数，优先使用编辑器的实际行数（包括空行）
    let totalLines = 0;
    if (editor && editor.document.fileName === filePath) {
      currentLine = editor.selection.active.line + 1;
      // 使用编辑器的实际行数，包括所有行，包括空行
      totalLines = editor.document.lineCount;
    } else if (data.totalLines) {
      // 如果没有编辑器，使用data中的总行数
      totalLines = data.totalLines;
    } else if (data.rows?.length) {
      // 如果都没有，使用数据行数
      totalLines = data.rows.length;
    }
    
    // 验证表头行值
    let validatedHeaderRowIndex = 1; // 默认表头行为第1行
    if (headerRowIndex !== undefined) {
      // 使用传入的表头行值
      validatedHeaderRowIndex = headerRowIndex;
    } else if (data.headerRowIndex) {
      // 使用data中的表头行值
      validatedHeaderRowIndex = data.headerRowIndex;
    }
    
    // 确保表头行值不小于1
    validatedHeaderRowIndex = Math.max(1, validatedHeaderRowIndex);
    // 确保表头行值不大于总行数
    validatedHeaderRowIndex = Math.min(validatedHeaderRowIndex, totalLines);
    
    const message = {
      type: 'data',
      headers: data.headers || [],
      firstRowHeaders: data.firstRowHeaders || [],
      currentFile: filePath,
      rowCount: data.rows?.length || 0,
      totalColumns: data.totalColumns || 0,
      totalLines: totalLines,
      currentLine: currentLine,
      headerRowIndex: validatedHeaderRowIndex,
      isExtensionActive: true
    };
    
    if (this._formTemplateLoaded) {
      console.log('[ExcelSidebarProvider] 表单模板已加载，直接发送数据消息');
      this.postMessage(message);
    } else {
      console.log('[ExcelSidebarProvider] 表单模板未加载，保存数据消息');
      this._pendingDataMessage = message;
    }
  }

  public clearData(): void {
    console.log('[ExcelSidebarProvider] 清空数据');
    this.postMessage({
      type: 'emptyData',
      isExtensionActive: this._isExtensionActive
    });
  }

  public selectRow(rowData: any, rowIndex: number, lineNumber: number): void {
    if (!this._view || !this._view.webview) {
      console.warn('[ExcelSidebarProvider] Webview 不可用，无法发送 selectRow 消息');
      return;
    }
    
    this.postMessage({
      type: 'selectRow',
      rowData: rowData,
      rowIndex: rowIndex,
      lineNumber: lineNumber
    });
  }

  public clearForm(): void {
    if (!this._view || !this._view.webview) {
      console.warn('[ExcelSidebarProvider] Webview 不可用，无法发送 clearForm 消息');
      return;
    }
    
    this.postMessage({
      type: 'clearForm'
    });
  }

  public updateHeaders(headers: string[]): void {
    this.postMessage({
      type: 'updateHeaders',
      headers: headers
    });
  }

  public updateLineStats(totalLines: number, currentLine: number): void {
    this.postMessage({
      type: 'updateLineStats',
      totalLines: totalLines,
      currentLine: currentLine
    });
  }

  public updateCurrentRowInput(currentLineNumber: number): void {
    this.postMessage({
      type: 'updateCurrentRowInput',
      currentLineNumber: currentLineNumber
    });
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    console.log('[ExcelSidebarProvider] 开始生成 HTML');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'sidebar.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'sidebar.css'));
    const nonce = this._templateLoader.generateNonce();

    console.log('[ExcelSidebarProvider] Webview URI:', {
      extensionUri: this._extensionUri.fsPath,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      scriptUriScheme: scriptUri.scheme,
      styleUriScheme: styleUri.scheme,
      webviewCspSource: webview.cspSource
    });

    const scriptUriStr = scriptUri.toString();
    const styleUriStr = styleUri.toString();
    
    console.log('[ExcelSidebarProvider] scriptUri 原始值:', scriptUriStr);
    console.log('[ExcelSidebarProvider] styleUri 原始值:', styleUriStr);
    console.log('[ExcelSidebarProvider] scriptUri 长度:', scriptUriStr.length);
    console.log('[ExcelSidebarProvider] styleUri 长度:', styleUriStr.length);
    console.log('[ExcelSidebarProvider] scriptUri 前10字符:', scriptUriStr.substring(0, 10));
    console.log('[ExcelSidebarProvider] styleUri 前10字符:', styleUriStr.substring(0, 10));
    console.log('[ExcelSidebarProvider] scriptUri 第1个字符编码:', scriptUriStr.charCodeAt(0));
    console.log('[ExcelSidebarProvider] styleUri 第1个字符编码:', styleUriStr.charCodeAt(0));
    console.log('[ExcelSidebarProvider] scriptUri 前5个字符编码:', Array.from(scriptUriStr.substring(0, 5)).map(c => c.charCodeAt(0)));
    console.log('[ExcelSidebarProvider] styleUri 前5个字符编码:', Array.from(styleUriStr.substring(0, 5)).map(c => c.charCodeAt(0)));
    console.log('[ExcelSidebarProvider] scriptUri 是否包含反引号:', scriptUriStr.includes('`'));
    console.log('[ExcelSidebarProvider] styleUri 是否包含反引号:', styleUriStr.includes('`'));
    
    let cspSource = webview.cspSource;
    console.log('[ExcelSidebarProvider] CSP_SOURCE 原始值:', cspSource);
    console.log('[ExcelSidebarProvider] CSP_SOURCE 是否包含反引号:', cspSource.includes('`'));
    if (cspSource.includes('`')) {
      cspSource = cspSource.replace(/`/g, '');
      console.log('[ExcelSidebarProvider] CSP_SOURCE 已清理反引号:', cspSource);
    }

    const variables = {
      STYLE_URI: styleUriStr,
      SCRIPT_URI: scriptUriStr,
      NONCE: nonce,
      CSP_SOURCE: cspSource
    };
    
    try {
      console.log('[ExcelSidebarProvider] 开始加载模板');
      const html = this._templateLoader.loadTemplate('sidebar.html', variables);
      
      console.log('[ExcelSidebarProvider] HTML 长度:', html.length);
      console.log('[ExcelSidebarProvider] HTML 预览 (前500字符):', html.substring(0, 500));
      
      const styleUriMatch = html.match(/href="([^"]*)"/);
      const scriptUriMatch = html.match(/src="([^"]*)"/);
      console.log('[ExcelSidebarProvider] href 属性:', styleUriMatch ? styleUriMatch[0] : '未找到');
      console.log('[ExcelSidebarProvider] src 属性:', scriptUriMatch ? scriptUriMatch[0] : '未找到');
      
      if (styleUriMatch && styleUriMatch[1]) {
        console.log('[ExcelSidebarProvider] href 值:', styleUriMatch[1]);
        console.log('[ExcelSidebarProvider] href 值长度:', styleUriMatch[1].length);
        console.log('[ExcelSidebarProvider] href 值前10字符:', styleUriMatch[1].substring(0, 10));
        console.log('[ExcelSidebarProvider] href 值第1个字符编码:', styleUriMatch[1].charCodeAt(0));
        console.log('[ExcelSidebarProvider] href 值是否包含反引号:', styleUriMatch[1].includes('`'));
      }
      
      if (scriptUriMatch && scriptUriMatch[1]) {
        console.log('[ExcelSidebarProvider] src 值:', scriptUriMatch[1]);
        console.log('[ExcelSidebarProvider] src 值长度:', scriptUriMatch[1].length);
        console.log('[ExcelSidebarProvider] src 值前10字符:', scriptUriMatch[1].substring(0, 10));
        console.log('[ExcelSidebarProvider] src 值第1个字符编码:', scriptUriMatch[1].charCodeAt(0));
        console.log('[ExcelSidebarProvider] src 值是否包含反引号:', scriptUriMatch[1].includes('`'));
      }
      
      const hasTemplateStyleUri = html.includes('{{STYLE_URI}}');
      const hasTemplateScriptUri = html.includes('{{SCRIPT_URI}}');
      console.log('[ExcelSidebarProvider] 是否包含模板变量 STYLE_URI:', hasTemplateStyleUri);
      console.log('[ExcelSidebarProvider] 是否包含模板变量 SCRIPT_URI:', hasTemplateScriptUri);
      
      if (hasTemplateStyleUri || hasTemplateScriptUri) {
        console.error('[ExcelSidebarProvider] 警告：HTML 中仍然包含模板变量！');
      }
      
      return html;
    } catch (error) {
      console.error('Failed to read sidebar.html template:', error);
      return this._templateLoader.loadFallbackTemplate(webview);
    }
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}