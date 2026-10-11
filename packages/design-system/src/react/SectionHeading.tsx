import React from 'react';
import type { ThemeTokens } from '../tokens/index.js';

export function SectionHeading({
  title,
  tokens: V,
  font,
  console: isConsole = false,
}: {
  title?: React.ReactNode;
  tokens: ThemeTokens;
  font: string;
  console?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '18px 2px 6px',
        minWidth: 0,
      }}
    >
      {isConsole && (
        <span
          aria-hidden="true"
          style={{ flex: '0 0 18px', height: 12, background: V.sec2, borderRadius: '6px 0 0 6px' }}
        />
      )}
      <span
        role="heading"
        aria-level={2}
        style={{
          font: `700 12px/1.4 ${font}`,
          letterSpacing: isConsole ? '.04em' : '.16em',
          color: V.ink2,
          textTransform: 'uppercase',
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </span>
      {isConsole && (
        <>
          <span aria-hidden="true" style={{ flex: 1, minWidth: 8, height: 6, background: V.sec }} />
          <span
            aria-hidden="true"
            style={{ flex: '0 0 24px', height: 12, background: V.pri, borderRadius: '0 6px 6px 0' }}
          />
        </>
      )}
    </div>
  );
}
