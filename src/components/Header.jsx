import { useApp } from '../context/AppContext.jsx';
import { app } from '../linkpoint/app.ts';
import { describePing } from '../screens/diagnosticsView.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { LAYOUTS, PALETTES } from '@linkpoint/design-system/tokens';
import { HEAD } from '../data/content.js';
import { SCREENS } from '../theme/constants.js';
import Icon from './Icon.jsx';

// Ported from the five header <sc-if> blocks (hasHeader/isSweepHead/
// isPivotHead/isRuleHead/isPressHead) plus the shared title/subtitle lookup.
export default function Header() {
  const { state } = useApp();
  const { V, t, headLook, condPack, scr, isConsole } = useTheme();

  const headMap = HEAD(LAYOUTS[state.layout].name, PALETTES[state.palette].name, {
    cleared: state.cacheCleared,
    limit: state.prefs.cacheLimit,
    loc: state.prefs.cacheLoc,
  });
  const [rawTitle, rawSubtitle] = headMap[scr] || ['', ''];
  const title = rawTitle;
  const subtitle = condPack ? condPack.sub || null : rawSubtitle;

  if (headLook === 'none' || headLook === 'sweep') {
    // "sweep" head only renders outside the console frame (isSweepHead requires
    // !isConsole); when isConsole is true the console chrome draws its own title.
    if (headLook === 'sweep' && !isConsole) return <SweepHead title={title} subtitle={subtitle} />;
    return null;
  }
  if (headLook === 'pivot') return <PivotHead title={title} subtitle={subtitle} scr={scr} />;
  if (headLook === 'rule') return <RuleHead title={title} subtitle={subtitle} />;
  if (headLook === 'editorial') return <EditorialHead title={title} subtitle={subtitle} />;
  return <StackHead title={title} subtitle={subtitle} scr={scr} />;
}

function StackHead({ title, subtitle, scr }) {
  const { V, t } = useTheme();
  const { actions } = useApp();
  const showLink = scr === 'Chat';
  const headerIcons =
    scr === 'Friends'
      ? [
          {
            icon: 'user-plus',
            label: 'ADD FRIEND',
            pick: () => actions.openSearch('Friends', 'SEARCH'),
          },
          { icon: 'search', label: 'SEARCH', pick: () => actions.openSearch('Friends', 'SEARCH') },
        ]
      : scr === 'Diagnostics'
        ? [
            {
              icon: 'refresh-cw',
              label: 'RE-RUN PROBE',
              pick: () => {
                void app.protocol.fetchDiagnostics().then(
                  (res) => actions.notify(describePing(res)),
                  () => actions.notify('Ping probe error'),
                );
              },
            },
          ]
        : null;
  return (
    <header
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px 8px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 21px/1.05 ' + t.dfont, letterSpacing: V.tls, color: V.pri }}>
          {title}
        </div>
        <div style={{ font: '400 11px/1.4 ' + t.font, color: V.ink2, marginTop: '4px' }}>
          {subtitle}
        </div>
      </div>
      {showLink ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            minWidth: '24px',
            minHeight: '24px',
            padding: '0 10px',
            border: '1px solid ' + V.ok,
            borderRadius: V.rs,
            background: V.surf,
            flexShrink: 0,
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '3px', background: V.ok }} />
          <span style={{ font: '600 10px/1 ' + t.font, letterSpacing: '.2em', color: V.ok }}>
            LINK
          </span>
        </div>
      ) : null}
      {headerIcons
        ? headerIcons.map((hi) => (
            <div
              key={hi.icon}
              onClick={hi.pick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  hi.pick();
                }
              }}
              role="button"
              aria-label={hi.label}
              tabIndex={0}
              style={{
                width: '44px',
                height: '44px',
                minWidth: '24px',
                minHeight: '24px',
                border: '1px solid ' + V.outv,
                borderRadius: V.rs,
                background: V.surf,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: V.pri,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Icon name={hi.icon} size={18} />
            </div>
          ))
        : null}
    </header>
  );
}

function SweepHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <header style={{ flex: 'none' }}>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 12px 6px 4px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '24px',
            minWidth: '24px',
            padding: '0 8px',
            background: V.sec2,
            borderRadius: '8px 0 0 8px',
            flex: 'none',
            font: '700 8.5px/1 ' + t.dfont,
            color: V.bg,
            letterSpacing: '.1em',
          }}
        >
          01-4471
        </span>
        <span style={{ flex: 1, height: '6px', background: V.surf2 }} />
        <span
          style={{
            font: '700 22px/1 ' + t.dfont,
            letterSpacing: '.14em',
            color: V.pri,
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        <span
          style={{
            width: '36px',
            minWidth: '24px',
            minHeight: '24px',
            background: V.pri,
            borderRadius: '0 8px 8px 0',
            flex: 'none',
          }}
        />
      </div>
      <div
        style={{
          flex: 'none',
          padding: '0 12px 8px',
          font: '400 11px/1.4 ' + t.font,
          letterSpacing: '.06em',
          color: V.ink2,
        }}
      >
        {subtitle}
      </div>
    </header>
  );
}

function PivotHead({ title, subtitle, scr }) {
  const { t, V } = useTheme();
  const { actions } = useApp();
  const nextScr = SCREENS[(SCREENS.indexOf(scr) + 1) % SCREENS.length];
  return (
    <header style={{ flex: 'none' }}>
      <div
        style={{
          flex: 'none',
          padding: '14px 0 2px 16px',
          display: 'flex',
          alignItems: 'baseline',
          gap: '22px',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            flex: 'none',
            font: '300 42px/1 ' + t.dfont,
            color: V.ink,
            textTransform: 'lowercase',
            letterSpacing: '-.02em',
          }}
        >
          {String(title || '').toLowerCase()}
        </span>
        <span
          onClick={() => actions.setScreen(nextScr)}
          role="button"
          tabIndex={0}
          aria-label={'Pivot to ' + nextScr}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              actions.setScreen(nextScr);
            }
          }}
          style={{
            flex: 'none',
            minWidth: '24px',
            minHeight: '24px',
            font: '300 42px/1 ' + t.dfont,
            color: V.ink2,
            opacity: 0.35,
            cursor: 'pointer',
            textTransform: 'lowercase',
            letterSpacing: '-.02em',
          }}
        >
          {nextScr.toLowerCase()}
        </span>
      </div>
      <div
        style={{
          flex: 'none',
          padding: '2px 16px 10px',
          font: '300 12px/1.4 ' + t.font,
          color: V.ink2,
        }}
      >
        {subtitle}
      </div>
    </header>
  );
}

function RuleHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <header style={{ flex: 'none', padding: '16px 16px 4px', minWidth: '24px', minHeight: '24px' }}>
      <div style={{ height: '1px', background: V.pri }} />
      <div style={{ height: '3px', borderBottom: '1px solid ' + V.pri }} />
      <div
        style={{
          textAlign: 'center',
          padding: '12px 0 10px',
          font: '600 15px/1.1 ' + t.dfont,
          letterSpacing: V.tls,
          color: V.pri,
          textIndent: V.tls,
        }}
      >
        {title}
      </div>
      <div
        style={{
          textAlign: 'center',
          font: '400 10px/1.4 ' + t.font,
          letterSpacing: '.16em',
          color: V.ink2,
        }}
      >
        {subtitle}
      </div>
      <div style={{ height: '1px', background: V.outv, marginTop: '12px' }} />
    </header>
  );
}

function EditorialHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <header style={{ flex: 'none', padding: '18px 18px 10px', borderBottom: '2px solid ' + V.ink }}>
      <div
        style={{
          font: '600 27px/1.12 ' + t.font,
          letterSpacing: '-.01em',
          color: V.ink,
          textTransform: 'capitalize',
        }}
      >
        {title}
      </div>
      <div
        style={{
          font: '400 12px/1.5 ' + t.font,
          color: V.ink2,
          marginTop: '6px',
          maxWidth: '46ch',
        }}
      >
        {subtitle}
      </div>
    </header>
  );
}
