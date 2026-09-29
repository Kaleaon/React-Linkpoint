import { useEffect } from "react";
import { AppProvider } from "./context/AppContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import DeviceFrame from "./components/DeviceFrame.jsx";
import { app } from "./linkpoint/app";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

let startup: Promise<void> | null = null;

function Viewer() {
  useEffect(() => {
    startup ||= app.init();
    void startup;
  }, []);

  return <DeviceFrame />;
}

export default function App() {
  return (
    <ErrorBoundary label="Linkpoint">
      <AppProvider>
        <ThemeProvider>
          <Viewer />
        </ThemeProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
