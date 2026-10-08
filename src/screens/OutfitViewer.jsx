import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";
import { slBridge } from "../linkpoint/sl-bridge.ts";
import SHAPE_PARAMS from "../linkpoint/avatar-data/shape-params.json";

const CAMERA_PRESETS = [
  ["front", "Front"],
  ["back", "Back"],
  ["face", "Face"],
  ["side", "Side"],
  ["full", "Full"],
];

/**
 * Outfit viewer: your own avatar in the real 3D renderer, and what you are wearing right now.
 * Everything shown comes from the grid. Wearing, removing and shape editing are not done here yet,
 * so the screen offers no control that pretends to do them.
 */
export default function OutfitViewer() {
  const { V } = useTheme();
  const [activePanel, setActivePanel] = useState("viewport"); // "viewport" | "outfit" | "shape" | "mesh"
  const [autoRotate, setAutoRotate] = useState(false);
  const [cameraPreset, setCameraPreset] = useState("front");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  // What the avatar is really wearing, from the Current Outfit folder. Empty until it loads.
  const [wornItems, setWornItems] = useState([]);
  const [outfitState, setOutfitState] = useState({ loading: false, error: "", loaded: false, outfits: [] });
  const [viewportError, setViewportError] = useState("");
  const [hasAvatar, setHasAvatar] = useState(false);

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [wearQuery, setWearQuery] = useState("");
  // Shape: the real values of the worn Shape (parameter id -> weight), and the edited copy.
  const [shape, setShape] = useState({ state: "idle", error: "", name: "", original: {}, edited: {} });
  const [shapeGroup, setShapeGroup] = useState("shape_body");

  const canvasRef = useRef(null);

  const loadOutfit = useCallback(async () => {
    setOutfitState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const result = await app.loadOutfit();
      setWornItems(Array.isArray(result?.items) ? result.items : []);
      setOutfitState({ loading: false, error: "", loaded: true, outfits: Array.isArray(result?.outfits) ? result.outfits : [] });
    } catch (error) {
      setOutfitState((prev) => ({ ...prev, loading: false, error: error instanceof Error ? error.message : "The outfit could not be loaded." }));
    }
  }, []);

  const say = useCallback((text) => {
    setStatusMessage(text);
    setTimeout(() => setStatusMessage(""), 6000);
  }, []);

  // Run a change on the grid, then read the outfit again. `baked: false` means the grid did not confirm the rebuild.
  const change = useCallback(async (action, success) => {
    setBusy(true);
    try {
      const result = await action();
      say(result?.baked === false ? `${success} The appearance rebuild was not confirmed${result.reason ? `: ${result.reason}` : "."}` : success);
    } catch (error) {
      say(error instanceof Error ? error.message : "The change failed.");
    } finally {
      setBusy(false);
      void loadOutfit();
    }
  }, [loadOutfit, say]);

  useEffect(() => {
    void loadOutfit();
    // The session may not be ready when the screen opens; read the outfit again once it is.
    const reload = () => { void loadOutfit(); };
    app.protocol.on("connected", reload);
    app.inventory.on("inventory_loaded", reload);
    return () => {
      app.protocol.off("connected", reload);
      app.inventory.off("inventory_loaded", reload);
    };
  }, [loadOutfit]);

  const focusSelf = useCallback(() => {
    const id = app.protocol.agentId;
    const focused = Boolean(id) && app.world.focusObjectById(id);
    setHasAvatar(Boolean(focused));
    return Boolean(focused);
  }, []);

  // Camera presets act on the real world camera, orbiting your own avatar.
  const applyCameraPreset = useCallback((preset) => {
    setCameraPreset(preset);
    const world = app.world;
    if (!world.camera3d) return;
    focusSelf();
    switch (preset) {
      case "back":
        world.setCameraPreset("rear");
        break;
      case "face":
        world.setCameraPreset("front");
        world.camera3d.orbitDistance = 1.4;
        break;
      case "side":
        world.setCameraPreset("rear");
        world.rotateCamera(0, 90);
        break;
      case "full":
        world.setCameraPreset("front");
        world.camera3d.orbitDistance = 7;
        break;
      default:
        world.setCameraPreset("front");
        world.camera3d.orbitDistance = 4;
    }
    world.camera3d.updateMatrices();
  }, [focusSelf]);

  // Auto rotation turns the real camera around the avatar.
  useEffect(() => {
    if (!autoRotate) return;
    let animId;
    let lastTime = performance.now();
    const animate = (now) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      app.world.rotateCamera(0, delta * 30);
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [autoRotate]);

  // The viewport is the real world renderer, framed on your own avatar with its baked textures and attachments.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let framed = false;
    const frameOnce = () => {
      if (!active || framed) return;
      framed = focusSelf();
    };
    app.world.on("objects_changed", frameOnce);
    app.world.init(canvas)
      .then(() => {
        if (!active) return;
        if (!app.world.graphics3d) setViewportError("3D rendering is not available on this device.");
        frameOnce();
      })
      .catch((reason) => { if (active) setViewportError(reason instanceof Error ? reason.message : "3D initialization failed."); });
    return () => {
      active = false;
      app.world.off("objects_changed", frameOnce);
      app.world.destroyRenderer(canvas);
    };
  }, [focusSelf]);

  const loadShape = useCallback(async () => {
    setShape((prev) => ({ ...prev, state: "loading", error: "" }));
    try {
      const result = await slBridge.fetchShape();
      const values = Object.fromEntries(Object.entries(result.values || {}).map(([id, weight]) => [id, Number(weight)]));
      setShape({ state: "ready", error: "", name: result.name || "", original: values, edited: { ...values } });
    } catch (error) {
      setShape((prev) => ({ ...prev, state: "error", error: error instanceof Error ? error.message : "Your shape could not be read." }));
    }
  }, []);

  useEffect(() => {
    if (activePanel === "shape" && shape.state === "idle" && app.auth.isLoggedIn()) void loadShape();
  }, [activePanel, shape.state, loadShape]);

  // Pointer drag for 3D rotation
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY };
    app.world.rotateCamera(dy * 0.5, dx * 0.5);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e) => {
    app.world.camera3d?.zoom(-e.deltaY * 0.002);
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return wornItems.filter((item) => {
      const matchQ = !q || item.name.toLowerCase().includes(q) || item.typeName.toLowerCase().includes(q);
      const matchCat = categoryFilter === "all" || item.category === categoryFilter;
      return matchQ && matchCat;
    });
  }, [wornItems, searchQuery, categoryFilter]);

  const counts = useMemo(() => ({
    body: wornItems.filter((i) => i.category === "body").length,
    clothing: wornItems.filter((i) => i.category === "clothing").length,
    attachment: wornItems.filter((i) => i.category === "attachment").length,
  }), [wornItems]);

  // Inventory items that can be worn and are not already: clothing and body parts (5, 13) and objects (6).
  const wearCandidates = useMemo(() => {
    const q = wearQuery.toLowerCase().trim();
    if (q.length < 2) return [];
    const worn = new Set(wornItems.map((item) => String(item.linkedId || "").toLowerCase()));
    return Array.from(app.inventory.items.values())
      .filter((it) => [5, 6, 13].includes(Number(it.assetType)) && !worn.has(String(it.id).toLowerCase()) && String(it.name || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [wearQuery, wornItems]);

  const meshStats = activePanel === "mesh" ? app.world.getAttachmentMeshStats() : { attachments: 0, meshes: 0, vertices: 0, triangles: 0 };
  const loggedIn = app.auth.isLoggedIn();
  const small = (extra) => ({ fontSize: 11, color: V.ink2, ...extra });
  const note = (text) => <div style={{ padding: 16, textAlign: "center", color: V.ink2, fontSize: 11 }}>{text}</div>;

  const emptyText = !loggedIn
    ? "Connect to a grid to see what you are wearing."
    : outfitState.error
      ? `Your outfit could not be loaded: ${outfitState.error}`
      : outfitState.loading && !outfitState.loaded
        ? "Loading your outfit…"
        : wornItems.length
          ? "No outfit items match the current filter."
          : "The grid reports nothing worn.";

  return (
    <section className="live-screen outfit-viewer-screen" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, height: "100%", overflowY: "auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${V.outv}`, paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="shirt" size={20} style={{ color: V.pri }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.ink }}>FULL OUTFIT VIEWER</h1>
            <span style={small()}>Your avatar in 3D and what you are wearing</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: V.surf, padding: 3, borderRadius: V.rs, border: `1px solid ${V.outv}` }}>
          {[
            ["viewport", "3D View", "eye"],
            ["outfit", "Outfit Items", "package"],
            ["shape", "Shape", "sliders"],
            ["mesh", "Mesh View", "box"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePanel(id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                borderRadius: V.rs,
                background: activePanel === id ? V.pri : "transparent",
                color: activePanel === id ? (V.onpri || "#fff") : V.ink,
                cursor: "pointer",
              }}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {statusMessage ? (
        <div role="status" style={{ padding: "6px 12px", background: "rgba(56, 189, 248, 0.15)", border: `1px solid ${V.pri}`, borderRadius: V.rs, fontSize: 12, color: V.pri, fontWeight: 600 }}>{statusMessage}</div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 420 }}>
        {/* 3D Viewport Panel */}
        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", background: V.bg, border: `1px solid ${V.outv}`, borderRadius: V.rs, position: "relative", overflow: "hidden" }}>
          <canvas
            ref={canvasRef}
            aria-label="3D Avatar Viewport"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            style={{ width: "100%", height: "100%", cursor: "grab", touchAction: "none" }}
          />

          {(viewportError || !loggedIn || !hasAvatar) && (
            <div role="status" style={{ position: "absolute", top: 12, left: 12, right: 12, padding: "6px 10px", background: "rgba(15, 23, 42, 0.85)", color: "#cbd5e1", fontSize: 11, borderRadius: V.rs, border: `1px solid ${V.outv}` }}>
              {viewportError
                ? viewportError
                : !loggedIn
                  ? "Connect to a grid to see your avatar."
                  : "Waiting for the simulator to send your avatar…"}
            </div>
          )}

          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(6px)", padding: "6px 10px", borderRadius: V.rs, border: `1px solid ${V.outv}` }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginRight: 4 }}>CAMERA:</span>
              {CAMERA_PRESETS.map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyCameraPreset(p)}
                  style={{
                    padding: "3px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                    border: `1px solid ${cameraPreset === p ? V.pri : "rgba(255,255,255,0.2)"}`,
                    borderRadius: V.rs,
                    background: cameraPreset === p ? V.pri : "transparent",
                    color: cameraPreset === p ? "#fff" : "#cbd5e1",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setAutoRotate(!autoRotate)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: V.rs,
                  border: `1px solid ${autoRotate ? V.sec2 : "rgba(255,255,255,0.2)"}`,
                  background: autoRotate ? "rgba(168, 85, 247, 0.3)" : "transparent",
                  color: autoRotate ? V.sec2 : "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <Icon name="rotate-cw" size={12} />
                {autoRotate ? "SPINNING" : "AUTO-SPIN"}
              </button>

              <button
                type="button"
                onClick={() => applyCameraPreset("front")}
                title="Reset Camera View"
                style={{ padding: "3px 6px", fontSize: 10, background: "transparent", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.2)", borderRadius: V.rs, cursor: "pointer" }}
              >
                RESET
              </button>
            </div>
          </div>
        </div>

        {/* Right Details Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rs, padding: 12, overflowY: "auto" }}>
          {(activePanel === "outfit" || activePanel === "viewport") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: V.pri, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="package" size={16} /> WORN OUTFIT ITEMS ({wornItems.length})
                </h2>
                <button
                  type="button"
                  disabled={outfitState.loading || !loggedIn}
                  onClick={() => void loadOutfit()}
                  title="Read what you are wearing from Second Life again"
                  style={{ padding: "4px 8px", fontSize: 10, fontWeight: 700, background: V.pri, color: V.onpri || "#fff", border: "none", borderRadius: V.rs, cursor: "pointer" }}
                >
                  {outfitState.loading ? "LOADING…" : "REFRESH"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter outfit items..."
                  style={{ flex: 1, padding: "5px 8px", fontSize: 11, background: V.bg, color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs }}
                />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ padding: "5px 8px", fontSize: 11, background: V.bg, color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs }}
                >
                  <option value="all">All Items</option>
                  <option value="clothing">Clothing</option>
                  <option value="body">Body Parts</option>
                  <option value="attachment">Attachments</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {filteredItems.length ? (
                  filteredItems.map((item) => (
                    <div
                      key={item.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(56, 189, 248, 0.08)", border: `1px solid ${V.pri}`, borderRadius: V.rs }}
                    >
                      <Icon name={item.category === "attachment" ? "paperclip" : item.category === "body" ? "user" : "shirt"} size={15} style={{ color: V.pri }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: V.ink }}>{item.name}</div>
                        <div style={small({ fontSize: 10 })}>{item.typeName} · {item.category}</div>
                      </div>
                      {item.category !== "body" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void change(() => slBridge.removeWorn({ linkId: item.id }), `Took off ${item.name}.`)}
                          title={item.category === "attachment" ? "Detach and take off" : "Take off"}
                          style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: V.rs, border: `1px solid ${V.err || V.outv}`, background: "transparent", color: V.err || V.ink, cursor: "pointer" }}
                        >
                          TAKE OFF
                        </button>
                      )}
                    </div>
                  ))
                ) : note(emptyText)}
              </div>
              <h2 style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 700, color: V.pri }}>WEAR FROM INVENTORY</h2>
              <input
                type="text"
                value={wearQuery}
                onChange={(e) => setWearQuery(e.target.value)}
                placeholder="Search your inventory (2+ letters)..."
                aria-label="Search inventory to wear"
                style={{ padding: "5px 8px", fontSize: 11, background: V.bg, color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs }}
              />
              {wearCandidates.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                  {wearCandidates.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: V.bg, border: `1px solid ${V.outv}`, borderRadius: V.rs }}>
                      <span style={{ flex: 1, fontSize: 12, color: V.ink }}>{it.name}</span>
                      <button type="button" disabled={busy || !loggedIn} onClick={() => void change(() => slBridge.wearItem({ itemId: it.id }), `Now wearing ${it.name}.`)} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: V.rs, border: `1px solid ${V.pri}`, background: V.pri, color: V.onpri || "#fff", cursor: "pointer" }}>WEAR</button>
                    </div>
                  ))}
                </div>
              ) : wearQuery.trim().length >= 2 ? note("Nothing wearable matches. Open the folder in Inventory first if it has not loaded.") : null}

              <h2 style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 700, color: V.pri }}>SAVED OUTFITS ({outfitState.outfits.length})</h2>
              {outfitState.outfits.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {outfitState.outfits.map((outfit) => (
                    <div key={outfit.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", fontSize: 12, color: V.ink, background: V.bg, border: `1px solid ${V.outv}`, borderRadius: V.rs }}>
                      <span style={{ flex: 1 }}>{outfit.name}</span>
                      <button type="button" disabled={busy || !loggedIn} onClick={() => void change(() => slBridge.wearOutfit({ folderId: outfit.id }), `Now wearing the outfit ${outfit.name}.`)} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: V.rs, border: `1px solid ${V.pri}`, background: V.pri, color: V.onpri || "#fff", cursor: "pointer" }}>WEAR OUTFIT</button>
                    </div>
                  ))}
                </div>
              ) : note(outfitState.loaded ? "No saved outfits in My Outfits." : "—")}
            </div>
          )}

          {activePanel === "shape" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: V.pri, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="sliders" size={16} /> AVATAR SHAPE{shape.name ? ` — ${shape.name}` : ""}
              </h2>
              {!loggedIn ? note("Connect to a grid to see your shape.")
                : shape.state === "loading" || shape.state === "idle" ? note("Reading your shape…")
                : shape.state === "error" ? (
                  <>
                    {note(`Your shape could not be read: ${shape.error}`)}
                    <button type="button" onClick={() => void loadShape()} style={{ alignSelf: "center", padding: "4px 10px", fontSize: 11, fontWeight: 700, background: V.pri, color: V.onpri || "#fff", border: "none", borderRadius: V.rs, cursor: "pointer" }}>TRY AGAIN</button>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {[...new Set(SHAPE_PARAMS.map((param) => param.group))].map((group) => (
                        <button key={group} type="button" onClick={() => setShapeGroup(group)} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: V.rs, border: `1px solid ${shapeGroup === group ? V.pri : V.outv}`, background: shapeGroup === group ? V.pri : "transparent", color: shapeGroup === group ? (V.onpri || "#fff") : V.ink, cursor: "pointer" }}>
                          {group.replace("shape_", "").toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {SHAPE_PARAMS.filter((param) => param.group === shapeGroup).map((param) => {
                      const value = shape.edited[param.id] ?? param.default;
                      return (
                        <label key={param.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 2, fontSize: 11, color: V.ink }}>
                          <span>{param.label}</span>
                          <span style={small()}>{Number(value).toFixed(2)}</span>
                          <input
                            type="range"
                            aria-label={param.label}
                            min={param.min}
                            max={param.max}
                            step={(param.max - param.min) / 100}
                            value={value}
                            onChange={(e) => setShape((prev) => ({ ...prev, edited: { ...prev.edited, [param.id]: Number(e.target.value) } }))}
                            style={{ gridColumn: "1 / span 2" }}
                          />
                          <span style={small({ fontSize: 9 })}>{param.labelMin}</span>
                          <span style={small({ fontSize: 9, textAlign: "right" })}>{param.labelMax}</span>
                        </label>
                      );
                    })}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" disabled={busy} onClick={() => setShape((prev) => ({ ...prev, edited: { ...prev.original } }))} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: "transparent", color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs, cursor: "pointer" }}>REVERT</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void change(async () => { const result = await slBridge.saveShape({ values: shape.edited }); await loadShape(); return result; }, "Saved as a new shape and put it on.")}
                        style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: V.pri, color: V.onpri || "#fff", border: "none", borderRadius: V.rs, cursor: "pointer" }}
                      >
                        SAVE AS NEW SHAPE &amp; WEAR
                      </button>
                    </div>
                    <div style={small({ fontSize: 10 })}>Your current shape is never overwritten; wear it again to undo.</div>
                  </>
                )}
            </div>
          )}

          {activePanel === "mesh" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: V.pri, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="box" size={16} /> MESH & SKELETON INSPECTION
              </h2>
              <div style={{ background: V.bg, padding: 10, borderRadius: V.rs, border: `1px solid ${V.outv}`, fontSize: 11, color: V.ink2, display: "flex", flexDirection: "column", gap: 4 }}>
                <strong style={{ color: V.pri }}>WHAT YOU ARE WEARING</strong>
                <div>Body parts: {outfitState.loaded ? counts.body : "—"}</div>
                <div>Clothing layers: {outfitState.loaded ? counts.clothing : "—"}</div>
                <div>Attachments: {outfitState.loaded ? counts.attachment : "—"}</div>
                <div>Attachment meshes decoded so far: {meshStats.meshes} of {meshStats.attachments} attachments</div>
                <div>Vertices: {meshStats.meshes ? meshStats.vertices.toLocaleString() : "—"} · Triangles: {meshStats.meshes ? meshStats.triangles.toLocaleString() : "—"}</div>
                <div style={small({ fontSize: 10 })}>Counts cover attachments only; the base avatar body is built by the viewer and not counted. Joint counts are not reported.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
