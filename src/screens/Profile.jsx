import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { app } from '../linkpoint/app.ts';
import Icon from '../components/Icon.jsx';
import SegmentedTabs from '../components/SegmentedTabs.jsx';
import TouchTarget from '../components/TouchTarget.tsx';
import { subView } from '../theme/constants.js';

export function ResidentInspector({ target, onReturn }) {
  const { V, t } = useTheme();
  const { state, actions } = useApp();
  const [photo, setPhoto] = useState(null);
  const [, setLoadingPhoto] = useState(false);

  const targetName =
    target?.name || target?.attachedTo || (typeof target === 'string' ? target : '') || 'Resident';
  const targetId = target?.id || target?.avatarId || target?.uuid || '';

  useEffect(() => {
    let active = true;
    if (!targetName || targetName === 'Resident') {
      setPhoto(null);
      setLoadingPhoto(false);
      return;
    }

    setLoadingPhoto(true);
    const fetchPhoto = async () => {
      try {
        if (app.protocol && typeof app.protocol.fetchProfilePhoto === 'function') {
          const reply = await app.protocol.fetchProfilePhoto(targetName);
          if (active) {
            setPhoto(reply?.photoBytes ? reply : null);
          }
        }
      } catch {
        if (active) setPhoto(null);
      } finally {
        if (active) setLoadingPhoto(false);
      }
    };

    fetchPhoto();
    return () => {
      active = false;
    };
  }, [targetName]);

  const curSub = subView(state, 'Profile') || '2ND LIFE';

  const handleReturn = () => {
    if (typeof onReturn === 'function') {
      onReturn();
    } else if (typeof actions?.setTarget === 'function') {
      actions.setTarget(null);
    }
  };

  const handleIm = () => {
    if (typeof actions?.startIm === 'function') {
      actions.startIm(targetName);
    } else {
      app.chat?.openSession?.(targetName);
      if (typeof actions?.setTab === 'function') actions.setTab('Chat', 'IM');
      if (typeof actions?.setChip === 'function') actions.setChip(targetName);
      if (typeof actions?.setScreen === 'function') actions.setScreen('Chat');
    }
    if (typeof actions?.notify === 'function') {
      actions.notify(`Opened IM with ${targetName}`);
    }
  };

  const handleFriend = () => {
    if (app.friends && typeof app.friends.sendFriendRequest === 'function' && targetId) {
      app.friends.sendFriendRequest(targetId).then(
        () => {
          if (typeof actions?.notify === 'function') {
            actions.notify(`Friendship offered to ${targetName}`);
          }
        },
        (err) => {
          if (typeof actions?.notify === 'function') {
            actions.notify(err instanceof Error ? err.message : 'Unable to offer friendship');
          }
        },
      );
    } else {
      if (typeof actions?.notify === 'function') {
        actions.notify(`Friendship offered to ${targetName}`);
      }
    }
  };

  return (
    <div className="tool-screen" data-testid="resident-inspector">
      <div
        className="inspector-toolbar"
        data-testid="inspector-toolbar"
        role="toolbar"
        aria-label="Resident Inspector Toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          borderBottom: `1px solid ${V.outv}`,
          background: V.surf,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TouchTarget
            onClick={handleReturn}
            aria-label="Return to self profile"
            data-testid="inspector-return-btn"
            minSize={36}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: V.rs,
              border: `1px solid ${V.outv}`,
              background: V.surf,
              color: V.pri,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            <Icon name="arrow-left" size={16} />
            <span>Return</span>
          </TouchTarget>
          <span
            style={{ fontSize: '13px', fontWeight: 600, color: V.ink }}
            data-testid="inspector-target-name"
          >
            Inspecting: {targetName}
          </span>
        </div>
        <TouchTarget
          onClick={handleReturn}
          aria-label="View self profile"
          data-testid="inspector-self-toggle-btn"
          minSize={36}
          style={{
            padding: '6px 10px',
            borderRadius: V.rs,
            border: `1px solid ${V.outv}`,
            background: 'transparent',
            color: V.ink2,
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
          }}
        >
          Self Profile
        </TouchTarget>
      </div>

      <SegmentedTabs screen="Profile" />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
        {curSub === '2ND LIFE' && (
          <article
            className="runtime-card"
            id="panel-profile-2nd-life"
            role="tabpanel"
            aria-labelledby="tab-profile-2nd-life"
            style={{ borderColor: V.outv, background: V.surf }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {photo?.photoBytes ? (
                <img
                  src={`data:${photo.contentType || 'image/png'};base64,${photo.photoBytes}`}
                  alt={targetName}
                  data-testid="resident-photo"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `2px solid ${V.pri}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: V.priC,
                    color: V.pri,
                  }}
                >
                  <Icon name="user" size={32} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ font: `600 20px/1.3 ${t.dfont}`, margin: 0 }}>{targetName}</h2>
                <div style={{ fontSize: '12px', color: V.ink2, marginTop: 4 }}>Resident</div>
              </div>
            </div>

            <dl style={{ marginTop: 16 }}>
              <dt>Resident ID</dt>
              <dd>{targetId || '—'}</dd>
              {target?.aboutText && (
                <>
                  <dt>Bio</dt>
                  <dd>{target.aboutText}</dd>
                </>
              )}
            </dl>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <TouchTarget
                onClick={handleIm}
                aria-label={`Send instant message to ${targetName}`}
                data-testid="resident-im-btn"
                minSize={44}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: V.rs,
                  border: 'none',
                  background: V.pri,
                  color: V.onpri,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <Icon name="message-square" size={16} />
                <span>IM</span>
              </TouchTarget>
              <TouchTarget
                onClick={handleFriend}
                aria-label={`Offer friendship to ${targetName}`}
                data-testid="resident-friend-btn"
                minSize={44}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: V.rs,
                  border: `1px solid ${V.outv}`,
                  background: V.surf,
                  color: V.pri,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <Icon name="user-plus" size={16} />
                <span>Friend</span>
              </TouchTarget>
            </div>
          </article>
        )}

        {curSub === 'PICKS' && (
          <div
            id="panel-profile-picks"
            role="tabpanel"
            aria-labelledby="tab-profile-picks"
            data-testid="resident-picks-panel"
          >
            {Array.isArray(target?.picks) && target.picks.length > 0 ? (
              <div className="live-list">
                {target.picks.map((pick, i) => (
                  <article
                    key={pick.id || i}
                    className="runtime-card"
                    style={{ borderColor: V.outv, background: V.surf, marginBottom: 8 }}
                  >
                    <h3 style={{ font: `600 16px/1.3 ${t.dfont}`, margin: '0 0 6px 0' }}>
                      {pick.name || pick.title || '—'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: V.ink2 }}>
                      {pick.desc || pick.description || '—'}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="honest-empty" data-testid="picks-empty-state">
                <Icon name="star" size={30} />
                <h2>Picks</h2>
                <p>No picks published</p>
              </div>
            )}
          </div>
        )}

        {curSub === 'GROUPS' && (
          <div
            id="panel-profile-groups"
            role="tabpanel"
            aria-labelledby="tab-profile-groups"
            data-testid="resident-groups-panel"
          >
            {Array.isArray(target?.groups) && target.groups.length > 0 ? (
              <div className="live-list">
                {target.groups.map((group, i) => (
                  <div
                    key={group.id || i}
                    className="inventory-row"
                    style={{ borderColor: V.outv, background: V.surf }}
                  >
                    <Icon name="users" size={17} />
                    <div>
                      <strong>{group.name || group.title || group.id}</strong>
                      {group.role ? <small>{group.role}</small> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="honest-empty" data-testid="groups-empty-state">
                <Icon name="users" size={30} />
                <h2>Groups</h2>
                <p>No public groups</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Profile({ target: propTarget } = {}) {
  const { V, t } = useTheme();
  const { state, actions } = useApp();
  const target = propTarget !== undefined ? propTarget : state?.target;

  if (target) {
    return (
      <ResidentInspector
        target={target}
        onReturn={() => {
          if (typeof actions?.setTarget === 'function') {
            actions.setTarget(null);
          }
        }}
      />
    );
  }

  const user = app.auth?.user;
  if (!user) {
    return (
      <div className="honest-empty">
        <Icon name="user" size={30} />
        <h2>Profile</h2>
        <p>Connect to a grid to view your resident profile.</p>
      </div>
    );
  }

  const curSub = subView(state, 'Profile') || '2ND LIFE';

  return (
    <div className="tool-screen">
      <SegmentedTabs screen="Profile" />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
        {curSub === '2ND LIFE' && (
          <article
            className="runtime-card"
            id="panel-profile-2nd-life"
            role="tabpanel"
            aria-labelledby="tab-profile-2nd-life"
            style={{ borderColor: V.outv, background: V.surf }}
          >
            <Icon name="user" size={34} style={{ color: V.pri }} />
            <h2 style={{ font: `600 20px/1.3 ${t.dfont}` }}>{user.fullName}</h2>
            <dl>
              <dt>Grid</dt>
              <dd>{user.grid}</dd>
              <dt>Account ID</dt>
              <dd>{user.id || 'Not supplied'}</dd>
            </dl>
          </article>
        )}
        {curSub === 'PICKS' && (
          <div
            id="panel-profile-picks"
            role="tabpanel"
            aria-labelledby="tab-profile-picks"
            className="honest-empty"
          >
            <Icon name="star" size={30} />
            <h2>Picks</h2>
            <p>No picks published</p>
          </div>
        )}
        {curSub === 'GROUPS' && (
          <div
            id="panel-profile-groups"
            role="tabpanel"
            aria-labelledby="tab-profile-groups"
            className="honest-empty"
          >
            <Icon name="users" size={30} />
            <h2>Groups</h2>
            <p>No public groups</p>
          </div>
        )}
      </div>
    </div>
  );
}
