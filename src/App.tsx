import { useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { TickProvider } from "./context/TickContext.jsx";
import { ErrorRecoveryProvider } from "./context/ErrorRecoveryContext.tsx";
import { ErrorRecoveryBanner } from "./components/ErrorRecoveryBanner.tsx";
import { ErrorRecoveryModal } from "./components/ErrorRecoveryModal.tsx";
import DeviceFrame from "./components/DeviceFrame.jsx";
import LiveRegionAnnouncerComponent from "./components/LiveRegionAnnouncerComponent.jsx";
import { app } from "./linkpoint/app";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

let startup: Promise<void> | null = null;

export function Viewer() {
  const { actions } = useApp();

  useEffect(() => {
    startup ||= app.init();
    void startup;
  }, []);

  return (
    <>
      <a href="#main-content" className="skip-to-content-link">
        Skip to main content
      </a>
      <ErrorRecoveryBanner />
      <LiveRegionAnnouncerComponent />
      <DeviceFrame />
      <ErrorRecoveryModal onNavigateFallback={(route) => actions.setScreen(route)} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary label="Linkpoint">
      <ErrorRecoveryProvider>
        <AppProvider>
          <TickProvider>
            <ThemeProvider>
              <Viewer />
            </ThemeProvider>
          </TickProvider>
        </AppProvider>
      </ErrorRecoveryProvider>
    </ErrorBoundary>
  );
}


