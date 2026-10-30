/**
 * Linkpoint PWA - Capabilities Manager (Features 9-12)
 *
 * Phase 2: Core Protocol Extensions - Priority 1
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 28-33)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/modules/
 *
 * Manages Second Life capability URLs with caching and retry logic.
 */

export class CapabilitiesManager {
  private capabilities: Map<string, any> = new Map();
  public seedUrl: string | null = null;
  private cacheTimeout: number = 3600000; // 1 hour default
  private retryAttempts: number = 3;
  private retryDelay: number = 1000;

  constructor(options: any = {}) {
    this.cacheTimeout = options.cacheTimeout || 3600000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * Feature 9: Capability caching
   * Cache a capability URL with expiration
   */
  setCapability(name: string, url: string, expires: number | null = null) {
    if (!name || typeof name !== 'string') throw new Error('Valid capability name required');
    if (!url || typeof url !== 'string') throw new Error('Valid capability URL required');

    this.capabilities.set(name, {
      url: url,
      timestamp: Date.now(),
      expires: expires || Date.now() + this.cacheTimeout,
    });
    console.log(`[Capabilities] Cached: ${name}`);
  }

  /**
   * Feature 11: Capability URL resolution
   * Resolve a capability URL by name
   */
  resolveCapability(name: string): string | null {
    const cap = this.capabilities.get(name);
    if (!cap) return null;
    if (cap.expires && Date.now() > cap.expires) {
      this.capabilities.delete(name);
      return null;
    }
    return cap.url;
  }

  /**
   * Feature 10: Seed capability parsing
   * Parse seed capability response and cache all capabilities
   */
  async parseSeedCapability(seedData: any) {
    if (!seedData || typeof seedData !== 'object') throw new Error('Valid seed data required');

    if (seedData.seed_url) this.seedUrl = seedData.seed_url;
    for (const [name, url] of Object.entries(seedData)) {
      if (name !== 'seed_url' && typeof url === 'string') {
        this.setCapability(name, url);
      }
    }
    console.log(`[Capabilities] Parsed ${this.capabilities.size} capabilities`);
  }

  /**
   * Feature 12: Timeout and retry logic
   * Fetch capability with retry support
   */
  async fetchWithRetry(
    url: string,
    optionsOrAttempt?: RequestInit | number,
    attempt: number = 1,
  ): Promise<Response> {
    let options: RequestInit | undefined;
    let currentAttempt = attempt;
    if (typeof optionsOrAttempt === 'number') {
      currentAttempt = optionsOrAttempt;
    } else if (optionsOrAttempt && typeof optionsOrAttempt === 'object') {
      options = optionsOrAttempt;
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok && currentAttempt < this.retryAttempts) {
        await new Promise((r) => setTimeout(r, this.retryDelay * currentAttempt));
        return this.fetchWithRetry(url, options, currentAttempt + 1);
      }
      return response;
    } catch (error) {
      if (currentAttempt < this.retryAttempts) {
        await new Promise((r) => setTimeout(r, this.retryDelay * currentAttempt));
        return this.fetchWithRetry(url, options, currentAttempt + 1);
      }
      throw error;
    }
  }

  hasCapability(name: string): boolean {
    return this.resolveCapability(name) !== null;
  }

  /**
   * Resolves the GroupNoticesList HTTP capability URL if exposed by the seed capabilities.
   */
  getGroupNoticesListUrl(): string | null {
    return this.resolveCapability('GroupNoticesList');
  }

  /**
   * Resolves the PayObject HTTP capability URL if exposed by the seed capabilities.
   */
  getPayObjectUrl(): string | null {
    return this.resolveCapability('PayObject') || this.resolveCapability('PayObjectViaIP');
  }

  /**
   * Execute PayObject HTTP capability RPC call for scripted object transactions.
   */
  async executePayObjectCapability(
    objectId: string,
    amount: number,
    description?: string,
  ): Promise<any> {
    const url = this.getPayObjectUrl();
    if (!url) {
      throw new Error('PayObject capability is not available on this grid circuit');
    }

    const payload = JSON.stringify({
      object_id: objectId,
      amount: Math.floor(amount),
      description: description || 'PayObject capability transaction',
    });

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });
    if (!response.ok) {
      throw new Error(`PayObject capability RPC failed with status ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      return { success: true };
    }
  }

  clearCache() {
    this.capabilities.clear();
  }

  /**
   * Update capability seed URL and clear cached capabilities on region boundary crossing.
   */
  async updateSeedUrl(newSeedUrl: string) {
    if (!newSeedUrl || typeof newSeedUrl !== 'string') return;
    this.seedUrl = newSeedUrl;
    this.clearCache();
    console.log(`[Capabilities] Seed capability URL updated for region crossing: ${newSeedUrl}`);
  }
}
