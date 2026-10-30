import React from 'react';
import CrystalLoader from './CrystalLoader.jsx';
import CrystalProgressBar from './CrystalProgressBar.jsx';
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
  return <BrandedLoader variant="card" contentHeight={height} style={style} />;
}

/**
 * @param {{ title?: string, progress?: number | null }} props
 */
export function SkeletonAssetPlaceholder({ title = 'Loading Asset...', progress = null }) {
  return (
    <div
      className="skeleton-container"
      role="status"
      aria-label={title}
      data-testid="skeleton-asset-placeholder"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '60%' }}>
          <CrystalLoader size={20} variant="inline" />
          <SkeletonBox width="80%" height="14px" />
        </div>
        <SkeletonBox width="15%" height="12px" />
      </div>
      <SkeletonBox width="100%" height="140px" borderRadius="6px" />
      {progress !== null && progress !== undefined && (
        <CrystalProgressBar progress={progress} showLabel={true} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBox width="90%" height="12px" />
        <SkeletonBox width="60%" height="12px" />
      </div>
    </div>
  );
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
