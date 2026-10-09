// The grid-side mute list. The simulator keeps it per account; the viewer asks for it with MuteListRequest and the
// simulator answers with MuteListUpdate naming a file, which is then downloaded over Xfer. Ported from the official
// viewer (indra/newview/llmutelist.cpp: requestFromServer, processMuteListUpdate, processUseCachedMuteList,
// loadFromFile, updateAdd, updateRemove; indra/llmessage/llxfermanager.cpp + llxfer_file.cpp: the receive side of Xfer).
const crypto = require('node:crypto');
const Long = require('long');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { UUID } = require('@caspertech/node-metaverse/dist/lib/classes/UUID');
const { Utils } = require('@caspertech/node-metaverse/dist/lib/classes/Utils');
const { MuteListRequestMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/MuteListRequest');
const { RequestXferMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/RequestXfer');
const { ConfirmXferPacketMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/ConfirmXferPacket');
const { UpdateMuteListEntryMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/UpdateMuteListEntry');
const { RemoveMuteListEntryMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/RemoveMuteListEntry');

/** `LLMute::EType`. */
const MUTE_TYPE = { BY_NAME: 0, AGENT: 1, OBJECT: 2, GROUP: 3, EXTERNAL: 4 };
/** `LL_PATH_CACHE` in lldir.h: the remote file lives in the simulator's cache directory. */
const LL_PATH_CACHE = 4;
const NULL_UUID = '00000000-0000-0000-0000-000000000000';
/** `LLXferManager::decodePacketNum` / `isLastPacket`. */
const decodePacketNum = (packet) => packet & 0x0fffffff;
const isLastPacket = (packet) => (packet & 0x80000000) !== 0;
/** How long to wait for the simulator to answer a request: it sends nothing at all when the account has no list. */
const MUTE_LIST_TIMEOUT_MS = 15000;

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * `LLMuteList::loadFromFile`: lines of " %d %254s %254[^|]| %u". An entry with a null id, or of type BY_NAME, is a
 * legacy mute by name.
 */
function parseMuteList(text) {
  const mutes = [];
  const legacy = [];
  for (const line of String(text).split('\n')) {
    const match = /^\s*(-?\d+)\s+(\S{1,254})\s*([^|]{0,254})(?:\|\s*(\d+))?/.exec(line);
    if (!match) continue;
    const type = Number(match[1]);
    const id = isUuid(match[2]) ? match[2].toLowerCase() : NULL_UUID;
    const name = match[3].replace(/\r$/, '');
    const flags = match[4] === undefined ? 0 : Number(match[4]) >>> 0;
    if (id === NULL_UUID || type === MUTE_TYPE.BY_NAME) legacy.push(name);
    else mutes.push({ id, name, type, flags });
  }
  return { mutes, legacy };
}

/** `LLMuteList::saveToFile` (what the simulator's file looks like), used by tests and for a future cache. */
function formatMuteList({ mutes = [], legacy = [] }) {
  const lines = legacy.map((name) => `${MUTE_TYPE.BY_NAME} ${NULL_UUID} ${name}|\n`);
  for (const m of mutes) if (m.type !== MUTE_TYPE.EXTERNAL) lines.push(`${m.type} ${m.id} ${m.name}|${m.flags >>> 0}\n`);
  return lines.join('');
}

const randomXferId = () => Long.fromBytesLE([...crypto.randomBytes(8)], true);
const bufferText = (buffer) => Buffer.from(buffer || []).toString('utf8').replace(/\0+$/, '');

/**
 * Requests the mute list and receives it. One request at a time. `onList({ state, mutes, legacy })` gets
 * `state: 'loaded'` with the entries, or `state: 'failed'` (nothing arrived in time, or the transfer was aborted).
 */
class MuteListLoader {
  constructor(getCircuit, agentId, onList, { timeoutMs = MUTE_LIST_TIMEOUT_MS, random = randomXferId } = {}) {
    this.getCircuit = getCircuit;
    this.agentId = agentId;
    this.onList = onList;
    this.timeoutMs = timeoutMs;
    this.random = random;
    this.subscription = null;
    this.timer = null;
    this.xfer = null;
    this.circuit = null;
  }

  /** `LLMuteList::requestFromServer`. The CRC is 0: there is no cached copy, so the simulator always sends the list. */
  request() {
    const circuit = this.getCircuit();
    if (!circuit?.sendMessage) { this.finish({ state: 'failed' }); return false; }
    this.cancel();
    this.circuit = circuit;
    this.subscription = circuit.subscribeToMessages([Message.MuteListUpdate, Message.UseCachedMuteList, Message.SendXferPacket, Message.AbortXfer], (packet) => this.onPacket(packet));
    const message = new MuteListRequestMessage();
    message.AgentData = { AgentID: this.agentId, SessionID: circuit.sessionID };
    message.MuteData = { MuteCRC: 0 };
    circuit.sendMessage(message, PacketFlags.Reliable);
    this.timer = setTimeout(() => this.finish({ state: 'failed' }), this.timeoutMs);
    this.timer.unref?.();
    return true;
  }

  cancel() {
    clearTimeout(this.timer); this.timer = null;
    this.subscription?.unsubscribe?.(); this.subscription = null;
    this.xfer = null;
  }

  finish(result) {
    this.cancel();
    this.onList(result);
  }

  onPacket(packet) {
    const message = packet?.message;
    if (!message) return;
    switch (message.id) {
      case Message.MuteListUpdate: return this.onUpdate(message);
      case Message.UseCachedMuteList:
        // We never keep a cache, so the simulator should not send this; treat it as an empty answer rather than hang.
        return this.finish({ state: 'loaded', mutes: [], legacy: [] });
      case Message.SendXferPacket: return this.onData(message);
      case Message.AbortXfer:
        if (this.xfer && message.XferID?.ID?.equals?.(this.xfer.id)) this.finish({ state: 'failed' });
        return undefined;
      default: return undefined;
    }
  }

  /** `LLMuteList::processMuteListUpdate` then `LLXfer_File::startDownload`. */
  onUpdate(message) {
    if (String(message.MuteData?.AgentID) !== String(this.agentId)) return; // an update for another agent
    const filename = bufferText(message.MuteData?.Filename);
    if (!filename || /[\\/]/.test(filename)) return this.finish({ state: 'failed' }); // LLDir::getScrubbedFileName never lets a path through
    this.xfer = { id: this.random(), expected: 0, chunks: [], size: null };
    const request = new RequestXferMessage();
    request.XferID = {
      ID: this.xfer.id, Filename: Utils.StringToBuffer(filename), FilePath: LL_PATH_CACHE, DeleteOnCompletion: true,
      UseBigPackets: false, VFileID: UUID.zero(), VFileType: -1,
    };
    this.circuit.sendMessage(request, PacketFlags.Reliable);
  }

  /** `LLXferManager::processReceiveData`. */
  onData(message) {
    const xfer = this.xfer;
    if (!xfer || !message.XferID?.ID?.equals?.(xfer.id)) return;
    const packetNumber = message.XferID.Packet;
    const number = decodePacketNum(packetNumber);
    const data = Buffer.from(message.DataPacket?.Data || []);
    if (number !== xfer.expected) {
      // A resend of the last packet means our confirmation was lost.
      if (number === xfer.expected - 1) this.confirm(xfer.id, number);
      return;
    }
    let body = data;
    if (number === 0) {
      // The first packet carries the file size as a leading little-endian S32.
      if (data.length < 4) return this.finish({ state: 'failed' });
      xfer.size = data.readInt32LE(0);
      body = data.subarray(4);
    }
    xfer.chunks.push(body);
    xfer.expected += 1;
    this.confirm(xfer.id, number);
    if (isLastPacket(packetNumber)) {
      const text = Buffer.concat(xfer.chunks).toString('utf8');
      this.finish({ state: 'loaded', ...parseMuteList(text) });
    }
  }

  confirm(id, packet) {
    const message = new ConfirmXferPacketMessage();
    message.XferID = { ID: id, Packet: packet };
    this.circuit.sendMessage(message, PacketFlags.Reliable);
  }
}

/** `LLMuteList::updateAdd`: tell the simulator about an added or changed entry. */
function sendMuteUpdate(circuit, agentId, entry) {
  if (entry.type === MUTE_TYPE.EXTERNAL) return false; // external mutes are local only
  const message = new UpdateMuteListEntryMessage();
  message.AgentData = { AgentID: agentId, SessionID: circuit.sessionID };
  message.MuteData = {
    MuteID: entry.type === MUTE_TYPE.BY_NAME ? UUID.zero() : new UUID(entry.id),
    MuteName: Utils.StringToBuffer(entry.name || ''), MuteType: entry.type, MuteFlags: entry.flags >>> 0,
  };
  circuit.sendMessage(message, PacketFlags.Reliable);
  return true;
}

/** `LLMuteList::updateRemove`. */
function sendMuteRemove(circuit, agentId, entry) {
  const message = new RemoveMuteListEntryMessage();
  message.AgentData = { AgentID: agentId, SessionID: circuit.sessionID };
  message.MuteData = {
    MuteID: entry.type === MUTE_TYPE.BY_NAME || !entry.id ? UUID.zero() : new UUID(entry.id),
    MuteName: Utils.StringToBuffer(entry.name || ''),
  };
  circuit.sendMessage(message, PacketFlags.Reliable);
}

module.exports = { MUTE_TYPE, MuteListLoader, parseMuteList, formatMuteList, sendMuteUpdate, sendMuteRemove, decodePacketNum, isLastPacket, MUTE_LIST_TIMEOUT_MS };
