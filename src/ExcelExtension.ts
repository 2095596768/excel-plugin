import * as vscode from 'vscode';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { ExcelSidebarProvider } from './ExcelSidebarProvider';
import { SyncManagerV2 } from './sync/SyncManagerV2';
import { EditorUtils } from './utils/EditorUtils';
import { 
  HeaderChangeEvent, 
  EditorChangeEvent, 
  FormChangeEvent, 
  CursorRowChangeEvent,
  CurrentRowInputChangeEvent,
  CurrentRowInputToCursorEvent,
  SyncEventData 
} from './sync/core/SyncTypes';

interface ExcelData {
  headers: string[];
  firstRowHeaders: string[];
  rows: any[][];
  sheetData: any[];
  totalColumns: number; // 总列数，使用所有行中的最大列数
  totalLines: number; // 总行数
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Excel编辑器扩展已激活');

  try {
    // 读取激活状态配置
    const config = vscode.workspace.getConfiguration('excelPlugin');
    const activateOnStart = config.get<boolean>('activateOnStart', true);
    console.log(`[ExcelExtension] 启动时激活状态: ${activateOnStart}`);

    let isExtensionActive = activateOnStart;
    let currentExcelFile: string | undefined = undefined;
    let currentExcelData: ExcelData | undefined = undefined;
    let currentEditor: vscode.TextEditor | undefined = undefined;
    let headerRowIndex = 1;
    let isEditorChangeFromExtension = false;
    let isEditingForm = false;
    let isUpdatingConfig = false;

    const sidebarProvider = new ExcelSidebarProvider('excelPlugin.sidebar', context, isExtensionActive);
    const syncManager = new SyncManagerV2(sidebarProvider);

    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    // 根据激活状态设置初始状态栏
    if (isExtensionActive) {
      statusBarItem.text = "$(excel) Excel编辑";
      statusBarItem.tooltip = "Excel编辑器已启用 (点击关闭)";
    } else {
      statusBarItem.text = "$(circle-slash) Excel编辑";
      statusBarItem.tooltip = "Excel编辑器已关闭 (点击开启)";
    }
    statusBarItem.command = 'excelPlugin.toggleStatus';
    statusBarItem.show();

    // 同步激活状态到侧边栏
    sidebarProvider.updateStatus(isExtensionActive);

    // 更新配置项的函数
    const updateActivateOnStartConfig = async (value: boolean) => {
      try {
        isUpdatingConfig = true;
        const config = vscode.workspace.getConfiguration('excelPlugin');
        await config.update('activateOnStart', value, vscode.ConfigurationTarget.Global);
        console.log(`[ExcelExtension] 已更新 activateOnStart 配置为: ${value}`);
      } catch (error) {
        console.error('[ExcelExtension] 更新配置失败:', error);
      } finally {
        isUpdatingConfig = false;
      }
    };

    // 初始化插件的函数
    const initializePlugin = () => {
      console.log('[ExcelExtension] 初始化插件');
      // 重置插件状态
      currentExcelFile = undefined;
      currentExcelData = undefined;
      headerRowIndex = 1;
      
      // 检查当前激活的编辑器
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        currentEditor = editor;
        autoLoadFile(editor);
      } else {
        console.log('[ExcelExtension] 初始化插件: 无激活的编辑器');
      }
    };

    // 切换插件状态的函数
    const togglePluginStatus = async () => {
      const newValue = !isExtensionActive;
      isExtensionActive = newValue;
      
      // 更新状态栏
      updateStatusBar();
      
      // 同步激活状态到侧边栏
      sidebarProvider.updateStatus(isExtensionActive);
      
      // 更新配置项
      await updateActivateOnStartConfig(newValue);
      
      if (isExtensionActive) {
        // 如果切换到已激活状态，初始化插件
        initializePlugin();
      } else {
        // 如果切换到未激活状态，清空表单
        sidebarProvider.clearForm();
      }
    };

    const updateStatusBar = () => {
      if (isExtensionActive) {
        statusBarItem.text = "$(excel) Excel编辑";
        statusBarItem.tooltip = "Excel编辑器已启用 (点击关闭)";
      } else {
        statusBarItem.text = "$(circle-slash) Excel编辑";
        statusBarItem.tooltip = "Excel编辑器已关闭 (点击开启)";
      }
    };

    const isExcelFile = (filePath: string): boolean => {
      if (!filePath) return false;
      const ext = path.extname(filePath).toLowerCase();
      return ['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext);
    };

    const parseExcelFile = async (filePath: string, headerRowIndex?: number): Promise<ExcelData> => {
      try {
        const buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Excel文件中没有工作表');
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // 获取工作表的实际范围，包括末尾的空行
        let totalLines = 0;
        if (worksheet['!ref']) {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          totalLines = range.e.r + 1;
        } else {
          totalLines = sheetData.length;
        }

        if (!Array.isArray(sheetData) || sheetData.length === 0) {
          return { headers: [], firstRowHeaders: [], rows: [], sheetData: [], totalColumns: 0, totalLines: totalLines };
        }

        // 计算总列数，使用所有行中的最大列数
        let totalColumns = 0;
        for (const row of sheetData) {
          if (Array.isArray(row) && row.length > totalColumns) {
            totalColumns = row.length;
          }
        }

        // 获取第一行表头用于固定占位符文本
        let firstRowHeaders: string[] = [];
        if (sheetData.length > 0 && Array.isArray(sheetData[0])) {
          firstRowHeaders = sheetData[0].map((header: any, index: number) => {
            if (header === null || header === undefined || header === '') {
              return `Column ${index + 1}`;
            }
            return String(header).trim();
          });
        } else if (sheetData.length > 0 && sheetData[0] !== null && sheetData[0] !== undefined && sheetData[0] !== '') {
          // 处理第一行只有单列的情况
          firstRowHeaders = [String(sheetData[0]).trim()];
        }

        // 确保表头行值不小于1且不大于总行数
        const validatedHeaderRowIndex = Math.max(1, Math.min(headerRowIndex || totalLines, totalLines));
        
        // 使用指定的表头行获取表头数据
        const headerRow = sheetData[validatedHeaderRowIndex - 1];
        let headers: string[] = [];

        if (Array.isArray(headerRow)) {
          headers = headerRow.map((header: any, index: number) => {
            if (header === null || header === undefined || header === '') {
              return `Column ${index + 1}`;
            }
            return String(header).trim();
          });
        } else {
          // 即使只有一列，也使用实际的表头值
          if (headerRow !== null && headerRow !== undefined && headerRow !== '') {
            headers = [String(headerRow).trim()];
          } else {
            headers = ['Column 1'];
          }
        }

        // 确保headers长度等于总列数
        while (headers.length < totalColumns) {
          headers.push(`Column ${headers.length + 1}`);
        }

        // 确保firstRowHeaders长度等于总列数
        while (firstRowHeaders.length < totalColumns) {
          firstRowHeaders.push(`Column ${firstRowHeaders.length + 1}`);
        }

        const rows: any[][] = [];
        for (let i = 0; i < sheetData.length; i++) {
          if (i === validatedHeaderRowIndex - 1) continue; // 跳过表头行
          
          const rowData = sheetData[i];
          if (Array.isArray(rowData)) {
            const row: any[] = [];
            for (let j = 0; j < totalColumns; j++) {
              if (j < rowData.length) {
                const cell = rowData[j];
                row.push(cell !== undefined && cell !== null ? String(cell).trim() : '');
              } else {
                row.push('');
              }
            }
            rows.push(row);
          }
        }

        return {
          headers,
          firstRowHeaders,
          rows,
          sheetData: rows.length > 0 ? [headers, ...rows] : [headers],
          totalColumns,
          totalLines: totalLines
        };
      } catch (error) {
        console.error('解析Excel文件失败:', error);
        throw new Error(`解析Excel文件失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

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

        // 确保表头行值不大于总行数
        if (headerRowIndex > lines.length) {
          headerRowIndex = Math.min(headerRowIndex, lines.length);
          if (headerRowIndex < 1) {
            headerRowIndex = 1;
          }
        }

        // 计算总列数，使用所有行中的最大列数
        let totalColumns = 0;
        for (const line of lines) {
          let columnsCount = 0;
          if (line.includes('\t')) {
            columnsCount = line.split('\t').length;
          } else if (line.includes(',')) {
            columnsCount = line.split(',').length;
          } else {
            columnsCount = 1;
          }
          if (columnsCount > totalColumns) {
            totalColumns = columnsCount;
          }
        }

        // 获取第一行表头用于固定占位符文本
        let firstRowHeaders: string[] = [];
        if (lines.length > 0) {
          const firstLine = lines[0];
          if (firstLine.includes('\t')) {
            firstRowHeaders = firstLine.split('\t').map((header, index) => {
              const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
              return trimmedHeader || `Column ${index + 1}`;
            });
          } else if (firstLine.includes(',')) {
            firstRowHeaders = firstLine.split(',').map((header, index) => {
              const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
              return trimmedHeader || `Column ${index + 1}`;
            });
          } else {
            // 处理第一行只有单列的情况
            const trimmedHeader = firstLine.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
            if (trimmedHeader) {
              firstRowHeaders = [trimmedHeader];
            } else {
              firstRowHeaders = ['Column 1'];
            }
          }
        }

        // 使用表头行作为表头
        const headerLineIndex = headerRowIndex - 1;
        const headerLine = lines[headerLineIndex] || lines[0];
        let headers: string[] = [];

        if (headerLine.includes('\t')) {
          headers = headerLine.split('\t').map((header, index) => {
            // 移除表头中的引号
            const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
            return trimmedHeader || `Column ${index + 1}`;
          });
        } else if (headerLine.includes(',')) {
          headers = headerLine.split(',').map((header, index) => {
            // 移除表头中的引号
            const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
            return trimmedHeader || `Column ${index + 1}`;
          });
        } else {
          // 即使只有一列，也使用实际的表头值
          const trimmedHeader = headerLine.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
          if (trimmedHeader) {
            headers = [trimmedHeader];
          } else {
            headers = ['Column 1'];
          }
        }

        // 确保headers长度等于总列数
        while (headers.length < totalColumns) {
          headers.push(`Column ${headers.length + 1}`);
        }

        // 确保firstRowHeaders长度等于总列数
        while (firstRowHeaders.length < totalColumns) {
          firstRowHeaders.push(`Column ${firstRowHeaders.length + 1}`);
        }

        const rows: any[][] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i === headerLineIndex) continue; // 跳过表头行
          
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
          for (let j = 0; j < totalColumns; j++) {
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
          firstRowHeaders,
          rows,
          sheetData: rows.length > 0 ? [headers, ...rows] : [headers],
          totalColumns,
          totalLines: editor.document.lineCount
        };
      } catch (error) {
        console.error('解析编辑器内容失败:', error);
        return undefined;
      }
    };

    const autoLoadFile = async (editor: vscode.TextEditor) => {
      if (!isExtensionActive || !editor) {
        console.log('[ExcelExtension] 插件未激活或编辑器不存在，跳过 autoLoadFile');
        return;
      }

      const filePath = editor.document.fileName;
      const isExcel = isExcelFile(filePath);
      console.log('[ExcelExtension] autoLoadFile 执行:', {
        filePath,
        isExcel,
        documentScheme: editor.document.uri.scheme
      });

      if (!isExcel) {
        console.log('[ExcelExtension] 非 Excel 文件，清空数据');
        sidebarProvider.clearData();
        return;
      }

      try {
        // 切换文件时，优先使用编辑器的实际内容（包括未保存的修改）来计算总行数和总列数
        const actualTotalLines = editor.document.lineCount;
        totalLines = actualTotalLines;
        
        // 优先使用编辑器的实际内容解析数据
        const editorData = parseEditorContent(editor);
        if (editorData) {
          // 使用编辑器的实际列数
          totalColumns = editorData.totalColumns;
          
          // 只有当当前表头行值大于新文件的总行数时，才更新表头行值
          if (headerRowIndex > actualTotalLines) {
            headerRowIndex = actualTotalLines;
          }
          
          // 获取当前行值
          const cursorPosition = editor.selection.active;
          const cursorRowIndex = cursorPosition.line + 1;
          
          // 只有当当前行值大于新文件的总行数时，才更新当前行值
          if (cursorRowIndex > actualTotalLines) {
            // 设置光标位置到新文件的最后一行
            const newPosition = new vscode.Position(actualTotalLines - 1, 0);
            const newSelection = new vscode.Selection(newPosition, newPosition);
            editor.selection = newSelection;
          }
          
          currentExcelFile = filePath;
          currentExcelData = editorData;
          currentEditor = editor;
          sidebarProvider.setData(editorData, filePath, headerRowIndex);
          updateCurrentLineData(editor);
          return;
        }
        
        // 如果编辑器内容解析失败，则尝试解析Excel文件
        const excelData = await parseExcelFile(filePath, headerRowIndex);

        if (excelData.headers.length === 0) {
            const editorData = parseEditorContent(editor);
            if (editorData) {
              currentExcelFile = filePath;
              currentExcelData = editorData;
              currentEditor = editor;
              headerRowIndex = editorData.totalLines;
              totalColumns = editorData.totalColumns;
              totalLines = editorData.totalLines;
              sidebarProvider.setData(editorData, filePath, headerRowIndex);
            }
            return;
          }

        currentExcelFile = filePath;
        currentExcelData = excelData;
        currentEditor = editor;
        sidebarProvider.setData(excelData, filePath, headerRowIndex);

        updateCurrentLineData(editor);

      } catch (error) {
        console.error('加载Excel文件失败:', error);
        const editorData = parseEditorContent(editor);
        if (editorData) {
            currentExcelFile = filePath;
            currentExcelData = editorData;
            currentEditor = editor;
            
            // 只有当当前表头行值大于新文件的总行数时，才更新表头行值
            if (headerRowIndex > editorData.totalLines) {
              headerRowIndex = editorData.totalLines;
            }
            totalColumns = editorData.totalColumns;
            totalLines = editorData.totalLines;
            
            sidebarProvider.setData(editorData, filePath, headerRowIndex);
          }
      }
    };

    const updateCurrentLineData = (editor: vscode.TextEditor) => {
      // 检查 Webview 是否可见
      if (!sidebarProvider.isWebviewVisible()) {
        console.log('[ExcelExtension] Webview 不可见，跳过更新当前行数据');
        return;
      }
      
      if (!editor || isEditingForm || isEditorChangeFromExtension) {
        return;
      }

      try {
        const cursorPosition = editor.selection.active;
        const cursorRowIndex = cursorPosition.line + 1;

        const selection = editor.selection;
        const hasSelection = !selection.isEmpty;
        const selectedLines = Math.abs(selection.end.line - selection.start.line) + 1;

        if (hasSelection && selectedLines > 1) {
          sidebarProvider.clearForm();
          return;
        }

        // 优先使用内存中的总行数，否则使用编辑器的行数
        let totalLines = currentExcelData?.totalLines || editor.document.lineCount;
        
        const lines: string[] = [];
        for (let i = 0; i < editor.document.lineCount; i++) {
          lines.push(editor.document.lineAt(i).text);
        }

        if (lines.length === 0) {
          sidebarProvider.selectRow({}, -1, cursorRowIndex);
          return;
        }

        // 确保表头行值不大于总行数
        if (headerRowIndex > totalLines) {
          headerRowIndex = Math.min(headerRowIndex, totalLines);
          if (headerRowIndex < 1) {
            headerRowIndex = 1;
          }
        }

        // 使用表头行作为表头
        const headerLineIndex = headerRowIndex - 1;
        const headerLine = lines[headerLineIndex] || lines[0];
        let headers: string[] = [];

        if (headerLine && headerLine.includes('\t')) {
          headers = headerLine.split('\t').map((header, index) => {
            // 移除表头中的引号
            const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
            return trimmedHeader || `Column ${index + 1}`;
          });
        } else if (headerLine && headerLine.includes(',')) {
          headers = headerLine.split(',').map((header, index) => {
            // 移除表头中的引号
            const trimmedHeader = header.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
            return trimmedHeader || `Column ${index + 1}`;
          });
        } else {
          headers = ['Column 1'];
        }

        if (!Array.isArray(headers) || headers.length === 0) {
          headers = ['Column 1'];
        }

        // 更新当前Excel数据的表头
        if (currentExcelData) {
          currentExcelData.headers = headers;
        }

        // 发送更新后的表头到前端
        sidebarProvider.updateHeaders(headers);
        sidebarProvider.updateLineStats(editor.document.lineCount, cursorRowIndex);

        if (cursorPosition.line >= 0 && cursorPosition.line < lines.length) {
          const currentLineText = lines[cursorPosition.line];
          let cells: string[] = [];

          if (currentLineText.includes('\t')) {
            cells = currentLineText.split('\t');
          } else if (currentLineText.includes(',')) {
            cells = currentLineText.split(',');
          } else {
            cells = [currentLineText];
          }

          // 根据列索引直接构造数据对象
          const rowObject: any = {};
          // 使用总列数来遍历，确保所有列都能被处理
          const totalColumns = currentExcelData?.totalColumns || headers.length;
          for (let i = 0; i < totalColumns; i++) {
            const header = i < headers.length ? headers[i] : `Column ${i + 1}`;
            rowObject[header] = i < cells.length ? cells[i].trim() : '';
          }

          console.log(`[ExcelExtension] updateCurrentLineData: 准备发送数据`, {
            cursorRowIndex,
            headers,
            cells,
            rowObject
          });

          sidebarProvider.selectRow(rowObject, cursorPosition.line, cursorRowIndex);
        }
      } catch (error) {
        console.error('[ExcelExtension] updateCurrentLineData 错误:', error);
      }
    };

    const handleEditorChange = () => {
      if (!isExtensionActive || !currentEditor || !currentExcelFile) {
        return;
      }

      if (isEditorChangeFromExtension) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const filePath = editor.document.fileName;
      if (currentExcelFile !== filePath) return;

      const newExcelData = parseEditorContent(editor);
      if (newExcelData) {
        currentExcelData = newExcelData;
      }

      const cursorPosition = editor.selection.active;
      const cursorRowIndex = cursorPosition.line + 1;

      const event: EditorChangeEvent = {
        type: 'editorChange',
        timestamp: Date.now(),
        source: 'editor',
        editor,
        headers: currentExcelData?.headers || [],
        headerRowIndex,
        cursorRowIndex,
        isEditingForm,
        isEditorChangeFromExtension
      };

      syncManager.emit(event);
    };

    const handleCursorChange = () => {
      try {
        // 检查 Webview 是否可见
        if (!sidebarProvider.isWebviewVisible()) {
          console.log('[ExcelExtension] Webview 不可见，跳过光标变化处理');
          return;
        }
        
        if (!isExtensionActive || !currentEditor) {
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const filePath = editor.document.fileName;
        if (currentExcelFile !== filePath) return;

        updateCurrentLineData(editor);

        const cursorPosition = editor.selection.active;
        const cursorRowIndex = cursorPosition.line + 1;

        const cursorEvent: CursorRowChangeEvent = {
          type: 'cursorRowChange',
          timestamp: Date.now(),
          source: 'editor',
          editor,
          cursorRowIndex,
          isEditingForm
        };

        syncManager.emit(cursorEvent);
      } catch (error) {
        console.error('[ExcelExtension] handleCursorChange 错误:', error);
      }
    };

    // 定义总列数和总行数变量
    let totalColumns = 0;
    let totalLines = 0;

    const handleTextChange = (event: vscode.TextDocumentChangeEvent) => {
      if (!isExtensionActive || !currentEditor) {
        return;
      }

      if (isEditorChangeFromExtension || isEditingForm) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const filePath = editor.document.fileName;
      if (currentExcelFile !== filePath) return;

      // 重新解析整个文件以获取最新的数据
      const parsedData = parseEditorContent(editor);
      if (parsedData) {
        // 使用编辑器的实际行数作为总行数，包括所有行，包括空行
        const actualTotalLines = editor.document.lineCount;
        
        // 检查总列数是否发生变化
        const oldTotalColumns = totalColumns;
        
        currentExcelData = {
          headers: parsedData.headers,
          firstRowHeaders: parsedData.firstRowHeaders,
          rows: parsedData.rows,
          sheetData: parsedData.sheetData,
          totalColumns: parsedData.totalColumns,
          totalLines: actualTotalLines
        };
        
        // 更新总列数和总行数
        totalColumns = parsedData.totalColumns;
        totalLines = actualTotalLines;
        
        // 如果总列数发生变化，更新当前行数据到表单
        if (oldTotalColumns !== totalColumns) {
          console.log(`[ExcelExtension] 总列数发生变化: ${oldTotalColumns} → ${totalColumns}，更新当前行数据`);
          updateCurrentLineData(editor);
        }
      }

      const cursorPosition = editor.selection.active;
      const cursorRowIndex = cursorPosition.line + 1;
      // 使用编辑器的实际行数作为总行数
      const actualTotalLines = editor.document.lineCount;

      const editorEvent: EditorChangeEvent = {
        type: 'editorChange',
        timestamp: Date.now(),
        source: 'editor',
        editor,
        headers: currentExcelData?.headers || [],
        headerRowIndex,
        cursorRowIndex,
        totalColumns: currentExcelData?.totalColumns || 0,
        totalLines: actualTotalLines,
        isEditingForm,
        isEditorChangeFromExtension
      };

      syncManager.emit(editorEvent);
      
      // 直接更新侧边栏数据，确保总行数实时同步
      if (currentExcelData) {
        sidebarProvider.setData(currentExcelData, filePath, headerRowIndex);
      }
    };

    const openExcel = async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb'],
          'All Files': ['*']
        }
      });

      if (fileUri && fileUri[0]) {
        const filePath = fileUri[0].fsPath;
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
      }
    };

    const toggleStatus = async () => {
      await togglePluginStatus();
    };

    const addRow = async (rowData?: any, copyCurrentRow?: boolean) => {
      if (!currentEditor || !currentExcelData) {
        vscode.window.showWarningMessage('请先打开Excel文件');
        return;
      }

      const document = currentEditor.document;
      const lastLine = document.lineAt(document.lineCount - 1);
      const endPosition = lastLine.range.end;

      let newRow = '';
      
      if (copyCurrentRow) {
        // 复制当前光标所在行的数据到最后一行
        const currentPosition = currentEditor.selection.active;
        const currentLine = document.lineAt(currentPosition.line);
        newRow = currentLine.text;
        console.log('[ExcelExtension] 复制当前行数据到最后一行:', newRow);
      } else {
        // 原有逻辑：从表单数据创建新行
        newRow = currentExcelData.headers.map((header, index) => {
          return rowData?.[header] || '';
        }).join('\t');
      }

      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, endPosition, '\n' + newRow);

      try {
        await vscode.workspace.applyEdit(edit).then(async success => {
          try {
            if (success && currentEditor) {
              if (currentExcelData) {
                // 如果是复制当前行，需要更新内存中的数据
                if (copyCurrentRow) {
                  const currentPosition = currentEditor.selection.active;
                  const currentLineIndex = currentPosition.line;
                  
                  // 获取当前行的数据
                  if (currentLineIndex >= 0 && currentLineIndex < currentExcelData.rows.length) {
                    const currentRowData = [...currentExcelData.rows[currentLineIndex]];
                    currentExcelData.rows.push(currentRowData);
                  }
                } else {
                  currentExcelData.rows.push(currentExcelData.headers.map(() => ''));
                }
              }
              
              // 使用EditorUtils将光标移动到新添加的行
              const newLineNumber = currentEditor.document.lineCount;
              await EditorUtils.gotoLine(newLineNumber, currentEditor);
            }
          } catch (error) {
            console.error('[ExcelExtension] addRow applyEdit then 回调错误:', error);
          }
        }, (error: any) => {
          console.error('[ExcelExtension] addRow applyEdit Promise 错误:', error);
        });
      } catch (error) {
        console.error('[ExcelExtension] addRow applyEdit 调用错误:', error);
      }
    };

    const updateCell = async (lineNumber: number, column: string, value: string, columnIndex: number) => {
      try {
        if (!currentExcelData || !currentEditor) {
          return;
        }

        isEditingForm = true;
        const cursorRowIndex = lineNumber;

        // 实际更新编辑器中的内容
        const document = currentEditor.document;
        const lineIndex = lineNumber - 1;
        
        if (lineIndex >= 0 && lineIndex < document.lineCount) {
          const line = document.lineAt(lineIndex);
          const lineText = line.text;
          
          // 解析行数据
          const cells = lineText.includes('\t') ? lineText.split('\t') : lineText.split(',');
          
          // 使用传递的列索引，而不是通过表头名称查找
          if (columnIndex >= 0) {
            // 确保cells数组有足够的长度
            while (cells.length <= columnIndex) {
              cells.push('');
            }
            
            // 更新单元格值
            cells[columnIndex] = value;
            
            // 重新组合行数据
            const newLineText = cells.join('\t');
            
            // 创建编辑操作
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, line.range, newLineText);
            
            // 应用编辑
            await vscode.workspace.applyEdit(edit);
          }
        }

        const formEvent: FormChangeEvent = {
          type: 'formChange',
          timestamp: Date.now(),
          source: 'form',
          editor: currentEditor,
          headers: currentExcelData.headers,
          headerRowIndex,
          cursorRowIndex,
          rowIndex: lineNumber - headerRowIndex,
          column,
          value,
          isEditingForm,
          isEditorChangeFromExtension: true
        };

        isEditorChangeFromExtension = true;

        syncManager.emit(formEvent);

        try {
          setTimeout(() => {
            try {
              isEditorChangeFromExtension = false;
              isEditingForm = false;
            } catch (error) {
              console.error('[ExcelExtension] setTimeout 回调错误:', error);
            }
          }, 50);
        } catch (error) {
          console.error('[ExcelExtension] setTimeout 设置错误:', error);
        }
      } catch (error) {
        console.error('[ExcelExtension] updateCell 错误:', error);
      }
    };

    const headerRowChanged = async (newHeaderRowIndex: number) => {
      try {
        // 确保表头行值不小于1
        let validatedHeaderRowIndex = Math.max(1, newHeaderRowIndex);
        
        // 确保表头行值不大于总行数
        if (currentEditor) {
          const totalLines = currentEditor.document.lineCount;
          validatedHeaderRowIndex = Math.min(validatedHeaderRowIndex, totalLines);
        }

        headerRowIndex = validatedHeaderRowIndex;

        if (currentEditor) {
          // 重新解析编辑器内容，获取新的表头数据
          const editorData = parseEditorContent(currentEditor);
          if (editorData) {
            currentExcelData = editorData;
          }
          
          const headerEvent: HeaderChangeEvent = {
            type: 'headerChange',
            timestamp: Date.now(),
            source: 'system',
            headers: currentExcelData?.headers || [],
            headerRowIndex
          };

          syncManager.emit(headerEvent);
          
          // 更新当前行数据
          // 注意：这里不调用updateCurrentLineData，因为可能会导致表单闪烁
          // 我们只需要更新表头，不需要重新填充表单
        }
      } catch (error) {
        console.error('[ExcelExtension] headerRowChanged 错误:', error);
      }
    };

    const currentRowChanged = async (currentRowValue: number) => {
      try {
        if (!currentEditor || !currentExcelData) {
          return;
        }

        console.log(`[ExcelExtension] currentRowChanged 接收到行号: ${currentRowValue}`);
        
        // 使用EditorUtils将光标移动到指定行
        await EditorUtils.gotoLine(currentRowValue, currentEditor);

        const cursorPosition = currentEditor.selection.active;
        const cursorRowIndex = cursorPosition.line + 1;

        const inputEvent: CurrentRowInputChangeEvent = {
          type: 'currentRowInputChange',
          timestamp: Date.now(),
          source: 'form',
          editor: currentEditor,
          headers: currentExcelData.headers,
          headerRowIndex,
          currentRowInputValue: currentRowValue,
          isUpdatingFromExtension: false
        };

        const cursorEvent: CurrentRowInputToCursorEvent = {
          type: 'currentRowInputToCursor',
          timestamp: Date.now(),
          source: 'form',
          editor: currentEditor,
          currentRowValue,
          isUpdatingFromExtension: false
        };

        syncManager.emit(inputEvent);
        syncManager.emit(cursorEvent);
      } catch (error) {
        console.error('[ExcelExtension] currentRowChanged 错误:', error);
      }
    };

    const showSidebar = () => {
      vscode.commands.executeCommand('workbench.view.extension.excel-plugin');
    };

    const hideSidebar = () => {
      vscode.commands.executeCommand('workbench.action.closeSidebar');
    };

    const activatePlugin = async () => {
      if (!isExtensionActive) {
        await togglePluginStatus();
      }
    };

    const deactivatePlugin = async () => {
      if (isExtensionActive) {
        await togglePluginStatus();
      }
    };

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('excelPlugin.sidebar', sidebarProvider),

      vscode.commands.registerCommand('excelPlugin.openExcel', openExcel),
      vscode.commands.registerCommand('excelPlugin.toggleStatus', toggleStatus),
      vscode.commands.registerCommand('excelPlugin.addRow', addRow),
      vscode.commands.registerCommand('excelPlugin.updateCell', updateCell),
      vscode.commands.registerCommand('excelPlugin.headerRowChanged', headerRowChanged),
      vscode.commands.registerCommand('excelPlugin.currentRowChanged', currentRowChanged),
      vscode.commands.registerCommand('excelPlugin.updateCurrentLineData', () => {
        if (currentEditor) {
          updateCurrentLineData(currentEditor);
        }
      }),
      vscode.commands.registerCommand('excelPlugin.reinitialize', () => {
        console.log('[ExcelExtension] 执行插件重新初始化');
        initializePlugin();
      }),
      vscode.commands.registerCommand('excelPlugin.showSidebar', showSidebar),
      vscode.commands.registerCommand('excelPlugin.hideSidebar', hideSidebar),
      vscode.commands.registerCommand('excelPlugin.activate', activatePlugin),
      vscode.commands.registerCommand('excelPlugin.deactivate', deactivatePlugin),

      vscode.window.onDidChangeActiveTextEditor(editor => {
        console.log('[ExcelExtension] 编辑器切换事件触发:', {
          editor: editor ? editor.document.fileName : 'undefined',
          editorType: editor ? editor.document.uri.scheme : 'undefined'
        });
        if (editor) {
          currentEditor = editor;
          autoLoadFile(editor);
        } else {
          console.log('[ExcelExtension] 编辑器为 undefined，清空数据');
          sidebarProvider.clearData();
        }
      }),

      vscode.window.onDidChangeTextEditorSelection(event => {
        try {
          if (event.textEditor === currentEditor) {
            handleCursorChange();
          }
        } catch (error) {
          console.error('[ExcelExtension] onDidChangeTextEditorSelection 错误:', error);
        }
      }),

      vscode.workspace.onDidChangeTextDocument(event => {
        try {
          handleTextChange(event);
        } catch (error) {
          console.error('[ExcelExtension] onDidChangeTextDocument 错误:', error);
        }
      }),

      vscode.workspace.onDidChangeConfiguration(event => {
        try {
          if (isUpdatingConfig) {
            console.log('[ExcelExtension] 配置正在更新中，跳过事件处理');
            return;
          }
          
          if (event.affectsConfiguration('excelPlugin.sync')) {
            syncManager.refreshConfig();
          }
          if (event.affectsConfiguration('excelPlugin.activateOnStart')) {
            const newActivateOnStart = config.get<boolean>('activateOnStart', true);
            if (newActivateOnStart !== isExtensionActive) {
              console.log(`[ExcelExtension] 配置变更，更新激活状态: ${isExtensionActive} → ${newActivateOnStart}`);
              isExtensionActive = newActivateOnStart;
              updateStatusBar();
              sidebarProvider.updateStatus(isExtensionActive);
              if (isExtensionActive) {
                // 如果切换到已激活状态，初始化插件
                initializePlugin();
              } else {
                // 如果切换到未激活状态，清空表单
                sidebarProvider.clearForm();
              }
            }
          }
        } catch (error) {
          console.error('[ExcelExtension] onDidChangeConfiguration 错误:', error);
        }
      }),

      statusBarItem
    );

    if (vscode.window.activeTextEditor) {
      currentEditor = vscode.window.activeTextEditor;
      autoLoadFile(currentEditor);
    }
  } catch (error) {
    console.error('[ExcelExtension] 激活扩展时发生错误:', error);
  }
}

export function deactivate() {
  console.log('Excel编辑器扩展已停用');
}
