import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import StatusBar from "./StatusBar.jsx";
import MenuBar from "./MenuBar.jsx";
import Shell from "./Shell.jsx";
import ConsoleFrame from "./ConsoleFrame.jsx";
import FloatersDesktop from "./FloatersDesktop.jsx";
import SystemDialog from "./SystemDialog.jsx";
import Toast from "./Toast.jsx";
import BottomTabs from "./BottomTabs.jsx";
import TileNav from "./TileNav.jsx";

// Ported from `bezelStyle`/`frameStyle`/`cfWrap` — the phone/tablet/desktop
// device chrome that everything else renders inside of.
export default function DeviceFrame() {
  const { state } = useApp();
  const { V, t, d, isFloat, isConsole } = useTheme();

  const bezelStyle = { position: "relative", background: "#0b0b0a", border: "1px solid rgba(255,255,255,.16)", borderRadius: isFloat ? "10px" : "34px", padding: isFloat ? "7px" : "12px", boxShadow: "0 24px 60px rgba(0,0,0,.55)" };
  const frameStyle = { position: "relative", overflow: "hidden", borderRadius: "24px", background: V.bg, color: V.ink, fontFamily: t.font, display: "flex", flexDirection: "column", width: d.w + "px", height: d.h + "px" };
  const cfWrap = { flex: 1, minHeight: 0, minWidth: 0, position: "relative", display: "flex", overflow: "hidden", background: V.bg };

  return (
    <div style={bezelStyle}>
      <div style={frameStyle}>
        <StatusBar />
        <MenuBar />
        <div style={cfWrap}>
          {isConsole ? <ConsoleFrame /> : isFloat ? <FloatersDesktop /> : <Shell />}
          <SystemDialog />
          <Toast />
        </div>
        <BottomTabs />
        <TileNav />
      </div>
    </div>
  );
}
