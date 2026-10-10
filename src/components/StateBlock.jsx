import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Icon from './Icon.jsx';
import CrystalLoader from './CrystalLoader.jsx';
import { app } from '../linkpoint/app.ts';

/**
 * @typedef {Object} StateBlockProps
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [icon]
 * @property {string} [btn]
 * @property {(() => void) | string} [action]
 * @property {string} [domain]
 * @property {() => void} [onAction]
 * @property {string} [status]
 * @property {string} [role]
 * @property {string} [ariaLive]
 */

/**
 * Shared loading/empty/error & onboarding UI shown in place of a screen's normal body.
 * @param {StateBlockProps} props
 */
export default function StateBlock({
  title: propTitle = '',
  body: propBody = '',
  icon: propIcon = '',
  btn: propBtn = '',
  action: propAction = undefined,
  domain: propDomain = '',
  onAction = undefined,
  status: propStatus = '',
  role = 'status',
  ariaLive = 'polite',
}) {
  const { state, actions } = useApp() || {};
  const theme = useTheme?.() || {};
  const V = theme?.V || {};
  const t = theme?.t || { font: 'sans-serif', dfont: 'sans-serif' };
  const condPack = theme?.condPack;
  const stateBlockActive = theme?.stateBlockActive;

  // Determine if this is a standalone/prop-driven instance or screen theme-driven
  const isPropDriven = Boolean(
    propTitle || propBody || propIcon || propBtn || propStatus || propDomain,
  );

  if (!isPropDriven && (!stateBlockActive || !condPack)) {
    return null;
  }

  const effectiveStatus =
    propStatus ||
    (state?.cond === 'error' ? 'error' : state?.cond === 'loading' ? 'loading' : 'empty');
  const isError = effectiveStatus === 'error';
  const isLoading = effectiveStatus === 'loading';

  const title =
    propTitle ||
    condPack?.title ||
    (isLoading ? 'LOADING' : isError ? 'CONNECTION ERROR' : 'NOTHING RECEIVED');
  const body =
    propBody ||
    condPack?.body ||
    (isLoading
      ? 'Loading requested data...'
      : isError
        ? 'Request failed. Please try again.'
        : 'No data records found.');
  const icon = propIcon || condPack?.icon || (isError ? 'plug-zap' : 'inbox');
  const btn =
    propBtn ||
    condPack?.btn ||
    (isError ? 'RETRY' : propDomain ? `EXPLORE ${propDomain.toUpperCase()}` : 'REFRESH');

  const handleAction = () => {
    if (typeof onAction === 'function') {
      onAction();
      return;
    }
    if (typeof propAction === 'function') {
      propAction();
      return;
    }

    const actionText = (btn || '').toString().toLowerCase();
    const domainText = (propDomain || '').toString().toLowerCase();

    if (
      actionText.includes('friend') ||
      actionText.includes('contact') ||
      domainText === 'friends'
    ) {
      if (actions?.openSearch) {
        actions.openSearch('Friends', 'FRIENDS');
      } else if (actions?.setScreen) {
        actions.setScreen('Search');
      }
    } else if (actionText.includes('inventory') || domainText === 'inventory') {
      if (app?.inventory?.load) {
        app.inventory.load(true);
      }
      actions?.notify?.('Fetching inventory...');
    } else if (actionText.includes('group') || domainText === 'groups') {
      if (actions?.openSearch) {
        actions.openSearch('Groups', 'SEARCH');
      } else if (app?.loadGroups) {
        app.loadGroups();
      }
    } else if (
      actionText.includes('chat') ||
      actionText.includes('conversation') ||
      domainText === 'chat'
    ) {
      if (actions?.openSearch) {
        actions.openSearch('Chat', 'FRIENDS');
      }
    } else {
      actions?.notify?.('Refreshing data...');
    }
  };

  return (
    <div
      role={role}
      aria-live={ariaLive}
      data-testid="state-block"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px',
        padding: '34px 26px',
        textAlign: 'center',
      }}
    >
      {isLoading ? (
        <CrystalLoader />
      ) : (
        <div
          style={{
            width: '62px',
            height: '62px',
            flex: 'none',
            borderRadius: V.rp || '8px',
            border:
              '1px solid ' + (isError ? V.err || '#EF4444' : V.outv || 'rgba(255,255,255,0.15)'),
            background: V.surf || 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isError ? V.err || '#EF4444' : V.pri || '#6CFF9A',
          }}
        >
          <Icon name={icon} size={26} />
        </div>
      )}
      <div
        style={{
          font: '700 15px/1.3 ' + t.dfont,
          letterSpacing: V.tls || '0.05em',
          color: isError ? V.err || '#EF4444' : V.ink || '#FFFFFF',
        }}
      >
        {title}
      </div>
      <div
        style={{
          maxWidth: '300px',
          font: '400 12px/1.7 ' + t.font,
          color: V.ink2 || 'rgba(255,255,255,0.7)',
        }}
      >
        {body}
      </div>
      {condPack?.bar && isLoading ? (
        <div
          style={{
            width: '216px',
            height: '4px',
            borderRadius: '2px',
            background: V.surf2 || 'rgba(255,255,255,0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: Math.round(condPack.bar * 100) + '%',
              height: '100%',
              background: V.pri || '#6CFF9A',
            }}
          />
        </div>
      ) : null}
      {condPack?.log ? (
        <div
          style={{
            font: '400 10.5px/1.75 ' + t.font,
            color: V.ink2 || 'rgba(255,255,255,0.7)',
            textAlign: 'left',
            border: '1px dashed ' + (V.outv || 'rgba(255,255,255,0.2)'),
            borderRadius: V.rs || '4px',
            padding: '8px 10px',
            maxWidth: '300px',
          }}
        >
          {condPack.log.map((ln, i) => (
            <div key={i}>{ln}</div>
          ))}
        </div>
      ) : null}
      {btn ? (
        <div
          role="button"
          tabIndex={0}
          data-testid="state-block-action"
          onClick={handleAction}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAction();
            }
          }}
          style={{
            minHeight: '44px',
            padding: '0 22px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: V.rs || '4px',
            background: isError ? V.err || '#EF4444' : V.pri || '#6CFF9A',
            color: isError ? '#FFFFFF' : V.onpri || '#000000',
            font: '700 11px/1 ' + t.font,
            letterSpacing: '.18em',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {btn}
        </div>
      ) : null}
    </div>
  );
}
