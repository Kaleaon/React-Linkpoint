import type {
  ChatMessage,
  Friend,
  Group,
  InventoryNode,
  Landmark,
  Notification,
  RadarEntry,
  RegionInfo,
  Resident,
  SystemDialog,
  SystemDialogKind,
  ViewerStats,
} from './slTypes';

/**
 * Seed content for the viewer screens.
 *
 * This is the layer the protocol modules under src/linkpoint replace once a
 * session is live: shapes here match what those managers emit, so a screen
 * never has to change when the data starts arriving from a simulator.
 */

/** The grids a third party viewer is expected to offer. */
export const GRIDS = [
  { id: 'agni', name: 'Second Life (Agni)', loginUri: 'https://login.agni.lindenlab.com/cgi-bin/login.cgi' },
  { id: 'aditi', name: 'Second Life Beta (Aditi)', loginUri: 'https://login.aditi.lindenlab.com/cgi-bin/login.cgi' },
  { id: 'osgrid', name: 'OSGrid', loginUri: 'http://login.osgrid.org' },
  { id: 'custom', name: 'Other grid…', loginUri: '' },
];

/** Start locations, exactly as the viewer login panel offers them. */
export const START_LOCATIONS = [
  { id: 'last', label: 'My last location' },
  { id: 'home', label: 'My home' },
  { id: 'typed', label: 'Type a region name' },
];

export const AGENT: Resident = {
  id: '9f4c2b71-0e3a-4d88-9c5f-2a7b61de4410',
  firstName: 'Ruth',
  lastName: 'Resident',
  displayName: 'Ruth',
  userName: 'ruth.resident',
  online: true,
};

export const CURRENT_REGION: RegionInfo = {
  name: 'Da Boom',
  gridX: 1000,
  gridY: 1000,
  rating: 'General',
  avatars: 34,
  estate: 'Mainland',
  note: 'Linden Public · voice enabled',
};

/** The agent's local position inside the current region. */
export const AGENT_POSITION = { x: 128, y: 128, z: 26 };

/** L$ balance, shown in the status strip. */
export const BALANCE = 3570;

export const CHAT_LOCAL: ChatMessage[] = [
  { id: 'c1', time: '14:21', from: 'Nyx Vaher', text: "the roof build is up — teleport when you're free", volume: 'say' },
  { id: 'c2', time: '14:22', from: 'Ruth Resident', text: 'on my way, just rezzing the last sculpt', mine: true, volume: 'say' },
  { id: 'c3', time: '14:24', from: 'Second Life', text: 'Kit Sandalwood is online.', system: true },
  {
    id: 'c4',
    time: '14:25',
    from: 'Kit Sandalwood',
    text: '@Ruth check the landmark, second floor entrance',
    volume: 'say',
    link: { title: 'Bay City — Hollywood', url: 'secondlife://Hollywood/112/44/51' },
  },
  { id: 'c5', time: '14:26', from: 'Nyx Vaher', text: 'waves from the scaffolding', emote: true },
  { id: 'c6', time: '14:27', from: 'Ruth Resident', text: 'got it 👍', mine: true, volume: 'say' },
  { id: 'c7', time: '14:29', from: 'Nyx Vaher', text: 'bringing the light rig over, one sec', volume: 'whisper' },
];

export const CHAT_IM: Record<string, ChatMessage[]> = {
  'Nyx Vaher': [
    { id: 'i1', time: '14:21', from: 'Nyx Vaher', text: "the roof build is up — teleport when you're free" },
    { id: 'i2', time: '14:22', from: 'Ruth Resident', text: 'on my way, just rezzing the last sculpt', mine: true },
    { id: 'i3', time: '14:25', from: 'Nyx Vaher', text: 'bring the light rig if you have it' },
    { id: 'i4', time: '14:26', from: 'Ruth Resident', text: 'packing it now', mine: true },
  ],
  'Kit Sandalwood': [
    { id: 'i5', time: '13:58', from: 'Kit Sandalwood', text: 'did the vendor script ever get fixed?' },
    { id: 'i6', time: '13:59', from: 'Ruth Resident', text: 'yes — channel -142, the dimmer listens there now', mine: true },
    { id: 'i7', time: '14:28', from: 'Kit Sandalwood', text: 'perfect, sending you the updated notecard' },
  ],
};

export const CHAT_GROUP: Record<string, ChatMessage[]> = {
  'Bay City Builders': [
    { id: 'g1', time: '12:40', from: 'Marlowe Quill', text: 'build jam saturday, 14:00 SLT — bring your own prims' },
    { id: 'g2', time: '12:44', from: 'Ruth Resident', text: 'I can bring the roof kit and the light rig', mine: true },
    { id: 'g3', time: '13:02', from: 'Second Life', text: 'Juno Halcyon joined the session.', system: true },
    { id: 'g4', time: '13:05', from: 'Juno Halcyon', text: 'is the sandbox parcel still auto-returning at 2h?' },
  ],
};

export const FRIENDS: Friend[] = [
  {
    id: '4f2a9c11-8e1d-4a2b-9f03-7c1e5a9d2b64',
    firstName: 'Nyx',
    lastName: 'Vaher',
    displayName: 'Nyx',
    userName: 'nyx.vaher',
    online: true,
    region: 'Da Boom',
    rights: { seeOnline: true, mapLocate: true, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: true, modifyObjects: false },
  },
  {
    id: '8b71ee02-3c4f-4d19-a7b6-5e2d8f3a1c90',
    firstName: 'Kit',
    lastName: 'Sandalwood',
    displayName: 'Kit S.',
    userName: 'kit.sandalwood',
    online: true,
    region: 'Da Boom',
    rights: { seeOnline: true, mapLocate: false, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: true, modifyObjects: false },
  },
  {
    id: '22c4a5de-6b70-4f82-8d31-9a4c7e5b2f18',
    firstName: 'Marlowe',
    lastName: 'Quill',
    displayName: 'Marlowe',
    userName: 'marlowe.quill',
    online: true,
    region: 'Bay City — Hollywood',
    rights: { seeOnline: true, mapLocate: false, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: false, modifyObjects: false },
  },
  {
    id: '71ac93b4-5d28-4e60-bf19-3c8a2d7e6041',
    firstName: 'Sable',
    lastName: 'Ashgrove',
    displayName: 'Sable',
    userName: 'sable.ashgrove',
    online: false,
    lastSeen: '2 days ago',
    rights: { seeOnline: true, mapLocate: false, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: false, modifyObjects: false },
  },
  {
    id: 'c5e81a37-9f42-4b0d-8e73-1d6b4a2f9c85',
    firstName: 'Tamsin',
    lastName: 'Reed',
    displayName: 'Tamsin',
    userName: 'tamsin.reed',
    online: false,
    lastSeen: '5 days ago',
    rights: { seeOnline: false, mapLocate: false, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: false, modifyObjects: false },
  },
  {
    id: 'a3d72f60-4c19-4e85-b27a-8f5c1e9d3b47',
    firstName: 'Oren',
    lastName: 'Fairweather',
    displayName: 'Oren',
    userName: 'oren.fairweather',
    online: false,
    lastSeen: '1 week ago',
    rights: { seeOnline: true, mapLocate: false, modifyObjects: false },
    theirRights: { seeOnline: true, mapLocate: false, modifyObjects: false },
  },
];

export const RADAR_AVATARS: RadarEntry[] = [
  {
    id: 'r1',
    name: 'Nyx Vaher',
    distance: 8,
    bearing: 45,
    meta: 'friend · typing · payment info used',
    kind: 'avatar',
    isFriend: true,
    typing: true,
  },
  { id: 'r2', name: 'Kit Sandalwood', distance: 17, bearing: 10, meta: 'friend · voice active', kind: 'avatar', isFriend: true, voice: true },
  { id: 'r3', name: 'Marlowe Quill', distance: 34, bearing: 95, meta: 'age 14d · payment info on file', kind: 'avatar' },
  { id: 'r4', name: 'Bramble Vex', distance: 48, bearing: 220, meta: 'age 3y · no payment info', kind: 'avatar' },
  { id: 'r5', name: 'Juno Halcyon', distance: 112, bearing: 175, meta: 'beyond shout range', kind: 'avatar' },
  { id: 'r6', name: 'Wren Ostara', distance: 146, bearing: 310, meta: 'beyond draw distance', kind: 'avatar' },
];

export const RADAR_OBJECTS: RadarEntry[] = [
  { id: 'o1', name: 'Vendor — Sunset Lamp v3', distance: 6, bearing: 60, meta: 'Kit Sandalwood · 4 LI · 0.21ms', kind: 'object', owner: 'Kit Sandalwood', landImpact: 4, scripts: 1 },
  { id: 'o2', name: 'Particle fountain', distance: 14, bearing: 120, meta: 'Linden Public · 240 particles/s', kind: 'object', owner: 'Governor Linden' },
  { id: 'o3', name: 'Security orb', distance: 22, bearing: 200, meta: 'Marlowe Quill · scans every 5s', kind: 'object', owner: 'Marlowe Quill', scripts: 1 },
  { id: 'o4', name: 'Dance ball', distance: 31, bearing: 15, meta: 'Juno Halcyon · 1 script · 0.04ms', kind: 'object', owner: 'Juno Halcyon', scripts: 1 },
  { id: 'o5', name: 'Rezzing platform', distance: 58, bearing: 285, meta: 'you · 128 LI · no scripts', kind: 'object', owner: 'Ruth Resident', landImpact: 128 },
];

export const NEARBY_REGIONS: RegionInfo[] = [
  { name: 'Da Boom', gridX: 1000, gridY: 1000, rating: 'General', avatars: 34, note: 'you are here' },
  { name: 'Bay City — Hollywood', gridX: 1001, gridY: 1000, rating: 'Adult', avatars: 18 },
  { name: 'Ahern', gridX: 1000, gridY: 1001, rating: 'Moderate', avatars: 6 },
  { name: 'Sansara Ridge', gridX: 1001, gridY: 1001, rating: 'General', avatars: 0 },
];

/** Inventory, rooted at the protected system folders. */
export const INVENTORY: InventoryNode = {
  id: 'inv-root',
  name: 'My Inventory',
  type: 'category',
  system: true,
  count: 1284,
  children: [
    {
      id: 'f-objects',
      name: 'Objects',
      type: 'category',
      system: true,
      count: 18,
      children: [
        {
          id: 'i-lamp',
          name: 'Sunset Lamp v3',
          type: 'object',
          landImpact: 4,
          permissions: { copy: true, modify: true, transfer: false },
          acquired: '2026-08-14',
          creator: 'Kit Sandalwood',
          description: 'Warm brass lamp, scripted dimmer on channel -142.',
        },
        {
          id: 'i-roofkit',
          name: 'Roof Kit (unpacked)',
          type: 'object',
          landImpact: 32,
          permissions: { copy: true, modify: true, transfer: true },
          acquired: '2026-07-02',
          creator: 'Ruth Resident',
        },
        {
          id: 'i-lightrig',
          name: 'Light Rig — 6 point',
          type: 'object',
          landImpact: 12,
          permissions: { copy: true, modify: true, transfer: true },
          acquired: '2026-06-19',
          creator: 'Ruth Resident',
        },
      ],
    },
    { id: 'f-clothing', name: 'Clothing', type: 'category', system: true, count: 9 },
    { id: 'f-bodyparts', name: 'Body Parts', type: 'category', system: true, count: 4 },
    { id: 'f-outfit', name: 'Current Outfit', type: 'category', system: true, count: 11 },
    {
      id: 'f-landmarks',
      name: 'Landmarks',
      type: 'category',
      system: true,
      count: 12,
      children: [
        { id: 'i-lm1', name: 'Bay City — Hollywood', type: 'landmark', permissions: { copy: true, modify: false, transfer: true } },
        { id: 'i-lm2', name: 'Ahern Welcome Area', type: 'landmark', permissions: { copy: true, modify: false, transfer: true } },
      ],
    },
    { id: 'f-animations', name: 'Animations', type: 'category', system: true, count: 24 },
    { id: 'f-gestures', name: 'Gestures', type: 'category', system: true, count: 6 },
    { id: 'f-notecards', name: 'Notecards', type: 'category', system: true, count: 15 },
    { id: 'f-textures', name: 'Textures', type: 'category', system: true, count: 31 },
    { id: 'f-sounds', name: 'Sounds', type: 'category', system: true, count: 8 },
    { id: 'f-scripts', name: 'Scripts', type: 'category', system: true, count: 7 },
    { id: 'f-callingcards', name: 'Calling Cards', type: 'category', system: true, count: 8 },
    { id: 'f-environments', name: 'Environments', type: 'category', system: true, count: 3 },
    { id: 'f-photos', name: 'Photo Album', type: 'category', system: true, count: 42 },
    { id: 'f-received', name: 'Received Items', type: 'category', system: true, count: 5 },
    { id: 'f-lostfound', name: 'Lost And Found', type: 'category', system: true, count: 1 },
    { id: 'f-trash', name: 'Trash', type: 'category', system: true, count: 2 },
  ],
};

export const GROUPS: Group[] = [
  { id: 'g1', name: 'Bay City Builders', members: 412, role: 'Officer', notices: true, muted: false, unread: 4, joinFee: 0 },
  { id: 'g2', name: 'Sansara Cartographers', members: 88, role: 'Member', notices: true, muted: false, joinFee: 0 },
  { id: 'g3', name: 'Terraform Co-op', members: 1204, role: 'Member', notices: true, muted: true, unread: 12, joinFee: 250 },
  { id: 'g4', name: 'Mono Script Guild', members: 56, role: 'Member', notices: false, muted: false, joinFee: 0 },
];

export const NOTIFICATIONS: Notification[] = [
  { id: 'n1', kind: 'im', title: 'Offline IM · Sable Ashgrove', body: '"the texture pack is in your inventory, no rush"', time: 'yesterday', unread: true },
  { id: 'n2', kind: 'inventory', title: 'Inventory offer · Nyx Vaher', body: 'Bay City Landmark Pack · folder, 6 items', time: '2h', unread: true },
  { id: 'n3', kind: 'payment', title: 'Payment received', body: 'Marlowe Quill paid you L$ 1 200 for "Roof Kit".', time: '5h' },
  { id: 'n4', kind: 'notice', title: 'Group notice · Terraform Co-op', body: 'Sim edge terraform freeze until Monday.', time: '8h' },
  { id: 'n5', kind: 'friendship', title: 'Friendship offer · Kit Sandalwood', body: '"met you at the Bay City build jam"', time: '14:28', unread: true },
];

export const LANDMARKS: Landmark[] = [
  { id: 'l1', name: 'Home', region: 'Da Boom', x: 128, y: 128, z: 26, rating: 'General', favourite: true },
  { id: 'l2', name: 'The Roof Build', region: 'Bay City — Hollywood', x: 112, y: 44, z: 51, rating: 'Adult', favourite: true },
  { id: 'l3', name: 'Ahern Welcome Area', region: 'Ahern', x: 128, y: 128, z: 24, rating: 'Moderate', favourite: true },
  { id: 'l4', name: 'Sansara Ridge overlook', region: 'Sansara Ridge', x: 64, y: 200, z: 88, rating: 'General', favourite: true },
];

export const RECENT_DESTINATIONS: Landmark[] = [
  { id: 'r1', name: 'Bay City — Hollywood', region: 'Bay City — Hollywood', x: 112, y: 44, z: 51, rating: 'Adult', visited: '14:02' },
  { id: 'r2', name: 'Sansara Ridge', region: 'Sansara Ridge', x: 64, y: 200, z: 88, rating: 'General', visited: 'yesterday' },
  { id: 'r3', name: 'Ahern', region: 'Ahern', x: 128, y: 128, z: 24, rating: 'Moderate', visited: '2 days ago' },
];

export const STATS: ViewerStats = {
  fps: 58,
  ping: 84,
  packetLoss: 0.2,
  bandwidth: 812,
  simFps: 44.6,
  physicsFps: 45,
  timeDilation: 0.98,
  scriptTime: 0.8,
  activeScripts: 1204,
  agents: 34,
};

/** The resident profile shown on the Profile screen. */
export const PROFILE = {
  resident: {
    id: '4f2a9c11-8e1d-4a2b-9f03-7c1e5a9d2b64',
    firstName: 'Nyx',
    lastName: 'Vaher',
    displayName: 'Nyx',
    userName: 'nyx.vaher',
    online: true,
  } as Resident,
  born: '2019-04-12',
  accountType: 'Resident',
  paymentInfo: 'Payment info used',
  partner: null as string | null,
  secondLife: 'Builder, terraformer, occasional DJ. Bay City Builders officer. Ask me about mesh roofs.',
  firstLife: 'Somewhere with too many houseplants.',
  groups: ['Bay City Builders', 'Sansara Cartographers', 'Terraform Co-op'],
  picks: [
    { name: 'The Roof Build', region: 'Bay City — Hollywood', body: 'Six floors of open scaffolding, always something being rebuilt.' },
    { name: 'Ahern Welcome Area', region: 'Ahern', body: 'Where everyone still ends up on their first day.' },
    { name: 'Sansara Ridge overlook', region: 'Sansara Ridge', body: 'Best sunset draw distance on the mainland.' },
  ],
};

/** Worn HUDs, as Lumiya lists them: you pick which ones paint over the 3D view. */
export const HUDS = [
  { id: 'ao', name: 'ZHAO II · AO', attach: 'bottom left', w: 146, h: 56, kind: 'row' as const, x: 12, y: 250 },
  { id: 'meter', name: 'Combat Meter', attach: 'top left', w: 124, h: 40, kind: 'bar' as const, x: 12, y: 96 },
  { id: 'hands', name: 'Bento Hands', attach: 'top right', w: 118, h: 104, kind: 'grid' as const, x: 160, y: 96 },
  { id: 'dance', name: 'Dance HUD v4', attach: 'bottom', w: 164, h: 74, kind: 'list' as const, x: 92, y: 230 },
  { id: 'vehicle', name: 'Vehicle Control', attach: 'bottom right', w: 104, h: 104, kind: 'pad' as const, x: 176, y: 214 },
];

export const HUD_DEFAULT: Record<string, boolean> = { ao: true, meter: true };

/** Things in front of the camera that can be selected in the 3D view. */
export const TARGETS = [
  { id: 'nyx', name: 'Nyx Vaher', meta: 'avatar · 8m · friend', kind: 'avatar' as const },
  { id: 'kit', name: 'Kit Sandalwood', meta: 'avatar · 17m', kind: 'avatar' as const },
  { id: 'lamp', name: 'Sunset Lamp v3', meta: 'object · 4 LI · touch', kind: 'object' as const },
  { id: 'door', name: 'Roof Access Door', meta: 'object · scripted · sit', kind: 'object' as const },
  { id: 'sign', name: 'Bay City Notice', meta: 'object · touch to read', kind: 'object' as const },
];

/**
 * The user's customisable button dock, the way Firestorm's toolbar buttons work:
 * the dock is a list of keys into this palette.
 */
export const DOCK_BUTTONS: Record<string, { label: string; icon: string; toggle?: boolean; blockedReason?: string }> = {
  fly: { label: 'FLY', icon: 'plane', toggle: true, blockedReason: 'no fly in this region' },
  sit: { label: 'SIT', icon: 'armchair' },
  snap: { label: 'SNAP', icon: 'camera' },
  mini: { label: 'MAP', icon: 'map' },
  inv: { label: 'INV', icon: 'package' },
  home: { label: 'HOME', icon: 'house' },
  ao: { label: 'AO', icon: 'person-standing', toggle: true },
  sun: { label: 'NOON', icon: 'sun', toggle: true },
  mute: { label: 'MUTE', icon: 'volume-x', toggle: true },
  derender: { label: 'DERENDER', icon: 'eye-off' },
  region: { label: 'REGION', icon: 'info' },
  build: { label: 'BUILD', icon: 'hammer', blockedReason: 'not your land' },
};

export const DEFAULT_DOCK = ['fly', 'sit', 'snap', 'mini', 'inv', 'home', 'ao', 'sun'];

/** Simulator and scripted-object dialogs, with the disclosures the viewer owes. */
export const SYSTEM_DIALOGS: Record<SystemDialogKind, SystemDialog> = {
  llDialog: {
    kind: 'llDialog',
    category: 'SCRIPTED OBJECT',
    title: 'Vendor — Sunset Lamp v3',
    body: 'Touch a swatch to preview. Delivery is instant and copies are transferable.',
    meta: 'object: Sunset Lamp v3 · owner: Kit Sandalwood · channel -142',
    buttons: [
      { label: 'BRASS' },
      { label: 'WALNUT' },
      { label: 'MATTE BLACK' },
      { label: 'PREVIEW ALL' },
      { label: 'IGNORE', kind: 'danger' },
      { label: 'BLOCK OBJECT', kind: 'danger' },
    ],
  },
  permissions: {
    kind: 'permissions',
    category: 'PERMISSION REQUEST',
    title: '"Aurora Dance HUD" wants to animate your avatar',
    body: 'Also requests: attach to your avatar, take your movement controls while dancing.',
    meta: 'grants can be revoked from Settings › Scripted objects',
    buttons: [{ label: 'ALLOW ONCE' }, { label: 'ALLOW ALWAYS', kind: 'primary' }, { label: 'DENY', kind: 'danger' }],
  },
  inventoryOffer: {
    kind: 'inventoryOffer',
    category: 'INVENTORY OFFER',
    title: 'Nyx Vaher gave you "Bay City Landmark Pack"',
    body: 'Folder · 6 items · landmarks and one notecard.',
    meta: 'accepted items land in Received Items',
    buttons: [{ label: 'ACCEPT', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }, { label: 'MUTE SENDER', kind: 'danger' }],
  },
  teleportLure: {
    kind: 'teleportLure',
    category: 'TELEPORT OFFER',
    title: 'Kit Sandalwood offers to teleport you',
    body: '"come see the build jam, we\'re on the roof"',
    meta: 'destination: Bay City — Hollywood <112, 44, 51>',
    buttons: [{ label: 'TELEPORT', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }, { label: 'REPLY INSTEAD' }],
  },
  payment: {
    kind: 'payment',
    category: 'PAYMENT',
    title: 'Pay Sunset Lamp v3',
    body: 'L$ 450 — balance after: L$ 3 120.',
    meta: 'one-time payment · the object owner receives the funds directly',
    buttons: [{ label: 'L$ 450', kind: 'primary' }, { label: 'OTHER AMOUNT' }, { label: 'CANCEL', kind: 'danger' }],
  },
  regionRestart: {
    kind: 'regionRestart',
    category: 'ESTATE MESSAGE',
    title: 'Region restart in 2 minutes',
    body: 'Da Boom will restart for maintenance. You will be moved to your home location if you stay.',
    buttons: [{ label: 'TELEPORT HOME', kind: 'primary' }, { label: 'STAY' }, { label: 'DISMISS', kind: 'danger' }],
  },
  friendshipOffer: {
    kind: 'friendshipOffer',
    category: 'FRIENDSHIP OFFER',
    title: 'Kit Sandalwood wants to be your friend',
    body: '"met you at the Bay City build jam"',
    meta: 'accepting grants them permission to see when you are online',
    buttons: [{ label: 'ACCEPT', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }],
  },
  groupInvite: {
    kind: 'groupInvite',
    category: 'GROUP INVITATION',
    title: 'Nyx Vaher invited you to Aurora Dance Crew',
    body: 'Role: Member. There is no join fee.',
    meta: 'you hold 4 of 42 group slots',
    buttons: [{ label: 'JOIN', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }, { label: 'VIEW GROUP' }],
  },
};

/** Loading, empty and error copy per screen, with a generic fallback. */
export type ScreenCondition = 'normal' | 'loading' | 'empty' | 'error';

export interface ConditionCopy {
  sub: string;
  icon: string;
  title: string;
  body: string;
  log?: string[];
  bar?: number;
  btn?: string;
}

export const CONDITIONS: Record<Exclude<ScreenCondition, 'normal'>, Record<string, ConditionCopy>> = {
  loading: {
    _: { sub: '> awaiting simulator', icon: 'loader', title: 'SYNCING', body: 'Waiting on the simulator to answer.', log: ['> request sent · agni', '> awaiting capability grant'], bar: 0.34 },
    Chat: {
      sub: '> joining local · restoring queue',
      icon: 'message-square',
      title: 'OPENING CHANNELS',
      body: 'Joining local chat and restoring 4 conversations from the offline queue.',
      log: ['> local channel … ok', '> group im … ok', '> offline queue … 4 of 12'],
      bar: 0.55,
    },
    Map: {
      sub: '> fetching 4 region tiles',
      icon: 'map',
      title: 'REGION HANDSHAKE',
      body: 'Fetching map tiles for Da Boom and three adjacent regions.',
      log: ['> map-1-1000-1000 … ok', '> map-1-1001-1000 … ok', '> map-1-1000-1001 … pending'],
      bar: 0.68,
    },
    World: {
      sub: '> streaming objects · 812 / 1 204',
      icon: 'box',
      title: 'RENDERING SCENE',
      body: 'Streaming region objects and rigged mesh. Avatars appear as they resolve.',
      log: ['> objects 812 / 1 204', '> textures 44 / 96', '> avatars 2 / 6'],
      bar: 0.62,
    },
    Inventory: {
      sub: '> 640 / 1 284 items',
      icon: 'folder',
      title: 'FETCHING INVENTORY',
      body: '1 284 items across 42 folders. The skeleton loads first, contents on demand.',
      log: ['> folder skeleton … ok', '> items 640 / 1 284'],
      bar: 0.5,
    },
    Teleport: {
      sub: '> handing off · do not close',
      icon: 'zap',
      title: 'TELEPORTING',
      body: 'Handing off to Sansara Ridge. Hold still — this takes a moment on mobile data.',
      log: ['> region handoff requested', '> circuit established', '> awaiting arrival'],
      bar: 0.8,
    },
  },
  empty: {
    _: { sub: '> 0 items', icon: 'inbox', title: 'NOTHING HERE YET', body: 'When there is something to show, it will land in this list.', btn: 'REFRESH' },
    Chat: { sub: '> 0 in 20m · shout reaches 100m', icon: 'message-square-dashed', title: 'NO LOCAL CHATTER', body: 'Nobody has said anything within 20m in the last hour. Shout reaches 100m.', btn: 'SAY HELLO' },
    Friends: { sub: '> 0 online / 6 total', icon: 'users', title: 'NOBODY ONLINE', body: 'All 6 of your friends are offline. You will get a push when someone logs in.', btn: 'MANAGE ALERTS' },
    Radar: { sub: '> 0 avatars in draw distance', icon: 'radar', title: 'REGION IS EMPTY', body: 'No other avatars within draw distance. Raise it to 256m to look further out.', btn: 'RAISE DRAW DISTANCE' },
    Inventory: { sub: '> 0 of 1 284 match', icon: 'search-x', title: 'NO MATCHES', body: 'Nothing in 1 284 items matches that filter. Try a shorter filter or a different folder.', btn: 'CLEAR FILTER' },
    Notices: { sub: '> inbox clear · autoresponse ON', icon: 'bell-off', title: 'INBOX CLEAR', body: 'No unread group notices or offline IMs. Autoresponse stays on while you are away.', btn: 'NOTIFICATION SETTINGS' },
    Teleport: { sub: '> no landmarks saved', icon: 'map-pin-off', title: 'NO LANDMARKS', body: 'You have not saved any landmarks yet. Star a place from the map to keep it here.', btn: 'OPEN MAP' },
    Groups: { sub: '> 0 of 42 slots', icon: 'users', title: 'NO GROUPS', body: 'You are not in any groups. You can hold up to 42 slots on this account.', btn: 'SEARCH GROUPS' },
  },
  error: {
    _: {
      sub: '> circuit down · session held 60s',
      icon: 'plug-zap',
      title: 'GRID CONNECTION LOST',
      body: 'The simulator stopped answering. Your session is held for 60 seconds before logout.',
      btn: 'RECONNECT',
      log: ['! circuit timeout after 30s', '> retry 1 of 3 in 8s'],
    },
    Chat: {
      sub: '> 2 messages queued',
      icon: 'wifi-off',
      title: 'CHANNEL LOST',
      body: 'Chat went quiet because the circuit dropped. Anything you send now is queued and delivered on reconnect.',
      btn: 'RECONNECT',
      log: ['! local chat circuit closed', '> 2 messages queued'],
    },
    Map: {
      sub: '> tiles unavailable · cached names only',
      icon: 'cloud-off',
      title: 'REGION UNREACHABLE',
      body: 'Map tiles could not be fetched. The vector grid below is drawn from cached region names.',
      btn: 'RETRY TILES',
      log: ['! secondlife-maps-cdn 504', '> falling back to vector grid'],
    },
    Teleport: {
      sub: '> destination full · still at Da Boom',
      icon: 'zap-off',
      title: 'TELEPORT FAILED',
      body: 'Sansara Ridge refused the handoff — the region is full. You are still at Da Boom.',
      btn: 'TRY AGAIN',
      log: ['! destination full (40/40)', '> position unchanged'],
    },
    World: {
      sub: '> renderer paused at 812 / 1 204',
      icon: 'box',
      title: 'SCENE STALLED',
      body: 'Object streaming stopped at 812 of 1 204. Rendering is paused to save battery.',
      btn: 'RESUME STREAMING',
      log: ['! asset fetch timeout', '> renderer paused'],
    },
  },
};
