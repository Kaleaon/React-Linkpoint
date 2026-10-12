import React from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import BrandedLoader, { SkeletonBox } from './BrandedLoader.jsx';

export { SkeletonBox };

export function SkeletonRow({ count = 1 }) {
  const items = Array.from({ length: count });
  return (
    <div className="skeleton-list" role="status" aria-label="Loading contents...">
      {items.map((_, i) => (
        <div key={i} className="skeleton-row" data-testid="skeleton-row">
          <BrandedLoader variant="inline" size={20} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonBox width={`${60 + (i % 3) * 15}%`} height="13px" />
            <SkeletonBox width={`${30 + (i % 2) * 20}%`} height="10px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ height = '120px', style = {} }) {
  return <BrandedLoader variant="card" style={{ height, ...style }} />;
}

export function SkeletonAssetPlaceholder({ title = 'Loading Asset...', progress = null }) {
  return <BrandedLoader variant="asset" title={title} progress={progress} />;
}

export default function SkeletonLoader({
  type = 'row',
  count = 1,
  height = '120px',
  title,
  progress,
}) {
  if (type === 'card') return <SkeletonCard height={height} />;
  if (type === 'asset') return <SkeletonAssetPlaceholder title={title} progress={progress} />;
  if (type === 'inline') return <BrandedLoader variant="inline" size={16} />;
  if (type === 'screen') return <BrandedLoader variant="screen" />;
  return <SkeletonRow count={count} />;
}
