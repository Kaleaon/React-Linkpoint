import { BrandedLoader } from '@linkpoint/design-system/react';

/**
 * Backward compatibility wrapper for CrystalLoader delegating to BrandedLoader.
 * @param {Object} props
 * @param {number} [props.size]
 * @param {"block" | "inline" | "screen" | "card" | "asset"} [props.variant]
 * @param {string} [props.className]
 * @param {Object} [props.style]
 * @param {string} [props.idPrefix]
 */
export default function CrystalLoader({
  size = undefined,
  variant = 'block',
  className = '',
  style = {},
  idPrefix,
  ...rest
}) {
  return (
    <BrandedLoader
      size={size}
      variant={variant}
      className={className}
      style={style}
      idPrefix={idPrefix}
      {...rest}
    />
  );
}
