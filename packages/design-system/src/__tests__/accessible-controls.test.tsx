import { describe, it, expect, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LayoutProvider,
  AccessibleInput,
  AccessibleSelect,
} from "../react/index.js";
import { computeThemeTokens } from "../tokens/index.js";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
  });
  mounted = { host, root };
  return host;
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
});

describe("AccessibleInput and AccessibleSelect control primitives", () => {
  it("encapsulates theme token styles, radius, and 44px min-height target size", async () => {
    const tokens = computeThemeTokens("terminal", "ink");
    const host = await mount(
      <LayoutProvider initialLayout="terminal" initialPalette="ink">
        <AccessibleInput placeholder="Enter amount" />
      </LayoutProvider>
    );

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Enter amount");
    expect(input.style.minHeight).toBe("44px");
    expect(input.style.borderRadius).toBe(tokens.rs);
    expect(["#d7f5e6", "rgb(215, 245, 230)"]).toContain(input.style.color.toLowerCase());
  });

  it("renders visible keyboard focus outline under keyboard/focus navigation", async () => {
    const tokens = computeThemeTokens("terminal", "ink");
    const host = await mount(
      <LayoutProvider initialLayout="terminal" initialPalette="ink">
        <AccessibleInput placeholder="Search..." />
      </LayoutProvider>
    );

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.style.outline).toBe("");

    // Simulate focus from keyboard navigation
    await act(async () => {
      input.focus();
    });

    expect(input.style.outline).toBe(`2px solid ${tokens.pri}`);
    expect(input.style.outlineOffset).toBe("2px");

    // Simulate blur
    await act(async () => {
      input.blur();
    });

    expect(input.style.outline).toBe("");
  });

  it("prevents consumer components from suppressing focus outlines via inline styles", async () => {
    const tokens = computeThemeTokens("terminal", "ink");
    const host = await mount(
      <LayoutProvider initialLayout="terminal" initialPalette="ink">
        {/* Consumer passes outline: 'none' inline style */}
        <AccessibleInput
          placeholder="Suppression attempt"
          style={{ outline: "none", outlineWidth: 0, padding: "10px" } as any}
        />
      </LayoutProvider>
    );

    const input = host.querySelector("input") as HTMLInputElement;

    // Focus element
    await act(async () => {
      input.focus();
    });

    // The focus ring MUST still be visible and not suppressed
    expect(input.style.outline).toBe(`2px solid ${tokens.pri}`);
    expect(input.style.outlineOffset).toBe("2px");
  });

  it("renders AccessibleSelect with options and visible focus outline", async () => {
    const tokens = computeThemeTokens("lcars", "lcars");
    const host = await mount(
      <LayoutProvider initialLayout="lcars" initialPalette="lcars">
        <AccessibleSelect
          aria-label="View selector"
          options={[
            { value: "Viewport", label: "3D Viewport" },
            { value: "Chat", label: "Spatial Chat" },
          ]}
        />
      </LayoutProvider>
    );

    const select = host.querySelector("select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(2);
    expect(select.style.minHeight).toBe("44px");

    // Focus select
    await act(async () => {
      select.focus();
    });

    expect(select.style.outline).toBe(`2px solid ${tokens.pri}`);
    expect(select.style.outlineOffset).toBe("2px");
  });

  it("supports compact mode for dense headers without outline suppression", async () => {
    const host = await mount(
      <LayoutProvider initialLayout="terminal" initialPalette="ink">
        <AccessibleSelect
          compact
          aria-label="Compact select"
          style={{ padding: "2px 4px", fontSize: "10px" }}
        >
          <option value="1">Option 1</option>
        </AccessibleSelect>
      </LayoutProvider>
    );

    const select = host.querySelector("select") as HTMLSelectElement;
    expect(select.style.minHeight).toBe("");
    expect(select.style.fontSize).toBe("10px");

    await act(async () => {
      select.focus();
    });

    expect(select.style.outline).toContain("2px solid");
  });

  it("preserves standard form input attributes such as disabled, value, and onChange", async () => {
    let changedVal = "";
    const host = await mount(
      <LayoutProvider initialLayout="terminal" initialPalette="ink">
        <AccessibleInput
          value="Initial"
          disabled
          onChange={(e) => {
            changedVal = e.target.value;
          }}
        />
      </LayoutProvider>
    );

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("aria-disabled")).toBe("true");
    expect(input.value).toBe("Initial");
    expect(input.style.opacity).toBe("0.5");
  });
});
