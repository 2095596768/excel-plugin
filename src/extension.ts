import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

interface ExcelData {
  headers: string[];
  rows: any[][];
  sheetData: any[];
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Excel Editor扩展已激活');
  
  // 插件状态
  let isExtensionActive = true;
  let currentExcelFile: string | undefined = undefined;
  let currentExcelData: ExcelData | undefined = undefined;
  let sidebarProvider: ExcelSidebarProvider | undefined = undefined;
  let isEditingForm: boolean = false;
  let currentEditor: vscode.TextEditor | undefined = undefined;
  let lastFormUpdateTime: number = 0;
  let isLoadingFile: boolean = false;
  let editorChangeTimeout: NodeJS.Timeout | undefined = undefined;
  let isEditorChangeFromExtension: boolean = false;
  
  // 状态栏项
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(excel) Excel编辑";
  statusBarItem.tooltip = "Excel编辑器已启用 (点击关闭)";
  statusBarItem.command = 'excelPlugin.toggleStatus';
  statusBarItem.show();
  
  // 更新状态栏显示
  const updateStatusBar = () => {
    if (isExtensionActive) {
      statusBarItem.text = "$(excel) Excel编辑";
      statusBarItem.tooltip = "Excel编辑器已启用 (点击关闭)";
    } else {
      statusBarItem.text = "$(circle-slash) Excel编辑";
      statusBarItem.tooltip = "Excel编辑器已关闭 (点击开启)";
    }
  };
  
  // 检查是否是Excel文件
  const isExcelFile = (filePath: string): boolean => {
    if (!filePath) return false;
    const ext = path.extname(filePath).toLowerCase();
    return ['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext);
  };
  
  // 解析Excel文件
  const parseExcelFile = async (filePath: string): Promise<ExcelData> => {
    try {
      console.log(`开始解析Excel文件: ${path.basename(filePath)}`);
      
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Excel文件中没有工作表');
      }
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      if (!Array.isArray(sheetData)) {
        return { headers: [], rows: [], sheetData: [] };
      }
      
      if (sheetData.length === 0) {
        return { headers: [], rows: [], sheetData: [] };
      }
      
      const firstRow = sheetData[0];
      let headers: string[] = [];
      
      if (Array.isArray(firstRow)) {
        headers = firstRow.map((header: any, index: number) => {
          if (header === null || header === undefined || header === '') {
            return `Column ${index + 1}`;
          }
          return String(header).trim();
        });
      } else {
        headers = ['Column 1'];
      }
      
      if (headers.length === 0) {
        if (sheetData.length > 1) {
          const sampleRow = sheetData[1];
          if (Array.isArray(sampleRow)) {
            headers = sampleRow.map((_: any, index: number) => `Column ${index + 1}`);
          } else {
            headers = ['Column 1'];
          }
        } else {
          headers = ['Column 1'];
        }
      }
      
      const rows: any[][] = [];
      for (let i = 1; i < sheetData.length; i++) {
        const rowData = sheetData[i];
        if (Array.isArray(rowData)) {
          const row: any[] = [];
          for (let j = 0; j < headers.length; j++) {
            if (j < rowData.length) {
              const cell = rowData[j];
              row.push(cell !== undefined && cell !== null ? String(cell).trim() : '');
            } else {
              row.push('');
            }
          }
          rows.push(row);
        } else if (rowData && typeof rowData === 'object') {
          const row: any[] = [];
          headers.forEach(header => {
            const value = (rowData as any)[header];
            row.push(value !== undefined && value !== null ? String(value).trim() : '');
          });
          rows.push(row);
        }
      }
      
      return { 
        headers, 
        rows, 
        sheetData: rows.length > 0 ? [headers, ...rows] : [headers] 
      };
    } catch (error) {
      console.error('解析Excel文件失败:', error);
      throw new Error(`解析Excel文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // 解析编辑器文本内容
  const parseEditorContent = (editor: vscode.TextEditor): ExcelData | undefined => {
    if (!editor) {
      return undefined;
    }
    
    try {
      const document = editor.document;
      const lines: string[] = [];
      
      for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
      }
      
      if (lines.length === 0) {
        return undefined;
      }
      
      // 解析第一行作为表头
      const firstLine = lines[0];
      let headers: string[] = [];
      
      if (firstLine.includes('\t')) {
        headers = firstLine.split('\t').map((header, index) => 
          header.trim() || `Column ${index + 1}`
        );
      } else if (firstLine.includes(',')) {
        headers = firstLine.split(',').map((header, index) => 
          header.trim() || `Column ${index + 1}`
        );
      } else {
        headers = ['Column 1'];
      }
      
      // 处理数据行
      const rows: any[][] = [];
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
        for (let j = 0; j < headers.length; j++) {
          if (j < cells.length) {
            row.push(cells[j].trim());
          } else {
            row.push('');
          }
        }
        rows.push(row);
      }
      
      return { 
        headers, 
        rows, 
        sheetData: rows.length > 0 ? [headers, ...rows] : [headers] 
      };
    } catch (error) {
      console.error('解析编辑器内容失败:', error);
      return undefined;
    }
  };
  
  // 从编辑器加载数据
  const loadDataFromEditor = (editor: vscode.TextEditor, filePath: string) => {
    if (!editor) return;
    
    try {
      const excelData = parseEditorContent(editor);
      
      if (!excelData || excelData.headers.length === 0) {
        console.log('从编辑器解析数据失败');
        return;
      }
      
      console.log(`从编辑器加载数据: ${excelData.headers.length} 列, ${excelData.rows.length} 行`);
      
      currentExcelFile = filePath;
      currentExcelData = excelData;
      currentEditor = editor;
      
      if (sidebarProvider) {
        sidebarProvider.setData(excelData, filePath);
        sidebarProvider.refresh();
      }
      
      // 更新当前行数据
      updateCurrentLineData(editor);
      
    } catch (error) {
      console.error('从编辑器加载数据失败:', error);
    }
  };
  
  // 自动加载文件
  const autoLoadFile = async (editor: vscode.TextEditor, forceReload: boolean = false) => {
    if (!isExtensionActive || !editor || isLoadingFile) {
      return;
    }
    
    const filePath = editor.document.fileName;
    console.log(`尝试加载文件: ${path.basename(filePath)}`);
    
    if (!isExcelFile(filePath)) {
      console.log('不是Excel文件，跳过加载');
      if (sidebarProvider) {
        sidebarProvider.clearData();
        sidebarProvider.refresh();
      }
      return;
    }
    
    // 如果文件相同且不是强制重新加载，则跳过
    if (!forceReload && filePath === currentExcelFile && currentExcelData) {
      console.log('文件已加载，跳过');
      updateCurrentLineData(editor);
      return;
    }
    
    isLoadingFile = true;
    
    try {
      console.log(`开始加载Excel文件: ${path.basename(filePath)}`);
      
      const excelData = await parseExcelFile(filePath);
      
      if (excelData.headers.length === 0) {
        console.log('Excel文件没有有效数据');
        loadDataFromEditor(editor, filePath);
        return;
      }
      
      console.log(`Excel数据加载成功: ${excelData.headers.length} 列, ${excelData.rows.length} 行`);
      
      currentExcelFile = filePath;
      currentExcelData = excelData;
      currentEditor = editor;
      
      if (sidebarProvider) {
        sidebarProvider.setData(excelData, filePath);
        sidebarProvider.refresh();
      }
      
      // 更新当前行数据
      updateCurrentLineData(editor);
      
      console.log(`文件加载完成: ${path.basename(filePath)}`);
      
    } catch (error) {
      console.error('加载Excel文件失败，尝试从编辑器解析:', error);
      loadDataFromEditor(editor, filePath);
    } finally {
      isLoadingFile = false;
    }
  };
  
  // 更新当前行的数据
  const updateCurrentLineData = (editor: vscode.TextEditor) => {
    if (!sidebarProvider) {
      return;
    }
    
    if (isEditingForm) {
      return;
    }
    
    if (!currentExcelData) {
      sidebarProvider.clearForm();
      return;
    }
    
    const cursorPosition = editor.selection.active;
    const currentLine = cursorPosition.line;
    
    // 检查是否有选中文本
    const selection = editor.selection;
    const hasSelection = !selection.isEmpty;
    const selectedLines = Math.abs(selection.end.line - selection.start.line) + 1;
    
    // 如果有选中文本或多行选中，清空表单
    if (hasSelection && selectedLines > 1) {
      console.log('有选中文本或多行选中，清空表单');
      sidebarProvider.clearForm();
      return;
    }
    
    const excelRowNumber = currentLine + 1;
    const dataRowIndex = currentLine - 1;
    
    if (currentLine === 0) {
      // 表头行
      const rowObject: any = {};
      currentExcelData.headers.forEach((header: string) => {
        rowObject[header] = '';
      });
      sidebarProvider.selectRow(rowObject, -1, excelRowNumber, true);
    } else if (dataRowIndex >= 0 && dataRowIndex < currentExcelData.rows.length) {
      // 有效数据行
      const rowData = currentExcelData.rows[dataRowIndex];
      const rowObject: any = {};
      
      currentExcelData.headers.forEach((header: string, index: number) => {
        rowObject[header] = rowData[index] || '';
      });
      
      console.log(`更新表单显示第${dataRowIndex + 1}行:`, rowObject);
      sidebarProvider.selectRow(rowObject, dataRowIndex, excelRowNumber, true);
    } else {
      // 超出数据范围或无效行
      sidebarProvider.clearForm();
    }
  };
  
  // 更新编辑器中的单元格
  // 更新编辑器中的单元格 - 修复表单到编辑器的绑定
// 更新编辑器中的单元格
const updateCellInEditor = async (rowIndex: number, column: string, value: string) => {
  if (!currentExcelData || !currentEditor) {
    console.warn('[Extension] 无法更新单元格: 没有Excel数据或编辑器');
    return;
  }
  
  const columnIndex = currentExcelData.headers.indexOf(column);
  if (columnIndex === -1) {
    console.warn(`[Extension] 未找到列: ${column}`);
    return;
  }
  
  console.log(`[Extension] 开始更新单元格: 行${rowIndex + 1}, 列"${column}", 值: "${value}"`);
  
  if (rowIndex >= 0 && rowIndex < currentExcelData.rows.length) {
    // 更新内存数据
    currentExcelData.rows[rowIndex][columnIndex] = value;
    
    // Excel行号是行索引+2（表头行+1，行号从1开始）
    const excelRowNumber = rowIndex + 2;
    
    try {
      const editor = currentEditor;
      const document = editor.document;
      
      // 获取要更新的行
      const lineNumber = excelRowNumber - 1; // 转换为编辑器行号（0-based）
      console.log(`[Extension] 编辑器行号: ${lineNumber + 1} (0-based: ${lineNumber})`);
      
      if (lineNumber >= document.lineCount) {
        console.warn(`[Extension] 行号 ${lineNumber + 1} 超出文档范围`);
        return;
      }
      
      const lineText = document.lineAt(lineNumber).text;
      console.log(`[Extension] 原始行文本: "${lineText}"`);
      
      let cells: string[];
      
      // 解析行
      if (lineText.includes('\t')) {
        cells = lineText.split('\t');
      } else if (lineText.includes(',')) {
        cells = lineText.split(',');
      } else {
        cells = [lineText];
      }
      
      console.log(`[Extension] 解析后的单元格:`, cells);
      
      // 确保cells数组足够长
      while (cells.length <= columnIndex) {
        cells.push('');
      }
      
      // 更新单元格
      const oldValue = cells[columnIndex];
      cells[columnIndex] = value;
      
      // 重新构建行文本
      const newLineText = cells.join('\t');
      console.log(`[Extension] 新行文本: "${newLineText}"`);
      
      // 如果值没有变化，跳过更新
      if (oldValue === value) {
        console.log(`[Extension] 值未变化，跳过更新`);
        return;
      }
      
      // 标记扩展正在编辑
      isEditorChangeFromExtension = true;
      
      // 应用编辑
      const edit = new vscode.WorkspaceEdit();
      const lineRange = new vscode.Range(
        new vscode.Position(lineNumber, 0),
        new vscode.Position(lineNumber, lineText.length)
      );
      
      edit.replace(document.uri, lineRange, newLineText);
      
      // 使用await确保编辑完成
      const success = await vscode.workspace.applyEdit(edit);
      
      if (success) {
        console.log(`[Extension] ✅ 成功更新: 第${excelRowNumber}行 "${column}" = "${value}"`);
        
        // 更新内存中的sheetData
        if (currentExcelData.sheetData[rowIndex + 1]) {
          currentExcelData.sheetData[rowIndex + 1][columnIndex] = value;
        }
        
        // 更新最后修改时间
        lastFormUpdateTime = Date.now();
      } else {
        console.error('[Extension] ❌ 应用编辑失败');
      }
      
      // 重置标志
      setTimeout(() => {
        isEditorChangeFromExtension = false;
      }, 100);
      
    } catch (error) {
      console.error('[Extension] ❌ 更新编辑器单元格失败:', error);
      isEditorChangeFromExtension = false;
    }
    
    // 标记正在编辑表单
    isEditingForm = true;
    
    // 2秒后重置编辑状态
    setTimeout(() => {
      isEditingForm = false;
    }, 2000);
    
  } else {
    console.warn(`[Extension] 行索引 ${rowIndex} 超出数据行范围 [0, ${currentExcelData.rows.length})`);
  }
};
  
  // 处理编辑器内容变化
  const handleEditorContentChange = () => {
    if (!isExtensionActive || !currentEditor || !currentExcelFile) {
      return;
    }
    
    // 如果变化是由扩展引起的，跳过
    if (isEditorChangeFromExtension || isEditingForm) {
      return;
    }
    
    // 清除之前的定时器
    if (editorChangeTimeout) {
      clearTimeout(editorChangeTimeout);
    }
    
    // 设置新的定时器，防抖处理
    editorChangeTimeout = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const filePath = editor.document.fileName;
      if (currentExcelFile !== filePath) return;
      
      // 重新解析当前行
      const cursorPosition = editor.selection.active;
      const currentLine = cursorPosition.line;
      
      if (currentLine <= 0 || !currentExcelData) {
        return;
      }
      
      const dataRowIndex = currentLine - 1;
      if (dataRowIndex >= 0 && dataRowIndex < currentExcelData.rows.length) {
        // 读取当前行数据
        const lineText = editor.document.lineAt(currentLine).text;
        let cells: string[];
        
        if (lineText.includes('\t')) {
          cells = lineText.split('\t');
        } else if (lineText.includes(',')) {
          cells = lineText.split(',');
        } else {
          cells = [lineText];
        }
        
        // 更新内存中的数据
        for (let i = 0; i < currentExcelData.headers.length && i < cells.length; i++) {
          currentExcelData.rows[dataRowIndex][i] = cells[i].trim();
        }
        
        // 更新表单显示
        if (sidebarProvider) {
          const rowObject: any = {};
          currentExcelData.headers.forEach((header: string, index: number) => {
            const value = dataRowIndex < currentExcelData!.rows.length && 
                         index < currentExcelData!.rows[dataRowIndex].length
              ? currentExcelData!.rows[dataRowIndex][index]
              : '';
            rowObject[header] = value;
          });
          
          sidebarProvider.selectRow(rowObject, dataRowIndex, currentLine + 1, true);
        }
      }
    }, 300);
  };
  
  // 添加新行
  const addNewRow = (rowData: any) => {
    if (!currentExcelData || !currentEditor) {
      vscode.window.showWarningMessage('请先打开一个Excel文件');
      return;
    }
    
    const newRow = currentExcelData.headers.map((header: string) => rowData[header] || '');
    const newRowIndex = currentExcelData.rows.length;
    
    currentExcelData.rows.push(newRow);
    
    const newRowCount = currentExcelData.rows.length;
    console.log(`已添加新行，总行数: ${newRowCount}`);
    
    try {
      const editor = currentEditor;
      const document = editor.document;
      
      const newLineText = newRow.join('\t');
      
      const edit = new vscode.WorkspaceEdit();
      const lastLine = document.lineCount;
      const insertPosition = new vscode.Position(lastLine, 0);
      
      // 在文档末尾添加新行
      if (lastLine > 0) {
        edit.insert(document.uri, insertPosition, '\n' + newLineText);
      } else {
        // 如果没有内容，先添加表头
        const headersText = currentExcelData.headers.join('\t');
        edit.insert(document.uri, new vscode.Position(0, 0), headersText + '\n' + newLineText);
      }
      
      vscode.workspace.applyEdit(edit).then(() => {
        // 移动光标到新添加的行
        setTimeout(() => {
          if (editor) {
            const newCursorLine = lastLine;
            const newCursorPosition = new vscode.Position(newCursorLine, 0);
            editor.selection = new vscode.Selection(newCursorPosition, newCursorPosition);
            
            // 滚动到新行
            editor.revealRange(new vscode.Range(newCursorPosition, newCursorPosition));
            
            // 更新表单显示新添加的行数据
            const rowObject: any = {};
            currentExcelData!.headers.forEach((header: string, index: number) => {
              rowObject[header] = newRow[index] || '';
            });
            
            if (sidebarProvider) {
              const excelRowNumber = newCursorLine + 1;
              sidebarProvider.selectRow(rowObject, newRowIndex, excelRowNumber, true);
            }
          }
        }, 100);
      });
      
    } catch (error) {
      console.error('在编辑器添加新行失败:', error);
      vscode.window.showErrorMessage(`添加新行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (sidebarProvider) {
      sidebarProvider.refresh();
    }
  };
  
  // 激活插件
  const activateExtension = () => {
    console.log('激活Excel编辑器插件');
    isExtensionActive = true;
    updateStatusBar();
    
    if (sidebarProvider) {
      sidebarProvider.setExtensionActive(true);
    }
    
    // 检查当前编辑器
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.fileName;
      
      if (isExcelFile(filePath)) {
        console.log('当前是Excel文件，自动加载');
        autoLoadFile(editor);
      } else {
        console.log('当前不是Excel文件，显示空状态');
        if (sidebarProvider) {
          sidebarProvider.clearData();
          sidebarProvider.refresh();
        }
      }
    } else {
      console.log('没有活动的编辑器');
      if (sidebarProvider) {
        sidebarProvider.clearData();
        sidebarProvider.refresh();
      }
    }
  };
  
  // 关闭插件
  const deactivateExtension = () => {
    console.log('关闭Excel编辑器插件');
    isExtensionActive = false;
    updateStatusBar();
    
    // 清理数据
    currentExcelFile = undefined;
    currentExcelData = undefined;
    currentEditor = undefined;
    
    if (sidebarProvider) {
      sidebarProvider.clearData();
      sidebarProvider.setExtensionActive(false);
      sidebarProvider.refresh();
    }
  };
  
  // 切换插件状态
  const toggleExtensionStatus = () => {
    console.log(`切换插件状态: ${isExtensionActive ? '关闭' : '开启'}`);
    if (isExtensionActive) {
      deactivateExtension();
    } else {
      activateExtension();
    }
  };
  
  // 切换状态命令
  const toggleStatusCommand = vscode.commands.registerCommand('excelPlugin.toggleStatus', () => {
    toggleExtensionStatus();
  });
  
  // 创建侧边栏提供者
  sidebarProvider = new ExcelSidebarProvider(context.extensionUri, isExtensionActive);
  
  // 注册侧边栏视图
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "excelPlugin.sidebar",
      sidebarProvider
    )
  );
  
  // 监听编辑器切换事件
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
      console.log('编辑器切换事件');
      if (editor && isExtensionActive) {
        const filePath = editor.document.fileName;
        
        console.log(`切换到文件: ${path.basename(filePath)}`);
        
        if (isExcelFile(filePath)) {
          if (filePath !== currentExcelFile) {
            console.log('切换到新的Excel文件，自动加载');
            await autoLoadFile(editor);
          } else {
            console.log('切换到已加载的Excel文件，更新表单');
            updateCurrentLineData(editor);
          }
        } else {
          console.log('切换到非Excel文件，清空表单');
          if (sidebarProvider) {
            sidebarProvider.clearData();
            sidebarProvider.refresh();
          }
        }
      } else if (isExtensionActive) {
        console.log('没有活动的编辑器或插件未激活');
        if (sidebarProvider) {
          sidebarProvider.clearData();
          sidebarProvider.refresh();
        }
      }
    })
  );
  
  // 监听光标位置变化
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
      if (isExtensionActive && currentExcelData) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const filePath = editor.document.fileName;
          if (isExcelFile(filePath) && filePath === currentExcelFile) {
            updateCurrentLineData(event.textEditor);
          }
        }
      }
    })
  );
  
  // 监听编辑器内容变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
      if (!isExtensionActive) {
        return;
      }
      
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        const filePath = editor.document.fileName;
        if (currentExcelFile && filePath === currentExcelFile) {
          handleEditorContentChange();
        }
      }
    })
  );
  
  // 打开Excel文件命令
  const openExcelCommand = vscode.commands.registerCommand('excelPlugin.openExcel', async () => {
    if (!isExtensionActive) {
      vscode.window.showWarningMessage('请先激活Excel编辑器插件');
      return;
    }
    
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        'Excel文件': ['xlsx', 'xls', 'xlsm', 'xlsb']
      }
    });
    
    if (uris && uris[0]) {
      const filePath = uris[0].fsPath;
      try {
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        await autoLoadFile(editor, true);
      } catch (error) {
        console.error(`打开文件失败: ${error}`);
        vscode.window.showErrorMessage(`打开文件失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  
  // 添加行命令
  const addRowCommand = vscode.commands.registerCommand('excelPlugin.addRow', async () => {
    if (!isExtensionActive) {
      vscode.window.showWarningMessage('请先激活Excel编辑器插件');
      return;
    }
    
    if (sidebarProvider) {
      const rowData = await sidebarProvider.getFormData();
      if (rowData) {
        addNewRow(rowData);
      } else {
        vscode.window.showWarningMessage('没有表单数据可添加');
      }
    }
  });
  
  // 更新单元格命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.updateCell', async (rowIndex: number, column: string, value: string) => {
      await updateCellInEditor(rowIndex, column, value);
    })
  );
  
  // 开始编辑命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.startEditing', () => {
      isEditingForm = true;
      console.log('开始编辑表单');
    })
  );
  
  // 结束编辑命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.endEditing', () => {
      isEditingForm = false;
      console.log('结束编辑表单');
    })
  );
  
  // 激活插件命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.activate', () => {
      activateExtension();
    })
  );
  
  // 关闭插件命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.deactivate', () => {
      deactivateExtension();
    })
  );
  
  // 刷新命令
  context.subscriptions.push(
    vscode.commands.registerCommand('excelPlugin.refresh', () => {
      if (isExtensionActive && currentEditor) {
        autoLoadFile(currentEditor, true);
      }
    })
  );
  
  context.subscriptions.push(
    toggleStatusCommand,
    openExcelCommand,
    addRowCommand,
    statusBarItem
  );
  
  // 初始状态更新
  updateStatusBar();
  
  // 延迟激活插件，确保侧边栏已加载
  setTimeout(() => {
    activateExtension();
  }, 1000);
  
  console.log('Excel编辑器插件已加载，初始状态为已激活');
}

class ExcelSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _excelData: ExcelData | undefined = undefined;
  private _currentFile: string = '';
  private _currentRowIndex: number = -1;
  private _currentLineNumber: number = 0;
  private _formData: any = {};
  private _isFormEditing: boolean = false;
  private _isExtensionActive: boolean = true;
  
  constructor(
    private readonly _extensionUri: vscode.Uri,
    isExtensionActive: boolean
  ) {
    this._isExtensionActive = isExtensionActive;
  }
  
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._isExtensionActive);
    
    // 监听侧边栏可见性变化
    webviewView.onDidChangeVisibility(() => {
      console.log('侧边栏可见性变化:', webviewView.visible);
      
      if (!webviewView.visible) {
        // 侧边栏关闭时，关闭插件
        vscode.commands.executeCommand('excelPlugin.deactivate');
      } else {
        // 侧边栏打开时，如果插件未激活则激活
        vscode.commands.executeCommand('excelPlugin.activate');
      }
    });
    
    // 在 ExcelSidebarProvider 类的 resolveWebviewView 方法中，更新消息处理
webviewView.webview.onDidReceiveMessage(async (data: any) => {
  switch (data.type) {
    case 'updateCell':
      console.log(`[Extension] 收到更新单元格消息: 行${data.rowIndex}, 列"${data.column}", 值: "${data.value}"`);
      vscode.commands.executeCommand('excelPlugin.updateCell', data.rowIndex, data.column, data.value);
      break;
    case 'addRow':
      console.log('[Extension] 收到添加行消息:', data.rowData);
      this._addRow(data.rowData);
      break;
    case 'clearForm':
      console.log('[Extension] 收到清空表单消息');
      this.clearForm();
      break;
    case 'openExcel':
      console.log('[Extension] 收到打开Excel消息');
      vscode.commands.executeCommand('excelPlugin.openExcel');
      break;
    case 'getFormData':
      console.log('[Extension] 收到获取表单数据消息');
      this._sendFormData();
      break;
    case 'startEditing':
      console.log('[Extension] 收到开始编辑消息');
      vscode.commands.executeCommand('excelPlugin.startEditing');
      this._isFormEditing = true;
      break;
    case 'endEditing':
      console.log('[Extension] 收到结束编辑消息');
      vscode.commands.executeCommand('excelPlugin.endEditing');
      this._isFormEditing = false;
      break;
    case 'toggleExtension':
      console.log('[Extension] 收到切换插件状态消息');
      vscode.commands.executeCommand('excelPlugin.toggleStatus');
      break;
    case 'refresh':
      console.log('[Extension] 收到刷新消息');
      vscode.commands.executeCommand('excelPlugin.refresh');
      break;
  }
});
    
    // 初始加载数据
    setTimeout(() => this._sendData(), 100);
  }
  
  public setData(data: ExcelData, filePath: string) {
    this._excelData = data;
    this._currentFile = filePath;
    console.log(`侧边栏设置数据: ${path.basename(filePath)}, ${data.headers.length} 列, ${data.rows.length} 行`);
  }
  
  public clearData() {
    this._excelData = undefined;
    this._currentFile = '';
    this._currentRowIndex = -1;
    this._currentLineNumber = 0;
    this._formData = {};
    this._isFormEditing = false;
  }
  
  public setExtensionActive(isActive: boolean) {
    this._isExtensionActive = isActive;
  }
  
  public refresh() {
    if (this._view) {
      if (this._excelData) {
        this._sendData();
      } else {
        this._sendEmptyData();
      }
    }
  }
  
  public selectRow(rowData: any, rowIndex: number, lineNumber: number, forceUpdate: boolean = false) {
    if (this._isFormEditing && !forceUpdate) {
      return;
    }
    
    this._currentRowIndex = rowIndex;
    this._currentLineNumber = lineNumber;
    this._formData = { ...rowData };
    
    if (this._view) {
      this._view.webview.postMessage({
        type: 'selectRow',
        rowData: rowData,
        rowIndex: rowIndex,
        lineNumber: lineNumber
      });
    }
  }
  
  public clearForm() {
    this._currentRowIndex = -1;
    this._currentLineNumber = 0;
    this._formData = {};
    this._isFormEditing = false;
    
    if (this._view) {
      this._view.webview.postMessage({
        type: 'clearForm'
      });
    }
  }
  
  public async getFormData(): Promise<any> {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'requestFormData'
      });
      
      return new Promise((resolve) => {
        const listener = this._view!.webview.onDidReceiveMessage((data: any) => {
          if (data.type === 'formDataResponse') {
            listener.dispose();
            resolve(data.formData);
          }
        });
        
        setTimeout(() => {
          listener.dispose();
          resolve(this._formData);
        }, 5000);
      });
    }
    return this._formData;
  }
  
  private _addRow(rowData: any) {
    if (!rowData || typeof rowData !== 'object') {
      console.error('行数据格式不正确');
      return;
    }
    
    this._formData = rowData;
    vscode.commands.executeCommand('excelPlugin.addRow');
  }
  
  private _sendData() {
    if (!this._view || !this._excelData) {
      return;
    }
    
    const headers = this._excelData.headers;
    const rowCount = this._excelData.rows.length;
    
    this._view.webview.postMessage({
      type: 'data',
      headers: headers,
      currentFile: this._currentFile,
      rowCount: rowCount,
      currentLine: this._currentLineNumber,
      isExtensionActive: this._isExtensionActive
    });
  }
  
  private _sendEmptyData() {
    if (!this._view) {
      return;
    }
    
    this._view.webview.postMessage({
      type: 'emptyData',
      isExtensionActive: this._isExtensionActive
    });
  }
  
  private _sendFormData() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'formDataResponse',
        formData: this._formData
      });
    }
  }
  
  private _getHtmlForWebview(webview: vscode.Webview, isExtensionActive: boolean) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "sidebar.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "sidebar.js")
    );
    
    const statusText = isExtensionActive ? '已激活' : '已关闭';
    const statusClass = isExtensionActive ? 'active' : 'inactive';
    const hotkeyText = 'Ctrl+Shift+E';
    
    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Excel编辑器</title>
      <link rel="stylesheet" href="${styleUri}">
    </head>
    <body>
      <div class="container">
        <div class="header-section">
          <div class="header-top">
            <div class="header-left">
              <h3>Excel编辑器</h3>
              <div class="status-container">
                <div class="status-indicator ${statusClass}" id="statusIndicator">
                  <span>${statusText}</span>
                  <span class="status-hotkey">${hotkeyText}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="file-info" id="fileInfo">
            未打开Excel文件
          </div>
          
          <div class="file-stats" id="fileStats">
            <span>行: 0</span>
            <span>列: 0</span>
            <span class="current-line">当前: 无</span>
          </div>
        </div>
        
        <div class="main-content" id="mainContent">
          <div class="form-container" id="formContainer" style="display: none;">
            <div class="form-scroll-container" id="formScrollContainer">
              <div id="formFields"></div>
            </div>
          </div>
          
          <div class="empty-state" id="emptyState">
            <div class="empty-icon">📊</div>
            <h3>Excel编辑器</h3>
            <p>打开一个Excel文件开始编辑</p>
            <div class="empty-actions">
              <button onclick="openExcel()" class="primary-btn" id="openExcelBtn">打开Excel文件</button>
              <p class="hint">支持 .xlsx, .xls, .xlsm, .xlsb 格式</p>
            </div>
          </div>
        </div>
        
        <div class="footer-section">
          <button class="add-row-btn" onclick="addRow()" id="addRowBtn">添加新行</button>
        </div>
      </div>
      
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}