import { useMemo, useState, useEffect } from "react";
import { app } from "../linkpoint/app.ts";
import { GRIDS } from "../theme/constants.js";
import Icon from "../components/Icon.jsx";
import AssetContainer from "../components/AssetContainer.jsx";
import PayDialog from "../components/PayDialog.jsx";

function Empty({ icon, children }) {
  return <div className="honest-empty"><Icon name={icon} size={30} /><p>{children}</p></div>;
}

export function AccountsScreen() {
  const [credentials, setCredentials] = useState(() => app.auth.credentials);
  const clear = () => { app.auth.credentials = null; localStorage.removeItem("linkpoint_credentials"); setCredentials(null); };
  return credentials ? <div className="tool-page"><section className="runtime-card"><Icon name="contact" size={24} /><h2>{credentials.username}</h2><p>{credentials.grid}</p><button onClick={clear}>Forget account</button></section></div> : <Empty icon="contact">No remembered account. Linkpoint never stores the account password.</Empty>;
}

export function GridsScreen() {
  const custom = app.preferences.get("network", "customGrids") || [];
  const grids = [...GRIDS, ...custom];
  return <div className="tool-page"><h2>Login grids</h2>{grids.map((grid) => <section className="runtime-card" key={grid.key || grid.host}><strong>{grid.label}</strong><small>{grid.host}</small></section>)}</div>;
}

export function MediaScreen() {
  const [url, setUrl] = useState("");
  const [active, setActive] = useState("");
  return <div className="tool-page"><h2>Streaming media</h2><div className="inline-tool"><input type="url" aria-label="HTTPS audio stream URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="HTTPS audio stream URL" /><button onClick={() => setActive(url.trim())} disabled={!/^https:\/\//i.test(url.trim())}>Play</button></div>{active ? <audio className="media-player" src={active} controls autoPlay onError={() => setActive("")} /> : <Empty icon="radio">Enter an HTTPS stream supplied by the current parcel or broadcaster.</Empty>}</div>;
}

export function NotecardsScreen() {
  const cards = useMemo(() => Array.from(app.inventory.items.values()).filter((item) => Number(item.assetType) === 7), []);
  const [selected, setSelected] = useState(null);
  return (
    <div className="tool-page">
      <h2>Notecards</h2>
      {cards.length ? cards.map((card) => (
        <button className="runtime-card runtime-card-button" key={card.id} onClick={() => setSelected(card)}>
          <Icon name="file-text" size={18} />
          <span>{card.name}</span>
        </button>
      )) : <Empty icon="file-text">No notecards have been loaded from inventory.</Empty>}
      {selected ? (
        <AssetContainer asset={selected} title={selected.name}>
          <h3>{selected.name}</h3>
          <p>{selected.description || selected.data || "Notecard asset content loaded."}</p>
          <small>{selected.id}</small>
        </AssetContainer>
      ) : null}
    </div>
  );
}

export function ParcelScreen() {
  const parcel = app.world.region?.parcel;
  return parcel ? <div className="tool-page"><section className="runtime-card"><h2>{parcel.name || "Unnamed parcel"}</h2><pre>{JSON.stringify(parcel, null, 2)}</pre></section></div> : <Empty icon="map-pin">No parcel-properties message has been received.</Empty>;
}

export function TransactionsScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState({ id: "", name: "Resident", type: "avatar" });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    void app.economy.init();
    void app.economy.fetchHistory();

    const updateHandler = () => setRefreshTrigger((prev) => prev + 1);
    app.economy.on("transactions_updated", updateHandler);
    app.economy.on("transaction_added", updateHandler);
    app.economy.on("balance_updated", updateHandler);

    return () => {
      app.economy.off("transactions_updated", updateHandler);
      app.economy.off("transaction_added", updateHandler);
      app.economy.off("balance_updated", updateHandler);
    };
  }, []);

  const transactions = useMemo(() => app.economy.getTransactions(searchQuery), [searchQuery, refreshTrigger]);
  const stats = useMemo(() => app.economy.getStats(), [refreshTrigger]);

  const openPayDialog = (targetId = "", targetName = "Resident", targetType = "avatar") => {
    setPayTarget({ id: targetId, name: targetName, type: targetType });
    setPayModalOpen(true);
  };

  return (
    <div className="tool-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0 }}>Transaction Ledger (30-Day Cache)</h2>
        <button
          onClick={() => openPayDialog("", "Nearby Target", "avatar")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            backgroundColor: "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontWeight: "600",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          <Icon name="banknote" size={16} />
          <span>Pay / Tip</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <section className="runtime-card" style={{ margin: 0, padding: "12px" }}>
          <small style={{ color: "#94a3b8" }}>Current Balance</small>
          <strong style={{ fontSize: "18px", color: "#38bdf8", display: "block", marginTop: "4px" }}>
            L$ {stats.balance === null ? "—" : stats.balance.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: "12px" }}>
          <small style={{ color: "#94a3b8" }}>Spent (30 days)</small>
          <strong style={{ fontSize: "18px", color: "#f43f5e", display: "block", marginTop: "4px" }}>
            L$ {stats.totalSpent30Days.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: "12px" }}>
          <small style={{ color: "#94a3b8" }}>Received (30 days)</small>
          <strong style={{ fontSize: "18px", color: "#34d399", display: "block", marginTop: "4px" }}>
            L$ {stats.totalReceived30Days.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: "12px" }}>
          <small style={{ color: "#94a3b8" }}>Total Records</small>
          <strong style={{ fontSize: "18px", color: "#e2e8f0", display: "block", marginTop: "4px" }}>
            {stats.totalTransactions}
          </strong>
        </section>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Filter transactions by description, resident, object, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid #334155",
            backgroundColor: "#0f172a",
            color: "#f8fafc",
            fontSize: "14px",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
      </div>

      {/* Transaction List */}
      {transactions.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {transactions.map((entry) => {
            const isNegative = entry.type === "payment" || entry.amount < 0;
            return (
              <section className="runtime-card" key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name={entry.targetType === "object" ? "box" : "contact"} size={16} style={{ color: "#94a3b8" }} />
                    <strong style={{ fontSize: "14px" }}>{entry.description || entry.id}</strong>
                    {entry.status === "failed" && (
                      <span style={{ fontSize: "11px", backgroundColor: "rgba(244, 63, 94, 0.2)", color: "#f43f5e", padding: "2px 6px", borderRadius: "4px" }}>Failed</span>
                    )}
                  </div>
                  <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "12px" }}>
                    {entry.targetName ? `Target: ${entry.targetName} • ` : ""}{new Date(entry.timestamp).toLocaleString()}
                  </small>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontWeight: "700", fontSize: "16px", color: isNegative ? "#f43f5e" : "#34d399" }}>
                    {isNegative ? `- L$ ${Math.abs(entry.amount)}` : `+ L$ ${entry.amount}`}
                  </span>
                  <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>{entry.type}</small>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Empty icon="banknote">
          {searchQuery ? "No transaction records match your search filter." : "No transactions stored in local 30-day ledger."}
        </Empty>
      )}

      {/* Pay Dialog Modal */}
      <PayDialog
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        target={payTarget}
        onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
      />
    </div>
  );
}

export function TeleportScreen() {
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("");
  const teleport = async () => {
    try {
      const result = await app.protocol.teleportTo(destination.trim());
      setStatus(result?.message ? `Grid: ${result.message}` : `Teleport to ${result?.requested?.region || destination.trim()} requested.`);
    } catch (error) {
      if (!app.interactions.teleportSession) {
        setStatus(error instanceof Error ? error.message : "Teleport failed.");
      }
    }
  };
  return <div className="tool-page"><h2>Teleport</h2><div className="inline-tool"><input aria-label="Teleport destination URI" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="secondlife://Region/x/y/z" /><button onClick={() => void teleport()} disabled={!destination.trim()}>Go</button></div>{status ? <p className="tool-status">{status}</p> : null}</div>;
}

export function DiagnosticsScreen() {
  const capabilities = Object.keys(app.protocol.capabilities || {});
  return <div className="tool-page"><section className="runtime-card"><h2>Connection</h2><dl><dt>State</dt><dd>{app.protocol.connected ? "Connected" : "Disconnected"}</dd><dt>Agent</dt><dd>{app.protocol.agentId || "—"}</dd><dt>Session</dt><dd>{app.protocol.sessionId || "—"}</dd><dt>Capabilities</dt><dd>{capabilities.length}</dd></dl></section>{capabilities.length ? <section className="runtime-card"><h2>Capabilities</h2>{capabilities.sort().map((name) => <small key={name}>{name}</small>)}</section> : null}</div>;
}

// The animation overrider is a worn attachment with its own scripts. The grid
// does not tell the viewer which attachments, scripts or animations are running,
// so there is nothing real to list here yet.
export function AOScreen() {
  return <div className="tool-page"><Empty icon="person-standing">Animation overrider status is not available. The viewer does not receive worn-attachment or script information from the grid yet.</Empty></div>;
}
