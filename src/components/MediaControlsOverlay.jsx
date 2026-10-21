import React, { useState, useEffect } from 'react';
import { app } from '../linkpoint/app';
import { useTheme } from '../context/ThemeContext.jsx';
import Icon from './Icon';

export default function MediaControlsOverlay() {
  const { V } = useTheme();
  const [focusedMedia, setFocusedMedia] = useState(app.world.focusedMediaFace);
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    const handleFocusChanged = (focused) => {
      setFocusedMedia(focused ? { ...focused } : null);
      if (focused?.state?.url) {
        setUrlInput(focused.state.url);
      }
    };

    const handlePlaybackChanged = (evt) => {
      const focused = app.world.focusedMediaFace;
      if (
        focused &&
        (!evt || (evt.objectId === focused.objectId && evt.faceIndex === focused.faceIndex))
      ) {
        setFocusedMedia({ ...focused });
      }
    };

    const handleUrlChanged = (evt) => {
      const focused = app.world.focusedMediaFace;
      if (
        focused &&
        (!evt || (evt.objectId === focused.objectId && evt.faceIndex === focused.faceIndex))
      ) {
        setFocusedMedia({ ...focused });
        setUrlInput(focused.state?.url || '');
      }
    };

    app.world.on('focused_media_changed', handleFocusChanged);
    app.world.on('media_playback_changed', handlePlaybackChanged);
    app.world.on('media_url_changed', handleUrlChanged);
    app.world.on('media_volume_changed', handlePlaybackChanged);

    return () => {
      app.world.off('focused_media_changed', handleFocusChanged);
      app.world.off('media_playback_changed', handlePlaybackChanged);
      app.world.off('media_url_changed', handleUrlChanged);
      app.world.off('media_volume_changed', handlePlaybackChanged);
    };
  }, []);

  if (!focusedMedia) {
    return null;
  }

  const { objectId, faceIndex, media, state } = focusedMedia;
  const isPlaying = state?.isPlaying ?? true;
  const isCorsBlocked = state?.isCorsBlocked ?? false;

  const handlePlayPause = () => {
    if (isPlaying) {
      app.world.pauseMedia(objectId, faceIndex);
    } else {
      app.world.playMedia(objectId, faceIndex);
    }
  };

  const handleNavigate = (e) => {
    e?.preventDefault();
    if (urlInput.trim()) {
      app.world.navigateMedia(objectId, faceIndex, urlInput.trim());
    }
  };

  const handleGoHome = () => {
    app.world.goHomeMedia(objectId, faceIndex);
  };

  const handleClose = () => {
    app.world.focusMediaFace('', 0);
  };

  return (
    <div
      role="region"
      aria-label="Media on Prim Controls"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        width: '90%',
        maxWidth: 520,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${isCorsBlocked ? '#ef4444' : V.pri}`,
        borderRadius: 12,
        padding: '12px 16px',
        color: '#f8fafc',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isCorsBlocked ? '#ef4444' : isPlaying ? '#22c55e' : '#f59e0b',
            }}
          />
          <span style={{ fontWeight: 700, letterSpacing: '0.5px' }}>
            SHARED MEDIA — FACE {faceIndex}
          </span>
          {isCorsBlocked && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: 4,
                background: '#7f1d1d',
                color: '#fca5a5',
                fontWeight: 600,
              }}
            >
              CORS BLOCKED
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close media controls"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <form onSubmit={handleNavigate} style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter Media URL..."
          aria-label="Media URL"
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '6px 10px',
            color: '#f8fafc',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          aria-label="Go to URL"
          style={{
            background: V.pri,
            color: V.onpri,
            border: 'none',
            borderRadius: 6,
            padding: '6px 12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          GO
        </button>
      </form>

      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause media' : 'Play media'}
            title={isPlaying ? 'Pause' : 'Play'}
            style={{
              background: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            aria-label="Go home URL"
            title="Go to Home URL"
            style={{
              background: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: 6,
              padding: '6px 10px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="home" size={14} />
            <span>HOME</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Vol:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state?.volume ?? 1}
            onChange={(e) =>
              app.world.setMediaVolume(objectId, faceIndex, parseFloat(e.target.value))
            }
            aria-label="Media volume"
            style={{ width: 80 }}
          />
        </div>
      </div>
    </div>
  );
}
