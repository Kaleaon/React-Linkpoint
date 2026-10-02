// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import Inventory from "../../screens/Inventory.jsx";
import AssetContainer from "../../components/AssetContainer.jsx";
import SkeletonLoader, { SkeletonAssetPlaceholder } from "../../components/SkeletonLoader.jsx";
import { app } from "../app";
import { mountScreen, unmount, click, buttonByText, type Mounted } from "./ui-helpers";

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
  app.inventory.items.clear();
  app.inventory.folders.clear();
  app.inventory.isLoading = false;
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
});

describe("Skeleton UI Loaders & Progressive Asset Hydration", () => {
  it("renders animated skeleton UI placeholder rows immediately during initial inventory fetch states", async () => {
    app.inventory.isLoading = true;
    mounted = await mountScreen(Inventory);

    const skeletonRows = mounted.host.querySelectorAll('[data-testid="skeleton-row"]');
    expect(skeletonRows.length).toBeGreaterThan(0);

    // Transition to loaded state
    await act(async () => {
      app.inventory.isLoading = false;
      app.inventory.items.set("item-1", { id: "item-1", name: "Custom Jacket", folder: false, assetType: 5 });
      app.inventory.emit("inventory_loaded");
    });

    const items = mounted.host.querySelectorAll(".inventory-row");
    expect(items.length).toBe(1);
    expect(mounted.host.textContent).toContain("Custom Jacket");
  });

  it("attaches progressive download progress listeners and updates progress bar during transfer", async () => {
    let progressCallback: ((loaded: number, total: number) => void) | null = null;

    const mockFetch = vi.fn((_asset, onProgress) => {
      progressCallback = onProgress;
      return new Promise((resolve) => {
        setTimeout(() => resolve("Downloaded Notecard Text"), 500);
      });
    });

    mounted = await mountScreen(() => (
      <AssetContainer asset={{ id: "notecard-1", name: "Grid Charter", assetType: 7 }} onFetch={mockFetch} />
    ));

    // Initially loading
    expect(mounted.host.querySelector('[data-testid="skeleton-asset-placeholder"]')).toBeTruthy();

    // Trigger progressive download updates
    await act(async () => {
      if (progressCallback) {
        progressCallback(250, 1000); // 25%
      }
    });

    let progressBar = mounted.host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe("25%");

    await act(async () => {
      if (progressCallback) {
        progressCallback(750, 1000); // 75%
      }
    });

    progressBar = mounted.host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(progressBar.style.width).toBe("75%");
  });

  it("transitions smoothly from downloading skeleton to loaded asset content once transfer completes", async () => {
    let resolveDownload: (data: string) => void = () => {};

    const mockFetch = vi.fn((_asset, onProgress) => {
      onProgress(100, 100);
      return new Promise<string>((resolve) => {
        resolveDownload = resolve;
      });
    });

    mounted = await mountScreen(() => (
      <AssetContainer asset={{ id: "texture-1", name: "Ground Texture", assetType: 0 }} onFetch={mockFetch} />
    ));

    expect(mounted.host.querySelector('[data-testid="asset-downloading-state"]')).toBeTruthy();

    // Resolve download
    await act(async () => {
      resolveDownload("RGBA Texture Bytes OK");
    });

    expect(mounted.host.querySelector('[data-testid="asset-loaded-state"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain("Ground Texture");
    expect(mounted.host.textContent).toContain("RGBA Texture Bytes OK");
  });

  it("transitions skeleton loader to clear error state with retry button on network fetch failure", async () => {
    let shouldFail = true;

    const mockFetch = vi.fn((_asset, onProgress) => {
      if (shouldFail) {
        return Promise.reject(new Error("Network timeout: Grid asset service un-reachable."));
      }
      onProgress(100, 100);
      return Promise.resolve("Retried Asset Content Success");
    });

    mounted = await mountScreen(() => (
      <AssetContainer asset={{ id: "sound-1", name: "Ambient Rain", assetType: 1 }} onFetch={mockFetch} />
    ));

    // Should transition to error state
    expect(mounted.host.querySelector('[data-testid="asset-error-state"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain("Network timeout: Grid asset service un-reachable.");

    const retryBtn = mounted.host.querySelector('[data-testid="asset-retry-button"]') as HTMLElement;
    expect(retryBtn).toBeTruthy();

    // Click retry with failure resolved
    shouldFail = false;
    await click(retryBtn);

    expect(mounted.host.querySelector('[data-testid="asset-loaded-state"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain("Retried Asset Content Success");
  });
});
