import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import MenuBar from "./MenuBar.jsx";
import Shell from "./Shell.jsx";
import ScreenBody from "./ScreenBody.jsx";
import ConsoleFrame from "./ConsoleFrame.jsx";
import FloatersDesktop from "./FloatersDesktop.jsx";
import SystemDialog from "./SystemDialog.jsx";
import Toast from "./Toast.jsx";
import BottomTabs from "./BottomTabs.jsx";
import TileNav from "./TileNav.jsx";

// The deployed application: the same screens and layouts as the design canvas,
// but filling the real viewport. No picker sidebar, no phone bezel and no
// simulated status bar -- those exist to show the design off, not to ship.
//
// StatusBar is deliberately absent: it renders a hardcoded "14:32", a fake
// notch and fake signal/battery glyphs, which would be wrong on a real device.
// MenuBar stays, because it is the actual desktop File/Edit/View/World menu.

// The device profile is what drives the nav mode (tabs / rail / tiles /
// floaters) and the split-pane layout, so derive it from the real viewport.
// Thresholds follow DEVICES: desk and tab/fold are the `split` profiles.
function deviceForWidth(width) {
  if (width >= 1280) return "desk";
  if (width >= 900) return "tab";
  if (width >= 700) return "fold";
  return "ios";
}

export default function AppShell() {
  const { state, actions } = useApp();
  const { V, t, isFloat, isConsole } = useTheme();
  const { setDevice } = actions;
  const setScreenRef = useRef(actions.setScreen);
  setScreenRef.current = actions.setScreen;

  // One protocol stack for the session.
  useEffect(() => {
    void app.init().catch((error) => console.error("Linkpoint failed to initialize", error));
    return () => app.world.stopRendering();
  }, []);

  // useAppState already starts on Login, so the logged-out case needs nothing.
  // A restored session does: move off Login so the resident is not asked to
  // sign in again. Guarded to run once, because setScreen is recreated whenever
  // the nav mode changes and re-running this would yank them back mid-navigation.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current) return;
    landed.current = true;
    if (app.auth.isLoggedIn()) setScreenRef.current("Chat");
  }, []);

  useEffect(() => {
    const apply = () => setDevice(deviceForWidth(window.innerWidth));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setDevice]);

  // Login is a pre-session, full-view screen. The console and floater layouts
  // are workspaces for a connected session -- on a desktop width, routing Login
  // through FloatersDesktop renders it inside whichever floater window happens
  // to be focused, which buries the only way to connect. So before a session
  // the login view gets the whole window, with no chrome around it: the rail,
  // tabs, tiles and desktop menu all navigate to screens that need a
  // connection, and none of them can do anything useful yet.
  const preSession = state.screen === "Login";

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: V.bg, color: V.ink, fontFamily: t.font }}>
      {preSession ? null : <MenuBar />}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", display: "flex", overflow: "hidden", background: V.bg }}>
        {preSession ? <ScreenBody /> : isConsole ? <ConsoleFrame /> : isFloat ? <FloatersDesktop /> : <Shell />}
        <SystemDialog />
        <Toast />
      </div>
      {preSession ? null : <BottomTabs />}
      {preSession ? null : <TileNav />}
    </div>
  );
}
