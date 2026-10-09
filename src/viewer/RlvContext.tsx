import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { RlvController } from '../linkpoint/rlv';

/**
 * RLV (Restrained Life Viewer) restrictions.
 *
 * TPV_COMPLIANCE.md §4 requires that when a restriction is active the UI
 * strictly prohibits the action — not merely discourages it. So restrictions
 * are resolved here, at the top of the tree, and every affected control asks
 * this context before it renders as usable. A restricted control is disabled
 * and says which restriction is holding it, because a dead button with no
 * explanation reads as a bug.
 */
export type RlvRestriction =
  | 'detach'
  | 'showloc'
  | 'shownames'
  | 'sendchat'
  | 'sendim'
  | 'tplm'
  | 'tploc'
  | 'showinv'
  | 'showworldmap'
  | 'showminimap';

export const RLV_REASONS: Record<RlvRestriction, string> = {
  detach: 'Locked by RLV — this item cannot be detached.',
  showloc: 'Hidden by RLV — your location is restricted.',
  shownames: 'Hidden by RLV — resident names are restricted.',
  sendchat: 'Blocked by RLV — you cannot send local chat.',
  sendim: 'Blocked by RLV — you cannot send instant messages.',
  tplm: 'Blocked by RLV — landmark teleports are restricted.',
  tploc: 'Blocked by RLV — teleporting is restricted.',
  showinv: 'Hidden by RLV — your inventory is restricted.',
  showworldmap: 'Hidden by RLV — the world map is restricted.',
  showminimap: 'Hidden by RLV — the radar is restricted.',
};

export const RLV_REDACTED = '(hidden)';

interface RlvContextValue {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  active: Set<RlvRestriction>;
  restricted: (r: RlvRestriction) => boolean;
  reasonFor: (r: RlvRestriction) => string | null;
  setRestriction: (r: RlvRestriction, on: boolean) => void;
  controller: RlvController;
  processMessage: (sourceId: string, messageText: string) => void;
}

const RlvContext = createContext<RlvContextValue | null>(null);

export const RlvProvider: React.FC<{
  children: React.ReactNode;
  initialEnabled?: boolean;
  initialRestrictions?: RlvRestriction[];
}> = ({ children, initialEnabled = false, initialRestrictions }) => {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [active, setActive] = useState<Set<RlvRestriction>>(
    () => new Set(initialRestrictions ?? []),
  );
  const controllerRef = useRef<RlvController>(new RlvController(initialEnabled));

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    controllerRef.current.setEnabled(on);
  }, []);

  const restricted = useCallback(
    (r: RlvRestriction) => {
      if (!enabled) return false;
      if (r === 'detach') return !controllerRef.current.canDetach();
      if (r === 'sendchat') return !controllerRef.current.canSendChat();
      if (r === 'sendim') return !controllerRef.current.canSendIM();
      if (r === 'tplm') return !controllerRef.current.canTeleportLandmark();
      if (r === 'tploc') return !controllerRef.current.canTeleportLocation();
      if (r === 'showinv') return !controllerRef.current.canShowInventory();
      return active.has(r);
    },
    [enabled, active],
  );

  const reasonFor = useCallback(
    (r: RlvRestriction) => (restricted(r) ? RLV_REASONS[r] : null),
    [restricted],
  );

  const setRestriction = useCallback((r: RlvRestriction, on: boolean) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (on) next.add(r);
      else next.delete(r);
      return next;
    });
  }, []);

  const processMessage = useCallback((sourceId: string, messageText: string) => {
    controllerRef.current.processMessage(sourceId, messageText);
  }, []);

  const value = useMemo<RlvContextValue>(
    () => ({
      enabled,
      setEnabled,
      active,
      restricted,
      reasonFor,
      setRestriction,
      controller: controllerRef.current,
      processMessage,
    }),
    [enabled, setEnabled, active, restricted, reasonFor, setRestriction, processMessage],
  );

  return <RlvContext.Provider value={value}>{children}</RlvContext.Provider>;
};

export function useRlv(): RlvContextValue {
  const ctx = useContext(RlvContext);
  if (!ctx) throw new Error('useRlv must be used inside an RlvProvider');
  return ctx;
}
