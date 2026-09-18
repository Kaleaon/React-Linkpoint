// Ported verbatim from the `DIALOGS` constant — the 6 SL "system moments" sheets.
export const DIALOGS = {
  "llDialog": { icon:"box", kind:"SCRIPTED OBJECT", title:"Vendor — Sunset Lamp v3", body:"Touch a swatch to preview. Delivery is instant and copies are transferable.",
    meta:"object: Sunset Lamp · owner: Kit Sandalwood · channel -142", buttons:[{label:"BRASS"},{label:"WALNUT"},{label:"MATTE BLACK"},{label:"PREVIEW ALL"},{label:"IGNORE",dim:true},{label:"BLOCK OBJECT",dim:true}] },
  "Permissions": { icon:"shield-alert", kind:"PERMISSION REQUEST", title:"“Aurora Dance HUD” wants to animate your avatar",
    body:"Also requests: attach to your avatar, take controls while dancing.", meta:"grants can be revoked from Settings › Scripted objects", buttons:[{label:"ALLOW ONCE"},{label:"ALLOW ALWAYS",primary:true},{label:"DENY",dim:true}] },
  "Inventory offer": { icon:"package", kind:"INVENTORY OFFER", title:"Nyx Vaher gave you “Bay City Landmark Pack”",
    body:"Folder · 6 items · landmarks and one notecard.", buttons:[{label:"ACCEPT",primary:true},{label:"DECLINE",dim:true},{label:"MUTE SENDER",dim:true}] },
  "Teleport lure": { icon:"zap", kind:"TELEPORT OFFER", title:"Kit Sandalwood offers to teleport you",
    body:"“come see the build jam, we’re on the roof”", meta:"destination: Bay City — Hollywood <112, 44, 51>", buttons:[{label:"TELEPORT",primary:true},{label:"DECLINE",dim:true},{label:"REPLY INSTEAD"}] },
  "Pay L$": { icon:"banknote", kind:"PAYMENT", title:"Pay Sunset Lamp v3", body:"L$ 450 — balance after: L$ 3 120.",
    meta:"one-time payment · object owner receives funds directly", buttons:[{label:"L$ 450",primary:true},{label:"OTHER AMOUNT"},{label:"CANCEL",dim:true}] },
  "Region restart": { icon:"alert-triangle", kind:"ESTATE MESSAGE", title:"Region restart in 2 minutes",
    body:"Da Boom will restart for maintenance. You will be moved to your home location if you stay.", buttons:[{label:"TELEPORT HOME",primary:true},{label:"STAY"},{label:"DISMISS",dim:true}] },
};
