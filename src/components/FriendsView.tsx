import React from 'react';
import { UserPlus, MoreVertical } from 'lucide-react';

const FriendsView: React.FC = () => {
  // Placeholder friends list since friends logic might not be fully hooked up in frontend yet
  const dummyFriends = [
    { id: '1', name: 'Kaleaon Resident', online: true },
    { id: '2', name: 'Alice Liddell', online: true },
    { id: '3', name: 'Bob Builder', online: false },
  ];

  return (
    <div className="flex h-full flex-col bg-[#100f0e]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#1e293b] bg-[#101a1c] p-4">
        <h2 className="text-lg font-semibold text-white">Friends</h2>
        <button className="rounded-full bg-[#1b2a2d] p-2 text-[#4a9eff] hover:bg-[#1e293b]">
          <UserPlus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 px-3 text-xs font-semibold text-[#e2e8f0]/50 uppercase tracking-wider">Online ({dummyFriends.filter(f => f.online).length})</div>
        {dummyFriends.filter(f => f.online).map(friend => (
          <div key={friend.id} className="mb-1 flex items-center justify-between rounded-xl border border-transparent bg-transparent p-3 transition hover:border-[#1e293b] hover:bg-[#101a1c]">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 overflow-hidden rounded-full bg-[#1b2a2d]">
                  {/* Avatar Placeholder */}
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#100f0e] bg-[#6cff9a]"></div>
              </div>
              <div>
                <div className="text-sm font-medium text-[#e2e8f0]">{friend.name}</div>
              </div>
            </div>
            <button className="text-[#e2e8f0]/40 hover:text-[#e2e8f0]">
              <MoreVertical size={18} />
            </button>
          </div>
        ))}

        <div className="mb-2 mt-6 px-3 text-xs font-semibold text-[#e2e8f0]/50 uppercase tracking-wider">Offline ({dummyFriends.filter(f => !f.online).length})</div>
        {dummyFriends.filter(f => !f.online).map(friend => (
          <div key={friend.id} className="mb-1 flex items-center justify-between rounded-xl border border-transparent bg-transparent p-3 opacity-60 transition hover:border-[#1e293b] hover:bg-[#101a1c] hover:opacity-100">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 overflow-hidden rounded-full bg-[#1b2a2d]"></div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#100f0e] bg-[#e2e8f0]/30"></div>
              </div>
              <div>
                <div className="text-sm font-medium text-[#e2e8f0]">{friend.name}</div>
              </div>
            </div>
            <button className="text-[#e2e8f0]/40 hover:text-[#e2e8f0]">
              <MoreVertical size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FriendsView;
