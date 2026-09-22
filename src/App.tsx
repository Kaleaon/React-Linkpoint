import {AppProvider} from './context/AppContext.jsx';
import {ThemeProvider} from './context/ThemeContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Workbench from './components/Workbench.jsx';

// Web entry point. The viewer UI lives in src/components + src/screens and is
// DOM-based, so this is the React DOM side of the app; the Expo/React Native
// entry is the root App.tsx and is a separate tree.
export default function App() {
  return (
    <ErrorBoundary label="Linkpoint">
      <AppProvider>
        <ThemeProvider>
          <Workbench />
        </ThemeProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
