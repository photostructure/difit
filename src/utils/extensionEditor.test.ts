import { describe, expect, it } from 'vitest';

import { resolveExtensionEditorEnvironment } from './extensionEditor';

describe('resolveExtensionEditorEnvironment', () => {
  it('lets an explicit extension preset select the server editor', () => {
    expect(resolveExtensionEditorEnvironment({ DIFIT_EDITOR: 'vscode' }, 'zed', 'vscode')).toEqual({
      DIFIT_EDITOR: 'zed',
    });
  });

  it('preserves an inherited editor choice in automatic mode', () => {
    expect(resolveExtensionEditorEnvironment({ DIFIT_EDITOR: 'emacs' }, 'auto', 'cursor')).toEqual({
      DIFIT_EDITOR: 'emacs',
    });
  });

  it('uses Cursor when the extension runs in Cursor and no editor was set', () => {
    expect(resolveExtensionEditorEnvironment({ EDITOR: 'vim' }, 'auto', 'cursor')).toEqual({
      EDITOR: 'vim',
      DIFIT_EDITOR: 'cursor',
    });
  });

  it('leaves the environment alone for VS Code in automatic mode', () => {
    expect(resolveExtensionEditorEnvironment({ EDITOR: 'emacs' }, 'auto', 'vscode')).toEqual({
      EDITOR: 'emacs',
    });
  });
});
