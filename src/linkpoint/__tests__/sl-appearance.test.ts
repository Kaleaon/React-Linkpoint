import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { watchAvatarAppearance } = require('../../../core/sl-appearance.cjs');
const { TextureEntry } = require('@caspertech/node-metaverse/dist/lib/classes/TextureEntry');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { ViewerSession } = require('../../../core/viewer-session.cjs');
const { PCode } = require('@caspertech/node-metaverse');

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const packet = { message: { id: Message.AvatarAppearance, Sender: { ID: { toString: () => 'AVATAR' } }, ObjectData: { TextureEntry: Buffer.from([1]) } } };
function setup() {
  let receive!: (packet: any) => void;
  const object = { FullID: { toString: () => 'avatar' }, ID: 7, PCode: PCode.Avatar, TextureEntry: null };
  const region = { circuit: { subscribeToMessages: vi.fn((ids, callback) => { receive = callback; return { unsubscribe: vi.fn() }; }) }, objects: { getObjectByUUID: vi.fn(() => object) } };
  const inherited = { textureID: { toString: () => 'baked-texture' } };
  const entry = { faces: [], defaultTexture: inherited, getEffectiveEntryForFace: () => inherited };
  vi.spyOn(TextureEntry, 'from').mockReturnValue(entry);
  return { region, object, entry, receive: (p: any = packet) => receive(p) };
}

describe('avatar appearance circuit bridge', () => {
  it('streams changed baked textures and requests their assets, including hair and skirt slots', () => {
    const { region, object, receive } = setup();
    const send = vi.fn();
    const session = new ViewerSession(send);
    session.bot = { currentRegion: region };
    session.loadObjectAsset = vi.fn();
    session.loadObjectMaterials = vi.fn();
    session.loadTexture = vi.fn();
    const watcher = watchAvatarAppearance(() => region, (event: any) => session.streamObject('object-update', event));
    session.appearanceWatcher = watcher;
    receive();
    expect(region.circuit.subscribeToMessages.mock.calls[0][0]).toEqual([Message.AvatarAppearance]);
    expect(send).toHaveBeenCalledWith('object-update', expect.objectContaining({ id: 'avatar', avatar: true, faceTextures: expect.any(Array) }));
    const faces = send.mock.calls[0][1].faceTextures;
    expect(faces).toHaveLength(21);
    expect(faces[20].textureId).toBe('baked-texture');
    expect(session.loadTexture).toHaveBeenCalledWith('baked-texture');
    expect(object.TextureEntry).not.toBeNull();
    watcher.unsubscribe();
  });

  it('retains appearance received before an object, then applies it to object updates and snapshots', () => {
    const { region, object, entry, receive } = setup();
    region.objects.getObjectByUUID.mockImplementation(() => { throw new Error('not found'); });
    const update = vi.fn();
    const watcher = watchAvatarAppearance(() => region, update);
    receive();
    expect(update).not.toHaveBeenCalled();
    watcher.apply(object);
    expect(object.TextureEntry).toBe(entry);
    watcher.unsubscribe();
  });

  it('moves the subscription when the circuit changes on the same region and discards stale appearances', () => {
    vi.useFakeTimers();
    const { region, object, receive } = setup();
    const watcher = watchAvatarAppearance(() => region, vi.fn(), 100);
    receive();
    const old = region.circuit.subscribeToMessages.mock.results[0].value;
    const nextUnsubscribe = vi.fn();
    region.circuit = { subscribeToMessages: vi.fn(() => ({ unsubscribe: nextUnsubscribe })) } as any;
    object.TextureEntry = null;
    vi.advanceTimersByTime(100);
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    watcher.apply(object);
    expect(object.TextureEntry).toBeNull();
    watcher.unsubscribe();
    expect(nextUnsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores malformed appearance packets without disrupting subsequent updates', () => {
    const { region, receive } = setup();
    const update = vi.fn();
    const watcher = watchAvatarAppearance(() => region, update);
    receive({ message: { ...packet.message, ObjectData: { TextureEntry: Buffer.alloc(0) } } });
    vi.mocked(TextureEntry.from).mockImplementationOnce(() => { throw new Error('truncated'); });
    receive();
    expect(update).not.toHaveBeenCalled();
    receive();
    expect(update).toHaveBeenCalledOnce();
    watcher.unsubscribe();
  });
});
