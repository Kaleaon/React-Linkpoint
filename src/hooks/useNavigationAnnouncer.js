import { useEffect, useRef } from 'react';
import { liveRegionAnnouncer } from '../services/LiveRegionAnnouncer';

export function useNavigationAnnouncer(screen) {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!screen) return;
    const title = screen === 'Login' ? 'Linkpoint' : `${screen} - Linkpoint`;
    document.title = title;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const mainEl = document.getElementById('main-content');
    if (mainEl) {
      mainEl.focus({ preventScroll: true });
    }

    liveRegionAnnouncer.announce(`Navigated to ${screen} screen`, 'polite');
  }, [screen]);
}
