import React, { useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import TouchTarget from "./TouchTarget";
import Icon from "./Icon";
import FocusTrap from "./FocusTrap.jsx";

export interface OutfitItem {
  id: string;
  name: string;
  category?: string;
  worn?: boolean;
  itemCount?: number;
}

export interface OutfitCarouselDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOutfit?: (outfit: OutfitItem) => void;
  outfits?: OutfitItem[];
  /** Shown when there are no outfits (not loaded, not logged in, or none saved). */
  emptyMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const OutfitCarouselDrawer: React.FC<OutfitCarouselDrawerProps> = ({
  isOpen,
  onClose,
  onSelectOutfit,
  outfits = [],
  emptyMessage = "No outfits to show.",
  className = "",
  style,
}) => {
  const { V, t } = useTheme();
  const [activeIdx, setActiveIdx] = useState(0);

  if (!isOpen) return null;

  const currentOutfit: OutfitItem | undefined = outfits[activeIdx] || outfits[0];

  const handleNext = () => {
    setActiveIdx((prev) => (prev + 1) % outfits.length);
  };

  const handlePrev = () => {
    setActiveIdx((prev) => (prev - 1 + outfits.length) % outfits.length);
  };

  const buttonStyle: React.CSSProperties = {
    background: V.surf,
    color: V.pri,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs || "4px",
    fontSize: "11px",
    fontWeight: 600,
  };

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Outfit Carousel Drawer"
        aria-expanded={isOpen}
        className={`outfit-carousel-drawer ${className}`.trim()}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        width: "92%",
        maxWidth: "440px",
        maxHeight: "30vh",
        display: "flex",
        flexDirection: "column",
        background: "rgba(0, 0, 0, 0.85)",
        border: `1px solid ${V.pri}`,
        borderRadius: V.rs || "8px",
        padding: "10px",
        boxSizing: "border-box",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.75)",
        zIndex: 35,
        color: V.ink,
        font: `400 11px/1.4 ${t.font}`,
        overflowY: "auto",
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="shirt" size={16} style={{ color: V.pri }} />
          <strong style={{ color: V.pri, letterSpacing: "0.08em", fontSize: "11px" }}>OUTFIT CAROUSEL</strong>
        </div>
        <TouchTarget
          minSize={44}
          aria-label="Close outfit drawer"
          title="Close drawer"
          onClick={onClose}
          style={{
            ...buttonStyle,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            background: "transparent",
            border: 0,
            color: V.ink2,
          }}
        >
          <Icon name="x" size={16} />
        </TouchTarget>
      </div>

      {!currentOutfit ? (
        <div role="status" style={{ padding: 12, textAlign: "center", color: V.ink2 }}>{emptyMessage}</div>
      ) : (<>
      {/* Carousel Body */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flex: 1 }}>
        <TouchTarget
          minSize={44}
          aria-label="Previous outfit"
          onClick={handlePrev}
          style={{ ...buttonStyle, minWidth: 44, minHeight: 44 }}
        >
          <Icon name="chevron-left" size={18} />
        </TouchTarget>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "4px 8px",
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs || "4px",
          }}
        >
          <strong style={{ fontSize: "12px", color: V.ink }}>{currentOutfit.name}</strong>
          <span style={{ fontSize: "10px", opacity: 0.8, color: currentOutfit.worn ? V.pri : V.ink2 }}>
            {currentOutfit.worn ? "WORN · " : ""}{currentOutfit.category || "Outfit"}{currentOutfit.itemCount !== undefined ? ` (${currentOutfit.itemCount} items)` : ""}
          </span>
        </div>

        <TouchTarget
          minSize={44}
          aria-label="Next outfit"
          onClick={handleNext}
          style={{ ...buttonStyle, minWidth: 44, minHeight: 44 }}
        >
          <Icon name="chevron-right" size={18} />
        </TouchTarget>
      </div>

      {/* Action Bar: only offered when the host can actually wear an outfit */}
      {onSelectOutfit && (<div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <TouchTarget
          minSize={44}
          aria-label={`Wear ${currentOutfit.name}`}
          onClick={() => onSelectOutfit?.(currentOutfit)}
          style={{
            ...buttonStyle,
            minWidth: 88,
            minHeight: 44,
            background: V.pri,
            color: V.onpri || "#000",
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          {currentOutfit.worn ? "ACTIVE" : "WEAR OUTFIT"}
        </TouchTarget>
      </div>)}
      </>)}
    </aside>
  </FocusTrap>
);
};

export default OutfitCarouselDrawer;
