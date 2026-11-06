import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { subView } from '../theme/constants.js';
import DiagnosticsPanel from './DiagnosticsPanel.jsx';
import CapabilityExplorer from './CapabilityExplorer.jsx';

/**
 * Composite DiagnosticsContainer mounting either real-time network telemetry
 * or the protocol capability explorer based on the active sub-navigation tab.
 */
export default function DiagnosticsContainer({ activeTab }) {
  const { state } = useApp();
  const resolvedSub = (activeTab || subView(state, 'Diagnostics') || 'TELEMETRY').toUpperCase();

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {resolvedSub === 'CAPABILITIES' ? (
        <div
          role="tabpanel"
          id="panel-diagnostics-capabilities"
          aria-label="Capabilities Explorer"
          tabIndex={0}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            outline: 'none',
          }}
        >
          <CapabilityExplorer />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-diagnostics-telemetry"
          aria-label="Telemetry Overview"
          tabIndex={0}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            outline: 'none',
          }}
        >
          <DiagnosticsPanel />
        </div>
      )}
    </div>
  );
}
