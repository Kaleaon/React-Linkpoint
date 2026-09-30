import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";

export default function Settings() {
  const { state, actions } = useApp();
  const [disconnecting, setDisconnecting] = useState(false);
  const user = app.auth.user;
  const region = app.world.region;

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await app.auth.logout();
      actions.setScreen("Login");
    } finally {
      setDisconnecting(false);
    }
  };

  return <div className="tool-page">
    <section className="runtime-card">
      <Icon name="plug" size={22} />
      <h2>Current session</h2>
      <dl>
        <dt>Status</dt><dd>{app.auth.isLoggedIn() ? "Connected" : "Disconnected"}</dd>
        <dt>Resident</dt><dd>{user?.fullName || "—"}</dd>
        <dt>Grid</dt><dd>{user?.grid || "—"}</dd>
        <dt>Region</dt><dd>{region?.name || app.protocol.authReply?.sim_name || "Not supplied"}</dd>
        <dt>Agent ID</dt><dd>{app.protocol.agentId || "Not supplied"}</dd>
      </dl>
      {app.auth.isLoggedIn() ? <button type="button" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? "Disconnecting…" : "Disconnect"}</button> : null}
    </section>
    <section className="runtime-card">
      <Icon name="settings" size={22} />
      <h2>Viewer preferences</h2>
      <label>Draw distance
        <select value={state.prefs.draw} onChange={(event) => actions.setPref("draw", event.target.value)}>
          {["64 m", "96 m", "128 m", "192 m", "256 m"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>Graphics quality
        <select value={state.prefs.quality} onChange={(event) => actions.setPref("quality", event.target.value)}>
          {["Low", "Balanced", "High", "Ultra"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>Bandwidth limit
        <select value={state.prefs.bandwidth} onChange={(event) => actions.setPref("bandwidth", event.target.value)}>
          {["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
    </section>
  </div>;
}
