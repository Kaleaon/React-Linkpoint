import React, { useEffect } from 'react';
import { app } from '../linkpoint/app';
import { Map, Compass, Crosshair } from 'lucide-react';

const WorldView: React.FC = () => {

  useEffect(() => {
    // Attempt to connect the world viewer to the canvas
    const canvas = document.getElementById('world-canvas') as HTMLCanvasElement;
    if (canvas && app.world) {
       // Since the renderer logic is internal to WorldViewer,
       // ensuring it hooks to this ID is sufficient as long as it matches
       // the ID expected by the old ViewerWorkbench or world logic.
       // The init is handled in App/app.ts
    }
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-black">
      {/* 3D Canvas Container */}
      <div className="absolute inset-0 z-0">
        <canvas id="world-canvas" className="h-full w-full" />
      </div>

      {/* Top HUD Overlay */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-[#6cff9a] backdrop-blur-md">
            <Map size={20} />
          </div>
          <div>
            <div id="region-name" className="font-bold text-white drop-shadow-md">Loading Region...</div>
            <div id="coordinates" className="text-xs font-medium text-[#e2e8f0]/90 drop-shadow-md">0, 0, 0</div>
          </div>
        </div>
      </div>

      {/* Right HUD Controls */}
      <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-4">
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-[#3476ff]/80">
          <Compass size={24} />
        </button>
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-[#3476ff]/80">
          <Crosshair size={24} />
        </button>
      </div>

      {/* Bottom overlay gradient for blending with nav */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-24 bg-gradient-to-t from-black to-transparent" />
    </div>
  );
};

export default WorldView;
