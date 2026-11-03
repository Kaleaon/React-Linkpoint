import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type FocusEvent,
} from 'react';

/**
 * Configuration options for the useRovingTabindex hook.
 */
export interface UseRovingTabindexOptions<T extends string = string> {
  /** Ordered list of tab identifiers */
  tabs: readonly T[] | T[];
  /** Currently active / selected tab identifier */
  activeTab: T;
  /** Callback fired when a tab is selected or activated */
  onSelect: (tab: T) => void;
  /**
   * Activation mode:
   * - 'auto': Navigating with arrow/Home/End keys immediately activates the focused tab.
   * - 'manual': Navigating with arrow/Home/End keys shifts focus; activation happens on Enter, Space, or Click.
   * Defaults to 'auto'.
   */
  activationMode?: 'auto' | 'manual';
  /**
   * Whether navigation wraps around at boundaries (first to last, last to first).
   * Defaults to true.
   */
  loop?: boolean;
  /**
   * Orientation for arrow key handling: 'horizontal' | 'vertical' | 'both'.
   * Defaults to 'horizontal'.
   */
  orientation?: 'horizontal' | 'vertical' | 'both';
}

/**
 * Standard tab HTML attributes and listeners returned by getTabProps.
 */
export interface TabProps {
  role: 'tab';
  tabIndex: number;
  'aria-selected': boolean;
  ref: (el: HTMLElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
}

/**
 * Reusable hook providing WAI-ARIA APG Tabs Pattern roving tabindex management.
 * Complies with WCAG 2.2 SC 2.1.1 (Keyboard), SC 2.4.3 (Focus Order), and SC 4.1.2 (Name, Role, Value).
 */
export function useRovingTabindex<T extends string = string>({
  tabs,
  activeTab,
  onSelect,
  activationMode = 'auto',
  loop = true,
  orientation = 'horizontal',
}: UseRovingTabindexOptions<T>) {
  const [focusedTab, setFocusedTab] = useState<T>(activeTab);
  const tabRefs = useRef<Map<T, HTMLElement>>(new Map());

  // Keep focusedTab in sync when activeTab changes externally
  useEffect(() => {
    setFocusedTab(activeTab);
  }, [activeTab]);

  const getTabIndex = useCallback(
    (tab: T): number => {
      const current = activationMode === 'manual' ? (focusedTab ?? activeTab) : activeTab;
      return current === tab ? 0 : -1;
    },
    [activationMode, focusedTab, activeTab],
  );

  const focusTab = useCallback(
    (targetTab: T) => {
      setFocusedTab(targetTab);
      if (activationMode === 'auto') {
        onSelect(targetTab);
      }
      const el = tabRefs.current.get(targetTab);
      if (el) {
        el.focus();
      } else {
        const fallback =
          document.querySelector<HTMLElement>(`[role="tab"][data-tab="${targetTab}"]`) ||
          document.querySelector<HTMLElement>(`[role="tab"][data-id="${targetTab}"]`);
        fallback?.focus();
      }
    },
    [activationMode, onSelect],
  );

  const getTargetIndex = useCallback(
    (currentIndex: number, step: number): number => {
      if (tabs.length === 0) return -1;
      const next = currentIndex + step;
      if (loop) {
        return ((next % tabs.length) + tabs.length) % tabs.length;
      }
      return Math.max(0, Math.min(tabs.length - 1, next));
    },
    [tabs, loop],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, tab: T) => {
      // Preserve default browser behavior for Tab, Shift+Tab, and Escape
      if (e.key === 'Tab' || e.key === 'Escape') return;
      // Do not intercept modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const currentIndex = tabs.indexOf(tab);
      if (currentIndex === -1) return;

      const allowHorizontal = orientation === 'horizontal' || orientation === 'both';
      const allowVertical = orientation === 'vertical' || orientation === 'both';

      let targetIndex = -1;

      if (e.key === 'ArrowRight' && allowHorizontal) {
        targetIndex = getTargetIndex(currentIndex, 1);
      } else if (e.key === 'ArrowLeft' && allowHorizontal) {
        targetIndex = getTargetIndex(currentIndex, -1);
      } else if (e.key === 'ArrowDown' && allowVertical) {
        targetIndex = getTargetIndex(currentIndex, 1);
      } else if (e.key === 'ArrowUp' && allowVertical) {
        targetIndex = getTargetIndex(currentIndex, -1);
      } else if (e.key === 'Home') {
        targetIndex = 0;
      } else if (e.key === 'End') {
        targetIndex = tabs.length - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setFocusedTab(tab);
        onSelect(tab);
        return;
      } else {
        return;
      }

      if (targetIndex !== -1) {
        e.preventDefault();
        const targetTab = tabs[targetIndex];
        focusTab(targetTab);
      }
    },
    [tabs, orientation, getTargetIndex, focusTab, onSelect],
  );

  const handleClick = useCallback(
    (tab: T) => {
      setFocusedTab(tab);
      onSelect(tab);
      const el = tabRefs.current.get(tab);
      el?.focus();
    },
    [onSelect],
  );

  const getTabRef = useCallback(
    (tab: T) => (el: HTMLElement | null) => {
      if (el) {
        tabRefs.current.set(tab, el);
      } else {
        tabRefs.current.delete(tab);
      }
    },
    [],
  );

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const nextTarget = e.relatedTarget as Node | null;
      const parent = e.currentTarget.parentElement;
      if (!nextTarget || (parent && !parent.contains(nextTarget))) {
        setFocusedTab(activeTab);
      }
    },
    [activeTab],
  );

  const getTabProps = useCallback(
    (tab: T): TabProps => {
      return {
        role: 'tab',
        tabIndex: getTabIndex(tab),
        'aria-selected': tab === activeTab,
        ref: getTabRef(tab),
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => handleKeyDown(e, tab),
        onClick: () => handleClick(tab),
        onFocus: () => setFocusedTab(tab),
        onBlur: handleBlur,
      };
    },
    [getTabIndex, activeTab, getTabRef, handleKeyDown, handleClick, handleBlur],
  );

  return {
    getTabProps,
    getTabIndex,
    getTabRef,
    handleKeyDown,
    handleClick,
    focusedTab,
    activeTab,
    focusTab,
  };
}
