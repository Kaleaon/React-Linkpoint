import { describe, expect, it, vi } from 'vitest';
import { WorldViewer, ObjectMediaParser, parseObjectMediaResponse } from '../world-viewer';
import { MediaTexturePipeline } from '../media-pipeline';
import { Utils } from '../utils';

class ProtocolStub extends Utils.EventEmitter {
  connected = true;
  authReply: Record<string, any> | null = null;
}

class MockGraphics3D {
  textures = new Map<string, any>();
  updateCanvasTexture = vi.fn((name: string, source: any) => name);
}

describe('Media on Prim (MoaP) Rendering & ObjectMedia Parser', () => {
  it('parses ObjectMedia RPC capability responses correctly', () => {
    const rawPayload = {
      object_media_data: [
        {
          object_id: '12345678-1234-1234-1234-123456789012',
          face_media_response: [
            {
              CURRENT_URL: 'https://example.com/stream.mp4',
              HOME_URL: 'https://example.com/home',
              AUTO_PLAY: true,
              AUTO_LOOP: true,
              AUTO_SCALE: true,
              CONTROLS: 'standard',
              WIDTH_PIXELS: 1024,
              HEIGHT_PIXELS: 512,
              WHITELIST: ['https://example.com/*'],
              WHITELIST_ENABLE: true,
            },
            null,
            {
              CURRENT_URL: 'https://video.org/live',
              CONTROLS: 'mini',
            },
          ],
        },
      ],
    };

    const resultMap = parseObjectMediaResponse(rawPayload);
    expect(resultMap.size).toBe(1);

    const mediaList = resultMap.get('12345678-1234-1234-1234-123456789012')!;
    expect(mediaList.length).toBe(2);

    expect(mediaList[0].faceIndex).toBe(0);
    expect(mediaList[0].currentUrl).toBe('https://example.com/stream.mp4');
    expect(mediaList[0].homeUrl).toBe('https://example.com/home');
    expect(mediaList[0].autoPlay).toBe(true);
    expect(mediaList[0].controls).toBe('standard');
    expect(mediaList[0].widthPixels).toBe(1024);
    expect(mediaList[0].whitelist).toEqual(['https://example.com/*']);

    expect(mediaList[1].faceIndex).toBe(2);
    expect(mediaList[1].currentUrl).toBe('https://video.org/live');
    expect(mediaList[1].controls).toBe('mini');
  });

  it('handles empty or malformed ObjectMedia responses gracefully', () => {
    expect(parseObjectMediaResponse(null).size).toBe(0);
    expect(parseObjectMediaResponse({}).size).toBe(0);
    expect(parseObjectMediaResponse({ object_media_data: [] }).size).toBe(0);
    expect(ObjectMediaParser.parseSingleFace('obj1', 0, null)).toBeNull();
    expect(ObjectMediaParser.parseSingleFace('obj1', 0, {})).toBeNull();
  });

  it('creates dynamic CanvasTexture pipeline and assigns texture to face material', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol as any);

    const objId = 'prim-screen-1';
    protocol.emit('scene:object-add', {
      id: objId,
      localId: 100,
      position: [10, 10, 2],
    });

    world.setPrimFaceMedia(objId, 0, {
      currentUrl: 'https://media.venue.com/feed',
      homeUrl: 'https://media.venue.com/feed',
      autoPlay: true,
      widthPixels: 512,
      heightPixels: 512,
    });

    const targetObj = (world as any).sceneObjects.get(objId);
    expect(targetObj).toBeDefined();
    expect(targetObj.faces[0].mediaTexture).toBe(`media-texture:${objId}:0`);
    expect(targetObj.faces[0].media.currentUrl).toBe('https://media.venue.com/feed');
  });

  it('renders fallback placeholder on CORS blocked or non-CORS media frames', () => {
    const pipeline = new MediaTexturePipeline();
    const media = {
      objectId: 'obj-cors',
      faceIndex: 0,
      currentUrl: 'https://forbidden-origin.com/video',
      homeUrl: 'https://forbidden-origin.com/video',
      autoPlay: true,
      autoLoop: true,
      autoScale: true,
      autoZoom: false,
      controls: 'standard' as const,
      widthPixels: 512,
      heightPixels: 512,
      firstClickInteract: false,
      whitelist: [],
      whitelistEnable: false,
      permsInteract: 31,
      permsControl: 31,
    };

    pipeline.registerMediaFace(media);
    const canvas = pipeline.renderFrameToCanvas('obj-cors:0');
    expect(canvas).toBeDefined();

    const state = pipeline.getPlaybackState('obj-cors', 0)!;
    expect(state.isCorsBlocked).toBe(true);
  });

  it('caps dynamic media updates by distance to maintain 60 FPS viewport performance', () => {
    const pipeline = new MediaTexturePipeline();
    pipeline.maxMediaDistance = 30.0; // meters

    const media = {
      objectId: 'distant-screen',
      faceIndex: 0,
      currentUrl: 'https://example.com/video',
      homeUrl: 'https://example.com/video',
      autoPlay: true,
      autoLoop: true,
      autoScale: true,
      autoZoom: false,
      controls: 'standard' as const,
      widthPixels: 512,
      heightPixels: 512,
      firstClickInteract: false,
      whitelist: [],
      whitelistEnable: false,
      permsInteract: 31,
      permsControl: 31,
    };

    pipeline.registerMediaFace(media);
    const mockGraphics = new MockGraphics3D();

    const cameraPos: [number, number, number] = [0, 0, 0];
    const objectPositions = new Map<string, [number, number, number]>();

    // 1. Far screen at 100 meters (beyond maxMediaDistance)
    objectPositions.set('distant-screen', [100, 0, 0]);
    pipeline.update(mockGraphics as any, cameraPos, objectPositions);
    expect(mockGraphics.updateCanvasTexture).not.toHaveBeenCalled();

    // 2. Near screen at 10 meters (within maxMediaDistance)
    objectPositions.set('distant-screen', [10, 0, 0]);
    pipeline.update(mockGraphics as any, cameraPos, objectPositions);
    expect(mockGraphics.updateCanvasTexture).toHaveBeenCalledWith(
      'media-texture:distant-screen:0',
      expect.anything(),
    );
  });

  it('executes media playback and URL navigation controls', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol as any);

    const objId = 'screen-control-test';
    world.setPrimFaceMedia(objId, 0, {
      currentUrl: 'https://club.com/home',
      homeUrl: 'https://club.com/home',
      autoPlay: true,
    });

    const playbackSpy = vi.fn();
    const urlSpy = vi.fn();
    const volumeSpy = vi.fn();
    const focusSpy = vi.fn();

    world.on('media_playback_changed', playbackSpy);
    world.on('media_url_changed', urlSpy);
    world.on('media_volume_changed', volumeSpy);
    world.on('focused_media_changed', focusSpy);

    // Focus face
    world.focusMediaFace(objId, 0);
    expect(focusSpy).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: objId, faceIndex: 0 }),
    );
    expect(world.focusedMediaFace?.state.isPlaying).toBe(true);

    // Pause
    world.pauseMedia(objId, 0);
    expect(playbackSpy).toHaveBeenCalledWith({ objectId: objId, faceIndex: 0, isPlaying: false });

    // Play
    world.playMedia(objId, 0);
    expect(playbackSpy).toHaveBeenCalledWith({ objectId: objId, faceIndex: 0, isPlaying: true });

    // Navigate to new URL
    world.navigateMedia(objId, 0, 'https://club.com/stream2');
    expect(urlSpy).toHaveBeenCalledWith({
      objectId: objId,
      faceIndex: 0,
      url: 'https://club.com/stream2',
    });
    expect(world.focusedMediaFace?.media.currentUrl).toBe('https://club.com/stream2');

    // Go Home
    world.goHomeMedia(objId, 0);
    expect(urlSpy).toHaveBeenCalledWith({
      objectId: objId,
      faceIndex: 0,
      url: 'https://club.com/home',
    });

    // Set Volume
    world.setMediaVolume(objId, 0, 0.5);
    expect(volumeSpy).toHaveBeenCalledWith({ objectId: objId, faceIndex: 0, volume: 0.5 });
  });
});
