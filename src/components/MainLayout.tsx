import React, { useState } from 'react';
import { MessageSquare, Users, Backpack, Globe } from 'lucide-react';
import ChatView from './ChatView';
import WorldView from './WorldView';
import FriendsView from './FriendsView';
import InventoryView from './InventoryView';

type Tab = 'chat' | 'friends' | 'inventory' | 'world';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#100f0e]">
      {/* Top Status Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#1e293b] bg-[#101a1c] px-4 shadow-sm">
        <div className="text-sm font-semibold text-white tracking-wide">Linkpoint</div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#6cff9a] shadow-[0_0_8px_#6cff9a]"></div>
          <span className="text-xs text-[#e2e8f0]/70">Online</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'friends' && <FriendsView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'world' && <WorldView />}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="flex h-16 shrink-0 items-center justify-around border-t border-[#1e293b] bg-[#101a1c] pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center justify-center p-2 transition-colors ${
            activeTab === 'chat' ? 'text-[#6cff9a]' : 'text-[#e2e8f0]/50 hover:text-[#e2e8f0]/80'
          }`}
        >
          <MessageSquare size={24} className="mb-1" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('friends')}
          className={`flex flex-col items-center justify-center p-2 transition-colors ${
            activeTab === 'friends' ? 'text-[#6cff9a]' : 'text-[#e2e8f0]/50 hover:text-[#e2e8f0]/80'
          }`}
        >
          <Users size={24} className="mb-1" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Friends</span>
        </button>

        <button
          onClick={() => setActiveTab('world')}
          className={`relative -top-4 flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 border-[#100f0e] bg-gradient-to-tr from-[#3476ff] to-[#4a9eff] p-2 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${
            activeTab === 'world' ? 'ring-2 ring-[#4a9eff] ring-offset-2 ring-offset-[#100f0e]' : ''
          }`}
        >
          <Globe size={28} />
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center justify-center p-2 transition-colors ${
            activeTab === 'inventory' ? 'text-[#6cff9a]' : 'text-[#e2e8f0]/50 hover:text-[#e2e8f0]/80'
          }`}
        >
          <Backpack size={24} className="mb-1" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Inventory</span>
        </button>
      </div>
    </div>
  );
};

export default MainLayout;
