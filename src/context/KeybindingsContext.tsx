import React, { createContext, useContext, useState, useCallback } from 'react';
import { matchesKeyBinding, isValidKeyBinding } from '../linkpoint/key-bindings';
import { isTypingTarget } from '../linkpoint/keyboard-motion';
import { app } from '../linkpoint/app';

export const KEYBINDINGS_STORAGE_KEY = 'linkpoint_keybindings';

export const DEFAULT_CUSTOM_BINDINGS: Record<string, string> = {
  toggleMouselook: 'KeyM',
  toggleOverlays: 'KeyH',
};

export interface KeybindingsContextType {
  singleCharShortcutsEnabled: boolean;
  setSingleCharShortcutsEnabled: (enabled: boolean) => void;
  customBindings: Record<string, string>;
  setCustomBinding: (action: string, keyString: string) => boolean;
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
  const [singleCharShortcutsEnabled, setSingleCharShortcutsEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.singleCharShortcutsEnabled === 'boolean') {
          return parsed.singleCharShortcutsEnabled;
        }
      }
    } catch {
      /* storage error fallback */
    }
    return true;
  });

  const [customBindings, setCustomBindingsState] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.customBindings && typeof parsed.customBindings === 'object') {
          return {
            ...DEFAULT_CUSTOM_BINDINGS,
            ...parsed.customBindings,
          };
        }
      }
    } catch {
      /* storage error fallback */
    }
    return { ...DEFAULT_CUSTOM_BINDINGS };
  });

  const saveState = useCallback((enabled: boolean, bindings: Record<string, string>) => {
    try {
      const data = {
        singleCharShortcutsEnabled: enabled,
        customBindings: bindings,
      };
      localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(data));
      if (app?.preferences) {
        app.preferences.set('keybindings', 'singleCharShortcutsEnabled', enabled);
        app.preferences.set('keybindings', 'customBindings', bindings);
      }
    } catch {
      /* storage exception handled */
    }
  }, []);

  const setSingleCharShortcutsEnabled = useCallback(
    (enabled: boolean) => {
      setSingleCharShortcutsEnabledState(enabled);
      saveState(enabled, customBindings);
    },
    [customBindings, saveState],
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
      saveState(singleCharShortcutsEnabled, updated);
      return true;
    },
    [customBindings, singleCharShortcutsEnabled, saveState],
  );

  const resetKeybindings = useCallback(() => {
    setSingleCharShortcutsEnabledState(true);
    setCustomBindingsState({ ...DEFAULT_CUSTOM_BINDINGS });
    saveState(true, { ...DEFAULT_CUSTOM_BINDINGS });
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
    return {
      singleCharShortcutsEnabled: true,
      setSingleCharShortcutsEnabled: () => {},
      customBindings: { ...DEFAULT_CUSTOM_BINDINGS },
      setCustomBinding: () => false,
      resetKeybindings: () => {},
      getKeybinding: (action: string) => DEFAULT_CUSTOM_BINDINGS[action] || '',
      matchesBinding: (event: any, action: string) => {
        if (event.target && isTypingTarget(event.target)) return false;
        const bindingStr = DEFAULT_CUSTOM_BINDINGS[action] || '';
        return matchesKeyBinding(event, bindingStr, true);
      },
    };
  }
  return ctx;
}
