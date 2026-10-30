import { useEffect, useRef } from 'react';
import { liveRegionAnnouncer } from '../services/LiveRegionAnnouncer';
import { formatHeading } from '../components/cameraReadout';

export interface SpatialCameraState {
  position?: number[];
  heading?: number;
  pitch?: number;
  [key: string]: any;
}

export function useSpatialAnnouncer(
  cameraState: SpatialCameraState | null | undefined,
  regionName: string = '3D Scene',
  enabled: boolean = true,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncedRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !cameraState?.position || !Array.isArray(cameraState.position)) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const [x, y, z] = cameraState.position!.map(Math.round);
      const headingText = formatHeading(cameraState) || '';
      const announcement = `Camera at ${x}, ${y}, ${z} in ${regionName}.${headingText ? ' ' + headingText : ''}`;

      if (announcement !== lastAnnouncedRef.current) {
        lastAnnouncedRef.current = announcement;
        liveRegionAnnouncer.announce(announcement, 'polite');
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    cameraState?.position?.[0],
    cameraState?.position?.[1],
    cameraState?.position?.[2],
    cameraState?.heading,
    cameraState?.pitch,
    regionName,
    enabled,
  ]);
}

export default useSpatialAnnouncer;
