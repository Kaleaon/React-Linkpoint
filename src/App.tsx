import {useMemo} from 'react';
import {AppProvider} from './context/AppContext.jsx';
import {ThemeProvider} from './context/ThemeContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AppShell from './components/AppShell.jsx';
import Workbench from './components/Workbench.jsx';

// Web entry point. The viewer UI lives in src/components + src/screens and is
// DOM-based, so this is the React DOM side of the app; the Expo/React Native
// entry is the root App.tsx and is a separate tree.
//
// A deployed build always renders the application itself. The design canvas --
// the layout/colour-pack/device/screen pickers around a device bezel -- is a
// development aid for reviewing the design, so it is reachable only from a dev
// server and only when explicitly asked for with ?design.
function useDesignCanvas() {
  return useMemo(() => {
    if (!(import.meta as any).env?.DEV) return false;
    try {
      return new URLSearchParams(window.location.search).has('design');
    } catch {
      return false;
    }
  }, []);
}

export default function App() {
  const designCanvas = useDesignCanvas();

  return (
    <ErrorBoundary label="Linkpoint">
      <AppProvider>
        <ThemeProvider>{designCanvas ? <Workbench /> : <AppShell />}</ThemeProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
