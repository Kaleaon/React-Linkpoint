// Ported verbatim from index.html's <script> block: device list,
// the desktop floater/window model, the menu bar, screen order, custom dock
// buttons, per-screen sub-segments, the movement pad, worn HUDs, world-view
// targets and the loading/empty/error copy bank.

export const DEVICES = {
  ios:  { name: "iPhone 15 Pro", dims: "393×852", w: 393, h: 852, split: false, notch: "island" },
  and:  { name: "Pixel 8", dims: "412×892", w: 412, h: 892, split: false, notch: "hole" },
  tab:  { name: 'Tablet 12.9" landscape', dims: "1194×834", w: 1194, h: 834, split: true, notch: "none" },
  fold: { name: "Foldable, unfolded", dims: "840×880", w: 840, h: 880, split: true, notch: "hole" },
  desk: { name: "Desktop", dims: "1440×900", w: 1440, h: 900, split: true, notch: "none", desk: true },
};

// Desktop SL is not a screen stack — it is N resizable windows over one scene. The
// floater set is the window model: position, size, z-order and minimise all live in state.
export const FBAR = 26;
export const FLOATERS = [
  { id:"Chat",        title:"Local Chat",    icon:"message-square", x:20,   y:24,  w:424, h:296 },
  { id:"Radar",       title:"Nearby",        icon:"radar",          x:462,  y:24,  w:372, h:296 },
  { id:"Friends",     title:"People",        icon:"users",          x:20,   y:340, w:300, h:262 },
  { id:"Inventory",   title:"Inventory",     icon:"folder",         x:1056, y:24,  w:346, h:420 },
  { id:"Map",         title:"World Map",     icon:"map",            x:462,  y:340, w:372, h:262 },
  { id:"Profile",     title:"Profile",       icon:"user",           x:340,  y:110, w:392, h:430 },
  { id:"Groups",      title:"Groups",        icon:"users-round",    x:852,  y:24,  w:196, h:252 },
  { id:"Notices",     title:"Notifications", icon:"bell",           x:852,  y:292, w:196, h:252 },
  { id:"Teleport",    title:"Places",        icon:"zap",            x:330,  y:150, w:370, h:350 },
  { id:"Settings",    title:"Preferences",   icon:"settings",       x:290,  y:80,  w:540, h:470 },
  { id:"Diagnostics", title:"Statistics",    icon:"activity",       x:1056, y:462, w:346, h:196 },
];
export const FMENU = [
  { label:"File",  items:[["Upload Image…","⌘U"],["Take Snapshot","⌘`"],["Save Texture As…",""],["Quit","⌘Q"]] },
  { label:"Edit",  items:[["Undo","⌘Z"],["Redo","⇧⌘Z"],["Appearance…",""],["Preferences…","⌘,"]] },
  { label:"View",  items:"WINDOWS" },
  { label:"World", items:[["Teleport Home","⇧⌘H"],["Set Home to Here",""],["About Land…",""],["Region / Estate…",""]] },
  { label:"Build", items:[["Focus","⌥1"],["Move","⌥2"],["Edit","⌥3"],["Create","⌥4"],["Land","⌥5"]] },
  { label:"Help",  items:[["Second Life Help","F1"],["Report Abuse…",""],["Report Bug…",""],["About Linkpoint",""]] },
];

export const SCREENS = ["Chat","Friends","Radar","Map","3D View","Inventory","Profile","Groups","Notices","Teleport","Outfits","Objects","Parcel","Transactions","Mute List","Settings","Diagnostics","Login","Search"];
// Grid picker for Login: Second Life's own two (Agni/Aditi) plus a few
// well-known OpenSim grids, so the login screen isn't LL-only.
export const GRIDS = [
  { key: "agni", label: "Agni (Main)", host: "login.agni.lindenlab.com" },
  { key: "aditi", label: "Aditi (Beta)", host: "login.aditi.lindenlab.com" },
  { key: "osgrid", label: "OSgrid", host: "login.osgrid.org" },
  { key: "kitely", label: "Kitely", host: "login.kitely.com" },
];

// Firestorm-style custom button array: the user's dock is a list of keys into this palette.
export const CBTN = {
  fly:  { label: "FLY",   icon: "plane",           tog: true, off: "no fly in this region" },
  sit:  { label: "SIT",   icon: "armchair" },
  snap: { label: "SNAP",  icon: "camera" },
  mini: { label: "MAP",   icon: "map" },
  inv:  { label: "INV",   icon: "package" },
  home: { label: "HOME",  icon: "house" },
  ao:   { label: "AO",    icon: "person-standing", tog: true },
  sun:  { label: "NOON",  icon: "sun",             tog: true },
  mute: { label: "MUTE",  icon: "volume-x",        tog: true },
  drnd: { label: "DEREND",icon: "eye-off" },
  rgn:  { label: "REGION",icon: "info" },
  bld:  { label: "BUILD", icon: "hammer",          off: "not your land" },
};

// Rail sub-segments are per-screen sub-nav, not decoration: each active area exposes
// its own two or three sub-views the way LCARS indents sub-functions off the spine.
export const CSUB = {
  "3D View":     [["CAM", "· 01"], ["GFX", "· 02"]],
  Chat:          [["LOCAL", "· 01"], ["IM", "· 02"], ["GROUP", "· 03"]],
  Friends:       [["ONLINE", "· 01"], ["ALL", "· 02"]],
  Radar:         [["AVATAR", "· 01"], ["OBJECT", "· 02"]],
  Map:           [["WORLD", "· 01"], ["MINI", "· 02"]],
  Inventory:     [["RECENT", "· 01"], ["WORN", "· 02"]],
  Profile:       [["2ND LIFE", "· 01"], ["PICKS", "· 02"]],
  Groups:        [["NOTICES", "· 01"], ["ROLES", "· 02"]],
  Notices:       [["IM", "· 01"], ["SYSTEM", "· 02"]],
  Teleport:      [["LANDMARK", "· 01"], ["HISTORY", "· 02"]],
  Settings:      [["LOOK", "· 01"], ["NETWORK", "· 02"]],
  Diagnostics:   [["NETWORK", "· 01"], ["RENDER", "· 02"]],
};

// Movement pad: turning is drag-to-look, so the pad is a cross with a camera-mode centre.
export const CPAD = [
  { k: "" },                          { k: "fwd", icon: "chevron-up" },    { k: "" },
  { k: "lft", icon: "chevron-left" }, { k: "cam", icon: "video" },        { k: "rgt", icon: "chevron-right" },
  { k: "" },                          { k: "bck", icon: "chevron-down" },  { k: "" },
];
export const CPADR = { 1: "50% 50% 0 0", 3: "50% 0 0 50%", 5: "0 50% 50% 0", 7: "0 0 50% 50%" };

// Worn HUDs, Lumiya-style: the viewer lists what you have on, you pick which ones
// paint over the 3D view, and each visible one can be dragged to a new spot.
export const HUDS = [
  { id:"ao",      name:"ZHAO II · AO",   attach:"bottom left",  w:146, h:56, kind:"row",  x:12,  y:250 },
  { id:"meter",   name:"Combat Meter",        attach:"top left",     w:124, h:40, kind:"bar",  x:12,  y:96  },
  { id:"hands",   name:"Bento Hands",         attach:"top right",    w:118, h:104, kind:"grid", x:160, y:96  },
  { id:"dance",   name:"Dance HUD v4",        attach:"bottom",       w:164, h:74, kind:"list", x:92,  y:230 },
  { id:"vehicle", name:"Vehicle Control",     attach:"bottom right", w:104, h:104, kind:"pad",  x:176, y:214 },
];
export const HUD_DEFAULT = { ao:true, meter:true };

export const TARGETS = [
  { id:"nyx",  icon:"user",    name:"Nyx Vaher",        meta:"avatar · 8m · friend" },
  { id:"kit",  icon:"user",    name:"Kit Sandalwood",   meta:"avatar · 17m" },
  { id:"lamp", icon:"box",     name:"Sunset Lamp v3",   meta:"object · 4 prims · touch" },
  { id:"door", icon:"box",     name:"Roof Access Door", meta:"object · scripted · sit" },
  { id:"sign", icon:"signpost",name:"Bay City Notice",  meta:"object · touch to read" },
];

// Loading / empty / error copy per screen, with a generic fallback for the rest.
export const STATES = {
  loading: {
    _: { sub:"> awaiting simulator", icon:"loader", title:"SYNCING", body:"Waiting on the simulator to answer.", log:["> request sent · agni","> awaiting capability grant"], bar:.34 },
    Chat: { sub:"> joining local · restoring queue", icon:"message-square", title:"OPENING CHANNELS", body:"Joining local chat and restoring 4 conversations from the offline queue.", log:["> local channel … ok","> group im … ok","> offline queue … 4 of 12"], bar:.55 },
    Map: { sub:"> fetching 4 region tiles", icon:"map", title:"REGION HANDSHAKE", body:"Fetching map tiles for Da Boom and three adjacent regions.", log:["> map-1-1000-1000 … ok","> map-1-1001-1000 … ok","> map-1-1000-1001 … pending"], bar:.68 },
    "3D View": { sub:"> streaming objects · 812 / 1 204", icon:"box", title:"RENDERING SCENE", body:"Streaming region objects and rigged mesh. Avatars appear as they resolve.", log:["> objects 812 / 1 204","> textures 44 / 96","> avatars 2 / 6"], bar:.62 },
    Inventory: { sub:"> 640 / 1 284 items", icon:"folder", title:"FETCHING INVENTORY", body:"1 284 items across 42 folders. Skeleton loads first, contents on demand.", log:["> folder skeleton … ok","> items 640 / 1 284"], bar:.5 },
    Teleport: { sub:"> handing off · do not close", icon:"zap", title:"TELEPORTING", body:"Handing off to Sansara Ridge. Hold still, this takes a moment on mobile data.", log:["> region handoff requested","> circuit established","> awaiting arrival"], bar:.8 },
  },
  empty: {
    _: { sub:"> 0 items", icon:"inbox", title:"NOTHING HERE YET", body:"When there is something to show, it will land in this list.", btn:"REFRESH" },
    Chat: { sub:"> 0 in 20m · shout reaches 100m", icon:"message-square-dashed", title:"NO LOCAL CHATTER", body:"Nobody has said anything within 20m in the last hour. Shout reaches 100m.", btn:"SAY HELLO" },
    Friends: { sub:"> 0 online / 8 total · last sync 14:32:07", icon:"users", title:"NOBODY ONLINE", body:"All 8 of your friends are offline. You will get a push when someone logs in.", btn:"MANAGE ALERTS" },
    Radar: { sub:"> 0 avatars in draw distance", icon:"radar", title:"REGION IS EMPTY", body:"No other avatars within draw distance. Raise it to 256m to look further out.", btn:"RAISE DRAW DISTANCE" },
    Inventory: { sub:"> 0 of 1 284 match “brass roof”", icon:"search-x", title:"NO MATCHES", body:"Nothing in 1 284 items matches “brass roof”. Try a shorter filter or a different folder.", btn:"CLEAR FILTER" },
    Notices: { sub:"> inbox clear · autoresponse ON", icon:"bell-off", title:"INBOX CLEAR", body:"No unread group notices or offline IMs. Autoresponse stays on while you are away.", btn:"NOTIFICATION SETTINGS" },
    Teleport: { sub:"> no landmarks saved", icon:"map-pin-off", title:"NO LANDMARKS", body:"You have not saved any landmarks yet. Star a place from the map to keep it here.", btn:"OPEN MAP" },
    Groups: { sub:"> 0 of 42 slots", icon:"users", title:"NO GROUPS", body:"You are not in any groups. You can hold up to 42 slots on this account.", btn:"SEARCH GROUPS" },
  },
  error: {
    _: { sub:"> circuit down · session held 60s", icon:"plug-zap", title:"GRID CONNECTION LOST", body:"The simulator stopped answering. Your session is held for 60 seconds before logout.", btn:"RECONNECT", log:["! circuit timeout after 30s","> retry 1 of 3 in 8s"] },
    Chat: { sub:"> 2 messages queued", icon:"wifi-off", title:"CHANNEL LOST", body:"Chat went quiet because the circuit dropped. Anything you send now is queued and delivered on reconnect.", btn:"RECONNECT", log:["! local chat circuit closed","> 2 messages queued"] },
    Map: { sub:"> tiles unavailable · cached names only", icon:"cloud-off", title:"REGION UNREACHABLE", body:"Map tiles could not be fetched. The vector grid below is drawn from cached region names.", btn:"RETRY TILES", log:["! secondlife-maps-cdn 504","> falling back to vector grid"] },
    Teleport: { sub:"> destination full · still at Da Boom", icon:"zap-off", title:"TELEPORT FAILED", body:"Sansara Ridge refused the handoff — the region is full. You are still at Da Boom.", btn:"TRY AGAIN", log:["! destination full (40/40)","> position unchanged"] },
    "3D View": { sub:"> renderer paused at 812 / 1 204", icon:"box", title:"SCENE STALLED", body:"Object streaming stopped at 812 of 1 204. Rendering is paused to save battery.", btn:"RESUME STREAMING", log:["! asset fetch timeout","> renderer paused"] },
  },
};
