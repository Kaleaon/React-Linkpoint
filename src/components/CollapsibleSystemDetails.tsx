import React, { useState, useId } from 'react';
import Icon from './Icon.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export interface CollapsibleSystemDetailsProps {
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  id?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  className?: string;
}

export const CollapsibleSystemDetails: React.FC<CollapsibleSystemDetailsProps> = ({
  summary = 'Developer / System Details',
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  id: customId,
  ariaLabel,
  style,
  buttonStyle,
  contentStyle,
  className,
}) => {
  const { V, t } = useTheme();
  const generatedId = useId();
  const panelId = customId || `collapsible-details-${generatedId.replace(/:/g, '')}`;

  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleToggle = () => {
    const nextState = !isExpanded;
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextState);
    }
    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <div className={className} style={{ width: '100%', boxSizing: 'border-box', ...style }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          width: '100%',
          padding: '8px 12px',
          background: V.surf2 || V.surf,
          color: V.pri,
          border: `1px solid ${V.outv}`,
          borderRadius: V.rs,
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: t.font,
          textAlign: 'left',
          boxSizing: 'border-box',
          lineHeight: 1.4,
          ...buttonStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
          <span>{summary}</span>
        </div>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-label={ariaLabel || (typeof summary === 'string' ? summary : 'System Details')}
          style={{
            marginTop: '6px',
            padding: '10px',
            background: V.bg,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            boxSizing: 'border-box',
            fontSize: '11px',
            color: V.ink,
            ...contentStyle,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSystemDetails;
