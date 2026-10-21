import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import {
  parseKeyString,
  formatKeyString,
  isValidKeyBinding,
  matchesKeyBinding,
} from '../../linkpoint/key-bindings';
import { isTypingTarget } from '../../linkpoint/keyboard-motion';
import {
  KeybindingsProvider,
  useKeybindings,
  KEYBINDINGS_STORAGE_KEY,
} from '../KeybindingsContext';

describe('Keybindings Parsing and Matching Utilities', () => {
  test('parseKeyString parses modifier and base key correctly', () => {
    const p1 = parseKeyString('M');
    expect(p1).toEqual({
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      baseKey: 'M',
      isSingleCharacter: true,
    });

    const p2 = parseKeyString('Alt+KeyM');
    expect(p2).toEqual({
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
      baseKey: 'KeyM',
      isSingleCharacter: false,
    });

    const p3 = parseKeyString('Ctrl+Shift+H');
    expect(p3).toEqual({
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
      baseKey: 'H',
      isSingleCharacter: false,
    });
  });

  test('formatKeyString formats key bindings for display', () => {
    expect(formatKeyString('M')).toBe('M');
    expect(formatKeyString('KeyM')).toBe('M');
    expect(formatKeyString('Alt+KeyM')).toBe('Alt+M');
    expect(formatKeyString('Ctrl+Alt+H')).toBe('Ctrl+Alt+H');
  });

  test('isValidKeyBinding validates input strings correctly', () => {
    expect(isValidKeyBinding('M')).toBe(true);
    expect(isValidKeyBinding('KeyM')).toBe(true);
    expect(isValidKeyBinding('Alt+M')).toBe(true);
    expect(isValidKeyBinding('Ctrl+Shift+H')).toBe(true);

    expect(isValidKeyBinding('')).toBe(false);
    expect(isValidKeyBinding('Ctrl')).toBe(false);
    expect(isValidKeyBinding('Alt')).toBe(false);
    expect(isValidKeyBinding('Ctrl+Alt')).toBe(false);
  });

  test('matchesKeyBinding handles single character shortcuts toggle', () => {
    const eventM = {
      code: 'KeyM',
      key: 'm',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };

    // Enabled
    expect(matchesKeyBinding(eventM, 'KeyM', true)).toBe(true);
    // Disabled
    expect(matchesKeyBinding(eventM, 'KeyM', false)).toBe(false);

    // Modified binding Alt+M
    const eventAltM = {
      code: 'KeyM',
      key: 'm',
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
    };

    // Alt+M matches regardless of singleCharShortcutsEnabled
    expect(matchesKeyBinding(eventAltM, 'Alt+KeyM', true)).toBe(true);
    expect(matchesKeyBinding(eventAltM, 'Alt+KeyM', false)).toBe(true);

    // Plain M does not match Alt+M
    expect(matchesKeyBinding(eventM, 'Alt+KeyM', true)).toBe(false);
  });

  test('isTypingTarget accurately identifies input targets', () => {
    const inputEl = { tagName: 'INPUT' };
    const textareaEl = { tagName: 'TEXTAREA' };
    const selectEl = { tagName: 'SELECT' };
    const editableEl = { tagName: 'DIV', isContentEditable: true };
    const textboxRoleEl = {
      tagName: 'DIV',
      getAttribute: (attr: string) => (attr === 'role' ? 'textbox' : null),
    };
    const canvasEl = { tagName: 'CANVAS' };

    expect(isTypingTarget(inputEl as any)).toBe(true);
    expect(isTypingTarget(textareaEl as any)).toBe(true);
    expect(isTypingTarget(selectEl as any)).toBe(true);
    expect(isTypingTarget(editableEl as any)).toBe(true);
    expect(isTypingTarget(textboxRoleEl as any)).toBe(true);
    expect(isTypingTarget(canvasEl as any)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('CameraControls Integration with Keybinding Preferences', () => {
  test('CameraControls suppresses M key when singleCharShortcutsEnabled is false', async () => {
    const { CameraControls } = await import('../../linkpoint/camera-controls');
    const { Camera3D } = await import('../../linkpoint/camera-3d');

    const canvas = document.createElement('canvas');
    const camera = new Camera3D();
    const toggleMouselook = vi.fn();

    let singleCharEnabled = false;
    let customBinding = 'KeyM';

    new CameraControls(
      canvas,
      camera,
      () => {},
      () => {},
      () => false,
      {
        toggleMouselook,
        singleCharShortcutsEnabled: () => singleCharEnabled,
        getCustomBinding: (action) => (action === 'toggleMouselook' ? customBinding : undefined),
      },
    );

    // Press 'M' when single-character shortcuts are disabled
    const mEvent = new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true });
    window.dispatchEvent(mEvent);
    expect(toggleMouselook).not.toHaveBeenCalled();

    // Enable single-character shortcuts and press 'M'
    singleCharEnabled = true;
    window.dispatchEvent(mEvent);
    expect(toggleMouselook).toHaveBeenCalledTimes(1);

    // Remap toggleMouselook to Alt+M and disable single-character shortcuts
    toggleMouselook.mockClear();
    singleCharEnabled = false;
    customBinding = 'Alt+KeyM';

    // Plain M should be ignored
    window.dispatchEvent(mEvent);
    expect(toggleMouselook).not.toHaveBeenCalled();

    // Alt+M should trigger toggleMouselook
    const altMEvent = new KeyboardEvent('keydown', {
      code: 'KeyM',
      key: 'm',
      altKey: true,
      bubbles: true,
    });
    window.dispatchEvent(altMEvent);
    expect(toggleMouselook).toHaveBeenCalledTimes(1);
  });

  test('CameraControls suppresses shortcuts during typing in an input field', async () => {
    const { CameraControls } = await import('../../linkpoint/camera-controls');
    const { Camera3D } = await import('../../linkpoint/camera-3d');

    const canvas = document.createElement('canvas');
    const camera = new Camera3D();
    const toggleMouselook = vi.fn();

    new CameraControls(
      canvas,
      camera,
      () => {},
      () => {},
      () => false,
      {
        toggleMouselook,
        singleCharShortcutsEnabled: () => true,
        getCustomBinding: () => 'KeyM',
      },
    );

    const input = document.createElement('input');
    document.body.appendChild(input);

    const mEventInInput = new KeyboardEvent('keydown', {
      code: 'KeyM',
      key: 'm',
      bubbles: true,
    });
    Object.defineProperty(mEventInInput, 'target', { value: input, writable: false });

    window.dispatchEvent(mEventInInput);
    expect(toggleMouselook).not.toHaveBeenCalled();

    input.remove();
  });
});
