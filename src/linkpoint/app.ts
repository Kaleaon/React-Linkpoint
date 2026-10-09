/**
 * Linkpoint PWA - Main Application
 */

import { purgeFabricatedStorage } from './fabricated-data';
import { migrationUtility } from './migration';
import { SLConnectionFull } from './sl-connection-full';
import { AuthManager } from './auth';
import { WorldViewer } from './world';
import { ChatManager } from './chat';
import { InventoryManager } from './inventory';
import { PreferencesManager } from './preferences';
import { NotificationsManager } from './notifications';
import { InteractionsManager } from './interactions';
import { ContactsStore } from './contacts';
import { NoticeStore } from './notices';
import { Utils } from './utils';
import { slBridge } from './sl-bridge';
import { AudioManager } from './audio';
import { VoiceManager } from './voice';
import { RlvController } from './rlv';
import { VoiceInput } from './voice-input';
import { MuteFlag, MuteList, MuteType } from './mute-list';
import { ParcelSoundMap } from './parcel-sound';
import { chooseSpatialChannel, regionHandleFor } from './voice-protocol';
import { RLV_STRINGS } from './rlv-data';
import { moneySoundFor } from './sound-standards';
import { CoordinateNormalizer } from './coordinate-normalizer';
import { economyManager, EconomyManager } from './economy-manager';

import { ChatProtocolAdapter } from './chat-protocol-adapter';

// Phase 2 Modules
import { EventQueueManager } from './phase2/event-queue';
import { CapabilitiesManager } from './phase2/capabilities';
import { AvatarManager } from './phase2/avatar';
import { ObjectManagerExtended } from './phase2/objects-extended';
import { InventoryCore } from './phase2/inventory-core';
import { InventoryOperations } from './phase2/inventory-ops';
import { InventorySpecialTypes } from './phase2/inventory-types';
import { ChatExtended } from './phase2/chat-extended';
import { GroupsManager } from './phase2/groups';
import { FriendsExtended } from './phase2/friends-extended';

export class LinkpointApp {
  private balanceTimer: ReturnType<typeof setInterval> | null = null;
  private initialization: Promise<void> | null = null;
  public protocol: SLConnectionFull;
  public auth: AuthManager;
  public world: WorldViewer;
  public chat: ChatManager;
  public inventory: InventoryManager;
  public preferences: PreferencesManager;
  public notifications: NotificationsManager;
  public interactions: InteractionsManager;
  public contacts: ContactsStore;
  public notices: NoticeStore;
  public audio: AudioManager;
  public voice: VoiceManager;
  public economy: EconomyManager;
  public chatAdapter: ChatProtocolAdapter;

  // Phase 2 Managers
  public eventQueue: EventQueueManager;
  public capabilities: CapabilitiesManager;
  public avatar: AvatarManager;
  public objects: ObjectManagerExtended;
  public inventoryCore: InventoryCore;
  public inventoryOps: InventoryOperations;
  public inventoryTypes: InventorySpecialTypes;
  public chatExtended: ChatExtended;
  public groups: GroupsManager;
  public friends: FriendsExtended;
  /** RLV (off until the user turns it on). `rlv.handler` holds the restrictions. */
  public rlv: RlvController;
  private voiceInput: VoiceInput | null = null;
  /** The account's mute list, kept on the grid. */
  public muteList: MuteList;
  /** Which parcels only hear their own sounds. */
  public parcelSound = new ParcelSoundMap();
  private regionOriginMeters: [number, number] = [0, 0];

  constructor() {
    this.protocol = new SLConnectionFull();
    this.chatAdapter = new ChatProtocolAdapter(this.protocol);
    this.preferences = new PreferencesManager();
    this.auth = new AuthManager(this.protocol);
    this.world = new WorldViewer(this.protocol);
    this.chat = new ChatManager(this.chatAdapter, this.auth);
    this.inventory = new InventoryManager(this.protocol, this.auth);
    this.notifications = new NotificationsManager(this.protocol);
    this.interactions = new InteractionsManager(this.protocol);
    this.contacts = new ContactsStore();
    this.notices = new NoticeStore(this.protocol);
    this.audio = new AudioManager(this.protocol);
    this.voice = new VoiceManager();
    this.economy = economyManager;

    // Initialize Phase 2 Managers
    this.eventQueue = new EventQueueManager(this.protocol as any); // Type cast for now
    this.capabilities = new CapabilitiesManager();
    this.avatar = new AvatarManager();
    this.objects = new ObjectManagerExtended();
    this.inventoryCore = new InventoryCore();
    this.inventoryOps = new InventoryOperations(this.inventoryCore);
    this.inventoryTypes = new InventorySpecialTypes();
    this.chatExtended = new ChatExtended(this.chatAdapter);
    this.chat.setMessageFilter((message) => this.chatExtended.shouldDisplayMessage(message));
    this.groups = new GroupsManager(this.chatAdapter, this.capabilities, this.notices);
    this.friends = new FriendsExtended(this.protocol);
    this.rlv = new RlvController(false, this.rlvEnvironment());
    this.chat.setRlv(this.rlv.handler);
    this.muteList = new MuteList({
      update: (entry) => slBridge.updateMuteEntry(entry),
      remove: (entry) => slBridge.removeMuteEntry(entry),
    });
    this.chatExtended.attachGridMuteList(this.muteList, (id) => this.nameOfObjectOrAvatar(id));
    this.audio.setPolicy({
      // LLViewerParcelMgr::canHearSound; a position outside the current region is in a parcel we know nothing about
      canHearAt: (global) => {
        const x = global[0] - this.regionOriginMeters[0],
          y = global[1] - this.regionOriginMeters[1];
        const inside =
          x >= 0 && y >= 0 && x < this.parcelSound.regionWidth && y < this.parcelSound.regionWidth;
        return this.parcelSound.canHear(inside ? [x, y, global[2]] : null);
      },
      isMuted: (id) => this.muteList.isMuted(id),
      ownerSoundsMuted: (ownerId) => this.muteList.isMuted(ownerId, '', MuteFlag.OBJECT_SOUNDS),
    });
    this.voice.setVoiceMuteChecker((id) => this.muteList.isMuted(id, '', MuteFlag.VOICE_CHAT));
    this.muteList.on(
      'entry_changed',
      ({
        entry,
        removed,
      }: {
        entry: { id: string; type: number; flags: number };
        removed: boolean;
      }) => {
        // LLWebRTCVoiceClient::onChangeDetailed: an agent's voice mute follows the mute list at once
        if (entry.type === MuteType.AGENT)
          this.voice.setUserMuted(entry.id, !removed && (entry.flags & MuteFlag.VOICE_CHAT) === 0);
      },
    );
    this.wireRlv();
  }

  /** `voiceConnectionStateMachine`: pick the spatial voice channel from the avatar's parcel and apply it. */
  private updateVoiceChannel() {
    const parcel = this.parcelSound.agentParcel;
    if (!parcel) return;
    void this.voice.setSpatialChoice(
      chooseSpatialChannel(parcel),
      regionHandleFor(this.regionOriginMeters),
    );
  }

  /** A name for the mute list entry of an avatar or object we can see. */
  private nameOfObjectOrAvatar(id: string): string | undefined {
    const wanted = id.toLowerCase();
    return (
      this.world.objectName(id) ??
      this.world.nearbyUsers.find((u: any) => String(u.id).toLowerCase() === wanted)?.name
    );
  }

  /** What RLV needs from the viewer. Missing pieces make the commands that use them fail rather than guess. */
  private rlvEnvironment() {
    return {
      selfId: () => String(this.protocol.agentId || ''),
      sendChat: (text: string, channel: number, type: number) => {
        void this.protocol
          .sendChat(text, channel, type)
          .catch((error: unknown) => console.warn('[RLV] reply not sent:', error));
      },
      avatarDistanceSquared: (id: string) => {
        const me = this.world.avatarPosition;
        const other = this.world.nearbyUsers.find(
          (user: any) => String(user.id).toLowerCase() === id.toLowerCase(),
        )?.position;
        if (!me || !other) return null;
        return (me[0] - other[0]) ** 2 + (me[1] - other[1]) ** 2 + (me[2] - other[2]) ** 2;
      },
      nearbyAvatars: () =>
        this.world.nearbyUsers
          .filter((user: any) => user.id && user.name)
          .map((user: any) => ({
            id: String(user.id),
            displayName: String(user.name),
            legacyName: String(user.name),
          })),
      locationNames: () => ({
        regions: [this.world.region?.name].filter(Boolean) as string[],
        parcel: this.world.region?.parcel?.Name ?? this.world.region?.parcel?.name ?? null,
      }),
      sendInstantMessage: (recipientId: string, text: string) => {
        void this.protocol.sendInstantMessage(recipientId, text).catch(() => {});
      },
    };
  }

  private wireRlv() {
    const rlv = this.rlv.handler;
    this.world.movementRestrictions = {
      canFly: () => !rlv.isEnabled() || rlv.canFly(),
      canJump: () => !rlv.isEnabled() || rlv.canJump(),
      canAlwaysRun: () => !rlv.isEnabled() || !rlv.hasBehaviour('alwaysrun'),
      canTempRun: () => !rlv.isEnabled() || !rlv.hasBehaviour('temprun'),
    };
    this.protocol.actionGuard = (action, detail) => {
      if (!rlv.isEnabled()) return null;
      switch (action) {
        case 'teleport':
          return rlv.canTeleportToLocation('') ? null : RLV_STRINGS.blockedTeleport;
        case 'acceptLure':
          return detail?.senderId
            ? rlv.canAcceptTpOffer(detail.senderId)
              ? null
              : RLV_STRINGS.blockedTeleport
            : rlv.hasBehaviour('tplure')
              ? RLV_STRINGS.blockedTeleport
              : null;
        case 'sit':
          return rlv.canGroundSit() ? null : RLV_STRINGS.blockedGeneric;
        case 'stand':
          return rlv.canStand() ? null : RLV_STRINGS.blockedGeneric;
        default:
          return null;
      }
    };
    // Restrictions belong to the session: forget them on logout.
    this.auth.on('logout', () => {
      rlv.reset();
      this.muteList.clear();
    });
  }

  async init() {
    if (this.initialization) return this.initialization;
    this.initialization = this.initialize();
    return this.initialization;
  }

  private async initialize() {
    console.log('🔗 Linkpoint PWA Starting...');

    // Remove invented data left in storage by earlier builds before anything reads it.
    purgeFabricatedStorage();
    await migrationUtility.migrateLegacyStorage().catch(() => {});
    this.preferences.init();
    this.auth.init();
    // Wired before anything that can fail or wait: a script dialog must never be dropped for want of a listener.
    this.interactions.init();
    this.notices.init();
    await this.world.init();
    this.chat.init();
    await this.inventory.init();
    this.notifications.init(this.chat);
    this.audio.init();
    this.wireSoundListener();
    // Push-to-talk keys (middle mouse toggles the mic; voice_follow_key holds it open)
    if (typeof window !== 'undefined') {
      this.voiceInput ??= new VoiceInput(this.voice, {
        mode: () => this.world.keyMode(),
        enabled: () => this.voice.state === 'connected',
      });
    }

    this.setupEventListeners();

    console.log('✅ Linkpoint PWA Ready');
  }

  private setupEventListeners() {
    this.protocol.on('scene:parcel-sound', (data: any) => this.parcelSound.accept(data));
    this.protocol.on('scene:voice-neighbors', (data: any) =>
      this.voice.setNeighborRegions(data?.neighbors ?? []),
    );
    this.protocol.on('scene:mute-list', (data: any) => this.muteList.load(data));
    this.protocol.on('connected', () => this.muteList.setSelfId(this.protocol.agentId || ''));
    this.protocol.on('friends_loaded', (friends: any[]) => {
      console.log('Real friends loaded from Second Life:', friends.length);
      this.friends.replaceFriends(
        friends.map((f) => ({
          id: f.id,
          name: f.name,
          onlineStatus: f.onlineStatus ?? f.online,
          permissions: {
            canSeeOnline:
              typeof f.rightsHasMask === 'number'
                ? Boolean(f.rightsHasMask & 1)
                : Boolean(f.rightsHas),
            canSeeOnMap:
              typeof f.rightsHasMask === 'number'
                ? Boolean(f.rightsHasMask & 2)
                : Boolean(f.rightsHas),
            canModifyObjects:
              typeof f.rightsGivenMask === 'number'
                ? Boolean(f.rightsGivenMask & 4)
                : Boolean(f.rightsGiven),
          },
        })),
      );
    });

    this.protocol.on('friend_status', (data: any) => {
      if (data?.id) {
        const known = this.friends
          .getFriends()
          .some((f: any) => String(f.id).toLowerCase() === String(data.id).toLowerCase());
        this.friends.updateFriendStatus(data.id, data.online ? 'online' : 'offline', data);
        // Presence for someone not in the list yet: fetch the list so they appear with their name.
        if (!known && !data.name) void this.loadFriends();
      }
    });

    // Accepting an offer adds a friend; the list (with names and rights) comes from the session.
    this.protocol.on('friend_response', (data: any) => {
      if (data?.accepted) void this.loadFriends();
    });

    this.protocol.on('friend_request', (data: any) => {
      this.notifications.handleNotification({
        id: data.requestId || String(Date.now()),
        title: 'Friend Request',
        message: `${data.fromName} offered friendship: "${data.message || ''}"`,
        type: 'friend_request',
        data,
      });
    });

    this.protocol.on('friend_remove', (data: any) => {
      const id = data?.id || data?.friendId;
      if (id) this.friends.removeFriend(String(id));
    });

    // The L$ balance is whatever the grid reports. It is requested after login and
    // refreshed periodically; until then it is null and shown as unknown.
    this.protocol.on('connected', () => {
      this.voice.setSelfId(this.protocol.agentId || '');
      this.audio.setSelfId(this.protocol.agentId || '');
      void this.protocol.refreshBalance();
      if (this.balanceTimer) clearInterval(this.balanceTimer);
      this.balanceTimer = setInterval(() => {
        void this.protocol.refreshBalance();
      }, 60000);
    });
    this.protocol.on('disconnected', () => {
      if (this.balanceTimer) clearInterval(this.balanceTimer);
      this.balanceTimer = null;
      this.protocol.balance = null;
      this.protocol.emit('balance_updated', null);
    });

    this.auth.on('login_success', async (user: any) => {
      console.log('User logged in:', user);
      await this.economy.init(user?.agent_id);
      await this.inventory.load();
      await this.loadFriends();
      try {
        await this.loadGroups();
      } catch (err) {
        console.warn('[LinkpointApp] Group loading failed:', err);
      }
    });

    this.protocol.on('capabilities_ready', (caps: any) => {
      if (caps?.EventQueueGet && !this.eventQueue.isPolling) {
        this.eventQueue.startPolling(caps.EventQueueGet).catch((err) => {
          console.warn('[LinkpointApp] EventQueue startPolling failed:', err);
        });
      }
    });

    this.auth.on('logout', () => {
      void this.voice.disconnect();
      console.log('User logged out');
      this.eventQueue.stopPolling();
      this.chat.clearHistory();
      this.friends.clear();
      if (this.friendsRetryTimer) {
        clearTimeout(this.friendsRetryTimer);
        this.friendsRetryTimer = null;
      }
      this.friendsError = null;
      this.groups.replaceGroups([]);
    });

    // Automated WebRTC voice re-provisioning on region teleports & parcel transitions
    this.world.on('region_changed', (region: any) => {
      if (region && Number.isFinite(Number(region.x)) && Number.isFinite(Number(region.y))) {
        const origin = CoordinateNormalizer.getRegionOriginMeters(region);
        this.voice.setRegionOrigin(origin);
        this.audio.setRegionOrigin(origin);
        this.regionOriginMeters = [origin[0], origin[1]];
      }
      // A new region: its parcel is not known yet, so the voice channel is decided when the parcel arrives.
      this.parcelSound.reset();
    });

    // The voice channel follows the avatar's parcel: its own channel, the estate channel, or none (parcel flags).
    this.parcelSound.on('agent_parcel', () => this.updateVoiceChannel());

    this.world.on('nearby_changed', (users: any[]) => {
      if (Array.isArray(users)) {
        users.forEach((u) => {
          if (u.id && Array.isArray(u.position)) {
            this.voice.setSpeakerPosition(u.id, u.position, u.name);
          }
        });
      }
      if (this.world.avatarPosition) {
        this.voice.updateSpatial({
          avatarPosition: this.world.avatarPosition,
          ...(this.world.avatarRotation ? { avatarRotation: this.world.avatarRotation } : {}),
        });
      }
    });
  }

  /** The ear follows the camera, the viewer's default (`MediaSoundsEarLocation` 0). */
  private wireSoundListener() {
    this.world.on('camera_changed', () => {
      const camera = this.world.camera3d;
      if (camera)
        this.audio.setListener({
          position: camera.position as [number, number, number],
          forward: camera.viewDirection(),
        });
    });
    // UI sounds the viewer plays for L$ changes, with its threshold (UISndMoneyChangeThreshold).
    let lastBalance: number | null = null;
    this.protocol.on('balance_updated', (balance: number | null) => {
      if (typeof balance === 'number' && lastBalance !== null) {
        const sound = moneySoundFor(balance - lastBalance);
        if (sound) this.audio.playUi(sound);
      }
      lastBalance = typeof balance === 'number' ? balance : null;
    });
  }

  /** What the avatar is wearing and its saved outfits, straight from the session. Throws when it cannot be read. */
  async loadOutfit() {
    if (!this.auth.isLoggedIn() || !slBridge.connected) return { items: [], outfits: [] };
    return slBridge.fetchOutfit();
  }

  async loadGroups() {
    if (!this.auth.isLoggedIn()) return [];
    if (!slBridge.connected) return this.groups.getGroups();
    const sessionId = slBridge.sessionId;
    const groups = await slBridge.fetchGroups();
    if (!slBridge.connected || !this.auth.isLoggedIn() || slBridge.sessionId !== sessionId)
      throw new Error('Session changed while loading groups');
    if (!Array.isArray(groups)) throw new Error('Group list response was invalid');
    this.groups.replaceGroups(groups);
    return groups;
  }

  async loadGroupDetails(groupId: string, section: string) {
    const sessionId = slBridge.sessionId;
    const data = await slBridge.fetchGroupDetails(groupId, section);
    if (!slBridge.connected || !this.auth.isLoggedIn() || slBridge.sessionId !== sessionId)
      throw new Error('Session changed while loading group details');
    if (section === 'members') this.groups.replaceMembers(groupId, data);
    else if (section === 'roles') this.groups.replaceRoles(groupId, data);
    else this.groups.setGroupInfo(groupId, { ...this.groups.getGroupInfo(groupId), ...data });
    return data;
  }

  /** Why the last friends fetch failed, or null; shown by the Friends screen. */
  public friendsError: string | null = null;
  private friendsLoad: Promise<any[]> | null = null;
  private friendsRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Fetch the friends list. The session's buddy list can still be empty or the request can fail right after
   * login, so an empty or failed answer is retried with a growing delay (5 attempts) instead of leaving the
   * list blank. A manual sync starts a fresh round.
   */
  async loadFriends({ attempts = 5 }: { attempts?: number } = {}) {
    if (!this.auth.isLoggedIn()) return [];
    if (this.friendsLoad) return this.friendsLoad;
    if (this.friendsRetryTimer) {
      clearTimeout(this.friendsRetryTimer);
      this.friendsRetryTimer = null;
    }
    const run = async () => {
      try {
        if (typeof this.protocol.fetchFriends === 'function') {
          const friends = await this.protocol.fetchFriends();
          if (Array.isArray(friends)) {
            this.friendsError = null;
            if (friends.length) this.protocol.emit('friends_loaded', friends);
            else if (attempts > 1) this.scheduleFriendsRetry(attempts - 1);
            return friends.length ? friends : this.friends.getFriends();
          }
        }
        this.friendsError = 'The friends list response was invalid.';
      } catch (err) {
        console.warn('[LinkpointApp] loadFriends warning:', err);
        this.friendsError = err instanceof Error ? err.message : 'Friends could not be loaded.';
        if (attempts > 1) this.scheduleFriendsRetry(attempts - 1);
      }
      return this.friends.getFriends();
    };
    this.friendsLoad = run().finally(() => {
      this.friendsLoad = null;
    });
    return this.friendsLoad;
  }

  private scheduleFriendsRetry(attemptsLeft: number) {
    const delay = Math.min(30000, 2000 * 2 ** (4 - attemptsLeft));
    this.friendsRetryTimer = setTimeout(() => {
      this.friendsRetryTimer = null;
      void this.loadFriends({ attempts: attemptsLeft });
    }, delay);
  }
}

export const app = new LinkpointApp();
