import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { LAYOUTS } from "../theme/layouts.js";
import { PALETTES } from "../theme/palettes.js";
import { buildCards } from "../data/content.js";
import Header from "./Header.jsx";
import SegmentedTabs from "./SegmentedTabs.jsx";
import ChipRow from "./ChipRow.jsx";
import StateBlock from "./StateBlock.jsx";
import CardList from "./CardList.jsx";
import SplitDetail from "./SplitDetail.jsx";
import Chat from "../screens/Chat.jsx";
import Radar from "../screens/Radar.jsx";
import Map from "../screens/Map.jsx";
import World3D, { World3DActionBar } from "../screens/World3D.jsx";
import Inventory from "../screens/Inventory.jsx";
import Profile from "../screens/Profile.jsx";
import Login from "../screens/Login.jsx";
import Search from "../screens/Search.jsx";

const CARD_SCREENS = ["Friends", "Groups", "Notices", "Teleport", "Outfits", "Objects", "Parcel", "Transactions", "Mute List", "Settings", "Diagnostics"];

// Ported from the big content column inside `shellStyle` (headers -> segTabs
// -> chips -> the 13 screens' bodies), plus the split-view detail pane that
// sits beside it on tablet/foldable devices.
export default function ScreenBody() {
  const { state, actions } = useApp();
  const { norm, scr } = useTheme();

  const cardsByScreen = buildCards({ state, actions, layoutName: LAYOUTS[state.layout].name, paletteName: PALETTES[state.palette].name });
  const isCardScreen = CARD_SCREENS.includes(scr);

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", position: "relative" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Header />
        <SegmentedTabs />
        <ChipRow />
        {norm && scr === "Chat" && <Chat />}
        {norm && scr === "Radar" && <Radar />}
        {norm && scr === "Map" && <Map />}
        {norm && scr === "3D View" && (
          <>
            <World3D />
            <World3DActionBar />
          </>
        )}
        {norm && scr === "Inventory" && <Inventory />}
        {norm && scr === "Profile" && <Profile />}
        {norm && isCardScreen && <CardList cards={cardsByScreen[scr] || []} />}
        {scr === "Login" && <Login />}
        {scr === "Search" && <Search />}
        {!norm && <StateBlock />}
      </div>
      <SplitDetail />
    </div>
  );
}
