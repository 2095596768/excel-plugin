(function() {
  let vscode = null;
  let headers = [];
  let firstRowHeaders = [];
  let currentFile = '';
  let rowCount = 0;
  let totalColumns = 0;
  let totalLines = 0;
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
  let headerRowIndex = 1;
  let headerRowInputInitialized = false;
  let currentRowInputValue = 1;
  let currentRowInputInitialized = false;
  let isUpdatingFromVSCodeForCurrentRow = false;
  let isFormRendered = false;
  let pendingSelectRowData = null;
  
  // 初始化智能抖动系统
  let smartDebouncer = null;
  
  // 加载智能抖动系统
  function loadSmartDebouncer() {
    try {
      // 检查是否已经在全局作用域中定义
      if (typeof window.SmartDebouncer === 'function') {
        smartDebouncer = new window.SmartDebouncer();
        console.log('[Sidebar] 智能抖动系统已加载');
      } else {
        console.warn('[Sidebar] 智能抖动系统未加载，使用默认防抖');
        // 降级到简单防抖
        smartDebouncer = {
          registerField: () => {},
          unregisterField: () => {},
          debounce: (field, value, callback) => {
            setTimeout(callback, 300);
          },
          clear: () => {},
          dispose: () => {}
        };
      }
    } catch (error) {
      console.error('[Sidebar] 加载智能抖动系统时出错:', error);
      // 降级到简单防抖
      smartDebouncer = {
        registerField: () => {},
        unregisterField: () => {},
        debounce: (field, value, callback) => {
          setTimeout(callback, 300);
        },
        clear: () => {},
        dispose: () => {}
      };
    }
  }
  
  // 加载智能抖动系统
  loadSmartDebouncer();
  
  // 安全地获取 VSCode API
  try {
    vscode = acquireVsCodeApi();
  } catch (error) {
    console.error('[Sidebar] 无法获取 VSCode API:', error);
    return;
  }
  
  if (!vscode) {
    console.error('[Sidebar] VSCode API 不可用');
    return;
  }
  
  console.log('[Sidebar] 脚本已加载，VSCode API 可用');
  
  // 初始化
  window.addEventListener('message', event => {
    console.log('[Sidebar] 收到消息:', event.data.type, event.data);
    console.log('[Sidebar] 消息详情:', JSON.stringify(event.data));
    console.log('[Sidebar] 当前状态:', {
      isExtensionActive,
      isFormRendered,
      isRenderingForm,
      isEditing,
      currentLineNumber,
      headersLength: headers.length
    });
    try {
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
        case 'updateHeaders':
          console.log('[Sidebar] 收到更新表头消息:', message.headers);
          updateHeadersOnly(message.headers);
          break;
        case 'refresh':
          console.log('[Sidebar] 收到刷新消息');
          break;
        case 'loadFormTemplate':
          loadFormTemplate(message.formTemplate);
          break;
        case 'updateCurrentRowInput':
          updateCurrentRowInput(message.currentLineNumber);
          break;
        case 'headerRowChanged':
          console.log('[Sidebar] 收到表头行变化消息:', message.headerRowIndex);
          if (message.headerRowIndex) {
            headerRowIndex = message.headerRowIndex;
            const headerRowInput = document.getElementById('headerRowInput');
            if (headerRowInput) {
              headerRowInput.value = message.headerRowIndex;
            }
            updateUI();
            // 重新渲染表单，使用新的表头行数据
            renderForm();
          }
          break;
        case 'editorChange':
          console.log('[Sidebar] 收到编辑器变化消息:', {
            totalLines: message.totalLines,
            totalColumns: message.totalColumns,
            cursorRowIndex: message.cursorRowIndex
          });
          // 更新总列数和总行数
          if (message.totalColumns !== undefined) {
            totalColumns = message.totalColumns;
          }
          if (message.totalLines !== undefined) {
            totalLines = message.totalLines;
          }
          // 更新当前行
          if (message.cursorRowIndex !== undefined) {
            currentLineNumber = message.cursorRowIndex;
            currentRowInputValue = message.cursorRowIndex;
          }
          // 更新UI和表头行选择器的最大值
          updateUI();
          updateHeaderRowSelectorMax();
          updateCurrentRowSelectorMax();
          break;
        case 'status':
          console.log('[Sidebar] 收到状态更新消息:', message.isExtensionActive);
          isExtensionActive = message.isExtensionActive;
          updateUI();
          break;
      }
    } catch (error) {
      console.error('[Sidebar] 处理消息时出错:', error);
    }
  });
  
  // 加载表单模板
  function loadFormTemplate(formTemplate) {
    const formPlaceholder = document.getElementById('formPlaceholder');
    if (formPlaceholder && formTemplate) {
      // 设置 formPlaceholder 样式以支持 flex 布局
      formPlaceholder.style.display = 'flex';
      formPlaceholder.style.flexDirection = 'column';
      formPlaceholder.style.height = '100%';
      formPlaceholder.style.width = '100%';
      
      formPlaceholder.innerHTML = formTemplate;
      console.log('[Sidebar] 表单模板加载完成');
      
      // 确保 formWrapper 有正确的样式
      const formWrapper = document.getElementById('formWrapper');
      if (formWrapper) {
        formWrapper.style.display = 'flex';
        formWrapper.style.flexDirection = 'column';
        formWrapper.style.height = '100%';
        formWrapper.style.width = '100%';
        formWrapper.style.overflow = 'hidden';
        console.log('[Sidebar] 表单包装器样式已设置');
      }
      
      // 模板加载后，如果有数据，立即渲染表单
      if (headers.length > 0 && isExtensionActive && currentFile) {
        console.log('[Sidebar] 模板加载后立即渲染表单');
        renderForm();
        
        // 渲染完成后，如果有待处理的 selectRow 数据，处理它
        setTimeout(() => {
          if (pendingSelectRowData && isFormRendered) {
            console.log('[Sidebar] 处理待处理的 selectRow 数据');
            selectRow(
              pendingSelectRowData.rowData,
              pendingSelectRowData.rowIndex,
              pendingSelectRowData.lineNumber
            );
            pendingSelectRowData = null;
          }
        }, 60);
      }
    }
  }
  
  // 初始化表首行选择器
  function initHeaderRowSelector() {
    const headerRowInput = document.getElementById('headerRowInput');
    if (headerRowInput && !headerRowInputInitialized) {
      headerRowInput.value = headerRowIndex;
      
      console.log(`[Sidebar] 初始化表首行选择器: 值=${headerRowIndex}`);
      
      let headerRowInputDebounceTimer = null;
      
      headerRowInput.addEventListener('input', function() {
        const newValue = parseInt(this.value);
        
        if (headerRowInputDebounceTimer) {
          clearTimeout(headerRowInputDebounceTimer);
        }
        
        headerRowInputDebounceTimer = setTimeout(() => {
          try {
            // 使用totalLines作为最大值，确保表头行值不超过文件总行数
            // totalLines已经是内存中的数据，优先使用
            const maxHeaderRow = totalLines > 0 ? totalLines : 1;
            if (!isNaN(newValue)) {
              // 如果输入值大于总行数，自动更新为总行数
              if (newValue > maxHeaderRow) {
                headerRowIndex = maxHeaderRow;
                console.log(`[Sidebar] 表首行值大于总行数，自动设置为: ${headerRowIndex}`);
                // 更新输入框值
                headerRowInput.value = headerRowIndex;
              } else if (newValue >= 1) {
                headerRowIndex = newValue;
                console.log(`[Sidebar] 表首行设置为: ${headerRowIndex}`);
              }
              
              // 发送表头行变化事件
              vscode.postMessage({
                type: 'headerRowChanged',
                headerRowIndex: headerRowIndex
              });
            }
          } catch (error) {
            console.error('[Sidebar] headerRowInput setTimeout 错误:', error);
          }
        }, 50);
      });
      
      // 添加失去焦点事件监听
      headerRowInput.addEventListener('blur', function() {
        try {
          // 如果输入框内容为空，自动填充为第一行
          if (this.value.trim() === '') {
            headerRowIndex = 1;
            this.value = headerRowIndex;
            console.log(`[Sidebar] 表首行输入框为空，自动设置为: ${headerRowIndex}`);
            
            // 发送表头行变化事件
            vscode.postMessage({
              type: 'headerRowChanged',
              headerRowIndex: headerRowIndex
            });
          }
        } catch (error) {
          console.error('[Sidebar] headerRowInput blur 错误:', error);
        }
      });
      
      headerRowInputInitialized = true;
    }
  }
  
  // 初始化当前行选择器
  function initCurrentRowSelector() {
    const currentRowInput = document.getElementById('currentRowInput');
    if (currentRowInput && !currentRowInputInitialized) {
      currentRowInput.value = currentRowInputValue;
      
      console.log(`[Sidebar] 初始化当前行选择器: 值=${currentRowInputValue}`);
      
      let currentRowInputDebounceTimer = null;
      
      currentRowInput.addEventListener('input', function() {
        const newValue = parseInt(this.value);
        
        if (currentRowInputDebounceTimer) {
          clearTimeout(currentRowInputDebounceTimer);
        }
        
        currentRowInputDebounceTimer = setTimeout(() => {
          try {
            if (!isUpdatingFromVSCodeForCurrentRow && !isNaN(newValue)) {
              const maxCurrentRow = totalLines > 0 ? totalLines : 1;
              
              // 如果输入值大于总行数，自动更新为总行数
              if (newValue > maxCurrentRow) {
                currentRowInputValue = maxCurrentRow;
                console.log(`[Sidebar] 当前行值大于总行数，自动设置为: ${currentRowInputValue}`);
                // 更新输入框值
                currentRowInput.value = currentRowInputValue;
              } else if (newValue >= 1) {
                currentRowInputValue = newValue;
                console.log(`[Sidebar] 当前行设置为: ${currentRowInputValue}`);
              }
              
              // 发送当前行变化事件
              vscode.postMessage({
                type: 'currentRowChanged',
                currentRowValue: currentRowInputValue
              });
            } else if (!isNaN(newValue)) {
              console.log(`[Sidebar] 无效的当前行值: ${newValue}, 有效范围: 1-${totalLines}`);
            }
          } catch (error) {
            console.error('[Sidebar] currentRowInput setTimeout 错误:', error);
          }
        }, 50);
      });
      
      // 添加失去焦点事件监听
      currentRowInput.addEventListener('blur', function() {
        try {
          // 如果输入框内容为空，自动填充为第一行
          if (this.value.trim() === '') {
            currentRowInputValue = 1;
            this.value = currentRowInputValue;
            console.log(`[Sidebar] 当前行输入框为空，自动设置为: ${currentRowInputValue}`);
            
            // 发送当前行变化事件
            vscode.postMessage({
              type: 'currentRowChanged',
              currentRowValue: currentRowInputValue
            });
          }
        } catch (error) {
          console.error('[Sidebar] currentRowInput blur 错误:', error);
        }
      });
      
      currentRowInputInitialized = true;
    }
    
    updateCurrentRowSelectorMax();
  }
  
  // 更新当前行选择器的最大值
  function updateCurrentRowSelectorMax() {
    const currentRowInput = document.getElementById('currentRowInput');
    
    if (currentRowInput) {
      const newMax = totalLines > 0 ? totalLines : 1;
      currentRowInput.max = newMax;
      console.log(`[Sidebar] 更新当前行选择器最大值为: ${newMax}`);
      
      if (currentRowInputValue > newMax) {
        currentRowInputValue = newMax;
        currentRowInput.value = newMax;
        console.log(`[Sidebar] 当前行值调整为: ${currentRowInputValue}`);
      } else if (currentLineNumber > 0) {
        currentRowInput.value = currentLineNumber;
        currentRowInputValue = currentLineNumber;
        console.log(`[Sidebar] 当前行值设置为: ${currentRowInputValue}`);
      } else {
        console.log(`[Sidebar] 跳过更新当前行输入框: currentLineNumber=${currentLineNumber}, currentRowInputValue=${currentRowInputValue}`);
      }
    } else {
      console.log(`[Sidebar] 当前行选择器元素未找到`);
    }
  }
  
  // 更新表首行选择器的最大值
  function updateHeaderRowSelectorMax() {
    const headerRowInput = document.getElementById('headerRowInput');
    
    if (headerRowInput) {
      const newMax = totalLines > 0 ? totalLines : 1;
      headerRowInput.max = newMax;
      console.log(`[Sidebar] 更新表首行选择器最大值为: ${newMax}`);
      
      if (headerRowIndex > newMax) {
        headerRowIndex = newMax;
        headerRowInput.value = newMax;
        console.log(`[Sidebar] 表首行值调整为: ${headerRowIndex}`);
      } else {
        console.log(`[Sidebar] 表首行值保持不变: ${headerRowIndex}`);
      }
    } else {
      console.log(`[Sidebar] 表首行选择器元素未找到`);
    }
  }
  
  // 更新当前行输入框的值
  function updateCurrentRowInput(newCurrentLineNumber) {
    const currentRowInput = document.getElementById('currentRowInput');
    if (currentRowInput) {
      isUpdatingFromVSCodeForCurrentRow = true;
      currentRowInput.value = newCurrentLineNumber;
      currentRowInputValue = newCurrentLineNumber;
      console.log(`[Sidebar] 更新当前行输入框值为: ${newCurrentLineNumber}`);
      
      try {
        // 更新当前行索引
        currentLineNumber = newCurrentLineNumber;
        
        // 不要重新渲染表单，因为updateCurrentLineData已经调用了selectRow更新了表单数据
        // 重新渲染会覆盖已经更新的表单数据
        
        setTimeout(() => {
          try {
            isUpdatingFromVSCodeForCurrentRow = false;
          } catch (error) {
            console.error('[Sidebar] updateCurrentRowInput setTimeout 错误:', error);
          }
        }, 100);
      } catch (error) {
        console.error('[Sidebar] updateCurrentRowInput 错误:', error);
      }
    }
  }
  
  // 处理有数据的情况
  function handleData(data) {
    console.log('[Sidebar] 接收数据:', {
      表头数: data.headers?.length || 0,
      文件: data.currentFile,
      行数: data.rowCount,
      总行数: data.totalLines,
      总列数: data.totalColumns,
      当前行: data.currentLine,
      表头行: data.headerRowIndex
    });
    
    headers = data.headers || [];
    currentFile = data.currentFile || '';
    rowCount = data.rowCount || 0;
    totalColumns = data.totalColumns || headers.length;
    totalLines = data.totalLines || 0;
    currentLineNumber = data.currentLine || 0;
    currentRowInputValue = data.currentLine || 1;
    isExtensionActive = data.isExtensionActive !== false;
    
    // 存储第一行表头用于固定占位符文本
    if (data.firstRowHeaders && Array.isArray(data.firstRowHeaders)) {
      firstRowHeaders = data.firstRowHeaders;
    } else {
      firstRowHeaders = [];
    }
    
    // 使用从后端传来的表头行值
    headerRowIndex = data.headerRowIndex || totalLines;
    
    // 确保表头行值不大于总行数
    if (headerRowIndex > totalLines) {
      headerRowIndex = totalLines;
    }
    
    // 同步表头行值到输入框
    const headerRowInput = document.getElementById('headerRowInput');
    if (headerRowInput) {
      headerRowInput.value = headerRowIndex;
    }
    
    updateUI();
    
    // 检查表单模板是否已加载
    const formWrapper = document.getElementById('formWrapper');
    if (isExtensionActive && headers.length > 0 && currentFile) {
      if (formWrapper) {
        console.log('[Sidebar] 表单模板已加载，渲染表单');
        renderForm();
        try {
          setTimeout(() => {
            try {
              initHeaderRowSelector();
              initCurrentRowSelector();
              
              // 如果当前行大于0，尝试获取并填充当前行数据
              if (currentLineNumber > 0) {
                console.log('[Sidebar] 尝试获取当前行数据:', currentLineNumber);
                // 发送消息到后端，请求当前行数据
                vscode.postMessage({
                  type: 'requestCurrentRowData',
                  currentLine: currentLineNumber
                });
              }
            } catch (error) {
              console.error('[Sidebar] handleData setTimeout 回调错误:', error);
            }
          }, 50);
        } catch (error) {
          console.error('[Sidebar] handleData setTimeout 设置错误:', error);
        }
      } else {
        console.log('[Sidebar] 表单模板未加载，等待模板加载');
      }
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
    const formWrapper = document.getElementById('formWrapper');
    const formPlaceholder = document.getElementById('formPlaceholder');
    const fileInfo = document.getElementById('fileInfo');
    const fileStats = document.getElementById('fileStats');
    const statusIndicator = document.getElementById('statusIndicator');
    const addRowBtn = document.getElementById('addRowBtn');
    const mainContent = document.getElementById('mainContent');
    const openExcelBtn = document.getElementById('openExcelBtn');
    
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
      emptyState.style.display = 'none';
      if (formWrapper) {
        formWrapper.style.display = 'flex';
      }
      if (formPlaceholder) {
        formPlaceholder.style.display = 'flex';
      }
      mainContent.style.backgroundColor = 'transparent';
      
      if (currentFile) {
        const fileName = currentFile.split(/[\\/]/).pop();
        const filePath = currentFile;
        
        fileInfo.innerHTML = `
          <div><strong>${fileName}</strong></div>
          <div class="file-path">${filePath}</div>
        `;
      } else {
        fileInfo.innerHTML = '<div>未打开Excel文件</div>';
      }
      
      fileStats.innerHTML = `
        <span>总行: ${totalLines}</span>
        <span>总列: ${totalColumns}</span>
        <span class="current-line">当前: ${currentLineNumber > 0 ? currentLineNumber : '无'}</span>
      `;

    } else if (isExtensionActive) {
      emptyState.style.display = 'flex';
      if (formWrapper) {
        formWrapper.style.display = 'none';
      }
      if (formPlaceholder) {
        formPlaceholder.style.display = 'none';
      }
      mainContent.style.backgroundColor = 'var(--vscode-editorWidget-background)';
      
      fileInfo.innerHTML = '<div>未打开Excel文件</div>';
      fileStats.innerHTML = `
        <span>总行: 0</span>
        <span>总列: 0</span>
        <span class="current-line">当前: 无</span>
      `;
      
    } else {
      emptyState.style.display = 'flex';
      if (formWrapper) {
        formWrapper.style.display = 'none';
      }
      if (formPlaceholder) {
        formPlaceholder.style.display = 'none';
      }
      mainContent.style.backgroundColor = 'var(--vscode-editorWidget-background)';
      
      fileInfo.innerHTML = '<div>Excel编辑器已关闭</div>';
      fileStats.innerHTML = `
        <span>总行: 0</span>
        <span>总列: 0</span>
        <span class="current-line">当前: 无</span>
      `;
      
      clearForm();
    }
  }
  
  // 显示空状态
  function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const formWrapper = document.getElementById('formWrapper');
    
    emptyState.style.display = 'flex';
    if (formWrapper) {
      formWrapper.style.display = 'none';
    }
    
    const formFields = document.getElementById('formFields');
    if (formFields) {
      formFields.innerHTML = '';
    }
  }
  
  // 仅更新表头名称，不影响输入框的值
  function updateHeadersOnly(newHeaders) {
    const formFields = document.getElementById('formFields');
    if (!formFields) {
      console.log('[Sidebar] formFields 不存在，表单未渲染，跳过更新表头');
      return;
    }
    
    console.log(`[Sidebar] 仅更新表头名称，新表头数量: ${newHeaders.length}`);
    console.log(`[Sidebar] 当前行号: ${currentLineNumber}, 表首行: ${headerRowIndex}, 当前行索引: ${currentRowIndex}`);
    
    headers = newHeaders;
    
    const newRowIndex = currentLineNumber - headerRowIndex;
    console.log(`[Sidebar] 根据新表首行重新计算行索引: ${newRowIndex}`);
    
    currentRowIndex = newRowIndex;
    
    newHeaders.forEach((header, index) => {
      const formGroup = document.getElementById(`form-group-${index}`);
      if (formGroup) {
        const label = formGroup.querySelector('label');
        if (label) {
          const headerSpan = label.querySelector('span:first-child');
          if (headerSpan) {
            headerSpan.textContent = header;
          }
        }
        
        const textarea = formGroup.querySelector('textarea');
        if (textarea) {
          textarea.dataset.column = header;
          // 使用第一行表头作为固定占位符文本
          let placeholderHeader = firstRowHeaders[index] || `Column ${index + 1}`;
          textarea.placeholder = `输入 ${placeholderHeader}`;
        }
      }
    });
    
    console.log('[Sidebar] 表头名称更新完成，行索引已更新');
  }
  
  // 渲染表单
  function renderForm() {
    const formFields = document.getElementById('formFields');
    if (!formFields) return;
    
    isRenderingForm = true;
    
    const currentFormData = {};
    if (totalColumns > 0) {
      for (let index = 0; index < totalColumns; index++) {
        const textarea = document.getElementById(`input-${index}`);
        if (textarea) {
          currentFormData[index] = textarea.value;
        }
      }
    }
    
    formFields.innerHTML = '';
    
    if (totalColumns === 0 || !isExtensionActive) {
      formFields.innerHTML = '<p class="hint" style="text-align: center; padding: 20px;">暂无表头数据</p>';
      return;
    }
    
    console.log(`[Sidebar] 渲染表单，表头数量: ${headers.length}, 总列数: ${totalColumns}, 表首行: ${headerRowIndex}`);
    
    // 使用总列数来渲染表单项
    for (let index = 0; index < totalColumns; index++) {
      // 获取表头名称，如果没有则使用默认名称
      let header = headers[index] || `Column ${index + 1}`;
      
      // 获取第一行表头用于固定占位符文本
      let placeholderHeader = firstRowHeaders[index] || `Column ${index + 1}`;
      
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
      textarea.placeholder = `输入 ${placeholderHeader}`;
      textarea.dataset.column = header;
      textarea.dataset.columnIndex = index;
      textarea.rows = 3;
      
      const autoResize = (element) => {
        element.style.height = 'auto';
        // 估算每行的高度（约20px）
        const lineHeight = 20;
        const minHeight = lineHeight * 3; // 3行
        const maxHeight = lineHeight * 6; // 6行
        
        // 计算实际需要的高度
        const newHeight = Math.min(element.scrollHeight, maxHeight);
        const finalHeight = Math.max(newHeight, minHeight);
        
        element.style.height = finalHeight + 'px';
        element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
      };
      
      // 注册字段到智能抖动系统
      smartDebouncer.registerField(header, {
        type: index < 3 ? 'key' : 'normal',
        priority: index < 3 ? 1 : 0
      });
      
      textarea.addEventListener('input', function() {
        autoResize(this);
        
        if (isUpdatingFromVSCode) {
          console.log(`[Sidebar] 跳过更新: 正在从VSCode更新`);
          return;
        }
        
        const field = this.dataset.column;
        const columnIndex = parseInt(this.dataset.columnIndex) || 0;
        const textareaElement = this;
        
        // 清除之前的定时器
        if (textareaElement.debounceTimer) {
          clearTimeout(textareaElement.debounceTimer);
        }
        
        // 设置新的定时器，使用简单的防抖
        textareaElement.debounceTimer = setTimeout(() => {
          try {
            const latestValue = textareaElement.value;
            console.log(`[Sidebar] 从表单更新单元格: 行号${currentLineNumber}, 列"${field}", 列索引${columnIndex}, 值: "${latestValue}"`);
            updateCell(currentLineNumber, field, latestValue, columnIndex);
          } catch (error) {
            console.error('[Sidebar] 防抖更新错误:', error);
          }
        }, 300);
      });
      
      textarea.addEventListener('focus', () => {
        isEditing = true;
        console.log('[Sidebar] 开始编辑表单');
        vscode.postMessage({
          type: 'startEditing'
        });
      });
      
      textarea.addEventListener('blur', () => {
        Object.keys(updateTimeouts).forEach(key => {
          clearTimeout(updateTimeouts[key]);
        });
        
        try {
          setTimeout(() => {
            try {
              isEditing = false;
              console.log('[Sidebar] 结束编辑表单');
              vscode.postMessage({
                type: 'endEditing'
              });
            } catch (error) {
              console.error('[Sidebar] textarea blur setTimeout 回调错误:', error);
            }
          }, 50);
        } catch (error) {
          console.error('[Sidebar] textarea blur setTimeout 设置错误:', error);
        }
      });
      
      formGroup.appendChild(label);
      formGroup.appendChild(textarea);
      formFields.appendChild(formGroup);
    }
    
    try {
      setTimeout(() => {
        try {
          isRenderingForm = false;
          isFormRendered = true;
          
          if (Object.keys(currentFormData).length > 0) {
            for (let index = 0; index < totalColumns; index++) {
              const textarea = document.getElementById(`input-${index}`);
              if (textarea && currentFormData[index] !== undefined) {
                textarea.value = currentFormData[index];
                const autoResize = (element) => {
                  element.style.height = 'auto';
                  // 估算每行的高度（约20px）
                  const lineHeight = 20;
                  const minHeight = lineHeight * 3; // 3行
                  const maxHeight = lineHeight * 6; // 6行
                  
                  // 计算实际需要的高度
                  const newHeight = Math.min(element.scrollHeight, maxHeight);
                  const finalHeight = Math.max(newHeight, minHeight);
                  
                  element.style.height = finalHeight + 'px';
                  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
                };
                autoResize(textarea);
              }
            }
            console.log('[Sidebar] 表单渲染完成，已恢复数据');
          }
          
          if (pendingSelectRowData) {
            console.log('[Sidebar] 处理待处理的 selectRow 数据');
            selectRow(
              pendingSelectRowData.rowData,
              pendingSelectRowData.rowIndex,
              pendingSelectRowData.lineNumber
            );
            pendingSelectRowData = null;
          }
        } catch (error) {
          console.error('[Sidebar] renderForm setTimeout 回调错误:', error);
        }
      }, 10);
    } catch (error) {
      console.error('[Sidebar] renderForm setTimeout 设置错误:', error);
    }
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
    console.log(`[Sidebar] selectRow 被调用`, {
      isExtensionActive,
      isFormRendered,
      isRenderingForm,
      isEditing,
      lineNumber,
      rowIndex,
      headersLength: headers.length,
      totalColumns: totalColumns,
      rowData,
      rowDataKeys: Object.keys(rowData),
      headers: headers
    });

    if (!isExtensionActive) {
      console.log(`[Sidebar] 跳过选择行: isExtensionActive=${isExtensionActive}`);
      return;
    }
    
    if (!isFormRendered) {
      console.log(`[Sidebar] 表单未渲染，保存待处理数据`);
      pendingSelectRowData = { rowData, rowIndex, lineNumber };
      return;
    }
    
    if (isRenderingForm) {
      console.log(`[Sidebar] 表单正在渲染，延迟执行selectRow`);
      try {
        setTimeout(() => {
          try {
            selectRow(rowData, rowIndex, lineNumber);
          } catch (error) {
            console.error('[Sidebar] selectRow setTimeout 回调错误:', error);
          }
        }, 50);
      } catch (error) {
        console.error('[Sidebar] selectRow setTimeout 设置错误:', error);
      }
      return;
    }
    
    if (isEditing && lineNumber === currentLineNumber) {
      console.log(`[Sidebar] 跳过选择行: 正在编辑同一行 ${lineNumber}`);
      return;
    }
    
    console.log(`[Sidebar] 选择行: 行索引${rowIndex}, 行号${lineNumber}, 数据:`, rowData);
    
    try {
      currentRowIndex = rowIndex;
      currentLineNumber = lineNumber;
      currentRowInputValue = lineNumber;
      formData = { ...rowData };
      
      const currentRowInput = document.getElementById('currentRowInput');
      if (currentRowInput) {
        currentRowInput.value = lineNumber;
        console.log(`[Sidebar] 直接更新当前行输入框值为: ${lineNumber}`);
      }
      
      updateUI();
      updateHeaderRowSelectorMax();
      updateCurrentRowSelectorMax();
      
      Object.keys(updateTimeouts).forEach(key => {
        clearTimeout(updateTimeouts[key]);
      });
      
      isUpdatingFromVSCode = true;
      
      console.log(`[Sidebar] 开始填充表单，总列数: ${totalColumns}`);
      
      const formFields = document.getElementById('formFields');
      if (!formFields) {
        console.warn('[Sidebar] formFields 元素不存在，表单可能未渲染');
        return;
      }
      
      const firstTextarea = document.getElementById('input-0');
      if (!firstTextarea) {
        console.warn('[Sidebar] 表单元素不存在，尝试重新渲染表单');
        renderForm();
        setTimeout(() => {
          selectRow(rowData, rowIndex, lineNumber);
        }, 100);
        return;
      }
      
      // 转换rowData为数组，按照表头顺序排列
      const rowValues = [];
      for (let i = 0; i < totalColumns; i++) {
        // 尝试获取对应的值
        let value = '';
        const header = headers[i] || `Column ${i + 1}`;
        
        // 先尝试使用表头获取值
        if (rowData[header] !== undefined) {
          value = rowData[header];
        } else {
          // 尝试使用索引获取值
          const keys = Object.keys(rowData);
          if (keys[i]) {
            value = rowData[keys[i]];
          }
        }
        
        rowValues.push(value || '');
      }
      
      console.log(`[Sidebar] 准备填充的数据:`, rowValues);
      
      // 遍历所有表单元素，直接从上往下填充数据
      for (let i = 0; i < totalColumns; i++) {
        const textarea = document.getElementById(`input-${i}`);
        console.log(`[Sidebar] 查找元素 input-${i}, 结果:`, textarea ? '找到' : '未找到');
        
        if (textarea && i < rowValues.length) {
          const value = rowValues[i] || '';
          console.log(`[Sidebar] 填充表单元素 ${i}: "${value}"`);
          
          // 直接更新表单元素的值
          textarea.value = value;
          
          // 更新title属性
          if (value.length > 50) {
            textarea.title = value;
          } else {
            textarea.title = '';
          }
          
          // 自动调整输入框大小
          const autoResize = (element) => {
            element.style.height = 'auto';
            // 估算每行的高度（约20px）
            const lineHeight = 20;
            const minHeight = lineHeight * 3; // 3行
            const maxHeight = lineHeight * 6; // 6行
            
            // 计算实际需要的高度
            const newHeight = Math.min(element.scrollHeight, maxHeight);
            const finalHeight = Math.max(newHeight, minHeight);
            
            element.style.height = finalHeight + 'px';
            element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
          };
          autoResize(textarea);
        }
      }
      
      try {
        setTimeout(() => {
          try {
            isUpdatingFromVSCode = false;
            console.log('[Sidebar] 选择行完成');
          } catch (error) {
            console.error('[Sidebar] selectRow setTimeout 回调错误:', error);
          }
        }, 100);
      } catch (error) {
        console.error('[Sidebar] selectRow setTimeout 设置错误:', error);
      }
    } catch (error) {
      console.error('[Sidebar] selectRow 错误:', error);
    }
  }
  
  // 清空表单
  function clearForm() {
    console.log('[Sidebar] 清空表单');
    
    currentRowIndex = -1;
    currentLineNumber = 0;
    isEditing = false;
    formData = {};
    
    updateUI();
    updateHeaderRowSelectorMax();
    updateCurrentRowSelectorMax();
    
    isUpdatingFromVSCode = true;
    
    headers.forEach((header, index) => {
      const textarea = document.getElementById(`input-${index}`);
      if (textarea) {
        textarea.value = '';
        textarea.title = '';
        textarea.style.height = 'auto';
      }
      // 从智能抖动系统中移除字段
      smartDebouncer.unregisterField(header);
    });
    
    try {
      setTimeout(() => {
        try {
          isUpdatingFromVSCode = false;
        } catch (error) {
          console.error('[Sidebar] clearForm setTimeout 回调错误:', error);
        }
      }, 100);
    } catch (error) {
      console.error('[Sidebar] clearForm setTimeout 设置错误:', error);
    }
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
    
    console.log('[Sidebar] 添加新行: 复制当前行数据到最后一行');
    vscode.postMessage({
      type: 'addRow',
      copyCurrentRow: true
    });
  };
  
  // 打开Excel文件
  window.openExcel = function() {
    vscode.postMessage({
      type: 'openExcel'
    });
  };
  
  // 更新单元格
  function updateCell(lineNumber, column, value, columnIndex) {
    console.log(`[Sidebar] 发送更新单元格消息: 行号${lineNumber}, 列"${column}", 列索引${columnIndex}, 值: "${value}"`);
    
    if (lineNumber === undefined || lineNumber === null) {
      console.error(`[Sidebar] 无效的行号: ${lineNumber}`);
      return;
    }
    
    if (!column || typeof column !== 'string') {
      console.error(`[Sidebar] 无效的列名: ${column}`);
      return;
    }
    
    // 检查是否正在编辑表头行
    if (lineNumber === headerRowIndex) {
      console.log(`[Sidebar] 正在编辑表头行，需要更新表头`);
      // 触发表头更新
      setTimeout(() => {
        try {
          vscode.postMessage({
            type: 'headerRowChanged',
            headerRowIndex: headerRowIndex
          });
        } catch (error) {
          console.error('[Sidebar] 触发表头更新错误:', error);
        }
      }, 100);
    }
    
    vscode.postMessage({
      type: 'updateCell',
      lineNumber: lineNumber,
      column: column,
      columnIndex: columnIndex,
      value: value || ''
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
  try {
    setTimeout(() => {
      try {
        console.log('[Sidebar] 初始化完成');
        
        const openExcelBtn = document.getElementById('openExcelBtn');
        if (openExcelBtn) {
          openExcelBtn.addEventListener('click', () => {
            try {
              vscode.postMessage({
                type: 'openExcel'
              });
            } catch (error) {
              console.error('[Sidebar] 打开Excel按钮点击错误:', error);
            }
          });
        }
        
        const addRowBtn = document.getElementById('addRowBtn');
        if (addRowBtn) {
          addRowBtn.addEventListener('click', () => {
            try {
              window.addRow();
            } catch (error) {
              console.error('[Sidebar] 添加行按钮点击错误:', error);
            }
          });
        }
        
        const saveExcelBtn = document.getElementById('saveExcelBtn');
        if (saveExcelBtn) {
          saveExcelBtn.addEventListener('click', () => {
            try {
              window.saveExcel();
            } catch (error) {
              console.error('[Sidebar] 保存Excel按钮点击错误:', error);
            }
          });
        }
        
        const closeExcelBtn = document.getElementById('closeExcelBtn');
        if (closeExcelBtn) {
          closeExcelBtn.addEventListener('click', () => {
            try {
              window.closeExcel();
            } catch (error) {
              console.error('[Sidebar] 关闭Excel按钮点击错误:', error);
            }
          });
        }
        
        console.log('[Sidebar] 按钮事件监听器已设置');
      } catch (error) {
        console.error('[Sidebar] 初始加载 setTimeout 回调错误:', error);
      }
    }, 100);
  } catch (error) {
    console.error('[Sidebar] 初始加载 setTimeout 设置错误:', error);
  }
})();