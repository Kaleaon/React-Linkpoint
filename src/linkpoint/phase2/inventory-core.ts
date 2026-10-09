/**
 * Linkpoint PWA - Inventory Core (Features 21-25)
 * 
 * Consolidated into InventoryManager so all UI components, network handlers,
 * and operations share a single unified inventory store.
 */

import { InventoryManager } from '../inventory';

export class InventoryCore extends InventoryManager {
  constructor(protocolManager?: any, authManager?: any) {
    super(protocolManager || ({} as any), authManager || ({} as any));
  }
}
