import React from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import CrystalLoader from './CrystalLoader.jsx';
import CrystalProgressBar from './CrystalProgressBar.jsx';

export function SkeletonBox({
  width = '100%',
  height = '16px',
  borderRadius = '4px',
  style = {},
  className = '',
}) {
  const { V } = useTheme?.() || { V: {} };
  const surf2 = V?.surf2 || 'var(--surf2, rgba(255, 255, 255, 0.08))';
  const priC = V?.priC || 'var(--priC, rgba(18, 59, 39, 0.4))';
  const pri = V?.pri || 'var(--pri, rgba(108, 255, 154, 0.35))';
  return (
    <div
      className={`skeleton-box ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${surf2} 25%, ${priC} 40%, ${pri} 50%, ${priC} 60%, ${surf2} 75%)`,
        backgroundSize: '200% 100%',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow({ count = 1 }) {
  const items = Array.from({ length: count });
  return (
    <div className="skeleton-list" role="status" aria-label="Loading contents...">
      {items.map((_, i) => (
        <div key={i} className="skeleton-row" data-testid="skeleton-row">
          <SkeletonBox width="20px" height="20px" borderRadius="4px" />
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
  return (
    <div
      className="skeleton-container"
      style={{ ...style }}
      role="status"
      aria-label="Loading asset container..."
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <SkeletonBox width="24px" height="24px" borderRadius="4px" />
        <SkeletonBox width="50%" height="16px" />
      </div>
      <SkeletonBox width="100%" height={height} borderRadius="6px" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SkeletonBox width="80%" height="12px" />
        <SkeletonBox width="40%" height="10px" />
      </div>
    </div>
  );
}

/**
 * @param {{ title?: string, progress?: number | null }} props
 */
export function SkeletonAssetPlaceholder({ title = 'Loading Asset...', progress = null }) {
  const { V } = useTheme?.() || { V: {} };
  const pri = V?.pri || 'var(--pri, #6CFF9A)';
  const priC = V?.priC || 'var(--priC, #123B27)';

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
  return <SkeletonRow count={count} />;
}
