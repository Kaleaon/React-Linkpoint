import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import {
  actionStyle,
  badgeStyle,
  bodyStyle,
  cardStyle,
  chipStyle,
  labelStyle,
  listStyle,
  merge,
  metaStyle,
  rowStyle,
  segItemStyle,
  segOnStyle,
  segWrapStyle,
  subtitleStyle,
  titleStyle,
} from './styles';

/** The action buttons a card can carry. */
export interface CardAction {
  label: string;
  kind?: 'normal' | 'primary' | 'danger';
  onClick?: () => void;
}

export interface CardProps {
  icon?: LucideIcon;
  title?: React.ReactNode;
  right?: React.ReactNode;
  body?: React.ReactNode;
  /** Recolours whichever edge this layout pack draws. */
  accent?: string;
  badge?: number;
  actions?: CardAction[];
  /** Renders a large figure — the Diagnostics readouts use this. */
  big?: string;
  bigColor?: string;
  toggle?: { on: boolean; onChange: (on: boolean) => void };
  children?: React.ReactNode;
  onClick?: () => void;
}

/** A list card, in whichever treatment the current layout pack calls for. */
export const Card: React.FC<CardProps> = ({
  icon: Icon,
  title,
  right,
  body,
  accent,
  badge,
  actions,
  big,
  bigColor,
  toggle,
  children,
  onClick,
}) => {
  const t = useTheme();
  return (
    <div style={merge(cardStyle(t, accent), onClick ? { cursor: 'pointer' } : null)} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {Icon && <Icon size={17} style={{ color: t.v.pri, flex: 'none', marginTop: '1px' }} strokeWidth={1.7} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ font: `500 13.5px/1.3 ${t.font}`, color: t.v.ink, flex: 1, minWidth: 0 }}>{title}</span>
              {badge != null && badge > 0 && <span style={badgeStyle(t)}>{badge}</span>}
              {right != null && <span style={{ font: `400 10.5px/1 ${t.font}`, color: t.v.ink2, flex: 'none' }}>{right}</span>}
            </div>
          )}
          {big != null && <div style={{ font: `700 46px/1 ${t.font}`, color: bigColor || t.v.ok, marginTop: '6px' }}>{big}</div>}
          {body != null && <div style={merge(metaStyle(t), { marginTop: title != null ? '5px' : 0 })}>{body}</div>}
          {children}
        </div>
        {toggle && <Toggle on={toggle.on} onChange={toggle.onChange} />}
      </div>
      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '11px' }}>
          {actions.map((a) => (
            <button key={a.label} type="button" style={actionStyle(t, a.kind)} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** The switch used throughout Settings. */
export const Toggle: React.FC<{ on: boolean; onChange: (on: boolean) => void; label?: string }> = ({ on, onChange, label }) => {
  const t = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      style={{
        width: '42px',
        height: '24px',
        borderRadius: '12px',
        position: 'relative',
        flex: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        background: on ? t.v.priC : t.v.surf2,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: on ? '21px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '9px',
          background: on ? t.v.pri : t.v.ink2,
          transition: 'left .18s ease',
        }}
      />
    </button>
  );
};

/** The scrolling card list a screen body sits in. */
export const CardList: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTheme();
  return <div style={listStyle(t)}>{children}</div>;
};

export interface SegTab {
  label: string;
  badge?: number;
}

/** Segmented control: fill, pivot or text, per pack. */
export const SegTabs: React.FC<{ tabs: SegTab[]; value: string; onChange: (label: string) => void }> = ({ tabs, value, onChange }) => {
  const t = useTheme();
  return (
    <div style={segWrapStyle(t)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={tab.label === value}
          onClick={() => onChange(tab.label)}
          style={merge({ border: 'none' }, segItemStyle(t), tab.label === value ? segOnStyle(t) : null)}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && <span style={badgeStyle(t)}>{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
};

export interface ChipItem {
  label: string;
  badge?: number;
  /** Presence dot colour, when the chip stands for a resident. */
  dot?: string;
}

/** A horizontal chip rail. Packs that opt out of chips render nothing. */
export const ChipRail: React.FC<{ chips: ChipItem[]; value: string; onChange: (label: string) => void }> = ({ chips, value, onChange }) => {
  const t = useTheme();
  if (!t.look.chips) return null;
  return (
    <div style={{ flex: 'none', display: 'flex', gap: '6px', padding: '0 16px 10px', overflowX: 'auto' }}>
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={() => onChange(c.label)} style={chipStyle(t, c.label === value)}>
          {c.dot && <span style={{ width: '8px', height: '8px', borderRadius: '4px', flex: 'none', background: c.dot }} />}
          <span style={{ font: `500 11.5px/1 ${t.font}` }}>{c.label}</span>
          {c.badge != null && c.badge > 0 && <span style={badgeStyle(t)}>{c.badge}</span>}
        </button>
      ))}
    </div>
  );
};

/** A plain list row with an icon, a title, meta text and a trailing slot. */
export const Row: React.FC<{
  icon?: LucideIcon;
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  tone?: string;
  divider?: boolean;
  onClick?: () => void;
  onPointerDown?: React.PointerEventHandler;
  onPointerUp?: React.PointerEventHandler;
}> = ({ icon: Icon, title, meta, right, tone, divider = true, onClick, onPointerDown, onPointerUp }) => {
  const t = useTheme();
  return (
    <div
      style={merge(rowStyle(t), divider ? { borderBottom: `1px solid ${t.v.outv}` } : null)}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {Icon && <Icon size={17} style={{ color: tone || t.v.pri, flex: 'none' }} strokeWidth={1.7} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `400 14px/1.2 ${t.font}`, color: t.v.ink }}>{title}</div>
        {meta != null && (
          <div style={merge(metaStyle(t), { marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
            {meta}
          </div>
        )}
      </div>
      {right != null && <div style={{ flex: 'none' }}>{right}</div>}
    </div>
  );
};

/** The small tracked caps that head a group of controls. */
export const SectionLabel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const t = useTheme();
  return <div style={merge(labelStyle(t), style)}>{children}</div>;
};

/** A 44px button in the pack's button treatment. */
export const Button: React.FC<{
  children: React.ReactNode;
  kind?: 'normal' | 'primary' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}> = ({ children, kind = 'normal', onClick, disabled, type = 'button', style }) => {
  const t = useTheme();
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={merge(actionStyle(t, kind), disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null, style)}
    >
      {children}
    </button>
  );
};

/** Screen title block, in the pack's header grammar. */
export const ScreenTitle: React.FC<{ title: string; subtitle?: string | null; right?: React.ReactNode }> = ({ title, subtitle, right }) => {
  const t = useTheme();
  if (!title) return null;
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', gap: '10px', padding: '14px 16px 10px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle(t)}>{title}</div>
        {subtitle && <div style={subtitleStyle(t)}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
};

export { bodyStyle, metaStyle, merge };
