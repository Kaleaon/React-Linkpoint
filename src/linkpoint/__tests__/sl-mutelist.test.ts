import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MuteListLoader,
  parseMuteList,
  formatMuteList,
  sendMuteUpdate,
  sendMuteRemove,
  MUTE_TYPE,
} = require('../../../core/sl-mutelist.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const Long = require('long');

const AGENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OBJ = '11111111-1111-1111-1111-111111111111';
const NULL = '00000000-0000-0000-0000-000000000000';
const uuid = (s: string) => ({ toString: () => s });

describe('mute list file (LLMuteList::loadFromFile / saveToFile)', () => {
  it('parses agents, objects, groups and legacy by-name mutes', () => {
    const text = [
      `1 ${BOB} Bob Resident|0`,
      `2 ${OBJ} Annoying Box|8`,
      `0 ${NULL} Spammer Name|`,
      `3 cccccccc-cccc-cccc-cccc-cccccccccccc The Group|15`,
      '',
    ].join('\n');
    expect(parseMuteList(text)).toEqual({
      mutes: [
        { id: BOB, name: 'Bob Resident', type: 1, flags: 0 },
        { id: OBJ, name: 'Annoying Box', type: 2, flags: 8 },
        { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'The Group', type: 3, flags: 15 },
      ],
      legacy: ['Spammer Name'],
    });
  });

  it('treats an unparsable id or a BY_NAME type as a legacy mute, and a missing flags field as 0', () => {
    expect(
      parseMuteList('1 not-a-uuid Someone|3\n0 ' + BOB + ' Named|\n2 ' + OBJ + ' NoBar\n'),
    ).toEqual({
      mutes: [{ id: OBJ, name: 'NoBar', type: 2, flags: 0 }],
      legacy: ['Someone', 'Named'],
    });
  });

  it("round-trips through the viewer's own file format, leaving external mutes out", () => {
    const list = {
      mutes: [
        { id: BOB, name: 'Bob Resident', type: 1, flags: 5 },
        { id: OBJ, name: 'x', type: 4, flags: 0 },
      ],
      legacy: ['Old Name'],
    };
    const text = formatMuteList(list);
    expect(text).toBe(`0 ${NULL} Old Name|\n1 ${BOB} Bob Resident|5\n`);
    expect(parseMuteList(text)).toEqual({
      mutes: [{ id: BOB, name: 'Bob Resident', type: 1, flags: 5 }],
      legacy: ['Old Name'],
    });
  });
});

function fakeCircuit() {
  const sent: any[] = [];
  let handler: (p: any) => void = () => {};
  const unsubscribe = vi.fn();
  return {
    sessionID: uuid('session'),
    sent,
    unsubscribe,
    sendMessage: (message: any) => {
      sent.push(message);
    },
    subscribeToMessages: (_ids: number[], cb: (p: any) => void) => {
      handler = cb;
      return { unsubscribe };
    },
    deliver: (message: any) => handler({ message }),
  };
}

const updateMessage = (filename: string, agent = AGENT) => ({
  id: Message.MuteListUpdate,
  MuteData: { AgentID: uuid(agent), Filename: Buffer.from(filename + '\0') },
});
const dataPacket = (id: any, packet: number, data: Buffer) => ({
  id: Message.SendXferPacket,
  XferID: { ID: id, Packet: packet },
  DataPacket: { Data: data },
});
const withSize = (text: string) => {
  const body = Buffer.from(text);
  const head = Buffer.alloc(4);
  head.writeInt32LE(body.length, 0);
  return { head, body };
};

describe('MuteListLoader (Xfer receive)', () => {
  const xferId = Long.fromNumber(12345, true);

  it('requests the list, asks for the named file, confirms each packet and parses the result', () => {
    const circuit = fakeCircuit();
    const results: any[] = [];
    const loader = new MuteListLoader(
      () => circuit,
      uuid(AGENT),
      (r: any) => results.push(r),
      { random: () => xferId },
    );
    expect(loader.request()).toBe(true);
    expect(circuit.sent[0].MuteData).toEqual({ MuteCRC: 0 });

    circuit.deliver(updateMessage('abc.mute'));
    const request = circuit.sent[1];
    expect(request.XferID.ID.equals(xferId)).toBe(true);
    expect(Buffer.from(request.XferID.Filename).toString().replace(/\0/g, '')).toBe('abc.mute');
    expect(request.XferID).toMatchObject({
      FilePath: 4,
      DeleteOnCompletion: true,
      UseBigPackets: false,
      VFileType: -1,
    });

    const text = `1 ${BOB} Bob Resident|0\n2 ${OBJ} Box|8\n`;
    const { head, body } = withSize(text);
    const half = Math.floor(body.length / 2);
    circuit.deliver(dataPacket(xferId, 0, Buffer.concat([head, body.subarray(0, half)])));
    expect(results).toEqual([]);
    circuit.deliver(dataPacket(xferId, 1 | 0x80000000, body.subarray(half)));
    expect(results).toEqual([
      {
        state: 'loaded',
        mutes: [
          { id: BOB, name: 'Bob Resident', type: 1, flags: 0 },
          { id: OBJ, name: 'Box', type: 2, flags: 8 },
        ],
        legacy: [],
      },
    ]);
    expect(circuit.sent.slice(2).map((m: any) => m.XferID.Packet)).toEqual([0, 1]); // the EOF bit is not echoed back
    expect(circuit.unsubscribe).toHaveBeenCalled();
  });

  it('reconfirms a resent packet without storing it twice, and ignores out-of-order packets', () => {
    const circuit = fakeCircuit();
    const results: any[] = [];
    new MuteListLoader(
      () => circuit,
      uuid(AGENT),
      (r: any) => results.push(r),
      { random: () => xferId },
    ).request();
    circuit.deliver(updateMessage('f'));
    const { head, body } = withSize(`1 ${BOB} Bob|0\n`);
    circuit.deliver(dataPacket(xferId, 0, Buffer.concat([head, body.subarray(0, 5)])));
    circuit.deliver(dataPacket(xferId, 0, Buffer.concat([head, body.subarray(0, 5)]))); // resend: confirmed again
    circuit.deliver(dataPacket(xferId, 5, Buffer.from('zzz'))); // from the future: ignored
    circuit.deliver(dataPacket(xferId, 1 | 0x80000000, body.subarray(5)));
    expect(circuit.sent.slice(2).map((m: any) => m.XferID.Packet)).toEqual([0, 0, 1]);
    expect(results[0].mutes).toEqual([{ id: BOB, name: 'Bob', type: 1, flags: 0 }]);
  });

  it('ignores updates for another agent and packets of other transfers', () => {
    const circuit = fakeCircuit();
    const results: any[] = [];
    new MuteListLoader(
      () => circuit,
      uuid(AGENT),
      (r: any) => results.push(r),
      { random: () => xferId },
    ).request();
    circuit.deliver(updateMessage('f', 'dddddddd-dddd-dddd-dddd-dddddddddddd'));
    expect(circuit.sent).toHaveLength(1);
    circuit.deliver(updateMessage('f'));
    circuit.deliver(dataPacket(Long.fromNumber(999, true), 0 | 0x80000000, Buffer.alloc(4)));
    expect(results).toEqual([]);
  });

  it('refuses a path-like file name, fails on abort and on silence', () => {
    vi.useFakeTimers();
    const circuit = fakeCircuit();
    const results: any[] = [];
    const loader = new MuteListLoader(
      () => circuit,
      uuid(AGENT),
      (r: any) => results.push(r),
      { random: () => xferId, timeoutMs: 1000 },
    );
    loader.request();
    circuit.deliver(updateMessage('../../etc/passwd'));
    expect(results).toEqual([{ state: 'failed' }]);

    loader.request();
    circuit.deliver(updateMessage('f'));
    circuit.deliver({ id: Message.AbortXfer, XferID: { ID: xferId, Result: -1 } });
    expect(results).toHaveLength(2);

    loader.request();
    vi.advanceTimersByTime(1500);
    expect(results).toHaveLength(3);
    expect(results[2]).toEqual({ state: 'failed' });
    vi.useRealTimers();
  });

  it('fails at once when there is no circuit yet', () => {
    const results: any[] = [];
    expect(
      new MuteListLoader(
        () => null,
        uuid(AGENT),
        (r: any) => results.push(r),
      ).request(),
    ).toBe(false);
    expect(results).toEqual([{ state: 'failed' }]);
  });
});

describe('mute list updates on the wire', () => {
  it('sends UpdateMuteListEntry and RemoveMuteListEntry as the viewer does', () => {
    const circuit = fakeCircuit();
    expect(
      sendMuteUpdate(circuit, uuid(AGENT), {
        id: BOB,
        name: 'Bob',
        type: MUTE_TYPE.AGENT,
        flags: 3,
      }),
    ).toBe(true);
    expect(circuit.sent[0].MuteData).toMatchObject({ MuteType: 1, MuteFlags: 3 });
    expect(String(circuit.sent[0].MuteData.MuteID)).toBe(BOB);
    expect(
      sendMuteUpdate(circuit, uuid(AGENT), {
        id: BOB,
        name: 'x',
        type: MUTE_TYPE.EXTERNAL,
        flags: 0,
      }),
    ).toBe(false);
    sendMuteUpdate(circuit, uuid(AGENT), {
      id: '',
      name: 'Legacy',
      type: MUTE_TYPE.BY_NAME,
      flags: 0,
    });
    expect(String(circuit.sent[1].MuteData.MuteID)).toBe(NULL);
    sendMuteRemove(circuit, uuid(AGENT), { id: BOB, name: 'Bob', type: MUTE_TYPE.AGENT, flags: 0 });
    expect(String(circuit.sent[2].MuteData.MuteID)).toBe(BOB);
  });
});

describe('ViewerSession mute entry methods', () => {
  const { ViewerSession } = require('../../../core/viewer-session.cjs');
  const session = () => {
    const s = new ViewerSession(() => undefined);
    const circuit = fakeCircuit();
    s.currentRegion = () => ({ circuit });
    s.bot = { agent: { agentID: uuid(AGENT) } };
    return { s, circuit };
  };

  it('sends an update for a valid entry and refuses bad types, ids and flags', () => {
    const { s, circuit } = session();
    expect(s.updateMuteEntry({ id: BOB.toUpperCase(), name: 'Bob', type: 1, flags: 3 })).toEqual({
      sent: true,
    });
    expect(String(circuit.sent[0].MuteData.MuteID)).toBe(BOB);
    expect(() => s.updateMuteEntry({ id: BOB, name: 'x', type: 4, flags: 0 })).toThrow(/Mute type/);
    expect(() => s.updateMuteEntry({ id: 'nope', name: 'x', type: 1, flags: 0 })).toThrow(/UUID/);
    expect(() => s.updateMuteEntry({ id: BOB, name: 'x', type: 1, flags: 99 })).toThrow(/flags/);
    expect(() => s.updateMuteEntry({ name: '', type: 0 })).toThrow(/needs a name/);
    expect(s.updateMuteEntry({ name: 'Legacy', type: 0 })).toEqual({ sent: true });
  });

  it('removes an entry, and needs a connection', () => {
    const { s, circuit } = session();
    expect(s.removeMuteEntry({ id: OBJ, name: 'Box', type: 2 })).toEqual({ sent: true });
    expect(String(circuit.sent[0].MuteData.MuteID)).toBe(OBJ);
    const idle = new ViewerSession(() => undefined);
    idle.currentRegion = () => null;
    expect(() => idle.removeMuteEntry({ id: OBJ, name: 'Box', type: 2 })).toThrow(/Not connected/);
  });
});
