import React from 'react';
import type { LcarsGeometry, ThemeTokens } from '../tokens/index.js';
import { inkOn } from '../tokens/index.js';

/** Opposing elbows share their curve centers; titles/readouts stay off the bars. */
export function LcarsChrome({
  geometry: G,
  tokens: V,
  font,
  title,
  readouts,
  arm = 'LINKPOINT',
}: {
  geometry: LcarsGeometry;
  tokens: ThemeTokens;
  font: string;
  title?: React.ReactNode;
  readouts?: React.ReactNode;
  arm?: React.ReactNode;
}) {
  const base: React.CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  return (
    <>
      <div
        data-lcars="arm"
        style={{
          ...base,
          left: 0,
          top: 0,
          width: G.rail,
          height: G.arm,
          background: V.sec2,
          color: inkOn(V.sec2),
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: '0 8px 8px',
          font: `700 12px/1 ${font}`,
          boxSizing: 'border-box',
        }}
      >
        {arm}
      </div>
      <div
        data-lcars="header-outer"
        aria-hidden="true"
        style={{
          ...base,
          left: 0,
          right: 0,
          top: G.headerTop,
          height: G.header,
          background: V.pri,
          borderBottomLeftRadius: `${G.outerX}px ${G.outerY}px`,
        }}
      />
      <div
        data-lcars="header-inner"
        aria-hidden="true"
        style={{
          ...base,
          left: G.rail,
          right: 0,
          top: G.headerTop,
          height: G.header - G.frame,
          background: V.bg,
          borderBottomLeftRadius: G.inner,
        }}
      />
      <div
        data-lcars="content-outer"
        aria-hidden="true"
        style={{
          ...base,
          left: 0,
          right: 0,
          top: G.contentTop,
          height: G.outerY,
          background: V.sec,
          borderTopLeftRadius: `${G.outerX}px ${G.outerY}px`,
        }}
      />
      <div
        data-lcars="content-inner"
        aria-hidden="true"
        style={{
          ...base,
          left: G.rail,
          right: 0,
          top: G.shellTop,
          height: G.inner,
          background: V.bg,
          borderTopLeftRadius: G.inner,
        }}
      />
      {[G.headerBottom - G.frame, G.contentTop].map((top, i) => (
        <div
          key={top}
          aria-hidden="true"
          style={{
            ...base,
            right: 0,
            top,
            width: '28%',
            height: G.frame,
            display: 'flex',
            gap: G.gap,
            background: V.bg,
            paddingLeft: G.gap,
          }}
        >
          <span style={{ flex: 1, background: i ? V.sec2 : V.sec }} />
          <span
            style={{
              flex: 0.7,
              background: i ? V.pri : V.sec2,
              borderRadius: `0 ${G.frame / 2}px ${G.frame / 2}px 0`,
            }}
          />
        </div>
      ))}
      <div
        data-lcars="title"
        style={{
          ...base,
          left: G.rail + 8,
          right: 8,
          top: 0,
          height: G.arm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: V.priText,
          font: `700 ${G.wide ? 32 : 24}px/1 ${font}`,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>
      <div
        data-lcars="readouts"
        style={{
          ...base,
          left: G.rail + 8,
          right: 8,
          top: G.headerTop + 8,
          height: G.header - G.frame - 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'flex-end',
          columnGap: 12,
          rowGap: 4,
          overflow: 'hidden',
          color: V.ink2,
          font: `500 12px/1.2 ${font}`,
        }}
      >
        {readouts}
      </div>
    </>
  );
}
