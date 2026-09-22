const {
  Bot,
  BotOptionFlags,
  LoginParameters,
  PCode,
} = require('@caspertech/node-metaverse');

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vector(value, fallback = [0, 0, 0]) {
  return value ? [finite(value.x), finite(value.y), finite(value.z)] : fallback;
}

function serializeObject(event) {
  const object = event.object;
  const rotation = object.Rotation || { x: 0, y: 0, z: 0, w: 1 };
  return {
    id: object.FullID?.toString() || String(event.localID),
    localId: event.localID,
    parentId: object.ParentID || 0,
    pcode: object.PCode,
    avatar: object.PCode === PCode.Avatar,
    position: vector(object.Position),
    scale: vector(object.Scale, [0.5, 0.5, 0.5]),
    rotation: [finite(rotation.x), finite(rotation.y), finite(rotation.z), finite(rotation.w, 1)],
    name: object.name || '',
  };
}

class ViewerSession {
  constructor(send) {
    this.send = send;
    this.bot = null;
    this.subscriptions = [];
  }

  subscribe(subject, type, serialize = (value) => value) {
    this.subscriptions.push(subject.subscribe((value) => this.send(type, serialize(value))));
  }

  async connect({ loginUrl, username, password, start = 'last' }) {
    await this.close();
    const names = username.replace(/[._]/g, ' ').trim().split(/\s+/);
    const params = new LoginParameters();
    params.firstName = names[0];
    params.lastName = names[1] || 'Resident';
    params.password = password;
    params.start = start;
    params.url = loginUrl;

    // The full object store decodes ObjectUpdate, ObjectUpdateCompressed,
    // ObjectUpdateCached and terse updates from the simulator UDP circuit.
    this.bot = new Bot(params, BotOptionFlags.None);
    const events = this.bot.clientEvents;
    this.subscribe(events.onNewObjectEvent, 'object-add', serializeObject);
    this.subscribe(events.onObjectUpdatedEvent, 'object-update', serializeObject);
    this.subscribe(events.onObjectUpdatedTerseEvent, 'object-update', serializeObject);
    this.subscribe(events.onObjectKilledEvent, 'object-remove', (event) => ({
      id: event.objectID?.toString() || String(event.localID),
      localId: event.localID,
    }));
    this.subscribe(events.onNearbyChat, 'chat', (event) => ({
      fromId: event.from?.toString(),
      fromName: event.fromName,
      message: event.message,
      chatType: event.chatType,
      position: vector(event.position),
    }));
    this.subscribe(events.onDisconnected, 'disconnected', (event) => ({ message: event.message || 'Disconnected' }));

    const reply = await this.bot.login();
    await this.bot.connectToSim();
    const region = this.bot.currentRegion;
    return {
      login: true,
      agent_id: this.bot.agent.agentID.toString(),
      session_id: region.circuit.sessionID.toString(),
      circuit_code: region.circuit.circuitCode,
      sim_name: region.regionName || 'Unknown region',
      region_x: region.xCoordinate || 0,
      region_y: region.yCoordinate || 0,
      message: reply.loginMessage || 'Connected',
      native_scene: true,
    };
  }

  async sendChat(message, channel = 0, type = 1) {
    if (!this.bot) throw new Error('Not connected to a simulator');
    const communications = this.bot.clientCommands.comms;
    if (type === 0) await communications.whisper(message, channel);
    else if (type === 2) await communications.shout(message, channel);
    else await communications.say(message, channel);
  }

  async close() {
    for (const subscription of this.subscriptions.splice(0)) subscription.unsubscribe();
    if (!this.bot) return;
    const bot = this.bot;
    this.bot = null;
    try { await bot.close(); } catch { /* circuit may already be closed */ }
  }
}

module.exports = { ViewerSession, serializeObject };
