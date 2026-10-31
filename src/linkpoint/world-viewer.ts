/**
 * Linkpoint PWA - World Viewer & ObjectMedia RPC Parser
 */

export interface PrimFaceMedia {
  objectId: string;
  faceIndex: number;
  currentUrl: string;
  homeUrl: string;
  autoPlay: boolean;
  autoLoop: boolean;
  autoScale: boolean;
  autoZoom: boolean;
  controls: 'standard' | 'mini' | 'none';
  widthPixels: number;
  heightPixels: number;
  firstClickInteract: boolean;
  whitelist: string[];
  whitelistEnable: boolean;
  permsInteract: number;
  permsControl: number;
  altImageEnable?: boolean;
}

export interface MediaPlaybackState {
  objectId: string;
  faceIndex: number;
  url: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  isCorsBlocked: boolean;
  lastUpdated: number;
}

/**
 * Normalizes ObjectMedia RPC/Capability responses into clean PrimFaceMedia objects.
 */
export class ObjectMediaParser {
  /**
   * Parses raw ObjectMedia capability responses or RPC payloads.
   * Accepts LLSD object structures, JSON representations, or arrays.
   */
  public static parseResponse(response: any): Map<string, PrimFaceMedia[]> {
    const resultMap = new Map<string, PrimFaceMedia[]>();
    if (!response || typeof response !== 'object') {
      return resultMap;
    }

    // Handles object_media_data array or map
    const rawData =
      response.object_media_data || response.ObjectMediaData || response.data || response;

    if (Array.isArray(rawData)) {
      for (const item of rawData) {
        if (!item || typeof item !== 'object') continue;
        const objectId = String(item.object_id || item.ObjectID || item.id || '');
        const faceResponses =
          item.face_media_response || item.FaceMediaResponse || item.faces || item.media_list || [];
        if (objectId && Array.isArray(faceResponses)) {
          const parsedFaces = ObjectMediaParser.parseFaceList(objectId, faceResponses);
          if (parsedFaces.length > 0) {
            resultMap.set(objectId, parsedFaces);
          }
        }
      }
    } else if (typeof rawData === 'object') {
      for (const [key, value] of Object.entries(rawData)) {
        if (!value) continue;
        const objectId = String(key);
        if (Array.isArray(value)) {
          const parsedFaces = ObjectMediaParser.parseFaceList(objectId, value);
          if (parsedFaces.length > 0) {
            resultMap.set(objectId, parsedFaces);
          }
        } else if (typeof value === 'object' && (value as any).face_media_response) {
          const parsedFaces = ObjectMediaParser.parseFaceList(
            objectId,
            (value as any).face_media_response,
          );
          if (parsedFaces.length > 0) {
            resultMap.set(objectId, parsedFaces);
          }
        }
      }
    }

    return resultMap;
  }

  /**
   * Parses an array of face media definitions for a given object ID.
   */
  public static parseFaceList(objectId: string, faceList: any[]): PrimFaceMedia[] {
    const results: PrimFaceMedia[] = [];
    if (!Array.isArray(faceList)) return results;

    faceList.forEach((faceData, idx) => {
      if (!faceData || typeof faceData !== 'object') return;

      const media = ObjectMediaParser.parseSingleFace(objectId, idx, faceData);
      if (media) {
        results.push(media);
      }
    });

    return results;
  }

  /**
   * Parses a single face media definition object.
   */
  public static parseSingleFace(
    objectId: string,
    faceIndex: number,
    data: any,
  ): PrimFaceMedia | null {
    if (!data || typeof data !== 'object') return null;

    const currentUrl = String(
      data.CURRENT_URL ?? data.current_url ?? data.CurrentUrl ?? data.url ?? '',
    ).trim();

    const homeUrl = String(data.HOME_URL ?? data.home_url ?? data.HomeUrl ?? currentUrl).trim();

    if (!currentUrl && !homeUrl) {
      return null;
    }

    const rawControls = data.CONTROLS ?? data.controls ?? data.Controls ?? 'standard';
    let controls: 'standard' | 'mini' | 'none' = 'standard';
    if (rawControls === 'none' || rawControls === 0 || rawControls === '0') {
      controls = 'none';
    } else if (rawControls === 'mini' || rawControls === 1 || rawControls === '1') {
      controls = 'mini';
    }

    const parseBool = (val: any, defaultVal: boolean = false): boolean => {
      if (val === undefined || val === null) return defaultVal;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val !== 0;
      if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
      return defaultVal;
    };

    const parseNum = (val: any, defaultVal: number): number => {
      const num = Number(val);
      return Number.isNaN(num) ? defaultVal : num;
    };

    const parseStringArray = (val: any): string[] => {
      if (Array.isArray(val)) return val.map(String);
      if (typeof val === 'string' && val.trim()) return [val.trim()];
      return [];
    };

    const faceIdx = parseNum(data.FACE ?? data.face ?? data.FaceIdx ?? faceIndex, faceIndex);

    return {
      objectId,
      faceIndex: faceIdx,
      currentUrl: currentUrl || homeUrl,
      homeUrl: homeUrl || currentUrl,
      autoPlay: parseBool(data.AUTO_PLAY ?? data.auto_play ?? data.AutoPlay, true),
      autoLoop: parseBool(data.AUTO_LOOP ?? data.auto_loop ?? data.AutoLoop, true),
      autoScale: parseBool(data.AUTO_SCALE ?? data.auto_scale ?? data.AutoScale, true),
      autoZoom: parseBool(data.AUTO_ZOOM ?? data.auto_zoom ?? data.AutoZoom, false),
      controls,
      widthPixels: parseNum(data.WIDTH_PIXELS ?? data.width_pixels ?? data.WidthPixels, 512),
      heightPixels: parseNum(data.HEIGHT_PIXELS ?? data.height_pixels ?? data.HeightPixels, 512),
      firstClickInteract: parseBool(data.FIRST_CLICK_INTERACT ?? data.first_click_interact, false),
      whitelist: parseStringArray(data.WHITELIST ?? data.whitelist),
      whitelistEnable: parseBool(data.WHITELIST_ENABLE ?? data.whitelist_enable, false),
      permsInteract: parseNum(data.PERMS_INTERACT ?? data.perms_interact, 31),
      permsControl: parseNum(data.PERMS_CONTROL ?? data.perms_control, 31),
      altImageEnable: parseBool(data.ALT_IMAGE_ENABLE ?? data.alt_image_enable, false),
    };
  }
}

export function parseObjectMediaResponse(response: any): Map<string, PrimFaceMedia[]> {
  return ObjectMediaParser.parseResponse(response);
}

// Re-export WorldViewer from world.ts to fulfill module path compatibility
export { WorldViewer } from './world';
