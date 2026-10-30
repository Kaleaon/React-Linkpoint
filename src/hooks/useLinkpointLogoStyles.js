import { useEffect } from 'react';

export const LOGO_STYLE_ID = 'linkpoint-logo-styles';

export const LOGO_CSS = `
  .top-crystal-r {
    will-change: auto;
  }
  .top-crystal-r.animated {
    will-change: transform;
    animation: topCloseSeq 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .bot-crystal-r {
    will-change: auto;
  }
  .bot-crystal-r.animated {
    will-change: transform;
    animation: botCloseSeq 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .core-anim-r {
    transform-origin: 256px 256px;
  }
  .core-anim-r.animated {
    animation: corePulseR 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .mote-rotator-group {
    will-change: auto;
  }
  .mote-rotator-group.animated {
    will-change: transform;
    animation: moteRotate 6s linear infinite;
  }
  .mote-near-r.animated {
    animation: moteNearFade 6s linear infinite;
  }
  .mote-far-r.animated {
    animation: moteFarFade 6s linear infinite;
  }

  @keyframes topCloseSeq {
    0%, 15% { transform: translateY(0); }
    35%, 65% { transform: translateY(86px); }
    85%, 100% { transform: translateY(0); }
  }

  @keyframes botCloseSeq {
    0%, 15% { transform: translateY(0); }
    35%, 65% { transform: translateY(-86px); }
    85%, 100% { transform: translateY(0); }
  }

  @keyframes corePulseR {
    0%, 25% { transform: rotate(0deg) scale(1); opacity: 0.8; }
    35%, 65% { transform: rotate(180deg) scale(0.6); opacity: 1; filter: drop-shadow(0 0 20px currentColor); }
    75%, 100% { transform: rotate(0deg) scale(1); opacity: 0.8; }
  }

  @keyframes moteRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes moteNearFade {
    0%, 44% { opacity: 1; }
    56%, 94% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes moteFarFade {
    0%, 44% { opacity: 0; }
    56%, 94% { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .top-crystal-r,
    .bot-crystal-r,
    .core-anim-r,
    .mote-rotator-group,
    .mote-near-r,
    .mote-far-r {
      animation: none !important;
      transform: none !important;
      will-change: auto !important;
    }
    .mote-near-r {
      opacity: 1 !important;
    }
    .mote-far-r {
      opacity: 0.6 !important;
    }
  }

  .logo-title-r {
    font-weight: 800;
    font-size: 38px;
    letter-spacing: 0.28em;
  }
  .logo-subtitle-r {
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.38em;
  }
`;

export function useLinkpointLogoStyles() {
  useEffect(() => {
    if (typeof document === 'undefined' || !document.head) {
      return;
    }

    if (!document.getElementById(LOGO_STYLE_ID)) {
      const styleElement = document.createElement('style');
      styleElement.id = LOGO_STYLE_ID;
      styleElement.textContent = LOGO_CSS;
      document.head.appendChild(styleElement);
    }
  }, []);
}

export default useLinkpointLogoStyles;
