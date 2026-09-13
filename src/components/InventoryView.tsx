import React, { useState, useEffect } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Package } from 'lucide-react';
import { app } from '../linkpoint/app';

interface TreeNodeProps {
  id: string;
  depth: number;
}

const InventoryNode: React.FC<TreeNodeProps> = ({ id, depth }) => {
  const [isOpen, setIsOpen] = useState(depth < 1); // Auto open root

  const folder = app.inventory.folders.get(id);
  const item = app.inventory.items.get(id);

  if (folder) {
    const children = Array.from(folder.children || []);

    return (
      <div>
        <div
          className="flex cursor-pointer items-center py-2 hover:bg-[#101a1c]"
          style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="mr-2 text-[#e2e8f0]/40">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <Folder size={18} className="mr-3 text-[#4a9eff]" />
          <span className="text-sm font-medium text-[#e2e8f0]">{folder.name}</span>
          <span className="ml-2 text-xs text-[#e2e8f0]/30">({children.length})</span>
        </div>

        {isOpen && (
          <div>
            {children.map((childId: any) => (
              <InventoryNode key={childId} id={childId} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item) {
    return (
      <div
        className="flex items-center py-2 hover:bg-[#101a1c]"
        style={{ paddingLeft: `${depth * 1 + 2}rem` }}
      >
        <Package size={16} className="mr-3 text-[#6cff9a]" />
        <span className="text-sm text-[#e2e8f0]/90">{item.name}</span>
      </div>
    );
  }

  return null;
};

const InventoryView: React.FC = () => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setVersion(v => v + 1);
    app.inventory.on('inventory_updated', handleUpdate);
    return () => {
      app.inventory.off('inventory_updated', handleUpdate);
    };
  }, []);

  const rootId = app.inventory.rootFolder?.id;

  return (
    <div className="flex h-full flex-col bg-[#100f0e]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#1e293b] bg-[#101a1c] p-4">
        <h2 className="text-lg font-semibold text-white">Inventory</h2>
        <div className="text-xs text-[#e2e8f0]/50">
          {app.inventory.folders.size} folders, {app.inventory.items.size} items
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {!rootId ? (
          <div className="mt-10 text-center text-sm text-[#e2e8f0]/40">
            Loading inventory...
          </div>
        ) : (
          <div className="pb-20">
            <InventoryNode id={rootId} depth={0} />
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryView;
