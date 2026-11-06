import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ViewerSession } = require('../../../core/viewer-session.cjs');
const { callViewer, METHODS } = require('../../../core/viewer-api.cjs');

describe('ViewerSession Notecard Capabilities', () => {
  it('registers fetchNotecard and saveNotecard in viewer-api METHODS', () => {
    expect(METHODS.has('fetchNotecard')).toBe(true);
    expect(METHODS.has('saveNotecard')).toBe(true);
  });

  it('downloads notecard asset through ViewerAsset capability', async () => {
    const session = new ViewerSession(() => undefined);
    const assetId = '11111111-2222-3333-4444-555555555555';
    const notecardText =
      'Linden text version 2\n{\nLLEmbeddedItems version 1\n{\ncount 0\n}\nText length 12\nHello World!}';

    const mockRequestGet = vi.fn().mockResolvedValue({
      status: 200,
      body: Buffer.from(notecardText, 'utf-8'),
    });

    session.currentRegion = () => ({
      caps: {
        getCapability: vi.fn().mockImplementation(async (name) => {
          if (name === 'ViewerAsset') return 'https://caps.agni.lindenlab.com/ViewerAsset';
          return null;
        }),
        requestGet: mockRequestGet,
      },
    });

    session.bot = { clientCommands: { asset: {} } };

    const result = await session.downloadNotecard(assetId);
    expect(result.toString('utf-8')).toBe(notecardText);
    expect(mockRequestGet).toHaveBeenCalledWith(
      `https://caps.agni.lindenlab.com/ViewerAsset/?notecard_id=${assetId}`,
      { responseType: 'buffer' },
    );
  });

  it('fetchNotecard returns decoded string, base64 and size', async () => {
    const session = new ViewerSession(() => undefined);
    const assetId = '22222222-3333-4444-5555-666666666666';
    const notecardText = 'Sample notecard content';

    session.downloadNotecard = vi.fn().mockResolvedValue(Buffer.from(notecardText, 'utf-8'));
    session.bot = {};

    const result = await session.fetchNotecard({ id: assetId });
    expect(result.id).toBe(assetId);
    expect(result.data).toBe(notecardText);
    expect(result.base64).toBe(Buffer.from(notecardText).toString('base64'));
    expect(result.size).toBe(Buffer.byteLength(notecardText));
  });

  it('saveNotecard uploads payload via UpdateNotecardAgentInventory capability', async () => {
    const session = new ViewerSession(() => undefined);
    const itemId = '33333333-4444-5555-6666-777777777777';
    const newAssetId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload =
      'Linden text version 2\n{\nLLEmbeddedItems version 1\n{\ncount 0\n}\nText length 5\nHello}';

    const mockCapsPostXML = vi.fn().mockResolvedValue({
      uploader: 'https://sim.agni.lindenlab.com/uploader/nc-upload-123',
    });
    const mockCapsRequestUpload = vi.fn().mockResolvedValue({
      state: 'complete',
      new_asset_id: newAssetId,
    });

    session.currentRegion = () => ({
      caps: {
        capsPostXML: mockCapsPostXML,
        capsRequestUpload: mockCapsRequestUpload,
      },
    });
    session.bot = {};

    const result = await session.saveNotecard({ itemId, data: payload });
    expect(result.success).toBe(true);
    expect(result.itemId).toBe(itemId);
    expect(result.newAssetId).toBe(newAssetId);

    expect(mockCapsPostXML).toHaveBeenCalledWith(
      'UpdateNotecardAgentInventory',
      expect.objectContaining({
        item_id: expect.anything(),
      }),
    );
    expect(mockCapsRequestUpload).toHaveBeenCalledWith(
      'https://sim.agni.lindenlab.com/uploader/nc-upload-123',
      Buffer.from(payload, 'utf-8'),
    );
  });

  it('saveNotecard rejects payloads exceeding 65536 bytes limit', async () => {
    const session = new ViewerSession(() => undefined);
    const itemId = '44444444-5555-6666-7777-888888888888';
    const hugePayload = 'A'.repeat(65537);

    session.bot = {};

    await expect(session.saveNotecard({ itemId, data: hugePayload })).rejects.toThrow(
      /65536 byte limit/i,
    );
  });

  it('dispatches fetchNotecard and saveNotecard through callViewer helper', async () => {
    const session = new ViewerSession(() => undefined);
    session.fetchNotecard = vi.fn().mockResolvedValue({ id: 'nc-1', data: 'hello' });
    session.saveNotecard = vi.fn().mockResolvedValue({ success: true, itemId: 'item-1' });

    const fetchRes = await callViewer(session, 'fetchNotecard', { id: 'nc-1' });
    expect(fetchRes).toEqual({ id: 'nc-1', data: 'hello' });
    expect(session.fetchNotecard).toHaveBeenCalledWith({ id: 'nc-1' });

    const saveRes = await callViewer(session, 'saveNotecard', { itemId: 'item-1', data: 'data' });
    expect(saveRes).toEqual({ success: true, itemId: 'item-1' });
    expect(session.saveNotecard).toHaveBeenCalledWith({ itemId: 'item-1', data: 'data' });
  });
});
