# Third-Party Viewer (TPV) Compliance

To connect to the official Second Life grid, Linkpoint MUST adhere strictly to the [Linden Lab Policy on Third-Party Viewers](https://secondlife.com/corporate/tpv.php). Failure to comply can result in the viewer being permanently blocked from the grid.

This document outlines the specific code-level implementations required to maintain compliance.

## 1. Viewer Identification (Login Channel)
Linden Lab requires all viewers to properly identify themselves during the login handshake.
- **Requirement:** We must never spoof the official Second Life viewer name.
- **Implementation:**
  - The `channel` string in the XML-RPC login request must be set to exactly `Linkpoint Viewer` (or whatever the final registered name is).
  - The `version` string must accurately reflect the current build version.

## 2. MAC Address Handling (Privacy & Ban Evasion)
The login server requires a MAC address string (often called `mac` or `id0` in the protocol) for hardware identification and ban enforcement.
- **Requirement:** TPVs must send a persistent identifier, but it should protect user privacy by not transmitting the actual physical MAC address in plaintext if possible. Crucially, TPVs **cannot** offer features that allow users to intentionally randomize their MAC address on every login to evade bans.
- **Implementation:**
  - We use `globalThis.crypto.getRandomValues()` to generate a secure, persistent UUID on first run.
  - This UUID is stored in local storage and hashed via MD5 (`spark-md5`) before being sent as the `mac` address parameter during login.
  - **Code Guardrail:** There must be NO user-facing UI option to "regenerate" or "spoof" this MAC address.

## 3. Asset Export and "Copybotting" Prevention
Linden Lab strictly enforces intellectual property rights via the permission system (Copy, Modify, Transfer).
- **Requirement:** The viewer must respect all asset permissions. Users cannot be allowed to save or export textures, meshes, or animations that they do not have explicit full permissions for.
- **Implementation:**
  - **No Export UI:** The UI will not present "Save to Disk" or "Export" buttons for 3D assets or textures unless the logged-in user is verified as the original Creator of the asset.
  - **Cache Protection:** If assets are cached locally (e.g., Web/Desktop local storage), they should be stored in proprietary or obfuscated formats (like raw UDP binary dumps) rather than easily readable formats (like loose `.obj` or `.png` files) to discourage casual scraping.

## 4. RLV (Restrained Life Viewer) Restrictions
RLV introduces consensual restrictions on the user's viewer.
- **Requirement:** If RLV is enabled, the viewer must strictly enforce the restrictions requested by the RLV controller (e.g., preventing detachment of items, restricting chat, or forcing camera views).
- **Implementation:** The `RLVManager` must hook into the core input/output pipelines of the UI to guarantee that if a restriction is active, the UI strictly prohibits the action.

## 5. UDP Packet Forgery
- **Requirement:** The viewer must only send standard, documented, and harmless UDP messages.
- **Implementation:** Our Web-to-UDP Proxy server will include basic packet inspection to ensure only whitelisted or structurally valid SL Protocol packets are forwarded to the grid, preventing the proxy from being used as a generic DDoS tool.
