import * as vscode from 'vscode';

export interface SyncConfig {
  headerToForm: boolean;
  cursorRowToCurrentRowInput: boolean;
  currentRowInputToCursor: boolean;
  editorToFormLessThan: boolean;
  editorToFormEqual: boolean;
  editorToFormGreaterThan: boolean;
  formToHeader: boolean;
}

export class SyncConfigManager {
  private static readonly CONFIG_SECTION = 'excelPlugin.sync';
  private config: SyncConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): SyncConfig {
    // 使用默认配置值，不再从 VS Code 配置中读取
    return {
      headerToForm: true,
      cursorRowToCurrentRowInput: true,
      currentRowInputToCursor: true,
      editorToFormLessThan: true,
      editorToFormEqual: true,
      editorToFormGreaterThan: true,
      formToHeader: true
    };
  }

  public refresh(): void {
    this.config = this.loadConfig();
  }

  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<SyncConfig>): void {
    // 不再更新 VS Code 配置，只更新内存中的配置
    this.config = {
      ...this.config,
      ...updates
    };
  }
}
