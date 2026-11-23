import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app.ts';
import {
  AO_STATE_DEFINITIONS,
  MAX_STAND_INTERVAL_SEC,
  MIN_STAND_INTERVAL_SEC,
  isValidAnimationUuid,
} from '../linkpoint/ao-engine.ts';
import { LLAssetType } from '../linkpoint/inventory.ts';
import Icon from '../components/Icon.jsx';

const PRIMARY_EXTRA_KEYS = new Set(['typing']);

/**
 * Firestorm-parity client-side Animation Overrider (`floater_ao.xml`) UI.
 * Works inside both resizable Desktop Floaters (`FloatersDesktop`) and Mobile/Split `ScreenBody`.
 */
export default function AOFloater() {
  const { V, t, ink } = useTheme();
  const [snap, setSnap] = useState(() => app.ao.getSnapshot());
  const [invRevision, setInvRevision] = useState(0);

  const [selectedState, setSelectedState] = useState('stand');
  const [stateFilter, setStateFilter] = useState('all'); // 'primary' | 'all'

  // Inline profile dialogs (avoids blocking window.prompt in Electron / mobile / tests)
  const [profileMode, setProfileMode] = useState(null); // 'new' | 'rename' | 'import' | null
  const [profileInput, setProfileInput] = useState('');
  const [notecardText, setNotecardText] = useState('');
  const [selectedNotecardId, setSelectedNotecardId] = useState('');
  const [importFeedback, setImportFeedback] = useState(null);

  // Add-animation controls
  const [invSearch, setInvSearch] = useState('');
  const [selectedInvItemId, setSelectedInvItemId] = useState('');
  const [manualUuid, setManualUuid] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const syncAO = () => setSnap(app.ao.getSnapshot());
    const syncInv = () => setInvRevision((v) => v + 1);
    app.ao.on('change', syncAO);
    app.inventory.on('inventory_loaded', syncInv);
    app.inventory.on('item_added', syncInv);
    app.inventory.on('folder_updated', syncInv);
    return () => {
      app.ao.off('change', syncAO);
      app.inventory.off('inventory_loaded', syncInv);
      app.inventory.off('item_added', syncInv);
      app.inventory.off('folder_updated', syncInv);
    };
  }, []);

  const activeProfile = useMemo(
    () => snap.profiles.find((p) => p.id === snap.activeProfileId) || null,
    [snap.profiles, snap.activeProfileId],
  );

  const visibleStates = useMemo(() => {
    if (stateFilter === 'primary') {
      return AO_STATE_DEFINITIONS.filter((d) => d.primary || PRIMARY_EXTRA_KEYS.has(d.key));
    }
    return AO_STATE_DEFINITIONS;
  }, [stateFilter]);

  const selectedStateDef = useMemo(
    () => AO_STATE_DEFINITIONS.find((d) => d.key === selectedState) || AO_STATE_DEFINITIONS[0],
    [selectedState],
  );

  const stateAnimations = activeProfile?.states?.[selectedState] || [];
  const selectedAnimIdx = activeProfile?.selectedIndex?.[selectedState] ?? 0;

  const inventoryAnimations = useMemo(() => {
    const all = app.ao.getInventoryAnimations();
    const q = invSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (item) => item.name.toLowerCase().includes(q) || item.assetId.toLowerCase().includes(q),
    );
  }, [invSearch, snap, invRevision]);

  const inventoryNotecards = useMemo(() => {
    const out = [];
    for (const item of app.inventory.items.values()) {
      if (item && item.assetType === LLAssetType.Notecard && item.assetId) {
        out.push({
          id: String(item.id),
          assetId: String(item.assetId),
          name: String(item.name || item.id),
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [snap, invRevision]);

  const errorByAsset = useMemo(() => {
    const map = new Map();
    for (const err of snap.errors) {
      map.set(err.assetId, err);
    }
    return map;
  }, [snap.errors]);

  const handleCreateProfile = (e) => {
    e.preventDefault();
    const name = profileInput.trim() || `Animation Set ${snap.profiles.length + 1}`;
    app.ao.createProfile(name);
    setProfileInput('');
    setProfileMode(null);
    setFormError('');
  };

  const handleRenameProfile = (e) => {
    e.preventDefault();
    if (!activeProfile) return;
    const name = profileInput.trim();
    if (!name) {
      setFormError('Enter a profile name.');
      return;
    }
    app.ao.renameProfile(activeProfile.id, name);
    setProfileInput('');
    setProfileMode(null);
    setFormError('');
  };

  const handleLoadSelectedNotecard = async () => {
    const nc = inventoryNotecards.find((n) => n.id === selectedNotecardId);
    if (!nc) return;
    setImportFeedback(null);
    setFormError('');
    try {
      const fetched = await app.protocol.fetchNotecard(nc.assetId, nc.id);
      if (fetched?.data) {
        setNotecardText(fetched.data);
        if (!profileInput.trim()) setProfileInput(nc.name);
      }
    } catch (err) {
      setFormError(
        `Could not download notecard "${nc.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleImportNotecard = (e) => {
    e.preventDefault();
    if (!notecardText.trim()) {
      setFormError('Paste or load a Second Life / Firestorm AO notecard first.');
      return;
    }
    const setName = profileInput.trim() || 'Imported AO Set';
    const result = app.ao.importNotecard(setName, notecardText);
    setImportFeedback(
      `Imported "${result.profile.name}" (${result.assignedCount} animation${result.assignedCount === 1 ? '' : 's'} mapped` +
        (result.unresolvedNames.length > 0
          ? `, ${result.unresolvedNames.length} not found in inventory`
          : '') +
        ').',
    );
    setNotecardText('');
    setProfileInput('');
    setProfileMode(null);
    setFormError('');
  };

  const ensureProfileForAssignment = () => {
    if (activeProfile) return activeProfile.id;
    const created = app.ao.createProfile('Default AO Set');
    return created.id;
  };

  const handleAddInventoryAnimation = (item) => {
    if (!item) return;
    setFormError('');
    try {
      const targetProfileId = ensureProfileForAssignment();
      app.ao.addAnimationToState(targetProfileId, selectedState, {
        assetId: item.assetId,
        itemId: item.itemId,
        name: item.name,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddManualUuid = (e) => {
    e.preventDefault();
    setFormError('');
    const cleanUuid = manualUuid.trim().toLowerCase();
    if (!isValidAnimationUuid(cleanUuid)) {
      setFormError('Enter a valid non-zero Second Life animation asset UUID.');
      return;
    }
    try {
      const targetProfileId = ensureProfileForAssignment();
      app.ao.addAnimationToState(targetProfileId, selectedState, {
        assetId: cleanUuid,
        name: manualLabel.trim() || cleanUuid,
      });
      setManualUuid('');
      setManualLabel('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const btnStyle = (primary = false, danger = false) => ({
    height: '26px',
    padding: '0 9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    border: `1px solid ${danger ? V.err : primary ? V.pri : V.outv}`,
    borderRadius: V.rs,
    background: danger ? 'transparent' : primary ? V.pri : V.surf2,
    color: danger ? V.err : primary ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink,
    font: `600 10.5px/1 ${t.dfont}`,
    letterSpacing: '.04em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const inputStyle = {
    height: '26px',
    padding: '0 8px',
    background: V.bg,
    color: V.ink,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    font: `400 11px/1.2 ${t.font}`,
    minWidth: 0,
  };

  return (
    <div
      data-testid="ao-floater"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: V.surf,
        color: V.ink,
        font: `400 11.5px/1.35 ${t.font}`,
        overflow: 'hidden',
      }}
    >
      {/* Top Bar: Master Switch + Profile Selector + Set Actions */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 10px',
          borderBottom: `1px solid ${V.outv}`,
          background: V.surf2,
        }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={snap.enabled}
          aria-label="Enable Animation Overrider"
          onClick={() => app.ao.toggleEnabled()}
          style={{
            height: '26px',
            padding: '0 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: V.rs,
            border: `1px solid ${snap.enabled ? V.ok || V.pri : V.outv}`,
            background: snap.enabled ? V.pri : V.bg,
            color: snap.enabled ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink2,
            font: `700 10.5px/1 ${t.dfont}`,
            letterSpacing: '.06em',
            cursor: 'pointer',
          }}
        >
          <Icon name="person-standing" size={13} />
          {snap.enabled ? 'AO ON' : 'AO OFF'}
        </button>

        <span
          data-testid="ao-current-state"
          title="Current local avatar locomotion state"
          style={{
            padding: '4px 8px',
            borderRadius: V.rs,
            background: V.bg,
            border: `1px solid ${V.outv}`,
            color: snap.enabled && snap.activeOverrideId ? V.pri : V.ink2,
            font: `600 10px/1 ${t.dfont}`,
            letterSpacing: '.05em',
          }}
        >
          STATE: {snap.currentStateLabel.toUpperCase()}
          {snap.enabled && snap.activeAnimationName ? ` · ${snap.activeAnimationName}` : ''}
        </span>

        <div
          style={{ flex: 1, minWidth: '130px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <label
            htmlFor="ao-profile-select"
            style={{ font: `600 10px/1 ${t.dfont}`, color: V.ink2, whiteSpace: 'nowrap' }}
          >
            SET
          </label>
          <select
            id="ao-profile-select"
            aria-label="Active Animation Set"
            value={snap.activeProfileId || ''}
            onChange={(e) => app.ao.setActiveProfile(e.target.value || null)}
            style={{ ...inputStyle, flex: 1, width: '100%' }}
          >
            {snap.profiles.length === 0 ? (
              <option value="">— No animation sets —</option>
            ) : (
              snap.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setProfileMode(profileMode === 'new' ? null : 'new');
              setProfileInput('');
              setFormError('');
            }}
            style={btnStyle(profileMode === 'new')}
            title="Create new animation set"
          >
            <Icon name="plus" size={12} />
            New
          </button>
          <button
            type="button"
            disabled={!activeProfile}
            onClick={() => {
              if (!activeProfile) return;
              setProfileMode(profileMode === 'rename' ? null : 'rename');
              setProfileInput(activeProfile.name);
              setFormError('');
            }}
            style={{ ...btnStyle(profileMode === 'rename'), opacity: activeProfile ? 1 : 0.5 }}
            title="Rename active animation set"
          >
            Rename
          </button>
          <button
            type="button"
            disabled={!activeProfile}
            onClick={() => activeProfile && app.ao.duplicateProfile(activeProfile.id)}
            style={{ ...btnStyle(), opacity: activeProfile ? 1 : 0.5 }}
            title="Duplicate active animation set"
          >
            Copy
          </button>
          <button
            type="button"
            disabled={!activeProfile}
            onClick={() => activeProfile && app.ao.deleteProfile(activeProfile.id)}
            style={{ ...btnStyle(false, true), opacity: activeProfile ? 1 : 0.5 }}
            title="Delete active animation set"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileMode(profileMode === 'import' ? null : 'import');
              setProfileInput('');
              setFormError('');
            }}
            style={btnStyle(profileMode === 'import')}
            title="Import standard Linden / Firestorm AO notecard"
          >
            <Icon name="file-text" size={12} />
            Notecard
          </button>
        </div>
      </div>

      {/* Inline Profile Create / Rename / Notecard Import Drawer */}
      {profileMode === 'new' && (
        <form
          onSubmit={handleCreateProfile}
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 10px',
            borderBottom: `1px solid ${V.outv}`,
            background: V.bg,
          }}
        >
          <input
            type="text"
            aria-label="New animation set name"
            placeholder="Animation set name (e.g. Casual, Formal, Dance)..."
            value={profileInput}
            onChange={(e) => setProfileInput(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <button type="submit" style={btnStyle(true)}>
            Create Set
          </button>
          <button type="button" onClick={() => setProfileMode(null)} style={btnStyle()}>
            Cancel
          </button>
        </form>
      )}

      {profileMode === 'rename' && activeProfile && (
        <form
          onSubmit={handleRenameProfile}
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 10px',
            borderBottom: `1px solid ${V.outv}`,
            background: V.bg,
          }}
        >
          <input
            type="text"
            aria-label="Rename animation set"
            value={profileInput}
            onChange={(e) => setProfileInput(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <button type="submit" style={btnStyle(true)}>
            Save Name
          </button>
          <button type="button" onClick={() => setProfileMode(null)} style={btnStyle()}>
            Cancel
          </button>
        </form>
      )}

      {profileMode === 'import' && (
        <form
          onSubmit={handleImportNotecard}
          style={{
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px 10px',
            borderBottom: `1px solid ${V.outv}`,
            background: V.bg,
          }}
        >
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              aria-label="Imported set name"
              placeholder="Imported profile name..."
              value={profileInput}
              onChange={(e) => setProfileInput(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: '150px' }}
            />
            {inventoryNotecards.length > 0 && (
              <>
                <select
                  aria-label="Select inventory AO notecard"
                  value={selectedNotecardId}
                  onChange={(e) => setSelectedNotecardId(e.target.value)}
                  style={{ ...inputStyle, maxWidth: '200px' }}
                >
                  <option value="">— Inventory Notecards —</option>
                  {inventoryNotecards.map((nc) => (
                    <option key={nc.id} value={nc.id}>
                      {nc.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedNotecardId}
                  onClick={handleLoadSelectedNotecard}
                  style={btnStyle()}
                >
                  Load
                </button>
              </>
            )}
          </div>
          <textarea
            aria-label="AO Notecard Configuration Text"
            placeholder="[ Standing ]Stand1|Stand2&#10;[ Walking ]Walk1"
            value={notecardText}
            onChange={(e) => setNotecardText(e.target.value)}
            rows={3}
            style={{
              ...inputStyle,
              height: 'auto',
              padding: '6px 8px',
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button type="button" onClick={() => setProfileMode(null)} style={btnStyle()}>
              Cancel
            </button>
            <button type="submit" style={btnStyle(true)}>
              Import AO Notecard
            </button>
          </div>
        </form>
      )}

      {/* Import Feedback / Validation Message */}
      {(importFeedback || formError) && (
        <div
          role={formError ? 'alert' : 'status'}
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 10px',
            borderBottom: `1px solid ${V.outv}`,
            background: formError ? 'rgba(220, 53, 69, 0.14)' : V.surf2,
            color: formError ? V.err : V.ink,
            fontSize: '11px',
          }}
        >
          <span>{formError || importFeedback}</span>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setImportFeedback(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
            }}
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      )}

      {/* Criterion 5: Asset Download / Parse Error Banner */}
      {snap.errors.length > 0 && (
        <div
          role="alert"
          data-testid="ao-asset-error-banner"
          style={{
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '7px 10px',
            borderBottom: `1px solid ${V.err}`,
            background: 'rgba(220, 53, 69, 0.14)',
            color: V.ink,
          }}
        >
          {snap.errors.map((err) => (
            <div
              key={err.assetId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '11px',
              }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ color: V.err }}>
                  {err.kind === 'parse' ? 'Animation Parse Error' : 'Animation Download Failed'}:
                </strong>{' '}
                <span>{err.name || err.assetId}</span> — <span>{err.message}</span>
              </span>
              <div style={{ display: 'flex', gap: '4px', flex: 'none' }}>
                <button
                  type="button"
                  onClick={() => void app.ao.retryAnimation(err.assetId)}
                  style={btnStyle()}
                >
                  Retry
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss error for ${err.name || err.assetId}`}
                  onClick={() => app.ao.clearAnimationError(err.assetId)}
                  style={btnStyle()}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-Panel Body: Left Locomotion State List + Right Assigned Animation Stack */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Left Panel: Locomotion States */}
        <aside
          aria-label="Locomotion States Panel"
          style={{
            width: '188px',
            minWidth: '148px',
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            borderRight: `1px solid ${V.outv}`,
            background: V.bg,
          }}
        >
          <div
            style={{
              flex: 'none',
              display: 'flex',
              padding: '5px 6px',
              gap: '4px',
              borderBottom: `1px solid ${V.outv}`,
              background: V.surf2,
            }}
          >
            <button
              type="button"
              onClick={() => setStateFilter('primary')}
              aria-pressed={stateFilter === 'primary'}
              style={{
                ...btnStyle(stateFilter === 'primary'),
                flex: 1,
                height: '22px',
                padding: '0 4px',
              }}
            >
              Core
            </button>
            <button
              type="button"
              onClick={() => setStateFilter('all')}
              aria-pressed={stateFilter === 'all'}
              style={{
                ...btnStyle(stateFilter === 'all'),
                flex: 1,
                height: '22px',
                padding: '0 4px',
              }}
            >
              All ({AO_STATE_DEFINITIONS.length})
            </button>
          </div>

          <div
            role="listbox"
            aria-label="Locomotion States"
            style={{ flex: 1, overflowY: 'auto', padding: '4px' }}
          >
            {visibleStates.map((def) => {
              const assigned = activeProfile?.states?.[def.key] || [];
              const isSelected = selectedState === def.key;
              const isCurrentLocomotion = snap.currentState === def.key;
              const hasStateError = assigned.some((a) => errorByAsset.has(a.assetId));

              return (
                <button
                  key={def.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-state-key={def.key}
                  onClick={() => setSelectedState(def.key)}
                  style={{
                    width: '100%',
                    minHeight: '27px',
                    padding: '4px 8px',
                    marginBottom: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    border: `1px solid ${isSelected ? V.pri : 'transparent'}`,
                    borderRadius: V.rs,
                    background: isSelected ? V.surf2 : 'transparent',
                    color: isSelected ? V.ink : V.ink2,
                    font: `${isSelected ? 600 : 400} 11px/1.2 ${t.font}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        flex: 'none',
                        background: isCurrentLocomotion ? V.pri : V.outv,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {def.label}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 'none' }}>
                    {hasStateError && (
                      <span
                        title="Assigned animation failed to download or parse"
                        style={{
                          color: V.err,
                          fontWeight: 700,
                          fontSize: '10px',
                        }}
                      >
                        !
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '10px',
                        color: assigned.length > 0 ? V.pri : V.ink2,
                        fontWeight: assigned.length > 0 ? 700 : 400,
                      }}
                    >
                      {assigned.length > 0 ? assigned.length : '—'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Panel: State Animation Bindings & Inventory Picker */}
        <section
          aria-label={`${selectedStateDef.label} Animations`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '6px 10px',
              borderBottom: `1px solid ${V.outv}`,
              background: V.surf2,
            }}
          >
            <div>
              <strong style={{ font: `700 11.5px/1.2 ${t.dfont}`, letterSpacing: '.04em' }}>
                {selectedStateDef.label.toUpperCase()}
              </strong>
              <span style={{ marginLeft: '8px', fontSize: '10.5px', color: V.ink2 }}>
                {stateAnimations.length === 0
                  ? 'Default Linden pose active'
                  : `${stateAnimations.length} assigned override${stateAnimations.length === 1 ? '' : 's'}`}
              </span>
            </div>
            {selectedState === 'stand' && stateAnimations.length > 1 && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  aria-label="Previous Stand"
                  onClick={() => app.ao.previousStand()}
                  style={{ ...btnStyle(), height: '22px', padding: '0 7px' }}
                  title="Switch to previous standing animation"
                >
                  <Icon name="chevron-left" size={12} />
                  Prev
                </button>
                <button
                  type="button"
                  aria-label="Next Stand"
                  onClick={() => app.ao.nextStand()}
                  style={{ ...btnStyle(), height: '22px', padding: '0 7px' }}
                  title="Switch to next standing animation"
                >
                  Next
                  <Icon name="chevron-right" size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Assigned Animations List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {!activeProfile ? (
              <div
                style={{
                  padding: '16px 12px',
                  border: `1px dashed ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink2,
                  textAlign: 'center',
                }}
              >
                No animation set selected. Click <strong>New</strong> to create an animation
                profile, or assign an animation below to start a default set automatically.
              </div>
            ) : stateAnimations.length === 0 ? (
              <div
                style={{
                  padding: '14px 12px',
                  border: `1px dashed ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink2,
                }}
              >
                No custom animations assigned to <strong>{selectedStateDef.label}</strong>. The
                viewer uses the default Second Life {selectedStateDef.label.toLowerCase()} animation
                until you add one below.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {stateAnimations.map((entry, idx) => {
                  const isActiveChoice = selectedAnimIdx === idx;
                  const isPlayingNow =
                    snap.enabled &&
                    snap.currentState === selectedState &&
                    snap.activeOverrideId === entry.assetId;
                  const entryErr = errorByAsset.get(entry.assetId);

                  return (
                    <div
                      key={entry.id}
                      data-testid={`ao-assigned-${selectedState}-${idx}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '6px 8px',
                        borderRadius: V.rs,
                        border: `1px solid ${entryErr ? V.err : isActiveChoice ? V.pri : V.outv}`,
                        background: isPlayingNow ? V.surf2 : V.bg,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            app.ao.selectStateAnimation(activeProfile.id, selectedState, idx)
                          }
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: V.ink,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          title="Select as active animation for this locomotion state"
                        >
                          <span
                            style={{
                              fontWeight: isActiveChoice ? 700 : 500,
                              fontSize: '11.5px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '100%',
                            }}
                          >
                            {isPlayingNow ? '▶ ' : isActiveChoice ? '• ' : ''}
                            {entry.name}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              color: V.ink2,
                              fontFamily: 'monospace',
                            }}
                          >
                            {entry.assetId}
                          </span>
                        </button>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            flex: 'none',
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Move ${entry.name} up`}
                            disabled={idx === 0}
                            onClick={() =>
                              app.ao.moveAnimationInState(
                                activeProfile.id,
                                selectedState,
                                entry.id,
                                -1,
                              )
                            }
                            style={{
                              ...btnStyle(),
                              height: '22px',
                              padding: '0 5px',
                              opacity: idx === 0 ? 0.4 : 1,
                            }}
                          >
                            <Icon name="chevron-up" size={11} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${entry.name} down`}
                            disabled={idx === stateAnimations.length - 1}
                            onClick={() =>
                              app.ao.moveAnimationInState(
                                activeProfile.id,
                                selectedState,
                                entry.id,
                                1,
                              )
                            }
                            style={{
                              ...btnStyle(),
                              height: '22px',
                              padding: '0 5px',
                              opacity: idx === stateAnimations.length - 1 ? 0.4 : 1,
                            }}
                          >
                            <Icon name="chevron-down" size={11} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${entry.name}`}
                            onClick={() =>
                              app.ao.removeAnimationFromState(
                                activeProfile.id,
                                selectedState,
                                entry.id,
                              )
                            }
                            style={{ ...btnStyle(false, true), height: '22px', padding: '0 6px' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {entryErr && (
                        <div style={{ fontSize: '10.5px', color: V.err }}>
                          {entryErr.kind === 'parse' ? 'Parse failed' : 'Download failed'}:{' '}
                          {entryErr.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Animation from Inventory or Asset UUID */}
          <div
            style={{
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '8px 10px',
              borderTop: `1px solid ${V.outv}`,
              background: V.surf2,
            }}
          >
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="search"
                aria-label="Filter inventory animations"
                placeholder="Filter inventory animations..."
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                style={{ ...inputStyle, width: '150px', flex: 'none' }}
              />
              <select
                aria-label="Choose inventory animation"
                value={selectedInvItemId}
                onChange={(e) => setSelectedInvItemId(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '140px' }}
              >
                <option value="">
                  {inventoryAnimations.length === 0
                    ? '— No inventory animations loaded —'
                    : `— Select inventory animation (${inventoryAnimations.length}) —`}
                </option>
                {inventoryAnimations.map((item) => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedInvItemId}
                onClick={() => {
                  const chosen = inventoryAnimations.find((i) => i.itemId === selectedInvItemId);
                  if (chosen) handleAddInventoryAnimation(chosen);
                }}
                style={{ ...btnStyle(true), opacity: selectedInvItemId ? 1 : 0.5 }}
              >
                + Add Inventory Anim
              </button>
            </div>

            <form
              onSubmit={handleAddManualUuid}
              style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <input
                type="text"
                aria-label="Animation asset UUID"
                placeholder="Animation Asset UUID..."
                value={manualUuid}
                onChange={(e) => setManualUuid(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '160px', fontFamily: 'monospace' }}
              />
              <input
                type="text"
                aria-label="Animation label"
                placeholder="Label (optional)"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                style={{ ...inputStyle, width: '120px' }}
              />
              <button type="submit" style={btnStyle()}>
                Assign UUID
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* Bottom Controls Bar (Firestorm floater_ao.xml parity) */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '7px 10px',
          borderTop: `1px solid ${V.outv}`,
          background: V.bg,
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={snap.overrideSits}
              onChange={(e) => app.ao.setPreferences({ overrideSits: e.target.checked })}
            />
            Override Sits
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              opacity: snap.overrideSits ? 1 : 0.5,
            }}
            title="Yield sit override when furniture plays its own custom sit pose"
          >
            <input
              type="checkbox"
              disabled={!snap.overrideSits}
              checked={snap.smartSit}
              onChange={(e) => app.ao.setPreferences({ smartSit: e.target.checked })}
            />
            Smart Sit
          </label>
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={snap.cycleStands}
              onChange={(e) => app.ao.setPreferences({ cycleStands: e.target.checked })}
            />
            Cycle Stands
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              opacity: snap.cycleStands ? 1 : 0.5,
            }}
          >
            <input
              type="checkbox"
              disabled={!snap.cycleStands}
              checked={snap.randomStands}
              onChange={(e) => app.ao.setPreferences({ randomStands: e.target.checked })}
            />
            Randomize
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label
            htmlFor="ao-stand-interval"
            style={{ color: V.ink2, fontSize: '10.5px', whiteSpace: 'nowrap' }}
          >
            Stand Time (s):
          </label>
          <input
            id="ao-stand-interval"
            type="number"
            min={MIN_STAND_INTERVAL_SEC}
            max={MAX_STAND_INTERVAL_SEC}
            aria-label="Stand Cycle Interval Seconds"
            value={snap.standIntervalSec}
            onChange={(e) =>
              app.ao.setPreferences({ standIntervalSec: Number(e.target.value) || 30 })
            }
            style={{ ...inputStyle, width: '58px', height: '23px', textAlign: 'right' }}
          />
          <button
            type="button"
            aria-label="Cycle Previous Stand"
            onClick={() => app.ao.previousStand()}
            style={{ ...btnStyle(), height: '23px', padding: '0 6px' }}
            title="Previous Stand"
          >
            <Icon name="chevron-left" size={12} />
          </button>
          <button
            type="button"
            aria-label="Cycle Next Stand"
            onClick={() => app.ao.nextStand()}
            style={{ ...btnStyle(), height: '23px', padding: '0 6px' }}
            title="Next Stand"
          >
            <Icon name="chevron-right" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
