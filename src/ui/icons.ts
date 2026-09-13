import {
  AlertTriangle,
  Armchair,
  Banknote,
  BellOff,
  Box,
  Camera,
  Circle,
  CloudOff,
  EyeOff,
  Folder,
  Hammer,
  House,
  Inbox,
  Info,
  Loader,
  Map,
  MapPinOff,
  MessageSquare,
  MessageSquareDashed,
  Package,
  PersonStanding,
  Plane,
  PlugZap,
  Radar,
  SearchX,
  ShieldAlert,
  Sun,
  UserPlus,
  Users,
  VolumeX,
  WifiOff,
  Zap,
  ZapOff,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons that are chosen by name at runtime.
 *
 * Screen state copy, the in-world button dock and the system dialogs all pick
 * their glyph from data, so the name is not known until render. Importing the
 * whole icon set to support that would defeat tree-shaking and pull roughly a
 * megabyte of unused glyphs into the bundle, so every name a data table can
 * produce is registered here explicitly instead.
 *
 * Adding an icon name to a data table means adding it here too — an unknown
 * name falls back to a plain circle rather than throwing.
 */
const REGISTRY: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  armchair: Armchair,
  banknote: Banknote,
  'bell-off': BellOff,
  box: Box,
  camera: Camera,
  'cloud-off': CloudOff,
  'eye-off': EyeOff,
  folder: Folder,
  hammer: Hammer,
  house: House,
  inbox: Inbox,
  info: Info,
  loader: Loader,
  map: Map,
  'map-pin-off': MapPinOff,
  'message-square': MessageSquare,
  'message-square-dashed': MessageSquareDashed,
  package: Package,
  'person-standing': PersonStanding,
  plane: Plane,
  'plug-zap': PlugZap,
  radar: Radar,
  'search-x': SearchX,
  'shield-alert': ShieldAlert,
  sun: Sun,
  'user-plus': UserPlus,
  users: Users,
  'volume-x': VolumeX,
  'wifi-off': WifiOff,
  zap: Zap,
  'zap-off': ZapOff,
};

/** Resolve a registered icon by its kebab-case name. */
export function icon(name: string): LucideIcon {
  return REGISTRY[name] ?? Circle;
}

/** The names this registry knows, so a test can assert the data tables match. */
export const REGISTERED_ICON_NAMES = Object.keys(REGISTRY);
