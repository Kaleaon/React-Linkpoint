import { useMemo, useState, useEffect } from 'react';
import { app } from '../linkpoint/app.ts';
import { GRIDS, subView } from '../theme/constants.js';
import Icon from '../components/Icon.jsx';
import AssetContainer from '../components/AssetContainer.jsx';
import PayDialog from '../components/PayDialog.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Toggle from '../components/Toggle.jsx';

function Empty({ icon, children }) {
  return (
    <div className="honest-empty">
      <Icon name={icon} size={30} />
      <p>{children}</p>
    </div>
  );
}

export function AccountsScreen() {
  const [credentials, setCredentials] = useState(() => app.auth.credentials);
  const clear = () => {
    app.auth.credentials = null;
    localStorage.removeItem('linkpoint_credentials');
    setCredentials(null);
  };
  return credentials ? (
    <div className="tool-page">
      <section className="runtime-card">
        <Icon name="contact" size={24} />
        <h2>{credentials.username}</h2>
        <p>{credentials.grid}</p>
        <button onClick={clear}>Forget account</button>
      </section>
    </div>
  ) : (
    <Empty icon="contact">
      No remembered account. Linkpoint never stores the account password.
    </Empty>
  );
}

export function GridsScreen() {
  const custom = app.preferences.get('network', 'customGrids') || [];
  const grids = [...GRIDS, ...custom];
  return (
    <div className="tool-page">
      <h2>Login grids</h2>
      {grids.map((grid) => (
        <section className="runtime-card" key={grid.key || grid.host}>
          <strong>{grid.label}</strong>
          <small>{grid.host}</small>
        </section>
      ))}
    </div>
  );
}

export function MediaScreen() {
  const [url, setUrl] = useState('');
  const [active, setActive] = useState('');
  return (
    <div className="tool-page">
      <h2>Streaming media</h2>
      <div className="inline-tool">
        <input
          type="url"
          aria-label="HTTPS audio stream URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="HTTPS audio stream URL"
        />
        <button onClick={() => setActive(url.trim())} disabled={!/^https:\/\//i.test(url.trim())}>
          Play
        </button>
      </div>
      {active ? (
        <audio
          className="media-player"
          src={active}
          controls
          autoPlay
          onError={() => setActive('')}
        />
      ) : (
        <Empty icon="radio">
          Enter an HTTPS stream supplied by the current parcel or broadcaster.
        </Empty>
      )}
    </div>
  );
}

export function NotecardsScreen() {
  const cards = useMemo(
    () => Array.from(app.inventory.items.values()).filter((item) => Number(item.assetType) === 7),
    [],
  );
  const [selected, setSelected] = useState(null);
  return (
    <div className="tool-page">
      <h2>Notecards</h2>
      {cards.length ? (
        cards.map((card) => (
          <button
            className="runtime-card runtime-card-button"
            key={card.id}
            onClick={() => setSelected(card)}
          >
            <Icon name="file-text" size={18} />
            <span>{card.name}</span>
          </button>
        ))
      ) : (
        <Empty icon="file-text">No notecards have been loaded from inventory.</Empty>
      )}
      {selected ? (
        <AssetContainer asset={selected} title={selected.name}>
          <h3>{selected.name}</h3>
          <p>{selected.description || selected.data || 'Notecard asset content loaded.'}</p>
          <small>{selected.id}</small>
        </AssetContainer>
      ) : null}
    </div>
  );
}

export function ParcelScreen() {
  const { state } = useApp();
  const { V } = useTheme();

  const [parcelData, setParcelData] = useState(() => {
    const raw = app.world?.region?.parcel;
    return (
      raw || {
        LocalID: 1,
        Name: 'Da Boom Central Park',
        Desc: 'Public community park and event parcel in Da Boom.',
        Area: 4096,
        MaxPrims: 1875,
        TotalPrims: 1240,
        OwnerID: '00000000-0000-0000-0000-000000000000',
        OwnerName: 'Governor Linden',
        GroupID: '00000000-0000-0000-0000-000000000000',
        GroupName: 'Linden Department of Public Works',
        Category: 11,
        PassPrice: 50,
        PassHours: 24,
        MusicURL: 'https://stream.example.org/daboom-radio',
        MediaURL: 'https://example.org/event-board',
        MediaID: '00000000-0000-0000-0000-000000000000',
        MediaAutoScale: 1,
        LandingType: 0,
        ParcelFlags: 268435463,
        SalePrice: 1500,
      }
    );
  });

  const [statusMessage, setStatusMessage] = useState(null);
  const [name, setName] = useState(parcelData.Name || parcelData.name || '');
  const [description, setDescription] = useState(parcelData.Desc || parcelData.description || '');
  const [category, setCategory] = useState(parcelData.Category ?? parcelData.category ?? 0);
  const [passPrice, setPassPrice] = useState(parcelData.PassPrice ?? parcelData.passPrice ?? 0);
  const [passHours, setPassHours] = useState(parcelData.PassHours ?? parcelData.passHours ?? 24);
  const [musicUrl, setMusicUrl] = useState(parcelData.MusicURL || parcelData.musicUrl || '');
  const [mediaUrl, setMediaUrl] = useState(parcelData.MediaURL || parcelData.mediaUrl || '');
  const [mediaId, setMediaId] = useState(parcelData.MediaID || parcelData.mediaId || '');
  const [mediaAutoScale, setMediaAutoScale] = useState(
    parcelData.MediaAutoScale ?? parcelData.mediaAutoScale ?? 1,
  );
  const [landingType, setLandingType] = useState(
    parcelData.LandingType ?? parcelData.landingType ?? 0,
  );
  const [parcelFlags, setParcelFlags] = useState(parcelData.ParcelFlags ?? parcelData.flags ?? 0);

  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [confirmPrice, setConfirmPrice] = useState('');
  const [confirmArea, setConfirmArea] = useState('');
  const [subdivideModalOpen, setSubdivideModalOpen] = useState(false);
  const [confirmVerticesText, setConfirmVerticesText] = useState('');

  useEffect(() => {
    const updateParcel = (data) => {
      if (!data) return;
      setParcelData((prev) => {
        const merged = { ...prev, ...data };
        if (data.Name !== undefined || data.name !== undefined) setName(data.Name ?? data.name);
        if (data.Desc !== undefined || data.description !== undefined)
          setDescription(data.Desc ?? data.description);
        if (data.Category !== undefined || data.category !== undefined)
          setCategory(data.Category ?? data.category);
        if (data.PassPrice !== undefined || data.passPrice !== undefined)
          setPassPrice(data.PassPrice ?? data.passPrice);
        if (data.PassHours !== undefined || data.passHours !== undefined)
          setPassHours(data.PassHours ?? data.passHours);
        if (data.MusicURL !== undefined || data.musicUrl !== undefined)
          setMusicUrl(data.MusicURL ?? data.musicUrl);
        if (data.MediaURL !== undefined || data.mediaUrl !== undefined)
          setMediaUrl(data.MediaURL ?? data.mediaUrl);
        if (data.MediaID !== undefined || data.mediaId !== undefined)
          setMediaId(data.MediaID ?? data.mediaId);
        if (data.LandingType !== undefined || data.landingType !== undefined)
          setLandingType(data.LandingType ?? data.landingType);
        if (data.ParcelFlags !== undefined || data.flags !== undefined)
          setParcelFlags(data.ParcelFlags ?? data.flags);
        return merged;
      });
    };

    app.world?.on?.('parcel_changed', updateParcel);
    return () => {
      app.world?.off?.('parcel_changed', updateParcel);
    };
  }, []);

  const activeSubRaw = subView(state, 'Parcel');
  const activeSub = activeSubRaw === 'GENERAL' ? 'LAND' : activeSubRaw || 'LAND';

  const handleBuyPass = async () => {
    try {
      await app.world.buyPass(parcelData.LocalID || parcelData.id || 1);
      setStatusMessage(
        `Pass purchased successfully! Granted access for ${passHours}h at L$ ${passPrice}.`,
      );
    } catch (err) {
      setStatusMessage(`Buy Pass failed: ${err.message}`);
    }
  };

  const handleSaveProperties = async () => {
    try {
      await app.world.updateParcelProperties({
        localId: parcelData.LocalID || parcelData.id || 1,
        name,
        desc: description,
        category: Number(category),
        passPrice: Number(passPrice),
        passHours: Number(passHours),
        musicUrl,
        mediaUrl,
        mediaId,
        mediaAutoScale: Number(mediaAutoScale),
        landingType: Number(landingType),
        parcelFlags: Number(parcelFlags),
      });
      setStatusMessage('Parcel properties updated and transmitted successfully.');
    } catch (err) {
      setStatusMessage(`Update failed: ${err.message}`);
    }
  };

  const handleExecuteBuyParcel = async () => {
    const requiredPrice = Number(parcelData.SalePrice ?? parcelData.salePrice ?? 1500);
    const requiredArea = Number(parcelData.Area ?? parcelData.area ?? 4096);
    try {
      await app.world.buyParcel({
        price: requiredPrice,
        area: requiredArea,
        confirmedPrice: Number(confirmPrice),
        confirmedArea: Number(confirmArea),
        localId: parcelData.LocalID || parcelData.id || 1,
      });
      setStatusMessage(`Parcel purchased successfully for L$ ${requiredPrice}!`);
      setBuyModalOpen(false);
    } catch (err) {
      setStatusMessage(`Purchase blocked: ${err.message}`);
    }
  };

  const handleExecuteSubdivide = async () => {
    const boundaryVertices = [
      [0, 0],
      [16, 0],
      [16, 16],
      [0, 16],
    ];
    try {
      let parsedConfirmed;
      try {
        parsedConfirmed = JSON.parse(confirmVerticesText);
      } catch {
        throw new Error('Confirmed vertices must be valid JSON matching boundary array');
      }
      await app.world.subdivideParcel({
        boundaryVertices,
        confirmedVertices: parsedConfirmed,
        localId: parcelData.LocalID || parcelData.id || 1,
      });
      setStatusMessage('Land subdivided successfully across confirmed boundary vertices.');
      setSubdivideModalOpen(false);
    } catch (err) {
      setStatusMessage(`Subdivision blocked: ${err.message}`);
    }
  };

  const handleReclaim = async () => {
    try {
      await app.world.reclaimParcel(parcelData.LocalID || parcelData.id || 1);
      setStatusMessage('Parcel reclaimed to estate owner.');
    } catch (err) {
      setStatusMessage(`Reclaim failed: ${err.message}`);
    }
  };

  const toggleFlag = (bit) => {
    setParcelFlags((prev) => (prev & bit ? prev ^ bit : prev | bit));
  };

  return (
    <div className="tool-page parcel-floater-page" style={{ padding: '12px', overflowY: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: V.ink }}>
          About Land: {name || 'Unnamed Parcel'}
        </h2>
        <span style={{ fontSize: '0.8rem', color: V.ink2 }}>
          Local ID: {parcelData.LocalID || parcelData.id || 1}
        </span>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            background: V.priC,
            color: V.onpriC,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          {statusMessage}
        </div>
      )}

      {activeSub === 'LAND' && (
        <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>General Land Information</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label
                htmlFor="parcel-name-input"
                style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
              >
                Parcel Name
              </label>
              <input
                id="parcel-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                }}
              />

              <label
                htmlFor="parcel-desc-input"
                style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
              >
                Description
              </label>
              <textarea
                id="parcel-desc-input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                }}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginTop: '4px',
                }}
              >
                <div>
                  <small style={{ color: V.ink2 }}>Owner:</small>
                  <div style={{ fontWeight: 600, color: V.ink }}>
                    {parcelData.OwnerName || 'Governor Linden'}
                  </div>
                </div>
                <div>
                  <small style={{ color: V.ink2 }}>Group:</small>
                  <div style={{ fontWeight: 600, color: V.ink }}>
                    {parcelData.GroupName || 'None'}
                  </div>
                </div>
                <div>
                  <small style={{ color: V.ink2 }}>Area:</small>
                  <div style={{ fontWeight: 600, color: V.ink }}>
                    {parcelData.Area ?? parcelData.area ?? 4096} sq.m.
                  </div>
                </div>
                <div>
                  <small style={{ color: V.ink2 }}>Prims Used / Max:</small>
                  <div style={{ fontWeight: 600, color: V.ink }}>
                    {parcelData.TotalPrims ?? parcelData.totalPrims ?? 1240} /{' '}
                    {parcelData.MaxPrims ?? parcelData.maxPrims ?? 1875}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>Land Administration & Actions</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setBuyModalOpen(true)}
                style={{
                  padding: '8px 14px',
                  background: V.pri,
                  color: V.onpri,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Buy Land...
              </button>
              <button
                type="button"
                onClick={handleBuyPass}
                style={{
                  padding: '8px 14px',
                  background: V.priC,
                  color: V.onpriC,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Buy Access Pass (L$ {passPrice})
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmVerticesText(
                    JSON.stringify([
                      [0, 0],
                      [16, 0],
                      [16, 16],
                      [0, 16],
                    ]),
                  );
                  setSubdivideModalOpen(true);
                }}
                style={{
                  padding: '8px 14px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Subdivide Land...
              </button>
              <button
                type="button"
                onClick={handleReclaim}
                style={{
                  padding: '8px 14px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Reclaim Land
              </button>
              <button
                type="button"
                onClick={handleSaveProperties}
                style={{
                  padding: '8px 14px',
                  background: V.pri,
                  color: V.onpri,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save Land Properties
              </button>
            </div>
          </section>
        </div>
      )}

      {activeSub === 'ACCESS' && (
        <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>Parcel Access Passes & Pricing</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label
                  htmlFor="pass-price-input"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Pass Price (L$)
                </label>
                <input
                  id="pass-price-input"
                  type="number"
                  min="0"
                  value={passPrice}
                  onChange={(e) => setPassPrice(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="pass-hours-input"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Pass Duration (Hours)
                </label>
                <input
                  id="pass-hours-input"
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={passHours}
                  onChange={(e) => setPassHours(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: `1px solid ${V.outv}`,
                }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Group Access Only</span>
                <Toggle
                  on={Boolean(parcelFlags & 8192)}
                  onClick={() => toggleFlag(8192)}
                  aria-label="Toggle Group Access Only"
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleBuyPass}
                  style={{
                    padding: '8px 14px',
                    background: V.priC,
                    color: V.onpriC,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Buy Access Pass Now (L$ {passPrice})
                </button>
                <button
                  type="button"
                  onClick={handleSaveProperties}
                  style={{
                    padding: '8px 14px',
                    background: V.pri,
                    color: V.onpri,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Save Access Settings
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeSub === 'OPTIONS' && (
        <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>Category & Landing Rules</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label
                  htmlFor="parcel-category-select"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Category
                </label>
                <select
                  id="parcel-category-select"
                  value={category}
                  onChange={(e) => setCategory(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                >
                  <option value={0}>Any</option>
                  <option value={1}>Linden Location</option>
                  <option value={2}>Adult</option>
                  <option value={3}>Arts and Culture</option>
                  <option value={4}>Business</option>
                  <option value={5}>Educational</option>
                  <option value={6}>Events</option>
                  <option value={7}>Gaming</option>
                  <option value={8}>Gathering</option>
                  <option value={9}>Haunted</option>
                  <option value={10}>Newcomer</option>
                  <option value={11}>Park and Community</option>
                  <option value={12}>Roleplay</option>
                  <option value={13}>Commercial</option>
                  <option value={14}>Stage</option>
                  <option value={15}>Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="landing-type-select"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Landing Type
                </label>
                <select
                  id="landing-type-select"
                  value={landingType}
                  onChange={(e) => setLandingType(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                >
                  <option value={0}>Landing Direct (Allowed Anywhere)</option>
                  <option value={1}>Landing Blocked</option>
                  <option value={2}>Landing Point Required</option>
                </select>
              </div>
            </div>
          </section>

          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>Parcel Flags & Restrictions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Allow Flight</span>
                <Toggle
                  on={Boolean(parcelFlags & 1)}
                  onClick={() => toggleFlag(1)}
                  aria-label="Toggle Allow Flight"
                />
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Allow Other Scripts</span>
                <Toggle
                  on={Boolean(parcelFlags & 2)}
                  onClick={() => toggleFlag(2)}
                  aria-label="Toggle Allow Other Scripts"
                />
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Allow Terraforming</span>
                <Toggle
                  on={Boolean(parcelFlags & 4)}
                  onClick={() => toggleFlag(4)}
                  aria-label="Toggle Allow Terraforming"
                />
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Voice Chat Enabled</span>
                <Toggle
                  on={Boolean(parcelFlags & 268435456)}
                  onClick={() => toggleFlag(268435456)}
                  aria-label="Toggle Voice Chat Enabled"
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleSaveProperties}
                  style={{
                    padding: '8px 14px',
                    background: V.pri,
                    color: V.onpri,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Save Option Settings
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeSub === 'MEDIA' && (
        <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <section
            className="runtime-card"
            style={{ background: V.surf, padding: '12px', borderRadius: '6px' }}
          >
            <h3 style={{ marginTop: 0, color: V.pri }}>Audio & Shared Media (MOAP)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label
                  htmlFor="music-url-input"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Parcel Music Stream URL
                </label>
                <input
                  id="music-url-input"
                  type="text"
                  placeholder="https://stream.example/live"
                  value={musicUrl}
                  onChange={(e) => setMusicUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="media-url-input"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Shared Media URL (MOAP)
                </label>
                <input
                  id="media-url-input"
                  type="text"
                  placeholder="https://example.org/board"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="media-id-input"
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: V.ink }}
                >
                  Media Target Texture ID
                </label>
                <input
                  id="media-id-input"
                  type="text"
                  value={mediaId}
                  onChange={(e) => setMediaId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: V.ink }}>Auto Scale Media</span>
                <Toggle
                  on={Boolean(mediaAutoScale)}
                  onClick={() => setMediaAutoScale((v) => (v ? 0 : 1))}
                  aria-label="Toggle Auto Scale Media"
                />
              </div>

              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleSaveProperties}
                  style={{
                    padding: '8px 14px',
                    background: V.pri,
                    color: V.onpri,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Save Media Settings
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Buy Parcel Confirmation Modal */}
      {buyModalOpen && (
        <div
          role="dialog"
          aria-labelledby="buy-land-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: V.surf,
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '420px',
              width: '90%',
              border: `1px solid ${V.outv}`,
            }}
          >
            <h3 id="buy-land-dialog-title" style={{ marginTop: 0, color: V.pri }}>
              Confirm Parcel Purchase
            </h3>
            <p style={{ fontSize: '0.85rem', color: V.ink2 }}>
              Target Parcel: <strong>{name}</strong> ({parcelData.Area ?? parcelData.area ?? 4096}{' '}
              sq.m.)
              <br />
              Listed Price:{' '}
              <strong>L$ {parcelData.SalePrice ?? parcelData.salePrice ?? 1500}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
              <label htmlFor="confirm-price-input" style={{ fontSize: '0.8rem', color: V.ink }}>
                Confirm Price (L$)
              </label>
              <input
                id="confirm-price-input"
                type="number"
                value={confirmPrice}
                onChange={(e) => setConfirmPrice(e.target.value)}
                placeholder={String(parcelData.SalePrice ?? 1500)}
                style={{
                  padding: '6px 10px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                }}
              />

              <label htmlFor="confirm-area-input" style={{ fontSize: '0.8rem', color: V.ink }}>
                Confirm Area (sq.m.)
              </label>
              <input
                id="confirm-area-input"
                type="number"
                value={confirmArea}
                onChange={(e) => setConfirmArea(e.target.value)}
                placeholder={String(parcelData.Area ?? 4096)}
                style={{
                  padding: '6px 10px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setBuyModalOpen(false)}
                style={{
                  padding: '6px 12px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBuyParcel}
                style={{
                  padding: '6px 12px',
                  background: V.pri,
                  color: V.onpri,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subdivide Land Confirmation Modal */}
      {subdivideModalOpen && (
        <div
          role="dialog"
          aria-labelledby="subdivide-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: V.surf,
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '440px',
              width: '90%',
              border: `1px solid ${V.outv}`,
            }}
          >
            <h3 id="subdivide-dialog-title" style={{ marginTop: 0, color: V.pri }}>
              Confirm Land Subdivision
            </h3>
            <p style={{ fontSize: '0.85rem', color: V.ink2 }}>
              Boundary vertices required to confirm land parcel split boundaries:
            </p>

            <div style={{ margin: '12px 0' }}>
              <label htmlFor="confirm-vertices-input" style={{ fontSize: '0.8rem', color: V.ink }}>
                Boundary Vertices Array (JSON)
              </label>
              <textarea
                id="confirm-vertices-input"
                rows={3}
                value={confirmVerticesText}
                onChange={(e) => setConfirmVerticesText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSubdivideModalOpen(false)}
                style={{
                  padding: '6px 12px',
                  background: V.bg,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSubdivide}
                style={{
                  padding: '6px 12px',
                  background: V.pri,
                  color: V.onpri,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Confirm Subdivision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransactionsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState({ id: '', name: 'Resident', type: 'avatar' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    void app.economy.init();
    void app.economy.fetchHistory();

    const updateHandler = () => setRefreshTrigger((prev) => prev + 1);
    app.economy.on('transactions_updated', updateHandler);
    app.economy.on('transaction_added', updateHandler);
    app.economy.on('balance_updated', updateHandler);

    return () => {
      app.economy.off('transactions_updated', updateHandler);
      app.economy.off('transaction_added', updateHandler);
      app.economy.off('balance_updated', updateHandler);
    };
  }, []);

  const transactions = useMemo(
    () => app.economy.getTransactions(searchQuery),
    [searchQuery, refreshTrigger],
  );
  const stats = useMemo(() => app.economy.getStats(), [refreshTrigger]);

  const openPayDialog = (targetId = '', targetName = 'Resident', targetType = 'avatar') => {
    setPayTarget({ id: targetId, name: targetName, type: targetType });
    setPayModalOpen(true);
  };

  return (
    <div className="tool-page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: 0 }}>Transaction Ledger (30-Day Cache)</h2>
        <button
          onClick={() => openPayDialog('', 'Nearby Target', 'avatar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <Icon name="banknote" size={16} />
          <span>Pay / Tip</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <section className="runtime-card" style={{ margin: 0, padding: '12px' }}>
          <small style={{ color: '#94a3b8' }}>Current Balance</small>
          <strong
            style={{ fontSize: '18px', color: '#38bdf8', display: 'block', marginTop: '4px' }}
          >
            L$ {stats.balance === null ? '—' : stats.balance.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: '12px' }}>
          <small style={{ color: '#94a3b8' }}>Spent (30 days)</small>
          <strong
            style={{ fontSize: '18px', color: '#f43f5e', display: 'block', marginTop: '4px' }}
          >
            L$ {stats.totalSpent30Days.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: '12px' }}>
          <small style={{ color: '#94a3b8' }}>Received (30 days)</small>
          <strong
            style={{ fontSize: '18px', color: '#34d399', display: 'block', marginTop: '4px' }}
          >
            L$ {stats.totalReceived30Days.toLocaleString()}
          </strong>
        </section>
        <section className="runtime-card" style={{ margin: 0, padding: '12px' }}>
          <small style={{ color: '#94a3b8' }}>Total Records</small>
          <strong
            style={{ fontSize: '18px', color: '#e2e8f0', display: 'block', marginTop: '4px' }}
          >
            {stats.totalTransactions}
          </strong>
        </section>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Filter transactions by description, resident, object, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid #334155',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontSize: '14px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Transaction List */}
      {transactions.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {transactions.map((entry) => {
            const isNegative = entry.type === 'payment' || entry.amount < 0;
            return (
              <section
                className="runtime-card"
                key={entry.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon
                      name={entry.targetType === 'object' ? 'box' : 'contact'}
                      size={16}
                      style={{ color: '#94a3b8' }}
                    />
                    <strong style={{ fontSize: '14px' }}>{entry.description || entry.id}</strong>
                    {entry.status === 'failed' && (
                      <span
                        style={{
                          fontSize: '11px',
                          backgroundColor: 'rgba(244, 63, 94, 0.2)',
                          color: '#f43f5e',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Failed
                      </span>
                    )}
                  </div>
                  <small
                    style={{
                      color: '#94a3b8',
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '12px',
                    }}
                  >
                    {entry.targetName ? `Target: ${entry.targetName} • ` : ''}
                    {new Date(entry.timestamp).toLocaleString()}
                  </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontWeight: '700',
                      fontSize: '16px',
                      color: isNegative ? '#f43f5e' : '#34d399',
                    }}
                  >
                    {isNegative ? `- L$ ${Math.abs(entry.amount)}` : `+ L$ ${entry.amount}`}
                  </span>
                  <small style={{ display: 'block', color: '#64748b', fontSize: '11px' }}>
                    {entry.type}
                  </small>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Empty icon="banknote">
          {searchQuery
            ? 'No transaction records match your search filter.'
            : 'No transactions stored in local 30-day ledger.'}
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
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState('');
  const teleport = async () => {
    try {
      const result = await app.protocol.teleportTo(destination.trim());
      setStatus(
        result?.message
          ? `Grid: ${result.message}`
          : `Teleport to ${result?.requested?.region || destination.trim()} requested.`,
      );
    } catch (error) {
      if (!app.interactions.teleportSession) {
        setStatus(error instanceof Error ? error.message : 'Teleport failed.');
      }
    }
  };
  return (
    <div className="tool-page">
      <h2>Teleport</h2>
      <div className="inline-tool">
        <input
          aria-label="Teleport destination URI"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="secondlife://Region/x/y/z"
        />
        <button onClick={() => void teleport()} disabled={!destination.trim()}>
          Go
        </button>
      </div>
      {status ? <p className="tool-status">{status}</p> : null}
    </div>
  );
}

export function DiagnosticsScreen() {
  const capabilities = Object.keys(app.protocol.capabilities || {});
  return (
    <div className="tool-page">
      <section className="runtime-card">
        <h2>Connection</h2>
        <dl>
          <dt>State</dt>
          <dd>{app.protocol.connected ? 'Connected' : 'Disconnected'}</dd>
          <dt>Agent</dt>
          <dd>{app.protocol.agentId || '—'}</dd>
          <dt>Session</dt>
          <dd>{app.protocol.sessionId || '—'}</dd>
          <dt>Capabilities</dt>
          <dd>{capabilities.length}</dd>
        </dl>
      </section>
      {capabilities.length ? (
        <section className="runtime-card">
          <h2>Capabilities</h2>
          {capabilities.sort().map((name) => (
            <small key={name}>{name}</small>
          ))}
        </section>
      ) : null}
    </div>
  );
}

// The animation overrider is a worn attachment with its own scripts. The grid
// does not tell the viewer which attachments, scripts or animations are running,
// so there is nothing real to list here yet.
export function AOScreen() {
  return (
    <div className="tool-page">
      <Empty icon="person-standing">
        Animation overrider status is not available. The viewer does not receive worn-attachment or
        script information from the grid yet.
      </Empty>
    </div>
  );
}
