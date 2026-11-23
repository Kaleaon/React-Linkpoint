import { ratingName } from './map-tiles';

export const MAX_LANDMARK_DESC_BYTES = 127;
export const MAX_LANDMARK_NAME_BYTES = 63;

const utf8Encoder = new TextEncoder();

/**
 * Returns the exact UTF-8 byte length of a string.
 */
export function getUtf8ByteLength(text: string): number {
  if (!text) return 0;
  return utf8Encoder.encode(String(text)).byteLength;
}

/**
 * Truncates a string to at most `maxBytes` UTF-8 bytes without splitting
 * surrogate pairs or multi-byte code points.
 */
export function truncateUtf8Bytes(
  input: string | null | undefined,
  maxBytes: number = MAX_LANDMARK_DESC_BYTES,
): string {
  if (!input || maxBytes <= 0) return '';
  const cleaned = String(input).replace(/\0/g, '');
  if (utf8Encoder.encode(cleaned).byteLength <= maxBytes) {
    return cleaned;
  }

  let usedBytes = 0;
  let endIndex = 0;
  for (const codePointChar of cleaned) {
    const charBytes = utf8Encoder.encode(codePointChar).byteLength;
    if (usedBytes + charBytes > maxBytes) {
      break;
    }
    usedBytes += charBytes;
    endIndex += codePointChar.length;
  }
  return cleaned.slice(0, endIndex);
}

/**
 * Resolves a human-readable maturity rating ('General', 'Moderate', 'Adult', or '—')
 * from live region/parcel state without fabricating unknown values.
 */
export function formatMaturityRating(region: any): string {
  if (!region || typeof region !== 'object') return '—';

  const numericCandidates = [
    region.parcel?.simAccess,
    region.parcel?.SimAccess,
    region.parcel?.access,
    region.simAccess,
    region.SimAccess,
    region.access,
  ];

  for (const candidate of numericCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      const mapped = ratingName(candidate);
      if (mapped) return mapped;
    }
  }

  const stringCandidates = [
    region.parcel?.maturity,
    region.parcel?.rating,
    region.maturity,
    region.rating,
  ];

  for (const candidate of stringCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const norm = candidate.trim().toLowerCase();
      if (norm === 'pg' || norm === 'general') return 'General';
      if (norm === 'mature' || norm === 'moderate') return 'Moderate';
      if (norm === 'adult') return 'Adult';
      return candidate.trim();
    }
  }

  return '—';
}
