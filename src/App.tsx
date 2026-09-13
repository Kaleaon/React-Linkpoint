import React, { useEffect, useState } from 'react';
import { ThemeProvider, useThemeContext } from './theme/ThemeContext';
import { ViewerProvider } from './viewer/ViewerContext';
import { RlvProvider } from './viewer/RlvContext';
import { Shell } from './components/Shell';
import LoginScreen from './screens/LoginScreen';
import { app } from './linkpoint/app';

/**
 * Before a session exists the viewer is one screen; after it, the full shell.
 * Both sit inside the same theme, so the skin a resident picked is already in
 * place on the login panel.
 */
const Root: React.FC = () => {
  const { cssVars, theme } = useThemeContext();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    app.init();
    // A session snapshot from a previous run means we can go straight in.
    if (app.auth.hasSavedSession?.()) setAuthenticated(true);
  }, []);

  if (authenticated) {
    return (
      <ViewerProvider>
        <RlvProvider>
          <Shell />
        </RlvProvider>
      </ViewerProvider>
    );
  }

  return (
    <div
      style={{
        ...cssVars,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: theme.v.bg,
        color: theme.v.ink,
        fontFamily: theme.font,
      }}
    >
      <LoginScreen onLoginSuccess={() => setAuthenticated(true)} />
    </div>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <Root />
  </ThemeProvider>
);

export default App;
