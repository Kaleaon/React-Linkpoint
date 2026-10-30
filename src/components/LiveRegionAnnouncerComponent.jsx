import { useEffect, useRef } from 'react';
import { liveRegionAnnouncer } from '../services/LiveRegionAnnouncer';
import { app } from '../linkpoint/app';

/**
 * LiveRegionAnnouncerComponent
 *
 * Mounts off-screen multi-channel live region elements in the DOM tree (WCAG 2.2 SC 4.1.3).
 * Manages 3 distinct containers (#live-region-status, #live-region-alert, #live-region-log)
 * for status toasts, critical alerts, and live chat updates.
 */
export default function LiveRegionAnnouncerComponent() {
  const statusRef = useRef(null);
  const alertRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (statusRef.current) {
      liveRegionAnnouncer.registerDOMElement(statusRef.current, 'status');
    }
    if (alertRef.current) {
      liveRegionAnnouncer.registerDOMElement(alertRef.current, 'alert');
    }
    if (logRef.current) {
      liveRegionAnnouncer.registerDOMElement(logRef.current, 'log');
    }

    liveRegionAnnouncer.attachChatBus(app.chat);

    return () => {
      // Don't fully destroy singleton on unmount/hot reload, but unregister DOM nodes
      liveRegionAnnouncer.registerDOMElement(null, 'status');
      liveRegionAnnouncer.registerDOMElement(null, 'alert');
      liveRegionAnnouncer.registerDOMElement(null, 'log');
    };
  }, []);

  return (
    <>
      <div
        ref={statusRef}
        id="live-region-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only live-region-announcer"
      />
      <div
        ref={alertRef}
        id="live-region-alert"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only live-region-announcer"
      />
      <div
        ref={logRef}
        id="live-region-log"
        role="log"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Live Chat Announcements"
        className="sr-only live-region-announcer"
      />
    </>
  );
}
