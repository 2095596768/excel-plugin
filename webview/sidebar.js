(function() {
  const vscode = acquireVsCodeApi();
  let headers = [];
  let currentFile = '';
  let rowCount = 0;
  let currentRowIndex = -1;
  let currentLineNumber = 0;
  let isEditing = false;
  let formData = {};
  let isExtensionActive = true;
  let updateTimeouts = {};
  let lastUpdateTime = 0;
  let isUpdatingFromVSCode = false;
  let pendingUpdate = false;
  let isRenderingForm = false;
  
  // 初始化
  window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
      case 'data':
        handleData(message);
        break;
      case 'emptyData':
        handleEmptyData(message);
        break;
      case 'selectRow':
        selectRow(message.rowData, message.rowIndex, message.lineNumber);
        break;
      case 'clearForm':
        clearForm();
        break;
      case 'requestFormData':
        sendFormData();
        break;
    }
  });
  
  // 处理有数据的情况
  function handleData(data) {
    console.log('[Sidebar] 接收到数据:', {
      表头数: data.headers?.length || 0,
      文件: data.currentFile,
      行数: data.rowCount,
      当前行: data.currentLine
    });
    
    headers = data.headers || [];
    currentFile = data.currentFile || '';
    rowCount = data.rowCount || 0;
    currentLineNumber = data.currentLine || 0;
    isExtensionActive = data.isExtensionActive !== false;
    
    updateUI();
    if (isExtensionActive && headers.length > 0 && currentFile) {
      renderForm();
    } else {
      showEmptyState();
    }
  }
  
  // 处理无数据的情况
  function handleEmptyData(data) {
    console.log('[Sidebar] 接收到空数据');
    
    headers = [];
    currentFile = '';
    rowCount = 0;
    currentRowIndex = -1;
    currentLineNumber = 0;
    isExtensionActive = data.isExtensionActive !== false;
    
    updateUI();
    showEmptyState();
  }
  
  // 更新UI
  function updateUI() {
    const hasData = headers.length > 0 && isExtensionActive && currentFile;
    const emptyState = document.getElementById('emptyState');
    const formContainer = document.getElementById('formContainer');
    const fileInfo = document.getElementById('fileInfo');
    const fileStats = document.getElementById('fileStats');
    const statusIndicator = document.getElementById('statusIndicator');
    const addRowBtn = document.getElementById('addRowBtn');
    const mainContent = document.getElementById('mainContent');
    const openExcelBtn = document.getElementById('openExcelBtn');
    
    // 更新插件状态显示
    if (isExtensionActive) {
      statusIndicator.innerHTML = `
        <span>已激活</span>
        <span class="status-hotkey">Ctrl+0</span>
      `;
      statusIndicator.className = 'status-indicator active';
      
      if (addRowBtn) {
        addRowBtn.disabled = false;
        addRowBtn.textContent = '添加新行';
      }
      
      if (openExcelBtn) {
        openExcelBtn.disabled = false;
      }
    } else {
      statusIndicator.innerHTML = `
        <span>已关闭</span>
        <span class="status-hotkey">Ctrl+0</span>
      `;
      statusIndicator.className = 'status-indicator inactive';
      
      if (addRowBtn) {
        addRowBtn.disabled = true;
        addRowBtn.textContent = '插件已关闭';
      }
      
      if (openExcelBtn) {
        openExcelBtn.disabled = true;
      }
    }
    
    if (isExtensionActive && hasData) {
      // 有Excel数据
      emptyState.style.display = 'none';
      formContainer.style.display = 'block';
      mainContent.style.backgroundColor = 'transparent';
      
      if (currentFile) {
        const fileName = currentFile.split(/[\\/]/).pop();
        const filePath = currentFile;
        
        // 文件路径显示
        fileInfo.innerHTML = `
          <div><strong>${fileName}</strong></div>
          <div class="file-path">${filePath}</div>
        `;
      } else {
        fileInfo.innerHTML = '<div>未打开Excel文件</div>';
      }
      
      fileStats.innerHTML = `
        <span>行: ${rowCount}</span>
        <span>列: ${headers.length}</span>
        <span class="current-line">当前: ${currentLineNumber > 0 ? currentLineNumber : '无'}</span>
      `;

    } else if (isExtensionActive) {
      // 插件激活但没有Excel文件
      emptyState.style.display = 'flex';
      formContainer.style.display = 'none';
      mainContent.style.backgroundColor = 'var(--vscode-editorWidget-background)';
      
      fileInfo.innerHTML = '<div>未打开Excel文件</div>';
      fileStats.innerHTML = `
        <span>行: 0</span>
        <span>列: 0</span>
        <span class="current-line">当前: 无</span>
      `;
      
    } else {
      // 插件未激活
      emptyState.style.display = 'flex';
      formContainer.style.display = 'none';
      mainContent.style.backgroundColor = 'var(--vscode-editorWidget-background)';
      
      fileInfo.innerHTML = '<div>Excel编辑器已关闭</div>';
      fileStats.innerHTML = `
        <span>行: 0</span>
        <span>列: 0</span>
        <span class="current-line">当前: 无</span>
      `;
      
      // 清空表单
      clearForm();
    }
  }
  
  // 显示空状态
  function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const formContainer = document.getElementById('formContainer');
    
    emptyState.style.display = 'flex';
    formContainer.style.display = 'none';
    
    // 清空表单字段
    const formFields = document.getElementById('formFields');
    if (formFields) {
      formFields.innerHTML = '';
    }
  }
  
  // 渲染表单
  function renderForm() {
    const formFields = document.getElementById('formFields');
    if (!formFields) return;
    
    isRenderingForm = true;
    formFields.innerHTML = '';
    
    if (headers.length === 0 || !isExtensionActive) {
      formFields.innerHTML = '<p class="hint" style="text-align: center; padding: 20px;">暂无表头数据</p>';
      return;
    }
    
    console.log(`[Sidebar] 渲染表单，表头数量: ${headers.length}`);
    
    headers.forEach((header, index) => {
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      formGroup.id = `form-group-${index}`;
      
      const label = document.createElement('label');
      label.htmlFor = `input-${index}`;
      label.innerHTML = `
        <span>${header}</span>
        <span class="column-index">${getColumnLetter(index)}</span>
      `;
      
      const textarea = document.createElement('textarea');
      textarea.id = `input-${index}`;
      textarea.className = 'form-textarea';
      textarea.placeholder = `输入 ${header}`;
      textarea.dataset.column = header;
      textarea.dataset.columnIndex = index;
      textarea.rows = 3;
      
      // 自动调整高度
      const autoResize = (element) => {
        element.style.height = 'auto';
        const newHeight = Math.min(element.scrollHeight, 120);
        element.style.height = newHeight + 'px';
        element.style.overflowY = element.scrollHeight > 120 ? 'auto' : 'hidden';
      };
      
      // 输入事件处理 - 修复：确保能触发更新
      textarea.addEventListener('input', function() {
        autoResize(this);
        
        if (isUpdatingFromVSCode) {
          console.log(`[Sidebar] 跳过更新: 正在从VSCode更新`);
          return; // 如果是来自VSCode的更新，不发送消息
        }
        
        // 清除之前的超时
        if (updateTimeouts[header]) {
          clearTimeout(updateTimeouts[header]);
        }
        
        // 设置新的超时，防抖动处理
        updateTimeouts[header] = setTimeout(() => {
          const now = Date.now();
          if (now - lastUpdateTime < 100) { // 避免过于频繁
            return;
          }
          lastUpdateTime = now;
          
          // 更新对应单元格
          if (currentRowIndex >= 0) {
            console.log(`[Sidebar] 从表单更新单元格: 行${currentRowIndex}, 列"${header}", 值: "${this.value}"`);
            updateCell(currentRowIndex, header, this.value);
          } else {
            console.log(`[Sidebar] 无法更新单元格: currentRowIndex=${currentRowIndex}`);
          }
        }, 200);
      });
      
      // 绑定焦点事件
      textarea.addEventListener('focus', () => {
        isEditing = true;
        console.log('[Sidebar] 开始编辑表单');
        vscode.postMessage({
          type: 'startEditing'
        });
      });
      
      // 绑定失去焦点事件
      textarea.addEventListener('blur', () => {
        // 清除所有未完成的更新
        Object.keys(updateTimeouts).forEach(key => {
          clearTimeout(updateTimeouts[key]);
        });
        
        setTimeout(() => {
          isEditing = false;
          console.log('[Sidebar] 结束编辑表单');
          vscode.postMessage({
            type: 'endEditing'
          });
        }, 200);
      });
      
      formGroup.appendChild(label);
      formGroup.appendChild(textarea);
      formFields.appendChild(formGroup);
    });
    
    // 表单渲染完成
    setTimeout(() => {
      isRenderingForm = false;
    }, 10);
  }
  
  // 获取Excel列字母
  function getColumnLetter(index) {
    let letter = '';
    let i = index;
    
    while (i >= 0) {
      letter = String.fromCharCode(65 + (i % 26)) + letter;
      i = Math.floor(i / 26) - 1;
    }
    
    return letter || 'A';
  }
  
  // 选择行（填充表单）
  function selectRow(rowData, rowIndex, lineNumber) {
    if (isEditing || !isExtensionActive) {
      console.log(`[Sidebar] 跳过选择行: isEditing=${isEditing}, isExtensionActive=${isExtensionActive}`);
      return;
    }
    
    // 如果表单正在渲染，延迟执行selectRow
    if (isRenderingForm) {
      console.log(`[Sidebar] 表单正在渲染，延迟执行selectRow`);
      setTimeout(() => {
        selectRow(rowData, rowIndex, lineNumber);
      }, 50);
      return;
    }
    
    console.log(`[Sidebar] 选择行: 行索引${rowIndex}, 行号${lineNumber}, 数据:`, rowData);
    
    // 检查是否是有效的数据行
    if (rowIndex < 0) {
      // 表头行或其他无效行，清空表单
      console.log(`[Sidebar] 行索引无效，清空表单`);
      clearForm();
      return;
    }
    
    currentRowIndex = rowIndex;
    currentLineNumber = lineNumber;
    formData = { ...rowData };
    
    // 更新文件统计信息
    updateUI();
    
    // 清除所有未完成的更新
    Object.keys(updateTimeouts).forEach(key => {
      clearTimeout(updateTimeouts[key]);
    });
    
    // 标记为来自VSCode的更新
    isUpdatingFromVSCode = true;
    
    // 填充表单
    headers.forEach((header, index) => {
      const textarea = document.getElementById(`input-${index}`);
      if (textarea) {
        const value = rowData[header] || '';
        console.log(`[Sidebar] 填充字段 ${header}: "${value}"`);
        
        // 只有当值不同时才更新，避免触发input事件
        if (textarea.value !== value) {
          textarea.value = value;
          
          // 触发自动调整高度
          textarea.dispatchEvent(new Event('input'));
          
          // 设置title以便鼠标悬停时显示完整内容
          if (value.length > 50) {
            textarea.title = value;
          } else {
            textarea.title = '';
          }
        }
      }
    });
    
    // 重置标志
    setTimeout(() => {
      isUpdatingFromVSCode = false;
    }, 100);
  }
  
  // 清空表单
  function clearForm() {
    console.log('[Sidebar] 清空表单');
    
    currentRowIndex = -1;
    currentLineNumber = 0;
    isEditing = false;
    formData = {};
    
    // 更新文件统计信息
    updateUI();
    
    // 标记为来自VSCode的更新
    isUpdatingFromVSCode = true;
    
    // 清空所有输入框
    headers.forEach((header, index) => {
      const textarea = document.getElementById(`input-${index}`);
      if (textarea) {
        textarea.value = '';
        textarea.title = '';
        textarea.style.height = 'auto';
      }
    });
    
    // 重置标志
    setTimeout(() => {
      isUpdatingFromVSCode = false;
    }, 100);
  }
  
  // 添加新行
  window.addRow = function() {
    if (!isExtensionActive) {
      console.log('[Sidebar] 插件未激活，无法添加行');
      return;
    }
    
    if (headers.length === 0) {
      vscode.postMessage({
        type: 'openExcel'
      });
      return;
    }
    
    const rowData = {};
    let hasData = false;
    
    headers.forEach((header, index) => {
      const textarea = document.getElementById(`input-${index}`);
      if (textarea) {
        rowData[header] = textarea.value;
        if (textarea.value.trim() !== '') {
          hasData = true;
        }
      }
    });
    
    if (!hasData) {
      console.log('[Sidebar] 请输入至少一个字段的值');
      return;
    }
    
    console.log('[Sidebar] 添加新行:', rowData);
    vscode.postMessage({
      type: 'addRow',
      rowData: rowData
    });
  };
  
  // 打开Excel文件
  window.openExcel = function() {
    vscode.postMessage({
      type: 'openExcel'
    });
  };
  
  // 更新单元格
  function updateCell(rowIndex, column, value) {
    console.log(`[Sidebar] 发送更新单元格消息: 行${rowIndex}, 列"${column}", 值: "${value}"`);
    
    // 验证数据
    if (rowIndex === undefined || rowIndex === null || rowIndex < 0) {
      console.error(`[Sidebar] 无效的行索引: ${rowIndex}`);
      return;
    }
    
    if (!column || typeof column !== 'string') {
      console.error(`[Sidebar] 无效的列名: ${column}`);
      return;
    }
    
    vscode.postMessage({
      type: 'updateCell',
      rowIndex: rowIndex,
      column: column,
      value: value || ''  // 确保值不是undefined
    });
  }
  
  // 发送表单数据
  function sendFormData() {
    const rowData = {};
    headers.forEach((header, index) => {
      const textarea = document.getElementById(`input-${index}`);
      if (textarea) {
        rowData[header] = textarea.value || '';
      }
    });
    
    vscode.postMessage({
      type: 'formDataResponse',
      formData: rowData
    });
  }
  
  // 初始加载
  setTimeout(() => {
    console.log('[Sidebar] 初始化完成');
  }, 100);
})();