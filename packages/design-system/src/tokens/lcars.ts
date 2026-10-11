/** Shared split-frame geometry, following CleverFerret's LCARS rework. */
export function lcarsGeometry(
  wide = false,
  overrides: Partial<{
    rail: number;
    frame: number;
    gap: number;
    inner: number;
    arm: number;
    header: number;
  }> = {},
) {
  const f = {
    rail: wide ? 132 : 76,
    frame: 12,
    gap: 4,
    inner: 18,
    arm: wide ? 56 : 48,
    header: 64,
    ...overrides,
  };
  const headerTop = f.arm + f.gap;
  const headerBottom = headerTop + f.header;
  const contentTop = headerBottom + f.gap;
  const shellTop = contentTop + f.frame;
  const outerX = f.rail + f.inner;
  const outerY = f.frame + f.inner;
  return {
    ...f,
    wide,
    headerTop,
    headerBottom,
    contentTop,
    shellTop,
    outerX,
    outerY,
    railTop: contentTop + outerY + f.gap,
    // Compatibility names for the viewer's content/dock placement.
    bar: shellTop,
    cur: f.inner,
    rad: f.inner,
    dock: wide ? 58 : 52,
    foot: 24,
  };
}

export type LcarsGeometry = ReturnType<typeof lcarsGeometry>;
