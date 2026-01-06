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
- **实时数据更新**: 当用户在编辑器中添加新行或修改内容时，内存数据会实时同步更新。
- **数据一致性**: 确保表单数据与编辑器中实际行数据保持一致，避免数据闪烁和清空问题。

## 安装方式 (Installation)

### 方法一：从 VS Code 插件市场安装

1. 打开 VS Code。
2. 进入扩展视图 (快捷键 `Ctrl+Shift+X` 或 `Cmd+Shift+X`)。
3. 搜索 `ExcelPlugin`。
4. 点击 "安装"。
5. 安装完成后，重新加载窗口即可使用。

### 方法二：从 GitHub Release 下载安装

如果您无法直接从插件市场安装，或者需要安装特定版本，可以通过以下步骤从 GitHub 下载并手动安装：

1. 访问 [ExcelPlugin GitHub 仓库](https://github.com/2095596768/excel-plugin)
2. 点击页面右侧的 "Releases" 标签
3. 在发布列表中找到您想要安装的版本（建议选择最新的稳定版本）
4. 下载 `.vsix` 文件（例如：`excel-plugin-1.0.0.vsix`）
5. 在 VS Code 中打开扩展视图 (`Ctrl+Shift+X` 或 `Cmd+Shift+X`)
6. 点击扩展视图右上角的三个点（更多操作）
7. 选择 "从 VSIX 安装..."
8. 浏览并选择您下载的 `.vsix` 文件
9. 安装完成后，重新加载窗口即可使用

## 使用方法 (Usage)

1. **打开侧边栏**: 点击 VS Code 活动栏上的 **Excel 图标**，即可打开 ExcelPlugin 的侧边栏视图。
2. **打开文件**: 在侧边栏中，使用 "打开Excel文件" 命令来选择并加载一个 Excel 文件。
3. **编辑数据**: 
   - 光标定位到编辑器中的某一行，侧边栏会自动显示该行的数据
   - 在侧边栏表单中修改数据，修改会自动同步到编辑器中
   - 在编辑器中直接修改内容，侧边栏表单也会实时更新
4. **添加新行**: 
   - 在编辑器中某一行末尾按回车键添加新行
   - 在侧边栏中填写新行数据并保存
5. **保存更改**: 插件会根据你的配置（`autoSync`）自动或手动将更改同步回文件。

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

## 常见问题 (FAQ)

### Q: 为什么光标定位到某行时，侧边栏数据闪烁一下又被清空了？
A: 这个问题已经在最新版本中修复。我们优化了数据加载和渲染的时序，确保表单数据能够稳定显示。

### Q: 添加新行后修改数据，为什么Excel文件数据不更新？
A: 我们已经修复了内存数据与编辑器同步的问题。现在当你添加新行后，内存数据会实时更新，确保表单数据与实际行数据一致。

### Q: 如何手动安装插件？
A: 请参考上面的"方法二：从 GitHub Release 下载安装"部分。

## 开发 (Development)

如果你想为这个插件贡献代码，请按照以下步骤操作：

1. **克隆仓库**:
   ```bash
   git clone https://github.com/2095596768/excel-plugin.git
   cd excel-plugin
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **运行开发服务器**:
   ```bash
   npm run watch
   ```

4. **调试扩展**:
   - 按 `F5` 启动调试会话
   - VS Code 会打开一个新窗口，加载开发版本的插件

5. **打包扩展**:
   ```bash
   npm run package
   ```
   这将生成一个 `.vsix` 文件，用于分发和安装。

## 贡献 (Contributing)

欢迎提交 Issue 和 Pull Request 来帮助改进这个插件！

## 许可证 (License)

MIT License

## 联系方式 (Contact)

如有问题或建议，请通过以下方式联系我们：

- GitHub Issues: [https://github.com/2095596768/excel-plugin/issues](https://github.com/2095596768/excel-plugin/issues)
- 邮箱: [2095596768@qq.com](mailto:2095596768@qq.com)

---

**ExcelPlugin - 让 Excel 编辑更高效！**