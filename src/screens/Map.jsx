import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";

function mapTileUrl(x, y) {
  return `https://map.secondlife.com/map-1-${x}-${y}-objects.jpg`;
}

export default function Map() {
  const { V, t } = useTheme();
  const [region, setRegion] = useState(app.world.region);
  useEffect(() => {
    const changed = (next) => setRegion(next);
    app.world.on("region_changed", changed);
    return () => app.world.off("region_changed", changed);
  }, []);

  const hasCoordinates = Number.isFinite(region?.x) && Number.isFinite(region?.y);
  const isSecondLife = ["agni", "aditi"].includes(String(app.auth.user?.grid || "").toLowerCase());
  const tiles = hasCoordinates && isSecondLife
    ? [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: region.x + dx, y: region.y - dy, center: dx === 0 && dy === 0 })))
    : [];

  return <section className="live-screen">
    {region ? <div className="tool-page">
      {tiles.length ? <div aria-label={`Live Second Life map around ${region.name || "the current region"}`} style={{ position: "relative", width: "min(100%, 660px)", aspectRatio: "1", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", overflow: "hidden", border: `1px solid ${V.outv}`, background: V.surf }}>
        {tiles.map((tile) => <div key={`${tile.x}-${tile.y}`} style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
          <img src={mapTileUrl(tile.x, tile.y)} alt={`Grid region tile ${tile.x}, ${tile.y}`} loading={tile.center ? "eager" : "lazy"} style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }} />
          {tile.center ? <Icon name="map-pin" size={30} style={{ position: "absolute", left: "50%", top: "50%", color: V.pri, filter: "drop-shadow(0 1px 2px #000)", transform: "translate(-50%, -100%)" }} /> : null}
        </div>)}
      </div> : null}
      <article className="runtime-card" style={{ borderColor: V.outv, background: V.surf }}>
        <Icon name="map-pin" size={26} style={{ color: V.pri }} />
        <h2 style={{ font: `600 18px/1.3 ${t.dfont}` }}>{region.name || "Current region"}</h2>
        <dl><dt>Region ID</dt><dd>{region.id || "Not supplied by grid"}</dd><dt>Grid coordinates</dt><dd>{hasCoordinates ? `${region.x}, ${region.y}` : "Not supplied by grid"}</dd>{region.parcel ? <><dt>Parcel</dt><dd>{region.parcel.Name || region.parcel.name || "Unnamed parcel"}</dd></> : null}</dl>
        {!isSecondLife && <small>Map tiles are not advertised by this grid; showing handshake data only.</small>}
      </article>
    </div> : <div className="honest-empty"><Icon name="map" size={30} /><h2>Map</h2><p>{app.auth.isLoggedIn() ? "Waiting for a region handshake from the simulator." : "Connect to a grid to load your current region."}</p></div>}
  </section>;
}
