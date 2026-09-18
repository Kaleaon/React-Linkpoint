// Ported verbatim from the copy/content literals inside renderVals() in
// index.html — chat transcripts, friend/radar rosters, the
// inventory tree, map regions, profile blocks, login fields and the
// buildCards() function (the Friends/Groups/Notices/Teleport/Settings/
// Diagnostics card lists, including their accept/decline/toggle callbacks).

// Ported from `nvAll`/`nvList` — the 7-item navigation model shared by every
// nav rendering (tabs/rail/tiles/sweep rail/console rail/desktop peek menu).
export const NAV_ALL = [
  { id: "Chat", label: "CHAT", tile: "chat", icon: "message-square", badge: 3 },
  { id: "Friends", label: "FRIENDS", tile: "people", icon: "users" },
  { id: "Radar", label: "RADAR", tile: "radar", icon: "radar" },
  { id: "Map", label: "MAP", tile: "map", icon: "map" },
  { id: "3D View", label: "3D WORLD", tile: "3d", icon: "box" },
  { id: "Inventory", label: "INV", tile: "inventory", icon: "folder" },
  { id: "Outfits", label: "OUTFITS", tile: "outfits", icon: "shirt" },
  { id: "Objects", label: "OBJECTS", tile: "objects", icon: "box" },
  { id: "Parcel", label: "PARCEL", tile: "parcel", icon: "map-pin" },
  { id: "Transactions", label: "L$", tile: "money", icon: "banknote" },
  { id: "Mute List", label: "MUTED", tile: "muted", icon: "volume-x" },
  { id: "Settings", label: "MORE", tile: "settings", icon: "settings" },
];
// TABS nav (Ink Terminal, Aero Glass, Press) drops Inventory; rail/tiles/sweep keep all 7.
export const TABS_NAV_IDS = ["Chat", "Friends", "Radar", "Map", "3D View", "Settings"];

export const IM_CHIPS = ["Nyx Vaher", "Kit Sandalwood", "Sable Ashgrove"];
export const GROUP_CHIPS = ["Bay City Builders", "Ruthless Roofers"];

export const LOCAL_MSGS = [
  { ts: "14:21", sender: "Nyx Vaher", text: "the roof build is up — teleport when you're free" },
  { ts: "14:22", sender: "Ruth Resident", text: "on my way, just rezzing the last sculpt", me: true },
  { ts: "14:24", sender: "System", text: "Kit Sandalwood is online.", sys: true },
  { ts: "14:25", sender: "Kit Sandalwood", text: "@Ruth check the landmark, second floor entrance", linkTitle: "Bay City — Hollywood", linkUrl: "secondlife://Hollywood/112/44/51" },
  { ts: "14:27", sender: "Ruth Resident", text: "got it 👍", me: true },
  { ts: "14:29", sender: "Nyx Vaher", text: "bringing the light rig over, one sec" },
];

export const IM_THREADS = {
  "Nyx Vaher": [
    { ts: "13:52", sender: "Nyx Vaher", text: "you still at the build site?" },
    { ts: "13:53", sender: "Ruth Resident", text: "yeah, finishing the roof trim", me: true },
    { ts: "13:54", sender: "Nyx Vaher", text: "send me the landmark when it's done" },
    { ts: "13:58", sender: "Ruth Resident", text: "will do — maybe 10 more min", me: true },
  ],
  "Kit Sandalwood": [
    { ts: "13:40", sender: "Kit Sandalwood", text: "reslotted the brass texture, check inventory", linkTitle: "Bay City — Hollywood", linkUrl: "secondlife://Hollywood/112/44/51" },
    { ts: "13:41", sender: "Kit Sandalwood", text: "lmk if the UVs still look off" },
    { ts: "13:47", sender: "Ruth Resident", text: "looking now, one sec", me: true },
  ],
  "Sable Ashgrove": [{ ts: "yesterday", sender: "Sable Ashgrove", text: "the texture pack is in your inventory, no rush" }],
};

export const GROUP_THREADS = {
  "Bay City Builders": [
    { ts: "12:10", sender: "Marlowe Quill", text: "meeting moved to 6pm SLT" },
    { ts: "12:12", sender: "Ruth Resident", text: "works for me", me: true },
    { ts: "12:15", sender: "System", text: "Sable Ashgrove joined the group.", sys: true },
  ],
  "Ruthless Roofers": [
    { ts: "11:02", sender: "Oren Fairweather", text: "anyone have a spare roofing script?" },
    { ts: "11:05", sender: "Ruth Resident", text: "I do, sending a copy now", me: true },
    { ts: "11:06", sender: "Oren Fairweather", text: "you're a lifesaver" },
  ],
};

// [name, meta, online, rights] — rights are the classic SL friend permissions:
// eye = can see me online, map-pin = can see me on the map, pencil = can modify my objects.
export const FRIEND_ROWS = [
  ["Nyx Vaher", "ONLINE · id 4f2a9c11", true, ["eye", "map-pin", "pencil"]],
  ["Kit Sandalwood", "ONLINE · id 8b71ee02", true, ["eye", "map-pin"]],
  ["Marlowe Quill", "ONLINE · id 22c4a5de", true, ["eye"]],
  ["Sable Ashgrove", "OFFLINE · seen 2d ago", false, ["eye", "map-pin"]],
  ["Tamsin Reed", "OFFLINE · seen 5d ago", false, ["eye"]],
  ["Oren Fairweather", "OFFLINE · seen 1w ago", false, []],
];

// Grid residents who show up in Search but aren't friends yet.
export const SEARCH_STRANGERS = ["Lyra Sunspire", "Cove Ashworth", "Petra Vantage", "Wren Halloway"];

// Radar, Firestorm-style: [name, distance-m, bearing-deg, meta, icon]
export const RADAR_AVATARS = [
  ["Nyx Vaher", 8, 45, "friend · typing · payment info used", "user-round"],
  ["Kit Sandalwood", 17, 10, "friend · voice active", "user-round"],
  ["Marlowe Quill", 34, 95, "age 14d · payment info on file", "user"],
  ["Bramble Vex", 48, 220, "age 3y · no payment info", "user"],
  ["Juno Halcyon", 112, 175, "beyond shout range", "user"],
  ["Wren Ostara", 146, 310, "beyond draw distance", "user"],
];
export const RADAR_OBJECTS = [
  ["Vendor — Sunset Lamp v3", 6, 60, "Kit Sandalwood · 4 prims · 0.21ms", "box"],
  ["Particle fountain", 14, 120, "Linden Public · 240 particles/s", "sparkles"],
  ["Security orb", 22, 200, "Marlowe Quill · scans every 5s", "shield-alert"],
  ["Dance ball", 31, 15, "Juno Halcyon · 1 script · 0.04ms", "circle-dot"],
  ["Rezzing platform", 58, 285, "you · 128 prims · no scripts", "layers"],
];
export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export const REGIONS = [
  ["Da Boom", "you are here · 34 avatars"],
  ["Bay City — Hollywood", "18 avatars · adult"],
  ["Ahern", "6 avatars · moderate"],
  ["Sansara Ridge", "0 avatars · general"],
];

// [name, icon, depth, parent, version]
export const INVENTORY_SOURCE = [
  ["Inventory", "folder-star", 0, null, "v42"],
  ["Objects", "box", 1, "Inventory", "v18"],
  ["Sunset Lamp v3", "box", 2, "Objects", ""],
  ["Roof Kit (unpacked)", "box", 2, "Objects", ""],
  ["Clothing", "shirt", 1, "Inventory", "v9"],
  ["Body Parts", "user", 1, "Inventory", "v4"],
  ["Landmarks", "map-pin", 1, "Inventory", "v12"],
  ["Bay City — Hollywood", "map-pin", 2, "Landmarks", ""],
  ["Textures", "image", 1, "Inventory", "v31"],
  ["Scripts", "file-code", 1, "Inventory", "v7"],
  ["Trash", "trash-2", 1, "Inventory", "v2"],
];
export const INVENTORY_FOLDERS = ["Inventory", "Objects", "Clothing", "Body Parts", "Landmarks", "Textures", "Scripts", "Trash"];
export const INVENTORY_RECENTS = ["Sunset Lamp v3", "Roof Kit", "Hollywood LM", "Brass texture"];

export const PROFILE_BLOCKS = [
  { label: "2ND LIFE", body: "Builder, terraformer, occasional DJ. Bay City Builders officer. Ask me about mesh roofs." },
  { label: "GROUPS", body: "Bay City Builders · Sansara Cartographers · Terraform Co-op" },
  { label: "PICKS", body: "The Roof Build · Ahern Welcome Area · Sansara Ridge overlook" },
];

export const HEAD = (layoutName, paletteName) => ({
  Chat: ["CHAT", "> Ruth Resident @ Da Boom"],
  Friends: ["FRIENDS", "> 3 online / 8 total · live · sync 14:32:07"],
  Radar: ["RADAR", "> 6 avatars in region · 3 in chat range"],
  Map: ["WORLD MAP", "> Da Boom <1000, 1000> · 4 regions loaded"],
  Inventory: ["INVENTORY", "> 1 284 items · 42 folders · Ruth Resident"],
  Profile: ["PROFILE", "> resident record · nyx.vaher"],
  Groups: ["GROUPS", "> 12 of 42 slots · 3 unread notices"],
  Notices: ["NOTIFICATIONS", "> 4 offline IMs queued · autoresponse ON"],
  Teleport: ["TELEPORT", "> 9 landmarks · 5 recent destinations"],
  Settings: ["SETTINGS", "> " + layoutName + " / " + paletteName],
  Diagnostics: ["DIAGNOSTICS", "> grid connectivity probe · agni"],
  "3D View": ["", ""],
  Login: ["", ""],
});

export const DETAIL = {
  Chat: {
    title: "Nyx Vaher · IM",
    sub: "online · Da Boom · voice off",
    rows: [
      ["14:21 Nyx", "the roof build is up — teleport when you're free"],
      ["14:22 you", "on my way, just rezzing the last sculpt"],
      ["14:25 Nyx", "bring the light rig if you have it"],
      ["14:26 you", "packing it now"],
    ],
  },
  Outfits: { title: "Urban Casual v2", sub: "outfit · 12 items worn · active outfit",
    rows: [["BASE AVATAR", "Ruth Classic Mesh"], ["ATTACHMENTS", "8 rigged mesh items · 4 HUDs"], ["FOLDER", "My Outfits / Urban Casual v2"], ["ACTIONS", "Wear · Replace · Add · Take Off"]] },
  Objects: { title: "Sunset Lamp v3", sub: "object · 4 prims · owner Kit Sandalwood",
    rows: [["PARCEL", "Da Boom <128, 128, 26>"], ["PERMISSIONS", "copy · modify · no transfer"], ["SCRIPT STATE", "1 script running · 0.02ms CPU time"], ["ACTIONS", "Touch · Pay L$ · Inspect · Derezz"]] },
  Parcel: { title: "Linden Public Park", sub: "parcel · 4096 sq.m. · general rating",
    rows: [["OWNER", "Governor Linden"], ["PRIM USAGE", "1 240 / 1 875 prims (66%)"], ["AUDIO STREAM", "http://stream.sl-radio.net:8000/live"], ["FLAGS", "Voice Enabled · No Script Restrict · Edit Land"]] },
  Transactions: { title: "L$ Balance: 4,250", sub: "last 30 days · 14 transactions",
    rows: [["LAST PAYMENT", "+L$ 1,200 from Marlowe Quill"], ["TOTAL SPENT", "L$ 3,450 this month"], ["TOTAL EARNED", "L$ 8,900 this month"], ["FILTER", "All transactions"]] },
  "Mute List": { title: "Blocked Entities", sub: "6 blocked items · 3 residents · 3 objects",
    rows: [["SETTINGS", "Block text chat · voice · inventory offers"], ["LAST BLOCKED", "Spam Bot v4 (yesterday)"], ["STORAGE", "Synced with Second Life server"]] },
  Inventory: {
    title: "Sunset Lamp v3",
    sub: "object · 4 prims · copy / mod / no-transfer",
    rows: [
      ["ACQUIRED", "2026-08-14 from Kit Sandalwood"],
      ["PERMISSIONS", "copy · modify · no transfer"],
      ["DESCRIPTION", "Warm brass lamp, scripted dimmer on channel -142."],
      ["ACTIONS", "Wear · Rez here · Rename · Move to Trash"],
    ],
  },
  Radar: {
    title: "Da Boom — region map",
    sub: "34 avatars · 4 parcels · restart in 2h",
    rows: [
      ["YOUR POSITION", "<128, 128, 26> · draw distance 96m"],
      ["PARCEL", "Linden Public · general · voice enabled"],
      ["NEARBY FRIENDS", "Nyx Vaher 8m · Kit Sandalwood 17m"],
      ["SCRIPTS", "1 204 running · 0.8ms frame time"],
    ],
  },
};

// Builds the CARDS[scr] arrays exactly like the mockup, wiring each card's
// actions to the same state transitions (dismiss/pin/toggleSetting/tab+screen
// navigation/cycle layout & palette).
export function buildCards({ state, actions, layoutName, paletteName }) {
  const { dismissed, toggles, pinned, dense } = state;
  return {
    Outfits: [
      { icon: "shirt", title: "Urban Casual v2 (Active)", right: "WORN", body: "12 items · Mesh body, jacket, jeans, boots", actions: [{ label: "EDIT OUTFIT", primary: true, pick: () => actions.notify("Editing Urban Casual v2") }] },
      { icon: "user-check", title: "Cyberpunk Tactical", right: "SAVED", body: "15 items · Exo-suit, visor, combat boots", actions: [{ label: "WEAR OUTFIT", primary: true, pick: () => actions.notify("Wearing Cyberpunk Tactical") }] },
      { icon: "user-check", title: "Formal Eveningwear", right: "SAVED", body: "8 items · Tuxedo, dress shoes, watch", actions: [{ label: "WEAR OUTFIT", pick: () => actions.notify("Wearing Formal Eveningwear") }] },
      { icon: "folder-archive", title: "Beach & Swimwear", right: "SAVED", body: "5 items · Boardshorts, sunglasses, sandals", actions: [{ label: "WEAR OUTFIT", pick: () => actions.notify("Wearing Beach & Swimwear") }] },
    ],
    Objects: [
      { icon: "box", title: "Sunset Lamp v3", right: "4 prims", body: "Owner: Kit Sandalwood · Scripted dimmer", actions: [{ label: "TOUCH", primary: true, pick: () => actions.notify("Touched Sunset Lamp v3") }, { label: "PAY L$", pick: () => actions.setDialog("pay") }] },
      { icon: "door-closed", title: "Roof Access Door", right: "12 prims", body: "Owner: Da Boom Parcel · Auto-open script", actions: [{ label: "TOUCH", pick: () => actions.notify("Door activated") }] },
      { icon: "armchair", title: "Lounge Chair Deluxe", right: "8 prims", body: "Owner: Nyx Vaher · 14 sit animations", actions: [{ label: "SIT", primary: true, pick: () => actions.notify("Sat on Lounge Chair") }] },
      { icon: "trash-2", title: "Temp Build Platform", right: "1 prim", body: "Owner: Ruth Resident · Temporary object", actions: [{ label: "DEREZ / RETURN", dim: true, pick: () => actions.notify("Derezzed Temp Build Platform") }] },
    ],
    Parcel: [
      { icon: "map-pin", title: "Linden Public Park", right: "4096 m²", body: "Sim: Da Boom <128, 128, 26> · Rating: General", actions: [{ label: "TELEPORT HERE", primary: true, pick: () => actions.setScreen("Map") }] },
      { icon: "user", title: "Parcel Owner", right: "Governor Linden", body: "Group: Linden Department of Public Works" },
      { icon: "radio", title: "Audio & Music Stream", body: "http://stream.sl-radio.net:8000/live", actions: [{ label: "PLAY STREAM", primary: true, pick: () => actions.notify("Playing region audio stream") }] },
      { icon: "layers", title: "Parcel Capacity", right: "1240 / 1875", body: "66% prim capacity used · 635 prims available" },
    ],
    Transactions: [
      { icon: "arrow-down-left", title: "Received L$ 1,200", right: "5h ago", body: "From Marlowe Quill for “Roof Kit”", accent: "ok" },
      { icon: "arrow-up-right", title: "Paid L$ 350", right: "Yesterday", body: "To Bay City Land Co. for Parcel Rent", accent: "sec" },
      { icon: "arrow-up-right", title: "Paid L$ 500", right: "Sep 12", body: "To Kit Sandalwood for Sculpted Light Rig" },
      { icon: "arrow-down-left", title: "Received L$ 2,500", right: "Sep 10", body: "From Event Payout · Build Jam Winner", accent: "ok" },
    ],
    "Mute List": [
      { icon: "volume-x", title: "Griefing Spambot 9000", right: "AVATAR", body: "Muted text, voice & gestures · Sep 14", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Griefing Spambot 9000") }] },
      { icon: "box", title: "Noisy Emitter Prim", right: "OBJECT", body: "Muted object sounds · Sep 11", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Noisy Emitter Prim") }] },
      { icon: "volume-x", title: "Annoying Vendor Script", right: "OBJECT", body: "Muted chat spam · Sep 02", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Annoying Vendor Script") }] },
    ],
    Friends: [
      ...(state.tabs.Friends === "ONLINE" || dismissed.friendReq
        ? []
        : [
            {
              icon: "user-plus",
              title: "Kit Sandalwood",
              right: "14:28",
              body: "“met you at the Bay City build jam”",
              accent: "sec2",
              actions: [
                { label: "DECLINE", dim: true, pick: () => actions.dismiss("friendReq") },
                { label: "ACCEPT", primary: true, pick: () => actions.dismiss("friendReq") },
              ],
            },
          ]),
      ...FRIEND_ROWS.filter(([, , online]) => state.tabs.Friends !== "ONLINE" || online).map(([n, m, online, rights]) => ({
        title: n,
        body: m,
        icon: online ? "circle-dot" : "circle",
        right: online ? "IM" : "",
        rights,
      })),
    ],
    Groups: [
      ...(dismissed.groupNotice
        ? []
        : [
            {
              icon: "megaphone",
              title: "Notice · Bay City Builders",
              right: "2h",
              body: "Build jam Saturday 14:00 SLT — landmark attached.",
              accent: "pri",
              actions: [
                { label: "KEEP LANDMARK", pick: () => actions.dismiss("groupNotice") },
                {
                  label: "OPEN CHAT",
                  primary: true,
                  pick: () => {
                    actions.setTab("Chat", "GROUP");
                    actions.setChip("Bay City Builders");
                    actions.setScreen("Chat");
                  },
                },
              ],
            },
          ]),
      { icon: "users", title: "Bay City Builders", body: "412 members · officer · notices on", badge: 4 },
      { icon: "users", title: "Sansara Cartographers", body: "88 members · member · notices on" },
      { icon: "users", title: "Terraform Co-op", body: "1 204 members · member · muted", badge: 12 },
      { icon: "users", title: "Mono Script Guild", body: "56 members · member · notices off" },
      ...(dismissed.groupInvite
        ? []
        : [
            {
              icon: "user-plus",
              title: "Invite · Aurora Dance Crew",
              body: "Nyx Vaher invited you — no join fee.",
              accent: "sec2",
              actions: [
                { label: "IGNORE", dim: true, pick: () => actions.dismiss("groupInvite") },
                { label: "JOIN", primary: true, pick: () => actions.dismiss("groupInvite") },
              ],
            },
          ]),
    ],
    Notices: [
      ...(dismissed.offlineIm
        ? []
        : [
            {
              icon: "message-square",
              title: "Offline IM · Sable Ashgrove",
              right: "yesterday",
              body: "“the texture pack is in your inventory, no rush”",
              actions: [
                {
                  label: "QUICK REPLY",
                  primary: true,
                  pick: () => {
                    actions.dismiss("offlineIm");
                    actions.setTab("Chat", "IM");
                    actions.setChip("Sable Ashgrove");
                    actions.setScreen("Chat");
                  },
                },
                { label: "MARK READ", pick: () => actions.dismiss("offlineIm") },
              ],
            },
          ]),
      ...(dismissed.invOffer
        ? []
        : [
            {
              icon: "package",
              title: "Inventory offer · Nyx Vaher",
              right: "2h",
              body: "Bay City Landmark Pack · folder, 6 items",
              actions: [
                { label: "DECLINE", dim: true, pick: () => actions.dismiss("invOffer") },
                { label: "ACCEPT", primary: true, pick: () => actions.dismiss("invOffer") },
              ],
            },
          ]),
      { icon: "banknote", title: "Payment received", right: "5h", body: "Marlowe Quill paid you L$ 1 200 for “Roof Kit”." },
      { icon: "megaphone", title: "Group notice · Terraform Co-op", right: "8h", body: "Sim edge terraform freeze until Monday." },
      {
        icon: "bell-off",
        title: "Autoresponse is " + (toggles.autoresponse ? "ON" : "OFF"),
        body: "“On mobile — replies may be slow.” Sent 4 times today.",
        toggle: true,
        on: toggles.autoresponse,
        togglePick: () => actions.toggleSetting("autoresponse"),
      },
    ],
    Teleport: [
      {
        icon: "history",
        title: "Recent · Bay City — Hollywood",
        right: "14:02",
        body: "<112, 44, 51> · adult · 18 avatars",
        actions: [
          { label: "TELEPORT", primary: true, pick: () => actions.setScreen("Map") },
          { label: pinned.hollywood ? "PINNED" : "PIN", primary: pinned.hollywood, pick: () => actions.pin("hollywood") },
        ],
      },
      { icon: "star", title: "Home", body: "Da Boom <128, 128, 26>" },
      { icon: "star", title: "The Roof Build", body: "Bay City — Hollywood <112, 44, 51>" },
      { icon: "star", title: "Ahern Welcome Area", body: "Ahern <128, 128, 24>" },
      { icon: "history", title: "Recent · Sansara Ridge", right: "yesterday", body: "<64, 200, 88> · general" },
      { icon: "map-pin", title: "Paste a SLURL", body: "secondlife:// … · or scan a QR from desktop" },
    ],
    Settings: [
      {
        icon: "user",
        title: "Session",
        right:
          state.loginMode === "offline"
            ? "offline"
            : "grid · " + ((actions.allGrids().find((g) => g.key === state.loginGrid) || {}).label || state.loginGrid),
        body:
          "Ruth Resident · Da Boom · agent 22c4a5de-11 · sim link " +
          (state.reconnecting ? "reconnecting…" : "LIVE · rx 18 204 / tx 6 118"),
      },
      {
        icon: "plug-zap",
        title: "Reconnect to grid",
        body: "Manually re-open the sim circuit without a full re-login.",
        actions: [
          {
            label: state.reconnecting ? "RECONNECTING…" : "RECONNECT",
            primary: !state.reconnecting,
            pick: state.reconnecting ? () => {} : () => actions.reconnect(),
          },
        ],
      },
      {
        icon: "log-out",
        title: "Disconnect",
        body: "Ends this session and returns to the login screen.",
        accent: "err",
        actions: [{ label: "DISCONNECT", dim: true, pick: () => actions.setScreen("Login") }],
      },
      {
        icon: "palette",
        title: "Layout pack",
        right: layoutName,
        body: "6 layout packs: geometry, nav model, type and density. Colour is a separate pack.",
        actions: [{ label: "PREVIEW ALL", pick: () => actions.cycleLayout() }],
      },
      {
        icon: "droplets",
        title: "Colour pack",
        right: paletteName,
        body: "24 Ktheme palettes grouped by family; any pack drops into any layout (144 combinations).",
        actions: [
          { label: "BROWSE PACKS", pick: () => actions.cyclePalette() },
          { label: "SYSTEM MATCH", pick: () => actions.setPalette("ink") },
        ],
      },
      {
        icon: "type",
        title: "Large type & high contrast",
        body: "Scales body to 18px, forces AA contrast, disables shimmer",
        toggle: true,
        on: toggles.largeType,
        togglePick: () => actions.toggleSetting("largeType"),
      },
      {
        icon: "rows-3",
        title: "Compact density",
        body: dense ? "ON · Lumiya-style dense rows" : "OFF · comfortable rows",
        toggle: true,
        on: dense,
        togglePick: () => actions.setDense(!dense),
        actions: [{ label: dense ? "SWITCH TO COMFORTABLE" : "SWITCH TO COMPACT", primary: true, pick: () => actions.setDense(!dense) }],
      },
      {
        icon: "bell",
        title: "Push notifications",
        body: "IMs, group notices, teleport offers · quick reply from the shade",
        toggle: true,
        on: toggles.push,
        togglePick: () => actions.toggleSetting("push"),
      },
      {
        icon: "mic",
        title: "Voice indicator",
        body: "Show speaking rings in radar and chat (listen-only on mobile)",
        toggle: true,
        on: toggles.voice,
        togglePick: () => actions.toggleSetting("voice"),
      },
      { icon: "shield", title: "Mute & block list", right: "6", body: "3 residents · 3 objects", actions: [{ label: "OPEN MUTE LIST", primary: true, pick: () => actions.setScreen("Mute List") }] },
      { icon: "lock", title: "RestrainedLove (RLV)", body: "Enable RLV script commands for viewer control & interactions", toggle: true, on: toggles.rlv || false, togglePick: () => actions.toggleSetting("rlv") },
      { icon: "hard-drive", title: "Cache Management", right: "512 MB", body: "Texture & asset disk cache size and storage location", actions: [{ label: "CLEAR CACHE", dim: true, pick: () => actions.notify("Cache cleared — restart viewer to apply") }] },
      {
        icon: "keyboard",
        title: "Chat channel commands",
        body: "/1 gestures, /me, /shout mapped to compose-bar shortcuts",
        toggle: true,
        on: toggles.chatCmds,
        togglePick: () => actions.toggleSetting("chatCmds"),
      },
      { icon: "layout-dashboard", title: "Widgets", body: "Unread IMs, nearby count, L$ balance — lock-screen glance" },
    ],
    Diagnostics: [
      { title: "LATENCY", big: "84", body: "> excellent · agni · round trip", tone: "ok" },
      { title: "DNS", right: "12 ms", body: "OK · login.agni.lindenlab.com", accent: "ok" },
      { title: "TCP / TLS", right: "38 ms", body: "OK · handshake reachable", accent: "ok" },
      { title: "SIM CIRCUIT", right: "live", body: "rx 18 204 / tx 6 118 packets · 0.2% loss" },
      { title: "ENDPOINT", body: "viewer Linkpoint Mobile 2.0 · server_time 2026-09-10T14:32:07Z" },
      { title: "CAPS", body: "display names OK · event queue OK · avatar picker OK · inventory skeleton OK" },
    ],
  };
}
