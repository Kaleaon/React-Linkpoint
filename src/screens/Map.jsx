import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";

export default function Map() {
  const { V, t } = useTheme();
  const [region, setRegion] = useState(app.world.region);
  useEffect(() => {
    const changed = (next) => setRegion(next);
    app.world.on("region_changed", changed);
    return () => app.world.off("region_changed", changed);
  }, []);

  return <section className="live-screen">
    {region ? <div className="tool-page"><article className="runtime-card" style={{ borderColor: V.outv, background: V.surf }}>
      <Icon name="map-pin" size={26} style={{ color: V.pri }} />
      <h2 style={{ font: `600 18px/1.3 ${t.dfont}` }}>{region.name || "Current region"}</h2>
      <dl><dt>Region ID</dt><dd>{region.id || "Not supplied"}</dd><dt>Coordinates</dt><dd>{[region.x, region.y].filter((value) => value != null).join(", ") || "Not supplied"}</dd></dl>
    </article></div> : <div className="honest-empty"><Icon name="map" size={30} /><h2>Map</h2><p>{app.auth.isLoggedIn() ? "Waiting for a region handshake from the simulator." : "Connect to a grid to load your current region."}</p></div>}
  </section>;
}
