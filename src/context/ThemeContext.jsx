import { createContext, useContext, useMemo } from 'react';
import { useApp } from './AppContext.jsx';
import { computeTheme } from '../theme/computeTheme.js';

/** @typedef {ReturnType<typeof computeTheme>} ThemeContextValue */
/** @type {import("react").Context<ThemeContextValue | null>} */
const ThemeContext = createContext(null);

const DEFAULT_THEME = computeTheme(
  { layout: 'terminal', palette: 'ink', device: 'ios', cond: 'normal', screen: 'Chat' },
  () => ({}),
);

/** @param {{ children?: import("react").ReactNode }} props */
export function ThemeProvider({ children }) {
  const { state, actions } = useApp();
  const theme = useMemo(() => computeTheme(state, actions?.cf || (() => ({}))), [state, actions]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx || DEFAULT_THEME;
}
