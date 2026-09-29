import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";

export default function Radar() {
  const { V, t } = useTheme();
  const [objects, setObjects] = useState(() => [...app.world.objects]);
  const [nearby, setNearby] = useState(() => [...app.world.nearbyUsers]);

  useEffect(() => {
    const objectsChanged = (items) => setObjects([...items]);
    const nearbyChanged = (items) => setNearby([...items]);
    app.world.on("objects_changed", objectsChanged);
    app.world.on("nearby_changed", nearbyChanged);
    return () => {
      app.world.off("objects_changed", objectsChanged);
      app.world.off("nearby_changed", nearbyChanged);
    };
  }, []);

  const rows = useMemo(() => [
    ...nearby.map((item) => ({ ...item, kind: "avatar", name: item.name || item.id, icon: "user" })),
    ...objects.map((item) => ({ ...item, kind: "object", name: item.name || item.id, icon: "box" })),
  ].sort((a, b) => Number(a.distance ?? Infinity) - Number(b.distance ?? Infinity)), [nearby, objects]);

  return <section className="live-screen" aria-live="polite">
    <div className="live-list">
      {rows.length ? rows.map((row) => <article className="inventory-row" style={{ borderColor: V.outv }} key={`${row.kind}-${row.id}`}>
        <Icon name={row.icon} size={18} style={{ color: row.kind === "avatar" ? V.pri : V.sec2 }} />
        <div><strong style={{ font: `600 13px/1.3 ${t.font}` }}>{row.name}</strong><small>{row.distance != null ? `${Number(row.distance).toFixed(1)} m` : row.kind === "avatar" ? "Nearby avatar" : "Simulator object"}</small></div>
      </article>) : <div className="honest-empty"><Icon name="radar" size={30} /><h2>Radar</h2><p>{app.auth.isLoggedIn() ? "No nearby avatars or objects have been received from the simulator." : "Connect to a grid to receive nearby avatars and objects."}</p></div>}
    </div>
  </section>;
}
