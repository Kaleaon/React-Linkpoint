import React, { useMemo, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  CircleSmall,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Image,
  MapPin,
  Music,
  PersonStanding,
  Shirt,
  Trash2,
  User,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, SectionLabel, ScreenTitle } from '../ui/primitives';
import { merge } from '../ui/styles';
import { INVENTORY } from '../data/slData';
import { permissionLabel, type AssetType, type InventoryNode } from '../data/slTypes';
import { AGENT } from '../data/slData';
import { legacyName } from '../data/slTypes';
import { useRlv } from '../viewer/RlvContext';
import { RlvNote } from '../ui/RlvBlocked';

/**
 * TPV_COMPLIANCE.md §3: an export affordance may only appear for an asset the
 * logged-in resident actually created, and only when they hold the full
 * permission mask on it. Anything short of that and the control is not
 * rendered at all — there is no disabled-but-present "Save to disk" to tempt
 * anyone, because the absence is the guardrail.
 */
export function mayExport(node: InventoryNode): boolean {
  if (node.type === 'category') return false;
  const p = node.permissions;
  if (!p) return false;
  // Full permissions AND the agent is the original creator. Both, always.
  return p.copy && p.modify && p.transfer && node.creator === legacyName(AGENT);
}

/**
 * Inventory.
 *
 * The folder skeleton loads first and item contents on demand, which is how the
 * viewer protocol delivers it — so this renders a tree, not a flat list, and a
 * folder's item count is available before its children are.
 */

/** Icon per asset type, matching what the desktop inventory panel shows. */
const ASSET_ICONS: Record<AssetType, typeof Box> = {
  texture: Image,
  sound: Music,
  callingcard: User,
  landmark: MapPin,
  clothing: Shirt,
  object: Box,
  notecard: FileText,
  category: Folder,
  bodypart: PersonStanding,
  animation: PersonStanding,
  gesture: PersonStanding,
  mesh: Box,
  settings: FileText,
  material: Image,
  script: FileCode,
};

/** Folders whose name earns a more specific glyph than the generic folder. */
const FOLDER_ICONS: Record<string, typeof Box> = {
  Objects: Box,
  Clothing: Shirt,
  'Body Parts': PersonStanding,
  Landmarks: MapPin,
  Textures: Image,
  Scripts: FileCode,
  Sounds: Music,
  Notecards: FileText,
  'Calling Cards': User,
  Trash: Trash2,
};

interface FlatNode {
  node: InventoryNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}

/** Flatten the tree to the rows currently visible, honouring what is expanded. */
function flatten(node: InventoryNode, expanded: Record<string, boolean>, depth = 0, out: FlatNode[] = []): FlatNode[] {
  const isFolder = node.type === 'category';
  const hasChildren = !!node.children?.length;
  const open = !!expanded[node.id];
  out.push({ node, depth, expandable: isFolder, expanded: open });
  if (isFolder && open && hasChildren) {
    for (const child of node.children!) flatten(child, expanded, depth + 1, out);
  }
  return out;
}

const InventoryScreen: React.FC = () => {
  const t = useTheme();
  const rlv = useRlv();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'inv-root': true, 'f-objects': true });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<InventoryNode | null>(null);

  const rows = useMemo(() => {
    const all = flatten(INVENTORY, expanded);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    // A filter searches the whole tree, so matches inside collapsed folders
    // still surface — the same behaviour as the desktop inventory search.
    const matches: FlatNode[] = [];
    const walk = (node: InventoryNode, depth: number) => {
      if (node.name.toLowerCase().includes(q)) matches.push({ node, depth, expandable: false, expanded: false });
      node.children?.forEach((c) => walk(c, depth + 1));
    };
    walk(INVENTORY, 0);
    return matches;
  }, [expanded, query]);

  // One formatting of the item count, so the header, the filter placeholder
  // and the empty state cannot disagree about how many items there are.
  const itemCount = (INVENTORY.count ?? 0).toLocaleString('en-US');

  // @detach=n locks anything that would add or remove a worn item.
  const detachBlocked = rlv.restricted('detach');

  const toggle = (node: InventoryNode) => {
    if (node.type === 'category') setExpanded((e) => ({ ...e, [node.id]: !e[node.id] }));
    else setSelected(node);
  };

  return (
    <>
      <ScreenTitle title="INVENTORY" subtitle={`> ${itemCount} items · ${INVENTORY.children?.length} system folders`} />

      <div style={{ flex: 'none', padding: '0 16px 10px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${itemCount} items`}
          aria-label="Filter inventory"
          style={{
            width: '100%',
            minHeight: '44px',
            boxSizing: 'border-box',
            padding: '0 12px',
            border: `1px solid ${t.v.outv}`,
            borderRadius: t.v.rs,
            background: t.v.surf,
            color: t.v.ink,
            font: `400 16px/1.4 ${t.font}`,
            outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {rows.map(({ node, depth, expandable, expanded: open }) => {
          const isFolder = node.type === 'category';
          const Icon = isFolder ? FOLDER_ICONS[node.name] || (open ? FolderOpen : Folder) : ASSET_ICONS[node.type] || Box;
          const Chevron = expandable ? (open ? ChevronDown : ChevronRight) : CircleSmall;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => toggle(node)}
              style={merge({
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: `${t.pad} 16px`,
                paddingLeft: `${16 + depth * 18}px`,
                border: 'none',
                borderBottom: `1px solid ${t.v.outv}`,
                background: selected?.id === node.id ? t.v.priC : 'transparent',
                color: selected?.id === node.id ? t.v.onpriC : t.v.ink,
                cursor: 'pointer',
                textAlign: 'left',
                boxSizing: 'border-box',
              })}
            >
              <Chevron size={13} style={{ color: t.v.ink2, flex: 'none' }} strokeWidth={2} />
              <Icon size={15} style={{ color: selected?.id === node.id ? t.v.onpriC : t.v.pri, flex: 'none' }} strokeWidth={1.7} />
              <span style={{ flex: 1, minWidth: 0, font: `400 13px/1.3 ${t.font}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.name}
              </span>
              {node.count != null && <span style={{ font: `400 10px/1 ${t.font}`, color: t.v.ink2, flex: 'none' }}>{node.count}</span>}
              {node.landImpact != null && <span style={{ font: `400 10px/1 ${t.font}`, color: t.v.ink2, flex: 'none' }}>{node.landImpact} LI</span>}
            </button>
          );
        })}

        {rows.length === 0 && (
          <div style={{ padding: '22px 16px', font: `400 12px/1.6 ${t.font}`, color: t.v.ink2 }}>
            Nothing in {itemCount} items matches "{query}".
            <div style={{ marginTop: '10px', maxWidth: '200px' }}>
              <Button onClick={() => setQuery('')}>CLEAR FILTER</Button>
            </div>
          </div>
        )}
      </div>

      {/* Item detail. Permissions are stated in full: a resident deciding
          whether to buy or pass on an item needs the whole mask, not an icon. */}
      {selected && selected.type !== 'category' && (
        <div style={{ flex: 'none', borderTop: `1px solid ${t.v.outv}`, background: t.v.surf, padding: '13px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14px/1.25 ${t.dfont}`, color: t.v.ink, letterSpacing: t.v.tls }}>{selected.name}</div>
              <div style={{ font: `400 10.5px/1.4 ${t.font}`, color: t.v.ink2, marginTop: '4px' }}>
                {selected.type}
                {selected.landImpact != null ? ` · ${selected.landImpact} LI` : ''}
                {selected.permissions ? ` · ${permissionLabel(selected.permissions)}` : ''}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close detail"
              onClick={() => setSelected(null)}
              style={{ border: 'none', background: 'transparent', color: t.v.ink2, cursor: 'pointer', font: `400 16px/1 ${t.font}` }}
            >
              ×
            </button>
          </div>

          {(selected.acquired || selected.creator) && (
            <div style={{ marginTop: '10px' }}>
              <SectionLabel>Acquired</SectionLabel>
              <div style={{ font: `400 11.5px/1.5 ${t.font}`, color: t.v.ink, marginTop: '4px' }}>
                {selected.acquired}
                {selected.creator ? ` from ${selected.creator}` : ''}
              </div>
            </div>
          )}

          {selected.description && (
            <div style={{ marginTop: '10px' }}>
              <SectionLabel>Description</SectionLabel>
              <div style={{ font: `400 11.5px/1.5 ${t.font}`, color: t.v.ink, marginTop: '4px' }}>{selected.description}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', marginTop: '13px' }}>
            <Button kind="primary">{selected.type === 'landmark' ? 'TELEPORT' : selected.type === 'object' ? 'REZ HERE' : 'OPEN'}</Button>
            <Button disabled={detachBlocked}>WEAR</Button>
            <Button kind="danger" disabled={detachBlocked}>
              TRASH
            </Button>
          </div>

          {/* Only ever shown for the resident's own full-perm creations. */}
          {mayExport(selected) && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <Button>SAVE TO DISK</Button>
            </div>
          )}

          {detachBlocked && <RlvNote restriction="detach" />}
        </div>
      )}
    </>
  );
};

export default InventoryScreen;
