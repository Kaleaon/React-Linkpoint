import { useEffect } from "react";
import { AppProvider } from "./context/AppContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { useApp } from "./context/AppContext.jsx";
import { useTheme } from "./context/ThemeContext.jsx";
import Login from "./screens/Login.jsx";
import Chat from "./screens/Chat.jsx";
import World3D, { World3DActionBar } from "./screens/World3D.jsx";
import { app } from "./linkpoint/app";

function Viewer() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  useEffect(() => {
    void app.init().catch((error) => console.error("Linkpoint failed to initialize", error));
    return () => app.world.stopRendering();
  }, []);

  if (state.screen === "Login") return <main aria-label="Linkpoint login" style={{ minHeight: "100dvh", display: "flex", background: V.bg, color: V.ink, fontFamily: t.font }}><Login /></main>;

  const logout = async () => {
    await app.auth.logout();
    actions.setScreen("Login");
  };

  return <main aria-label="Linkpoint Second Life viewer" style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: V.bg, color: V.ink, fontFamily: t.font }}>
    <nav aria-label="Viewer sections" style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderBottom: `1px solid ${V.outv}`, background: V.surf }}>
      <strong style={{ color: V.pri, marginRight: 8 }}>LINKPOINT</strong>
      {["Chat", "3D View"].map((screen) => <button key={screen} onClick={() => actions.setScreen(screen)} aria-current={state.screen === screen ? "page" : undefined} style={{ minHeight: 40, padding: "0 14px", border: `1px solid ${state.screen === screen ? V.pri : V.outv}`, borderRadius: V.rs, background: state.screen === screen ? V.priC : V.bg, color: state.screen === screen ? V.pri : V.ink, cursor: "pointer" }}>{screen === "3D View" ? "World" : screen}</button>)}
      <span style={{ flex: 1 }} />
      <span style={{ color: V.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.auth.getUserDisplayName()}</span>
      <button onClick={logout} style={{ minHeight: 40, border: `1px solid ${V.outv}`, borderRadius: V.rs, background: V.bg, color: V.ink, cursor: "pointer" }}>Log out</button>
    </nav>
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{state.screen === "3D View" ? <><World3D /><World3DActionBar /></> : <Chat />}</div>
  </main>;
}

export default function App() {
  return (
    <AppProvider>
      <ThemeProvider>
        <Viewer />
      </ThemeProvider>
    </AppProvider>
  );
}
