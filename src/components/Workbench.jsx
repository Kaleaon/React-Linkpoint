import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { LAYOUTS } from "../theme/layouts.js";
import { PALETTES } from "../theme/palettes.js";
import { DEVICES } from "../theme/constants.js";
import { NAV_ALL } from "../data/content.js";
import DeviceFrame from "./DeviceFrame.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

// The page around the prototype: the layout/palette/device/screen/state
// pickers on the left, the device frame on the stage to the right. index.css
// already carries this page's classes (.app-shell/.app-body/.sidepanels/.pnl/
// .pick/.tag/.stage) — its header comment names this component as their owner.

const STATE_PICKS = [
  { key: "normal", label: "Normal" },
  { key: "loading", label: "Loading" },
  { key: "empty", label: "Empty" },
  { key: "error", label: "Error" },
];

// Every reachable screen: the nav destinations plus the two that are only
// reached through a flow (Login on launch, Search from Friends/Radar).
const SCREEN_PICKS = ["Login", ...NAV_ALL.map((n) => n.id), "Search"];

function Panel({ title, children }) {
  return (
    <div className="pnl">
      <div className="pnlh">{title}</div>
      {children}
    </div>
  );
}

function PickList({ items, active, onPick }) {
  return (
    <div>
      {items.map((it) => (
        <button
          type="button"
          key={it.key}
          className="pick"
          onClick={() => onPick(it.key)}
          aria-pressed={active === it.key}
          style={active === it.key ? { background: "rgba(108,255,154,.14)", color: "#6cff9a" } : undefined}
        >
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.note ? <span style={{ font: "400 9.5px/1 monospace", color: "rgba(255,255,255,.4)" }}>{it.note}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function Workbench() {
  const { state, actions } = useApp();
  const { t } = useTheme();

  return (
    <div className="app-shell">
      <div className="app-title">
        <span className="app-tid">LINKPOINT</span>
        <span className="app-tname">{t.name}</span>
      </div>
      <div className="app-note">{t.note}</div>

      <div className="app-body">
        <div className="sidepanels">
          <Panel title="LAYOUT">
            <PickList
              items={Object.keys(LAYOUTS).map((k) => ({ key: k, label: LAYOUTS[k].name, note: LAYOUTS[k].nav }))}
              active={state.layout}
              onPick={actions.setLayout}
            />
          </Panel>
          <Panel title="COLOUR PACK">
            <PickList items={Object.keys(PALETTES).map((k) => ({ key: k, label: PALETTES[k].name }))} active={state.palette} onPick={actions.setPalette} />
          </Panel>
          <Panel title="DEVICE">
            <PickList items={Object.keys(DEVICES).map((k) => ({ key: k, label: DEVICES[k].name, note: DEVICES[k].dims }))} active={state.device} onPick={actions.setDevice} />
          </Panel>
          <Panel title="SCREEN">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {SCREEN_PICKS.map((id) => (
                <button
                  type="button"
                  key={id}
                  className="tag"
                  onClick={() => actions.setScreen(id)}
                  aria-pressed={state.screen === id}
                  style={state.screen === id ? { borderColor: "#6cff9a", color: "#6cff9a" } : undefined}
                >
                  {id}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="STATE">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {STATE_PICKS.map((s) => (
                <button
                  type="button"
                  key={s.key}
                  className="tag"
                  onClick={() => actions.setCond(s.key)}
                  aria-pressed={state.cond === s.key}
                  style={state.cond === s.key ? { borderColor: "#6cff9a", color: "#6cff9a" } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="tag" onClick={() => actions.setDense(!state.dense)} aria-pressed={state.dense} style={{ marginTop: "8px", width: "100%", ...(state.dense ? { borderColor: "#6cff9a", color: "#6cff9a" } : null) }}>
              {state.dense ? "DENSE SPACING: ON" : "DENSE SPACING: OFF"}
            </button>
          </Panel>
        </div>

        <div className="stage">
          {/* Keyed on the inputs that swap whole subtrees, so a failure that
              was specific to one screen or pack clears when you move off it. */}
          <ErrorBoundary label={state.screen} key={state.layout + "/" + state.palette + "/" + state.device + "/" + state.screen + "/" + state.cond}>
            <DeviceFrame />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
