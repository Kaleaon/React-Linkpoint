/**
 * AvatarBakeEngine handles client-side system layer texture baking.
 * It composites wearable textures, colors, and tints into baked RGBA buffers
 * for head, upper, lower, eyes, hair, and skirt slots.
 */

export type BakeSlot = 'head' | 'upper' | 'lower' | 'eyes' | 'hair' | 'skirt';

export interface BakeLayer {
  textureId?: string;
  color?: [number, number, number, number]; // RGBA 0..1
  imageBuffer?: Uint8Array | HTMLCanvasElement | ImageBitmap | ImageData;
  width?: number;
  height?: number;
}

export interface BakeSlotData {
  layers?: BakeLayer[];
  tintColor?: [number, number, number, number];
}

export interface BakedTextureResult {
  slot: BakeSlot;
  width: number;
  height: number;
  rgba: Uint8Array;
}

export class AvatarBakeEngine {
  private width: number;
  private height: number;

  constructor(width = 512, height = 512) {
    this.width = width;
    this.height = height;
  }

  /**
   * Bake composite texture for a single avatar system slot.
   */
  async bakeSlot(slot: BakeSlot, layers: BakeLayer[] = []): Promise<BakedTextureResult> {
    const w = this.width;
    const h = this.height;
    let rgba: Uint8Array;

    let canvas: any = null;
    let ctx: any = null;

    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
    }

    if (ctx) {
      // Hardware / Canvas 2D Rendering
      ctx.clearRect(0, 0, w, h);
      this.drawDefaultSlotBase2D(ctx, slot, w, h);

      for (const layer of layers) {
        if (layer.color) {
          const [r, g, b, a] = layer.color;
          ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
          ctx.fillRect(0, 0, w, h);
        }
        if (layer.imageBuffer instanceof ImageData) {
          ctx.putImageData(layer.imageBuffer, 0, 0);
        }
      }

      const imgData = ctx.getImageData(0, 0, w, h);
      rgba = new Uint8Array(imgData.data.buffer.slice(0));

      // Release canvas resources immediately
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      canvas = null;
      ctx = null;
    } else {
      // Software Buffer Fallback (for headless test environments without Canvas binary)
      rgba = new Uint8Array(w * h * 4);
      this.drawDefaultSlotBaseSoftware(rgba, slot, w, h);

      for (const layer of layers) {
        if (layer.color) {
          const [r, g, b, a] = layer.color;
          const cr = Math.round(r * 255);
          const cg = Math.round(g * 255);
          const cb = Math.round(b * 255);
          const ca = Math.round(a * 255);
          for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = Math.round((rgba[i] * (255 - ca) + cr * ca) / 255);
            rgba[i + 1] = Math.round((rgba[i + 1] * (255 - ca) + cg * ca) / 255);
            rgba[i + 2] = Math.round((rgba[i + 2] * (255 - ca) + cb * ca) / 255);
            rgba[i + 3] = Math.max(rgba[i + 3], ca);
          }
        } else if (
          layer.imageBuffer instanceof Uint8Array &&
          layer.imageBuffer.length === w * h * 4
        ) {
          const src = layer.imageBuffer;
          for (let i = 0; i < rgba.length; i += 4) {
            const sa = src[i + 3];
            if (sa === 255) {
              rgba[i] = src[i];
              rgba[i + 1] = src[i + 1];
              rgba[i + 2] = src[i + 2];
              rgba[i + 3] = 255;
            } else if (sa > 0) {
              rgba[i] = Math.round((rgba[i] * (255 - sa) + src[i] * sa) / 255);
              rgba[i + 1] = Math.round((rgba[i + 1] * (255 - sa) + src[i + 1] * sa) / 255);
              rgba[i + 2] = Math.round((rgba[i + 2] * (255 - sa) + src[i + 2] * sa) / 255);
              rgba[i + 3] = Math.max(rgba[i + 3], sa);
            }
          }
        }
      }
    }

    return { slot, width: w, height: h, rgba };
  }

  /**
   * Bake all 6 standard system wearable slots.
   */
  async bakeAll(
    slotsData: Partial<Record<BakeSlot, BakeLayer[]>> = {},
  ): Promise<Record<BakeSlot, BakedTextureResult>> {
    const slots: BakeSlot[] = ['head', 'upper', 'lower', 'eyes', 'hair', 'skirt'];
    const results = {} as Record<BakeSlot, BakedTextureResult>;

    for (const slot of slots) {
      results[slot] = await this.bakeSlot(slot, slotsData[slot] || []);
    }

    return results;
  }

  private drawDefaultSlotBase2D(
    ctx: CanvasRenderingContext2D,
    slot: BakeSlot,
    w: number,
    h: number,
  ) {
    switch (slot) {
      case 'head':
      case 'upper':
      case 'lower':
        ctx.fillStyle = 'rgba(210, 180, 160, 255)';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'eyes':
        ctx.fillStyle = 'rgba(255, 255, 255, 255)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(80, 120, 200, 255)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'hair':
        ctx.fillStyle = 'rgba(60, 40, 20, 255)';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'skirt':
        ctx.fillStyle = 'rgba(180, 140, 120, 255)';
        ctx.fillRect(0, 0, w, h);
        break;
    }
  }

  private drawDefaultSlotBaseSoftware(buf: Uint8Array, slot: BakeSlot, w: number, h: number) {
    let r = 210,
      g = 180,
      b = 160,
      a = 255;
    if (slot === 'eyes') {
      r = 255;
      g = 255;
      b = 255;
      a = 255;
    } else if (slot === 'hair') {
      r = 60;
      g = 40;
      b = 20;
      a = 255;
    } else if (slot === 'skirt') {
      r = 180;
      g = 140;
      b = 120;
      a = 255;
    }

    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }

    if (slot === 'eyes') {
      const cx = w / 2;
      const cy = h / 2;
      const radiusSq = (w / 4) * (w / 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= radiusSq) {
            const idx = (y * w + x) * 4;
            buf[idx] = 80;
            buf[idx + 1] = 120;
            buf[idx + 2] = 200;
            buf[idx + 3] = 255;
          }
        }
      }
    }
  }
}
