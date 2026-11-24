import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  matchesKeyBinding,
  isValidKeyBinding,
  sanitizeCustomBindings,
  sanitizeKeyOverrides,
  setCachedKeyOverrides,
  type KeyOverrides,
} from '../linkpoint/key-bindings';
import { isTypingTarget } from '../linkpoint/keyboard-motion';
import { app } from '../linkpoint/app';

export const KEYBINDINGS_STORAGE_KEY = 'linkpoint_keybindings';

export const DEFAULT_CUSTOM_BINDINGS: Record<string, string> = {
  toggleMouselook: 'KeyM',
  toggleOverlays: 'KeyH',
  createLandmark: 'Ctrl+Shift+KeyD',
};

export interface KeybindingsRestoreSnapshot {
  singleCharShortcutsEnabled: boolean;
  customBindings: Record<string, string>;
  overrides?: KeyOverrides;
}

type KeybindingsSyncListener = (snapshot: KeybindingsRestoreSnapshot) => void;
const syncListeners = new Set<KeybindingsSyncListener>();

export function subscribeKeybindingsSync(listener: KeybindingsSyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function persistAndSyncKeybindings(snapshot: KeybindingsRestoreSnapshot): void {
  const cleanBindings = sanitizeCustomBindings(snapshot.customBindings, DEFAULT_CUSTOM_BINDINGS);
  const cleanOverrides = sanitizeKeyOverrides(snapshot.overrides);
  const enabled =
    typeof snapshot.singleCharShortcutsEnabled === 'boolean'
      ? snapshot.singleCharShortcutsEnabled
      : true;
  try {
    const data: Record<string, unknown> = {
      singleCharShortcutsEnabled: enabled,
      customBindings: cleanBindings,
    };
    if (Object.keys(cleanOverrides).length > 0) {
      data.overrides = cleanOverrides;
    }
    localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(data));
    if (app?.preferences) {
      app.preferences.set('keybindings', 'singleCharShortcutsEnabled', enabled);
      app.preferences.set('keybindings', 'customBindings', cleanBindings);
      if (Object.keys(cleanOverrides).length > 0) {
        app.preferences.set('keybindings', 'overrides', cleanOverrides);
      }
    }
  } catch {
    /* storage exception handled */
  }
  setCachedKeyOverrides(cleanOverrides);
  const normalized: KeybindingsRestoreSnapshot = {
    singleCharShortcutsEnabled: enabled,
    customBindings: cleanBindings,
    overrides: cleanOverrides,
  };
  for (const listener of syncListeners) {
    listener(normalized);
  }
}

export function readStoredKeybindings(): {
  singleCharShortcutsEnabled: boolean;
  customBindings: Record<string, string>;
  overrides: KeyOverrides;
} {
  try {
    const saved = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const overrides = sanitizeKeyOverrides(parsed.overrides ?? parsed.modeBindings);
        setCachedKeyOverrides(overrides);
        return {
          singleCharShortcutsEnabled:
            typeof parsed.singleCharShortcutsEnabled === 'boolean'
              ? parsed.singleCharShortcutsEnabled
              : true,
          customBindings: sanitizeCustomBindings(parsed.customBindings, DEFAULT_CUSTOM_BINDINGS),
          overrides,
        };
      }
    }
  } catch {
    /* storage error fallback */
  }
  setCachedKeyOverrides({});
  return {
    singleCharShortcutsEnabled: true,
    customBindings: { ...DEFAULT_CUSTOM_BINDINGS },
    overrides: {},
  };
}

export interface KeybindingsContextType {
  singleCharShortcutsEnabled: boolean;
  setSingleCharShortcutsEnabled: (enabled: boolean) => void;
  customBindings: Record<string, string>;
  setCustomBinding: (action: string, keyString: string) => boolean;
  keyOverrides: KeyOverrides;
  setKeyOverrides: (overrides: KeyOverrides) => void;
  restoreKeybindings: (snapshot: KeybindingsRestoreSnapshot) => void;
  resetKeybindings: () => void;
  getKeybinding: (action: string) => string;
  matchesBinding: (
    event:
      | KeyboardEvent
      | React.KeyboardEvent
      | {
          key?: string;
          code?: string;
          ctrlKey?: boolean;
          altKey?: boolean;
          shiftKey?: boolean;
          metaKey?: boolean;
          target?: any;
        },
    action: string,
  ) => boolean;
}

const KeybindingsContext = createContext<KeybindingsContextType | undefined>(undefined);

export function KeybindingsProvider({ children }: { children: React.ReactNode }) {
  const [singleCharShortcutsEnabled, setSingleCharShortcutsEnabledState] = useState<boolean>(
    () => readStoredKeybindings().singleCharShortcutsEnabled,
  );

  const [customBindings, setCustomBindingsState] = useState<Record<string, string>>(
    () => readStoredKeybindings().customBindings,
  );

  const [keyOverrides, setKeyOverridesState] = useState<KeyOverrides>(
    () => readStoredKeybindings().overrides,
  );

  useEffect(() => {
    return subscribeKeybindingsSync((snapshot) => {
      setSingleCharShortcutsEnabledState(snapshot.singleCharShortcutsEnabled);
      setCustomBindingsState(snapshot.customBindings);
      setKeyOverridesState(snapshot.overrides ?? {});
    });
  }, []);

  const saveState = useCallback(
    (enabled: boolean, bindings: Record<string, string>, overrides: KeyOverrides = {}) => {
      try {
        const data: Record<string, unknown> = {
          singleCharShortcutsEnabled: enabled,
          customBindings: bindings,
        };
        if (Object.keys(overrides).length > 0) {
          data.overrides = overrides;
        }
        localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(data));
        if (app?.preferences) {
          app.preferences.set('keybindings', 'singleCharShortcutsEnabled', enabled);
          app.preferences.set('keybindings', 'customBindings', bindings);
          if (Object.keys(overrides).length > 0) {
            app.preferences.set('keybindings', 'overrides', overrides);
          }
        }
      } catch {
        /* storage exception handled */
      }
      setCachedKeyOverrides(overrides);
    },
    [],
  );

  const setSingleCharShortcutsEnabled = useCallback(
    (enabled: boolean) => {
      setSingleCharShortcutsEnabledState(enabled);
      saveState(enabled, customBindings, keyOverrides);
    },
    [customBindings, keyOverrides, saveState],
  );

  const setCustomBinding = useCallback(
    (action: string, keyString: string): boolean => {
      if (!isValidKeyBinding(keyString)) {
        return false;
      }
      const updated = {
        ...customBindings,
        [action]: keyString.trim(),
      };
      setCustomBindingsState(updated);
      saveState(singleCharShortcutsEnabled, updated, keyOverrides);
      return true;
    },
    [customBindings, singleCharShortcutsEnabled, keyOverrides, saveState],
  );

  const setKeyOverrides = useCallback(
    (overrides: KeyOverrides) => {
      const sanitized = sanitizeKeyOverrides(overrides);
      setKeyOverridesState(sanitized);
      saveState(singleCharShortcutsEnabled, customBindings, sanitized);
    },
    [singleCharShortcutsEnabled, customBindings, saveState],
  );

  const restoreKeybindings = useCallback((snapshot: KeybindingsRestoreSnapshot) => {
    persistAndSyncKeybindings(snapshot);
  }, []);

  const resetKeybindings = useCallback(() => {
    setSingleCharShortcutsEnabledState(true);
    setCustomBindingsState({ ...DEFAULT_CUSTOM_BINDINGS });
    setKeyOverridesState({});
    saveState(true, { ...DEFAULT_CUSTOM_BINDINGS }, {});
  }, [saveState]);

  const getKeybinding = useCallback(
    (action: string): string => {
      return customBindings[action] || DEFAULT_CUSTOM_BINDINGS[action] || '';
    },
    [customBindings],
  );

  const matchesBinding = useCallback(
    (
      event:
        | KeyboardEvent
        | React.KeyboardEvent
        | {
            key?: string;
            code?: string;
            ctrlKey?: boolean;
            altKey?: boolean;
            shiftKey?: boolean;
            metaKey?: boolean;
            target?: any;
          },
      action: string,
    ): boolean => {
      if (event.target && isTypingTarget(event.target)) {
        return false;
      }
      const bindingStr = getKeybinding(action);
      if (!bindingStr) return false;
      return matchesKeyBinding(event, bindingStr, singleCharShortcutsEnabled);
    },
    [getKeybinding, singleCharShortcutsEnabled],
  );

  return (
    <KeybindingsContext.Provider
      value={{
        singleCharShortcutsEnabled,
        setSingleCharShortcutsEnabled,
        customBindings,
        setCustomBinding,
        keyOverrides,
        setKeyOverrides,
        restoreKeybindings,
        resetKeybindings,
        getKeybinding,
        matchesBinding,
      }}
    >
      {children}
    </KeybindingsContext.Provider>
  );
}

export function useKeybindings(): KeybindingsContextType {
  const ctx = useContext(KeybindingsContext);
  if (!ctx) {
    // Return a fallback context if consumed outside Provider (e.g. isolated component unit tests)
    const stored = readStoredKeybindings();
    return {
      singleCharShortcutsEnabled: stored.singleCharShortcutsEnabled,
      setSingleCharShortcutsEnabled: () => {},
      customBindings: stored.customBindings,
      setCustomBinding: () => false,
      keyOverrides: stored.overrides,
      setKeyOverrides: () => {},
      restoreKeybindings: (snapshot: KeybindingsRestoreSnapshot) => {
        persistAndSyncKeybindings(snapshot);
      },
      resetKeybindings: () => {},
      getKeybinding: (action: string) =>
        stored.customBindings[action] || DEFAULT_CUSTOM_BINDINGS[action] || '',
      matchesBinding: (event: any, action: string) => {
        if (event.target && isTypingTarget(event.target)) return false;
        const bindingStr = stored.customBindings[action] || DEFAULT_CUSTOM_BINDINGS[action] || '';
        if (!bindingStr) return false;
        return matchesKeyBinding(event, bindingStr, stored.singleCharShortcutsEnabled);
      },
    };
  }
  return ctx;
}
