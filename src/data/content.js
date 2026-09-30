import { app } from "../linkpoint/app.ts";
// Ported verbatim from the copy/content literals inside renderVals() in
// index.html — chat transcripts, friend/radar rosters, the
// inventory tree, map regions, profile blocks, login fields and the
// buildCards() function (the Friends/Groups/Notices/Teleport/Settings/
// Diagnostics card lists, including their accept/decline/toggle callbacks).

import { LAYOUTS } from "../theme/layouts.js";
import { PALETTES } from "../theme/palettes.js";

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
  { id: "Notecards", label: "NOTES", tile: "notecards", icon: "file-text" },
  { id: "Media", label: "MEDIA", tile: "media", icon: "radio" },
  { id: "Accounts", label: "ACCOUNTS", tile: "accounts", icon: "contact" },
  { id: "Grids", label: "GRIDS", tile: "grids", icon: "network" },
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
// The tree gained leaves under Clothing and Body Parts so the WORN sub-view has
// something to list: the 6th field tags an item `worn`, `recent` or both.
export const INVENTORY_SOURCE = [
  ["Inventory", "folder-root", 0, null, "v42"],
  ["Objects", "box", 1, "Inventory", "v18"],
  ["Sunset Lamp v3", "box", 2, "Objects", "", ["recent"]],
  ["Roof Kit (unpacked)", "box", 2, "Objects", "", ["recent"]],
  ["Clothing", "shirt", 1, "Inventory", "v9"],
  ["Urban Jacket", "shirt", 2, "Clothing", "", ["worn"]],
  ["Dark Jeans", "shirt", 2, "Clothing", "", ["worn"]],
  ["Work Boots", "shirt", 2, "Clothing", "", ["worn", "recent"]],
  ["Body Parts", "user", 1, "Inventory", "v4"],
  ["Ruth Classic Mesh", "user", 2, "Body Parts", "", ["worn"]],
  ["Shape — Nyx v4", "user", 2, "Body Parts", "", ["worn"]],
  ["Landmarks", "map-pin", 1, "Inventory", "v12"],
  ["Bay City — Hollywood", "map-pin", 2, "Landmarks", "", ["recent"]],
  ["Textures", "image", 1, "Inventory", "v31"],
  ["Brass Panel 512", "image", 2, "Textures", "", ["recent"]],
  ["Scripts", "file-code", 1, "Inventory", "v7"],
  ["Trash", "trash-2", 1, "Inventory", "v2"],
];
export const INVENTORY_FOLDERS = ["Inventory", "Objects", "Clothing", "Body Parts", "Landmarks", "Textures", "Scripts", "Trash"];
export const INVENTORY_RECENTS = ["Sunset Lamp v3", "Roof Kit", "Hollywood LM", "Brass texture"];

// A real SL profile splits the resident record from their picks; the blocks
// shown follow whichever sub-view is active.
export const PROFILE_BLOCKS = {
  "2ND LIFE": [
    { label: "2ND LIFE", body: "Builder, terraformer, occasional DJ. Bay City Builders officer. Ask me about mesh roofs." },
    { label: "GROUPS", body: "Bay City Builders · Sansara Cartographers · Terraform Co-op" },
    { label: "REZZED", body: "2007-03-14 · 19 years · payment info on file" },
  ],
  PICKS: [
    { label: "THE ROOF BUILD", body: "Bay City — Hollywood <112, 44, 51>. Mesh roof kit demo, up until the next build jam." },
    { label: "AHERN WELCOME AREA", body: "Ahern <128, 128, 24>. Where I answer build questions on Thursdays." },
    { label: "SANSARA RIDGE OVERLOOK", body: "Sansara Ridge <64, 200, 88>. Best sunset draw distance on the continent." },
  ],
};

// Cache contents, in notional megabytes. Both the Cache screen and the Settings
// row that links to it read this one table, so the totals can never disagree.
export const CACHE_ROWS = [
  { key: "tex",  icon: "image",          name: "Texture cache",       mb: 318, note: "4 812 textures · evicted least-recently-used" },
  { key: "mesh", icon: "box",            name: "Mesh & object cache", mb: 96,  note: "1 204 rezzed assets · LOD levels 0-3" },
  { key: "snd",  icon: "volume-2",       name: "Sound cache",         mb: 34,  note: "612 clips · gestures and ambient loops" },
  { key: "inv",  icon: "folder",         name: "Inventory skeleton",  mb: 21,  note: "1 284 items · 42 folders · synced 14:32" },
  { key: "map",  icon: "map",            name: "Map tiles",           mb: 12,  note: "96 region tiles · secondlife-maps-cdn" },
  { key: "chat", icon: "message-square", name: "Chat & IM logs",      mb: 4,   note: "38 conversations · kept on device only" },
];
export const cacheRows = (cleared = {}) => CACHE_ROWS.map((r) => ({ ...r, mb: cleared[r.key] ? 0 : r.mb }));
export const cacheUsed = (cleared = {}) => cacheRows(cleared).reduce((n, r) => n + r.mb, 0);

export const HEAD = (layoutName, paletteName, cacheState = {}) => ({
  Chat: ["CHAT", "> Ruth Resident @ Da Boom"],
  Friends: ["FRIENDS", "> 3 online / 8 total · live · sync 14:32:07"],
  Radar: ["RADAR", "> 6 avatars in region · 3 in chat range"],
  Map: ["WORLD MAP", "> Da Boom <1000, 1000> · 4 regions loaded"],
  Inventory: ["INVENTORY", "> 1 284 items · 42 folders · Ruth Resident"],
  Profile: ["PROFILE", "> resident record · nyx.vaher"],
  Groups: ["GROUPS", "> 12 of 42 slots · 3 unread notices"],
  Notices: ["NOTIFICATIONS", "> 4 offline IMs queued · autoresponse ON"],
  Teleport: ["TELEPORT", "> 9 landmarks · 5 recent destinations"],
  Settings: ["SETTINGS", "> " + layoutName + " layout / " + paletteName + " colour"],
  Cache: ["CACHE", "> " + cacheUsed(cacheState.cleared) + " MB of " + cacheState.limit + " MB · " + cacheState.loc],
  Diagnostics: ["DIAGNOSTICS", "> grid connectivity probe · agni"],
  // These five screens existed but had no HEAD entry, so they fell through to
  // ["", ""] and rendered an empty header band above their card list.
  Outfits: ["OUTFITS", "> 1 worn · 14 saved · Ruth Resident"],
  Objects: ["OBJECTS", "> 4 nearby · 25 prims in draw distance"],
  Parcel: ["PARCEL", "> Linden Public Park · Da Boom · general"],
  Transactions: ["L$ TRANSACTIONS", "> balance L$ 4 250 · 14 in the last 30 days"],
  "Mute List": ["MUTE LIST", "> 6 blocked · 3 residents / 3 objects"],
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
  const { dismissed, toggles, pinned, dense, prefs } = state;
  const used = cacheUsed(state.cacheCleared);
  const free = Math.max(0, prefs.cacheLimit - used);
  const opts = (vals) => vals.map((v) => ({ label: String(v), value: v }));
  return {
    Outfits: [
      { sub: "WORN", icon: "shirt", title: "Urban Casual v2 (Active)", right: "WORN", body: "12 items · Mesh body, jacket, jeans, boots", actions: [{ label: "EDIT OUTFIT", primary: true, pick: () => actions.notify("Editing Urban Casual v2") }] },
      { sub: "WORN", icon: "layers", title: "Worn attachments", right: "8", body: "Jacket, jeans, boots, hair, glasses · 4 HUDs on screen", actions: [{ label: "TAKE OFF ALL", dim: true, pick: () => actions.notify("Detached 8 attachments") }] },
      { sub: "SAVED", icon: "user-check", title: "Cyberpunk Tactical", right: "SAVED", body: "15 items · Exo-suit, visor, combat boots", actions: [{ label: "WEAR OUTFIT", primary: true, pick: () => actions.notify("Wearing Cyberpunk Tactical") }] },
      { sub: "SAVED", icon: "user-check", title: "Formal Eveningwear", right: "SAVED", body: "8 items · Tuxedo, dress shoes, watch", actions: [{ label: "WEAR OUTFIT", pick: () => actions.notify("Wearing Formal Eveningwear") }] },
      { sub: "SAVED", icon: "folder-archive", title: "Beach & Swimwear", right: "SAVED", body: "5 items · Boardshorts, sunglasses, sandals", actions: [{ label: "WEAR OUTFIT", pick: () => actions.notify("Wearing Beach & Swimwear") }] },
    ],
    Objects: [
      { sub: "NEARBY", icon: "box", title: "Sunset Lamp v3", right: "4 prims", body: "Owner: Kit Sandalwood · Scripted dimmer", actions: [{ label: "TOUCH", primary: true, pick: () => actions.notify("Touched Sunset Lamp v3") }, { label: "INSPECT", pick: () => actions.setTab("Objects", "INSPECT") }] },
      { sub: "NEARBY", icon: "door-closed", title: "Roof Access Door", right: "12 prims", body: "Owner: Da Boom Parcel · Auto-open script", actions: [{ label: "TOUCH", pick: () => actions.notify("Door activated") }] },
      { sub: "NEARBY", icon: "armchair", title: "Lounge Chair Deluxe", right: "8 prims", body: "Owner: Nyx Vaher · 14 sit animations", actions: [{ label: "SIT", primary: true, pick: () => actions.notify("Sat on Lounge Chair") }] },
      { sub: "NEARBY", icon: "trash-2", title: "Temp Build Platform", right: "1 prim", body: "Owner: Ruth Resident · Temporary object", actions: [{ label: "DEREZ / RETURN", dim: true, pick: () => actions.notify("Derezzed Temp Build Platform") }] },
      // INSPECT is the selected object's record — the same fields the tablet's
      // split-detail pane shows, as cards for the devices that have no split pane.
      { sub: "INSPECT", icon: "box", title: "Sunset Lamp v3", right: "selected", body: "Object · 4 prims · owner Kit Sandalwood · created 2026-08-14" },
      { sub: "INSPECT", icon: "map-pin", title: "Position", right: "Da Boom", body: "<128, 128, 26> · rotation <0, 0, 41°> · scale <0.4, 0.4, 1.2>" },
      { sub: "INSPECT", icon: "key", title: "Permissions", right: "copy / mod", body: "You can copy and modify this object. Transfer is not permitted." },
      { sub: "INSPECT", icon: "file-code", title: "Scripts", right: "1 running", body: "dimmer.lsl · 0.02 ms CPU · listens on channel -142", actions: [{ label: "RESET SCRIPTS", dim: true, pick: () => actions.notify("Sunset Lamp v3 — scripts reset") }] },
      { sub: "INSPECT", icon: "arrow-left", title: "Back to nearby", body: "Stop inspecting and return to the objects in draw distance.", actions: [{ label: "NEARBY OBJECTS", primary: true, pick: () => actions.setTab("Objects", "NEARBY") }] },
    ],
    Parcel: [
      { sub: "GENERAL", icon: "map-pin", title: "Linden Public Park", right: "4096 m²", body: "Sim: Da Boom <128, 128, 26> · Rating: General", actions: [{ label: "TELEPORT HERE", primary: true, pick: () => actions.setScreen("Map") }] },
      { sub: "GENERAL", icon: "user", title: "Parcel Owner", right: "Governor Linden", body: "Group: Linden Department of Public Works" },
      { sub: "GENERAL", icon: "layers", title: "Parcel Capacity", right: "1240 / 1875", body: "66% prim capacity used · 635 prims available", meter: 1240 / 1875 },
      { sub: "GENERAL", icon: "flag", title: "Parcel flags", body: "Voice enabled · scripts allowed · terraform by group · no fly restriction" },
      { sub: "MEDIA", icon: "radio", title: "Audio & music stream", body: "http://stream.sl-radio.net:8000/live", actions: [{ label: "PLAY STREAM", primary: true, pick: () => actions.notify("Playing region audio stream") }] },
      { sub: "MEDIA", icon: "monitor-play", title: "Shared media", right: "MOAP", body: "https://bay-city-builds.example/board · 512×512 on 2 faces", actions: [{ label: "OPEN MEDIA", pick: () => actions.notify("Parcel media — opening") }] },
      { sub: "MEDIA", icon: "play", title: "Autoplay parcel media", body: "Start this parcel's stream and shared media without asking each time.", toggle: true, on: toggles.mediaAuto, togglePick: () => actions.toggleSetting("mediaAuto") },
      { sub: "MEDIA", icon: "volume-2", title: "Master volume", right: prefs.volume, body: "Shared with Settings › Sound & voice.", select: true, options: opts(["Muted", "25%", "50%", "70%", "100%"]), value: prefs.volume, onChange: (v) => actions.setPref("volume", v) },
    ],
    // ALL lists every movement; PAYMENTS narrows to money leaving the account,
    // so the outgoing rows carry both tags and the incoming ones only ALL.
    Transactions: [
      { sub: ["ALL"], icon: "arrow-down-left", title: "Received L$ 1,200", right: "5h ago", body: "From Marlowe Quill for “Roof Kit”", accent: "ok" },
      { sub: ["ALL", "PAYMENTS"], icon: "arrow-up-right", title: "Paid L$ 350", right: "Yesterday", body: "To Bay City Land Co. for Parcel Rent", accent: "sec" },
      { sub: ["ALL", "PAYMENTS"], icon: "arrow-up-right", title: "Paid L$ 500", right: "Sep 12", body: "To Kit Sandalwood for Sculpted Light Rig" },
      { sub: ["ALL"], icon: "arrow-down-left", title: "Received L$ 2,500", right: "Sep 10", body: "From Event Payout · Build Jam Winner", accent: "ok" },
      { sub: ["ALL", "PAYMENTS"], icon: "arrow-up-right", title: "Paid L$ 99", right: "Sep 08", body: "To Aurora Dance Crew for Group Join Fee" },
    ],
    "Mute List": [
      { sub: "AVATARS", icon: "volume-x", title: "Griefing Spambot 9000", right: "AVATAR", body: "Muted text, voice & gestures · Sep 14", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Griefing Spambot 9000") }] },
      { sub: "AVATARS", icon: "volume-x", title: "Rezday Confetti Bot", right: "AVATAR", body: "Muted text & particles · Sep 09", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Rezday Confetti Bot") }] },
      { sub: "AVATARS", icon: "volume-x", title: "Marrow Ashdown", right: "AVATAR", body: "Muted voice only · Aug 28", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Marrow Ashdown") }] },
      { sub: "OBJECTS", icon: "box", title: "Noisy Emitter Prim", right: "OBJECT", body: "Muted object sounds · Sep 11", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Noisy Emitter Prim") }] },
      { sub: "OBJECTS", icon: "box", title: "Annoying Vendor Script", right: "OBJECT", body: "Muted chat spam · Sep 02", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Annoying Vendor Script") }] },
      { sub: "OBJECTS", icon: "box", title: "Roadside Ad Board", right: "OBJECT", body: "Muted chat spam · Aug 30", actions: [{ label: "UNMUTE", dim: true, pick: () => actions.notify("Unmuted Roadside Ad Board") }] },
    ],
    Friends: app.friends.getFriends().length
      ? app.friends.getFriends()
          .filter((f) => state.tabs.Friends !== "ONLINE" || f.onlineStatus === "online")
          .map((f) => ({
            title: f.name,
            body: f.onlineStatus === "online" ? "Online" : "Offline",
            icon: f.onlineStatus === "online" ? "circle-dot" : "circle",
            right: f.onlineStatus === "online" ? "IM" : "",
            actions: [
              {
                label: "IM",
                primary: true,
                pick: () => actions.startIm(f.name),
              },
            ],
          }))
      : [
          {
            icon: "users",
            title: app.auth.isLoggedIn() ? "No friends added" : "Not connected to grid",
            body: app.auth.isLoggedIn()
              ? "Your Second Life friends list is empty."
              : "Connect to a grid to view your friends.",
          },
        ],
    Groups: app.groups.getGroups().length
      ? app.groups.getGroups().map((g) => ({
          sub: "GROUPS",
          icon: "users",
          title: g.name,
          body: g.title ? "Title: " + g.title : "Group member",
          actions: [
            {
              label: "GROUP CHAT",
              primary: true,
              pick: () => {
                actions.setTab("Chat", "GROUP");
                actions.setChip(g.name);
                actions.setScreen("Chat");
              },
            },
          ],
        }))
      : [
          {
            sub: "GROUPS",
            icon: "users",
            title: app.auth.isLoggedIn() ? "No groups joined" : "Not connected to grid",
            body: app.auth.isLoggedIn()
              ? "You belong to no groups on this account."
              : "Connect to a grid to view your groups.",
          },
        ],
    // IM is person-to-person traffic; SYSTEM is everything the grid itself sent.
    Notices: [
      ...(dismissed.offlineIm
        ? []
        : [
            {
              sub: "IM", icon: "message-square", title: "Offline IM · Sable Ashgrove", right: "yesterday",
              body: "“the texture pack is in your inventory, no rush”",
              actions: [
                { label: "QUICK REPLY", primary: true, pick: () => { actions.dismiss("offlineIm"); actions.setTab("Chat", "IM"); actions.setChip("Sable Ashgrove"); actions.setScreen("Chat"); } },
                { label: "MARK READ", pick: () => actions.dismiss("offlineIm") },
              ],
            },
          ]),
      ...(dismissed.invOffer
        ? []
        : [
            {
              sub: "IM", icon: "package", title: "Inventory offer · Nyx Vaher", right: "2h",
              body: "Bay City Landmark Pack · folder, 6 items",
              actions: [
                { label: "DECLINE", dim: true, pick: () => actions.dismiss("invOffer") },
                { label: "ACCEPT", primary: true, pick: () => actions.dismiss("invOffer") },
              ],
            },
          ]),
      { sub: "IM", icon: "message-square", title: "Offline IM · Kit Sandalwood", right: "2d", body: "“ping me when you’re back, the roof needs one more pass”",
        actions: [{ label: "QUICK REPLY", primary: true, pick: () => { actions.setTab("Chat", "IM"); actions.setChip("Kit Sandalwood"); actions.setScreen("Chat"); } }] },
      { sub: "SYSTEM", icon: "banknote", title: "Payment received", right: "5h", body: "Marlowe Quill paid you L$ 1 200 for “Roof Kit”." },
      { sub: "SYSTEM", icon: "megaphone", title: "Group notice · Terraform Co-op", right: "8h", body: "Sim edge terraform freeze until Monday." },
      { sub: "SYSTEM", icon: "alert-triangle", title: "Estate message · Da Boom", right: "1d", body: "Region restarted for maintenance at 03:12 SLT." },
      { sub: "SYSTEM", icon: "bell-off", title: "Autoresponse is " + (toggles.autoresponse ? "ON" : "OFF"), body: "“On mobile — replies may be slow.” Sent 4 times today.",
        toggle: true, on: toggles.autoresponse, togglePick: () => actions.toggleSetting("autoresponse") },
    ],
    // LANDMARK is the saved places list; HISTORY is where you have actually been.
    Teleport: [
      { sub: "HISTORY", icon: "history", title: "Recent · Bay City — Hollywood", right: "14:02", body: "<112, 44, 51> · adult · 18 avatars",
        actions: [
          { label: "TELEPORT", primary: true, pick: () => actions.setScreen("Map") },
          { label: pinned.hollywood ? "PINNED" : "PIN", primary: pinned.hollywood, pick: () => actions.pin("hollywood") },
        ] },
      { sub: "HISTORY", icon: "history", title: "Recent · Sansara Ridge", right: "yesterday", body: "<64, 200, 88> · general" },
      { sub: "HISTORY", icon: "history", title: "Recent · Ahern Welcome Area", right: "2d", body: "<128, 128, 24> · moderate · 6 avatars" },
      { sub: "HISTORY", icon: "eraser", title: "Clear teleport history", body: "Removes the 5 recent destinations from this device.",
        actions: [{ label: "CLEAR HISTORY", dim: true, pick: () => actions.notify("Teleport history cleared") }] },
      { sub: "LANDMARK", icon: "star", title: "Home", body: "Da Boom <128, 128, 26>" },
      { sub: "LANDMARK", icon: "star", title: "The Roof Build", body: "Bay City — Hollywood <112, 44, 51>" },
      { sub: "LANDMARK", icon: "star", title: "Ahern Welcome Area", body: "Ahern <128, 128, 24>" },
      { sub: "LANDMARK", icon: "star", title: "Sansara Ridge overlook", body: "Sansara Ridge <64, 200, 88>" },
      { sub: "LANDMARK", icon: "map-pin", title: "Paste a SLURL", body: "secondlife:// … · or scan a QR from desktop" },
    ],
    // Preferences, grouped the way a viewer's Preferences window is: a `sect` row
    // opens each group, so the list reads as sections rather than 30 loose rows.
    Settings: [
      { sect: true, title: "SESSION" },
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

      { sect: true, title: "GEMINI AI & PROXY SETUP" },
      {
        icon: "cpu",
        title: "Gemini Grid Proxy",
        right: "ACTIVE · gemini-3.8-flash",
        body: "Google Gemini powers server-side Second Life protocol simulation, LLSD data handling, and proxy fallback.",
        actions: [
          {
            label: "CHECK PROXY HEALTH",
            primary: true,
            pick: async () => {
              try {
                const res = await fetch("/api/gemini/status");
                const data = await res.json();
                actions.notify(`Gemini Proxy: ${data.proxyType} (${data.model}) — ONLINE`);
              } catch {
                actions.notify("Gemini Proxy status check completed.");
              }
            },
          },
        ],
      },
      {
        icon: "sparkles",
        title: "AI In-World Resident Simulation",
        right: "ENABLED",
        body: "Generates authentic responses from virtual avatars (Nyx Vaher, Kit Sandalwood) in local chat.",
        actions: [
          {
            label: "TEST SIMULATED CHAT",
            pick: async () => {
              try {
                const res = await fetch("/api/gemini/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt: "Hey everyone at the welcome island!", speaker: "Nyx Vaher" }),
                });
                const data = await res.json();
                actions.notify(`${data.speaker}: ${data.reply}`);
              } catch {
                actions.notify("Simulated in-world message dispatched.");
              }
            },
          },
        ],
      },

      { sect: true, title: "APPEARANCE" },
      { icon: "palette", title: "Layout pack", right: layoutName, body: "6 layout packs: geometry, nav model, type and density. Colour is a separate pack.", actions: [{ label: "PREVIEW ALL", pick: () => actions.cycleLayout() }] },
      { icon: "layout", title: "Nav layout", body: "Tabs, rail, tiles, sweep console or desktop floaters — set by the pack.", select: true, options: Object.entries(LAYOUTS).map(([k, x]) => ({ label: x.name, value: k })), value: state.layout, onChange: (v) => actions.setLayout(v) },
      { icon: "droplets", title: "Colour pack", right: paletteName, body: "24 Ktheme palettes grouped by family; any pack drops into any layout (144 combinations).", actions: [{ label: "BROWSE PACKS", pick: () => actions.cyclePalette() }, { label: "SYSTEM MATCH", pick: () => actions.setPalette("ink") }] },
      { icon: "droplet", title: "Colour palette", body: "Pick a palette directly instead of cycling through them.", select: true, options: Object.keys(PALETTES).map((k) => ({ label: PALETTES[k].name, value: k })), value: state.palette, onChange: (v) => actions.setPalette(v) },
      { icon: "type", title: "Large type & high contrast", body: "Scales body to 18px, forces AA contrast, disables shimmer", toggle: true, on: toggles.largeType, togglePick: () => actions.toggleSetting("largeType") },
      {
        icon: "rows-3",
        title: "Compact density",
        body: dense ? "ON · Lumiya-style dense rows" : "OFF · comfortable rows",
        toggle: true,
        on: dense,
        togglePick: () => actions.setDense(!dense),
        actions: [{ label: dense ? "SWITCH TO COMFORTABLE" : "SWITCH TO COMPACT", primary: true, pick: () => actions.setDense(!dense) }],
      },

      { sect: true, title: "GRAPHICS & PERFORMANCE" },
      { icon: "eye", title: "Draw distance", right: prefs.draw, body: "How far objects and avatars stream in. Past 128 m mobile data and battery both suffer.", select: true, options: opts(["64 m", "96 m", "128 m", "192 m", "256 m"]), value: prefs.draw, onChange: (v) => actions.setPref("draw", v) },
      { icon: "gauge", title: "Graphics quality", right: prefs.quality, body: "Preset for LOD factor, particle count, reflections and terrain detail.", select: true, options: opts(["Low", "Balanced", "High", "Ultra"]), value: prefs.quality, onChange: (v) => actions.setPref("quality", v) },
      { icon: "activity", title: "Frame rate cap", right: prefs.fps, body: "Capping below the panel refresh is the single biggest battery win on mobile.", select: true, options: opts(["30 fps", "45 fps", "60 fps", "Uncapped"]), value: prefs.fps, onChange: (v) => actions.setPref("fps", v) },
      { icon: "user-round-x", title: "Avatar complexity limit", right: prefs.complexity, body: "Avatars heavier than this render as a coloured silhouette (jellydoll).", select: true, options: opts(["20 000", "40 000", "80 000", "160 000", "No limit"]), value: prefs.complexity, onChange: (v) => actions.setPref("complexity", v) },
      { icon: "sun", title: "Shadows & advanced lighting", body: "Off by default on mobile — roughly a third of the frame budget on a phone GPU.", toggle: true, on: toggles.shadows, togglePick: () => actions.toggleSetting("shadows") },
      { icon: "battery-charging", title: "Battery saver", body: "Drops to 30 fps, stops object streaming and pauses the scene when backgrounded.", toggle: true, on: toggles.battery, togglePick: () => actions.toggleSetting("battery") },

      { sect: true, title: "SOUND & VOICE" },
      { icon: "volume-2", title: "Master volume", right: prefs.volume, body: "Ambient, gestures, object sounds and UI feedback.", select: true, options: opts(["Muted", "25%", "50%", "70%", "100%"]), value: prefs.volume, onChange: (v) => actions.setPref("volume", v) },
      { icon: "mic", title: "Voice indicator", body: "Show speaking rings in radar and chat (listen-only on mobile)", toggle: true, on: toggles.voice, togglePick: () => actions.toggleSetting("voice") },
      { icon: "radio", title: "Autoplay parcel media", body: "Start a parcel's audio stream and shared media without asking first.", toggle: true, on: toggles.mediaAuto, togglePick: () => actions.toggleSetting("mediaAuto") },

      { sect: true, title: "CHAT & IM" },
      { icon: "keyboard", title: "Chat channel commands", body: "/1 gestures, /me, /shout mapped to compose-bar shortcuts", toggle: true, on: toggles.chatCmds, togglePick: () => actions.toggleSetting("chatCmds") },
      { icon: "clock", title: "Timestamps in local chat", body: "Prefix every line with its sim time, the way the desktop viewer does.", toggle: true, on: toggles.timestamps, togglePick: () => actions.toggleSetting("timestamps") },
      { icon: "save", title: "Keep IM logs on device", body: "Conversations are stored locally and never uploaded. Counts against the cache budget.", toggle: true, on: toggles.imLogs, togglePick: () => actions.toggleSetting("imLogs") },
      { icon: "languages", title: "Translate incoming chat", right: prefs.translate, body: "Machine translation of local chat and IMs into your language.", select: true, options: opts(["Off", "English", "Deutsch", "Français", "日本語", "Português"]), value: prefs.translate, onChange: (v) => actions.setPref("translate", v) },
      { icon: "pencil-line", title: "Send typing indicator", body: "Let the other side see that you are composing a reply.", toggle: true, on: toggles.typingSent, togglePick: () => actions.toggleSetting("typingSent") },
      { icon: "bell-off", title: "Autoresponse while away", body: "“On mobile — replies may be slow.” Sent 4 times today.", toggle: true, on: toggles.autoresponse, togglePick: () => actions.toggleSetting("autoresponse") },

      { sect: true, title: "NOTIFICATIONS" },
      { icon: "bell", title: "Push notifications", body: "IMs, group notices, teleport offers · quick reply from the shade", toggle: true, on: toggles.push, togglePick: () => actions.toggleSetting("push") },
      { icon: "layout-dashboard", title: "Widgets", body: "Unread IMs, nearby count, L$ balance — lock-screen glance" },

      { sect: true, title: "PRIVACY & SAFETY" },
      { icon: "shield", title: "Mute & block list", right: "6", body: "3 residents · 3 objects", actions: [{ label: "OPEN MUTE LIST", primary: true, pick: () => actions.setScreen("Mute List") }] },
      // The Permissions dialog tells the resident grants "can be revoked from
      // Settings › Scripted objects" — until now there was no such row to go to.
      {
        icon: "shield-alert",
        title: "Scripted object permissions",
        right: "4 granted",
        body: "Animate, attach and take-controls grants held by HUDs and objects you have touched.",
        actions: [
          { label: "REVIEW GRANTS", pick: () => actions.setDialog("Permissions") },
          { label: "REVOKE ALL", dim: true, pick: () => actions.notify("All scripted-object permissions revoked") },
        ],
      },
      { icon: "eye-off", title: "Show me as online", body: "When off, friends see you offline and your map position is hidden.", toggle: true, on: toggles.showOnline, togglePick: () => actions.toggleSetting("showOnline") },
      { icon: "lock", title: "RestrainedLove (RLV)", body: "Enable RLV script commands for viewer control & interactions", toggle: true, on: toggles.rlv, togglePick: () => actions.toggleSetting("rlv") },
      { icon: "badge-alert", title: "Maturity rating", right: prefs.maturity, body: "Which regions and search results this account is allowed to reach.", select: true, options: opts(["General", "Moderate", "Adult"]), value: prefs.maturity, onChange: (v) => actions.setPref("maturity", v) },

      { sect: true, title: "NETWORK & STORAGE" },
      { icon: "gauge", title: "Bandwidth limit", right: prefs.bandwidth, body: "Ceiling for asset streaming. Lower it on a metered connection.", select: true, options: opts(["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"]), value: prefs.bandwidth, onChange: (v) => actions.setPref("bandwidth", v) },
      {
        icon: "hard-drive",
        title: "Cache & storage",
        right: used + " / " + prefs.cacheLimit + " MB",
        body: "Texture, mesh, sound and inventory caches · " + prefs.cacheLoc.toLowerCase() + ".",
        meter: used / prefs.cacheLimit,
        actions: [{ label: "OPEN CACHE MANAGER", primary: true, pick: () => actions.setScreen("Cache") }],
      },
      { icon: "activity", title: "Connection diagnostics", body: "Latency, DNS, TLS handshake and sim circuit counters.", actions: [{ label: "RUN PROBE", pick: () => actions.setScreen("Diagnostics") }] },

      { sect: true, title: "ABOUT" },
      {
        icon: "info",
        title: "Linkpoint Mobile",
        right: "2.0",
        body: "build 2026.09.21 · " + ((actions.allGrids().find((g) => g.key === state.loginGrid) || {}).host || "offline") + " · open source, AGPL-3.0",
        actions: [
          { label: "RELEASE NOTES", pick: () => actions.notify("Release notes — 2.0 (2026.09.21)") },
          { label: "REPORT A BUG", pick: () => actions.notify("Bug report — opening issue tracker") },
        ],
      },
    ],
    // Cache was one row on Settings with a single CLEAR CACHE button and no way to
    // see what was actually using the space. It is its own screen now.
    Cache: [
      {
        icon: "hard-drive",
        title: "Disk cache",
        right: used + " / " + prefs.cacheLimit + " MB",
        body: free + " MB free before the oldest assets start being evicted. Clearing a cache is safe — anything still in use is refetched from the sim.",
        meter: used / prefs.cacheLimit,
        actions: [
          { label: "CLEAR ALL", dim: true, pick: () => actions.clearAllCache() },
          { label: "REFRESH", pick: () => actions.notify("Cache recalculated — " + used + " MB in use") },
        ],
      },
      { sect: true, title: "BY ASSET TYPE" },
      ...cacheRows(state.cacheCleared).map((r) => ({
        icon: r.icon,
        title: r.name,
        right: r.mb + " MB",
        body: r.mb === 0 ? "empty · refills as assets are requested" : r.note,
        meter: r.mb / (prefs.cacheLimit || 1),
        actions: r.mb === 0 ? null : [{ label: "CLEAR", dim: true, pick: () => actions.clearCache(r.key, r.name) }],
      })),
      { sect: true, title: "POLICY" },
      {
        icon: "database",
        title: "Cache size limit",
        right: prefs.cacheLimit + " MB",
        body: "A bigger cache means fewer refetches and a longer first-visit wait after you clear it.",
        select: true,
        options: [128, 256, 512, 1024, 2048].map((v) => ({ label: v + " MB", value: v })),
        value: prefs.cacheLimit,
        onChange: (v) => actions.setPref("cacheLimit", Number(v)),
      },
      {
        icon: "folder-open",
        title: "Cache location",
        right: prefs.cacheLoc,
        body: "Moving the cache copies it and clears the old location.",
        select: true,
        options: opts(["Internal storage", "SD card", "App sandbox"]),
        value: prefs.cacheLoc,
        onChange: (v) => actions.setPref("cacheLoc", v),
      },
      { icon: "trash-2", title: "Clear cache on exit", body: "Frees the space every time you log out, at the cost of a cold start next session.", toggle: true, on: toggles.cacheOnExit, togglePick: () => actions.toggleSetting("cacheOnExit") },
      {
        icon: "refresh-cw",
        title: "Rebuild inventory skeleton",
        body: "Refetch all 1 284 items and 42 folders from the grid. Use this when inventory looks wrong.",
        actions: [{ label: "REBUILD NOW", pick: () => actions.notify("Inventory skeleton rebuilding — 1 284 items") }],
      },
    ],
    // AGNI and ADITI are two different grids, so the probe reports two different
    // sets of numbers — the tabs used to be highlight-only.
    Diagnostics: [
      { sub: "AGNI", title: "LATENCY", big: "84", body: "> excellent · agni · round trip", tone: "ok" },
      { sub: "AGNI", title: "DNS", right: "12 ms", body: "OK · login.agni.lindenlab.com", accent: "ok" },
      { sub: "AGNI", title: "TCP / TLS", right: "38 ms", body: "OK · handshake reachable", accent: "ok" },
      { sub: "AGNI", title: "SIM CIRCUIT", right: "live", body: "rx 18 204 / tx 6 118 packets · 0.2% loss" },
      { sub: "AGNI", title: "ENDPOINT", body: "viewer Linkpoint Mobile 2.0 · server_time 2026-09-10T14:32:07Z" },
      { sub: "AGNI", title: "CAPS", body: "display names OK · event queue OK · avatar picker OK · inventory skeleton OK" },
      { sub: "ADITI", title: "LATENCY", big: "212", body: "> fair · aditi · round trip", tone: "sec2" },
      { sub: "ADITI", title: "DNS", right: "34 ms", body: "OK · login.aditi.lindenlab.com", accent: "ok" },
      { sub: "ADITI", title: "TCP / TLS", right: "96 ms", body: "OK · handshake reachable · beta certificate", accent: "ok" },
      { sub: "ADITI", title: "SIM CIRCUIT", right: "idle", body: "no agent on this grid · last session 2026-08-30" },
      { sub: "ADITI", title: "ENDPOINT", body: "viewer Linkpoint Mobile 2.0 · server_time 2026-09-10T14:32:11Z · beta channel" },
      { sub: "ADITI", title: "CAPS", body: "display names OK · event queue OK · avatar picker DEGRADED · inventory skeleton OK", accent: "sec2" },
    ],
  };
}
