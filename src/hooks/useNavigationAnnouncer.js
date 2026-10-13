import { useEffect, useRef } from 'react';
import { liveRegionAnnouncer } from '../services/LiveRegionAnnouncer.ts';

export function useNavigationAnnouncer(screen) {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!screen) return;
    const title = screen === 'Login' ? 'Linkpoint' : `${screen} - Linkpoint`;
    if (typeof document !== 'undefined') {
      document.title = title;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (typeof document !== 'undefined') {
      const mainEl = document.getElementById('main-content');
      if (mainEl) {
        mainEl.focus({ preventScroll: true });
      }
    }

    liveRegionAnnouncer.announce(`Navigated to ${screen} screen`, 'polite');
  }, [screen]);
}
