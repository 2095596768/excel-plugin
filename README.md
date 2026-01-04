# ExcelPlugin

**Excel 文件编辑器 - 支持在 VS Code 中编辑 Excel 文件，双向绑定表单与编辑器。**

![ExcelPlugin Logo](media/icon.png)

## 功能特性 (Features)

ExcelPlugin 是一个强大的 VS Code 扩展，旨在将 Excel 电子表格的编辑能力直接带入你的代码编辑器中。

- **侧边栏视图**: 通过活动栏的 Excel 图标打开一个专用的侧边栏，用于显示和编辑 Excel 内容。
- **文件操作**: 轻松打开本地的 Excel 文件 (`.xlsx`, `.xls` 等)。
- **核心编辑**: 支持添加新行、更新单元格数据等基本操作。
- **状态控制**: 可以方便地激活、停用或切换编辑器的工作状态。
- **双向同步**: 支持表单与编辑器内容的双向数据同步（需在设置中启用）。
- **自动加载**: 可配置在打开 Excel 文件时自动加载插件视图。
- **快捷键支持**: 为常用操作（如切换状态）提供了默认的键盘快捷键。

## 安装 (Installation)

1.  打开 VS Code。
2.  进入扩展视图 (快捷键 `Ctrl+Shift+X` 或 `Cmd+Shift+X`)。
3.  搜索 `ExcelPlugin`。
4.  点击 "安装"。
5.  安装完成后，重新加载窗口即可使用。

## 使用方法 (Usage)

1.  **打开侧边栏**: 点击 VS Code 活动栏上的 **Excel 图标**，即可打开 ExcelPlugin 的侧边栏视图。
2.  **打开文件**: 在侧边栏中，使用 "打开Excel文件" 命令来选择并加载一个 Excel 文件。
3.  **开始编辑**: 文件加载后，你可以在侧边栏的表单中直接进行编辑。
4.  **保存更改**: 插件会根据你的配置（`autoSync`）自动或手动将更改同步回文件。

## 命令 (Commands)

在命令面板 (快捷键 `Ctrl+Shift+P` 或 `Cmd+Shift+P`) 中输入以下命令来使用插件的各项功能：

| 命令 (Command) | 标题 (Title) | 描述 (Description) |
| :--- | :--- | :--- |
| `excelPlugin.openExcel` | 打开Excel文件 | 打开一个文件选择对话框来加载 Excel 文件。 |
| `excelPlugin.toggleStatus` | 切换Excel编辑器状态 | 在激活和停用之间切换插件。 |
| `excelPlugin.addRow` | 添加新行 | 在当前表格中添加一个新行。 |
| `excelPlugin.updateCell` | 更新单元格 | 更新指定单元格的数据。 |
| `excelPlugin.refresh` | 刷新表单 | 重新从文件加载数据，刷新侧边栏视图。 |
| `excelPlugin.showSidebar` | 显示Excel编辑器侧边栏 | 强制显示插件的侧边栏。 |
| `excelPlugin.hideSidebar` | 隐藏Excel编辑器侧边栏 | 隐藏插件的侧边栏。 |
| `excelPlugin.activate` | 激活Excel编辑器 | 激活插件功能。 |
| `excelPlugin.deactivate` | 关闭Excel编辑器 | 停用插件功能。 |
| `excelPlugin.startEditing` | 开始编辑表单 | 进入编辑模式。 |
| `excelPlugin.endEditing` | 结束编辑表单 | 退出编辑模式并保存更改。 |

## 键盘快捷键 (Keyboard Shortcuts)

| 命令 | 快捷键 (Windows/Linux) | 快捷键 (Mac) | 何时可用 |
| :--- | :--- | :--- | :--- |
| `excelPlugin.toggleStatus` | `Ctrl + 0` | `Cmd + 0` | 编辑器文本获得焦点时 |

## 扩展配置 (Extension Settings)

你可以在 VS Code 的设置中 (`File > Preferences > Settings` 或 `Ctrl + ,`) 搜索 `ExcelPlugin` 来配置以下选项：

| 设置项 (Setting) | 类型 (Type) | 默认值 (Default) | 描述 (Description) |
| :--- | :--- | :--- | :--- |
| `excelPlugin.autoLoad` | `boolean` | `true` | 是否在打开 Excel 文件时自动加载插件。 |
| `excelPlugin.autoSync` | `boolean` | `true` | 是否启用表单与文件的双向自动同步。 |

## 开发 (Development)

如果你想为这个插件贡献代码，请按照以下步骤操作：

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/2095596768/excel-plugin.git
    cd excel-plugin