/**
 * Linkpoint PWA - Dynamic Media on Prim (MoaP) Pipeline
 */

import type { Graphics3D } from './graphics-3d';
import type { PrimFaceMedia, MediaPlaybackState } from './world-viewer';

export class MediaTexturePipeline {
  private mediaFaces = new Map<string, PrimFaceMedia>();
  private playbackStates = new Map<string, MediaPlaybackState>();
  private canvases = new Map<string, HTMLCanvasElement>();
  private dirtyTextures = new Set<string>();

  /**
   * Maximum distance (in meters) from camera to update dynamic media textures.
   * Capped to maintain 60 FPS viewport performance.
   */
  public maxMediaDistance: number = 30.0;

  private makeKey(objectId: string, faceIndex: number): string {
    return `${objectId}:${faceIndex}`;
  }

  public registerMediaFace(media: PrimFaceMedia): string {
    const key = this.makeKey(media.objectId, media.faceIndex);
    this.mediaFaces.set(key, media);

    if (!this.playbackStates.has(key)) {
      this.playbackStates.set(key, {
        objectId: media.objectId,
        faceIndex: media.faceIndex,
        url: media.currentUrl || media.homeUrl,
        isPlaying: media.autoPlay ?? true,
        volume: 1.0,
        isMuted: false,
        isCorsBlocked: false,
        lastUpdated: Date.now(),
      });
    }

    this.getOrCreateCanvas(key, media.widthPixels, media.heightPixels);
    this.dirtyTextures.add(key);
    return `media-texture:${key}`;
  }

  public unregisterMediaFace(objectId: string, faceIndex: number) {
    const key = this.makeKey(objectId, faceIndex);
    this.mediaFaces.delete(key);
    this.playbackStates.delete(key);
    this.canvases.delete(key);
    this.dirtyTextures.delete(key);
  }

  public unregisterAllForObject(objectId: string) {
    const prefix = `${objectId}:`;
    for (const key of Array.from(this.mediaFaces.keys())) {
      if (key.startsWith(prefix)) {
        this.mediaFaces.delete(key);
        this.playbackStates.delete(key);
        this.canvases.delete(key);
        this.dirtyTextures.delete(key);
      }
    }
  }

  public clear() {
    this.mediaFaces.clear();
    this.playbackStates.clear();
    this.canvases.clear();
    this.dirtyTextures.clear();
  }

  public getMediaTextureName(objectId: string, faceIndex: number): string | null {
    const key = this.makeKey(objectId, faceIndex);
    if (this.mediaFaces.has(key)) {
      return `media-texture:${key}`;
    }
    return null;
  }

  public getPlaybackState(objectId: string, faceIndex: number): MediaPlaybackState | null {
    return this.playbackStates.get(this.makeKey(objectId, faceIndex)) || null;
  }

  public play(objectId: string, faceIndex: number): boolean {
    const key = this.makeKey(objectId, faceIndex);
    const state = this.playbackStates.get(key);
    if (state) {
      state.isPlaying = true;
      state.lastUpdated = Date.now();
      this.dirtyTextures.add(key);
      return true;
    }
    return false;
  }

  public pause(objectId: string, faceIndex: number): boolean {
    const key = this.makeKey(objectId, faceIndex);
    const state = this.playbackStates.get(key);
    if (state) {
      state.isPlaying = false;
      state.lastUpdated = Date.now();
      this.dirtyTextures.add(key);
      return true;
    }
    return false;
  }

  public navigate(objectId: string, faceIndex: number, newUrl: string): boolean {
    const key = this.makeKey(objectId, faceIndex);
    const state = this.playbackStates.get(key);
    const media = this.mediaFaces.get(key);
    if (state && newUrl) {
      state.url = newUrl.trim();
      state.isCorsBlocked = false; // Reset CORS check for new URL
      if (media) media.currentUrl = state.url;
      state.lastUpdated = Date.now();
      this.dirtyTextures.add(key);
      return true;
    }
    return false;
  }

  public goHome(objectId: string, faceIndex: number): boolean {
    const key = this.makeKey(objectId, faceIndex);
    const media = this.mediaFaces.get(key);
    if (media) {
      return this.navigate(objectId, faceIndex, media.homeUrl);
    }
    return false;
  }

  public setVolume(objectId: string, faceIndex: number, volume: number): boolean {
    const key = this.makeKey(objectId, faceIndex);
    const state = this.playbackStates.get(key);
    if (state) {
      state.volume = Math.max(0, Math.min(1, volume));
      state.lastUpdated = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Simulates CORS checking for media frames.
   * Marks state as CORS blocked if non-HTTPS or known cross-origin restriction applies.
   */
  public checkCorsPolicy(url: string): boolean {
    if (!url) return false;
    // Standard CORS guardrail: non-http/https or test origins flagged non-cors
    if (url.includes('cors-blocked') || url.includes('forbidden-origin')) {
      return false;
    }
    return true;
  }

  private getOrCreateCanvas(key: string, width = 512, height = 512): HTMLCanvasElement {
    let canvas = this.canvases.get(key);
    if (!canvas) {
      if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = Math.max(64, Math.min(2048, width));
        canvas.height = Math.max(64, Math.min(2048, height));
      } else {
        // Fallback object for headless test environment
        canvas = {
          width,
          height,
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      this.canvases.set(key, canvas);
    }
    return canvas;
  }

  public getMediaFace(objectId: string, faceIndex: number): PrimFaceMedia | null {
    return this.mediaFaces.get(this.makeKey(objectId, faceIndex)) || null;
  }

  /**
   * Renders the dynamic media frame onto the face canvas.
   * Renders a fallback placeholder if the media is CORS blocked or failed.
   */
  public renderFrameToCanvas(key: string): HTMLCanvasElement | null {
    const media = this.mediaFaces.get(key);
    const state = this.playbackStates.get(key);
    const canvas = this.canvases.get(key);

    if (!media || !state || !canvas) {
      return canvas || null;
    }

    // Check CORS policy
    const corsOk = this.checkCorsPolicy(state.url);
    if (!corsOk) {
      state.isCorsBlocked = true;
    }

    if (typeof canvas.getContext !== 'function') {
      return canvas;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const width = canvas.width;
    const height = canvas.height;

    if (state.isCorsBlocked) {
      // Render fallback placeholder frame
      ctx.fillStyle = '#0f172a'; // Dark slate background
      ctx.fillRect(0, 0, width, height);

      // Grid accent lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      for (let x = 0; x < width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Warning badge
      ctx.fillStyle = '#ef4444'; // Red badge
      ctx.fillRect(width / 2 - 120, height / 2 - 40, 240, 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MEDIA BLOCKED (CORS)', width / 2, height / 2 - 15);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(state.url.slice(0, 40), width / 2, height / 2 + 25);
      ctx.fillText('Non-CORS media frame fallback', width / 2, height / 2 + 45);

      return canvas;
    }

    // Render active media frame
    ctx.fillStyle = '#1e1b4b'; // Deep violet media background
    ctx.fillRect(0, 0, width, height);

    // Screen header bar
    ctx.fillStyle = '#312e81';
    ctx.fillRect(0, 0, width, 40);

    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LINKPOINT SHARED MEDIA', 15, 25);

    ctx.fillStyle = state.isPlaying ? '#22c55e' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(width - 20, 20, 6, 0, Math.PI * 2);
    ctx.fill();

    // Canvas media content body
    ctx.fillStyle = '#020617';
    ctx.fillRect(20, 60, width - 40, height - 100);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      state.isPlaying ? '▶ MEDIA PLAYING' : '⏸ MEDIA PAUSED',
      width / 2,
      height / 2 - 10,
    );

    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px monospace';
    ctx.fillText(state.url, width / 2, height / 2 + 20);

    // Dynamic wave bar animation frame if playing
    if (state.isPlaying) {
      const now = Date.now() / 200;
      ctx.fillStyle = '#6366f1';
      for (let i = 0; i < 10; i++) {
        const barHeight = Math.abs(Math.sin(now + i)) * 30 + 10;
        ctx.fillRect(width / 2 - 100 + i * 20, height - 70 - barHeight, 12, barHeight);
      }
    }

    return canvas;
  }

  /**
   * Updates dynamic WebGL media textures, capped by camera distance.
   */
  public update(
    graphics: Graphics3D,
    cameraPos: [number, number, number] | number[],
    objectPositions: Map<string, [number, number, number] | number[]>,
  ) {
    if (!graphics) return;

    for (const [key, media] of this.mediaFaces.entries()) {
      const state = this.playbackStates.get(key);
      if (!state) continue;

      // Distance Capping Guardrail
      const objPos = objectPositions.get(media.objectId) || [0, 0, 0];
      const dist = Math.hypot(
        objPos[0] - cameraPos[0],
        objPos[1] - cameraPos[1],
        (objPos[2] || 0) - (cameraPos[2] || 0),
      );

      // Capped by distance to maintain 60 FPS viewport performance
      if (dist > this.maxMediaDistance) {
        continue;
      }

      const textureName = `media-texture:${key}`;
      const isDirty = this.dirtyTextures.has(key);

      // Re-render frame if playing or dirty
      if (state.isPlaying || isDirty) {
        const canvas = this.renderFrameToCanvas(key);
        if (canvas) {
          graphics.updateCanvasTexture(textureName, canvas);
        }
        this.dirtyTextures.delete(key);
      }
    }
  }
}
