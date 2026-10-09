const fs = require('fs');
const path = require('path');

/**
 * Read the viewer identity from its single source of truth so the login handshake
 * and the rest of the app can never disagree (TPV_COMPLIANCE.md section 1).
 */
function readViewerIdentity(root = path.join(__dirname, '..')) {
  const text = fs.readFileSync(path.join(root, 'src/linkpoint/viewer-identity.ts'), 'utf8');
  const channel = (text.match(/export const VIEWER_CHANNEL\s*=\s*'([^']+)'/) || [])[1];
  const version = (text.match(/export const VIEWER_VERSION\s*=\s*'([^']+)'/) || [])[1];
  if (!channel || !version)
    throw new Error('Could not read VIEWER_CHANNEL / VIEWER_VERSION from viewer-identity.ts');
  return { channel, version };
}

/**
 * node-metaverse logs in as channel "libnmv" with its own package version. Make it
 * identify as this viewer instead. Pure so it can be tested; returns the new text,
 * or null when the file does not have the expected shape (so a library update
 * that changes it is noticed rather than silently left unpatched).
 */
function patchLoginIdentity(content, channel, version) {
  const channelLiteral = "channel: 'libnmv'";
  const versionLine = 'const version = packageJson.version;';
  if (
    content.includes(`channel: ${JSON.stringify(channel)}`) &&
    content.includes(`const version = ${JSON.stringify(version)};`)
  )
    return content; // already patched
  if (!content.includes(channelLiteral) || !content.includes(versionLine)) return null;
  return content
    .replace(channelLiteral, `channel: ${JSON.stringify(channel)}`)
    .replace(versionLine, `const version = ${JSON.stringify(version)};`);
}

/**
 * Seed capability endpoints can briefly return 404 while the simulator is bringing the agent's
 * capability host online. The upstream constructor makes one request, dumps the complete `got`
 * error, and leaves every subsequent capability lookup waiting forever. Replace that request with
 * a bounded retry which always releases waiters after its final attempt.
 */
function patchCapsSeedRetry(content) {
  const original = `        this.requestPost(seedURL, LLSD.LLSD.formatXML(req), 'application/llsd+xml').then((resp) => {
            this.capabilities = LLSD.LLSD.parseXML(resp.body);
            this.gotSeedCap = true;
            this.onGotSeedCap.next();
            if (this.capabilities.EventQueueGet) {
                if (this.eventQueueClient !== null) {
                    void this.eventQueueClient.shutdown();
                }
                this.eventQueueClient = new EventQueueClient_1.EventQueueClient(this.agent, this, this.clientEvents);
            }
        }).catch((err) => {
            console.error('Error getting seed capability');
            console.error(err);
        });`;
  const replacement = `        const requestSeed = async () => {
            const maxAttempts = 30;
            let lastError;
            for (let attempt = 0; attempt < maxAttempts && this.active; attempt++) {
                if (attempt > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                if (!this.active) return;
                try {
                    const resp = await this.requestPost(seedURL, LLSD.LLSD.formatXML(req), 'application/llsd+xml');
                    this.capabilities = LLSD.LLSD.parseXML(resp.body);
                    this.gotSeedCap = true;
                    this.onGotSeedCap.next();
                    if (this.capabilities.EventQueueGet) {
                        if (this.eventQueueClient !== null) {
                            void this.eventQueueClient.shutdown();
                        }
                        this.eventQueueClient = new EventQueueClient_1.EventQueueClient(this.agent, this, this.clientEvents);
                    }
                    return;
                }
                catch (err) {
                    lastError = err;
                }
            }
            if (!this.active) return;
            this.gotSeedCap = true;
            this.onGotSeedCap.next();
            const status = lastError && lastError.response && lastError.response.statusCode;
            console.warn('[Caps] Seed capability unavailable after retries' + (status ? ' (HTTP ' + status + ')' : '') + ': ' + ((lastError && lastError.message) || lastError));
        };
        void requestSeed();`;
  if (content.includes('const requestSeed = async () => {')) return content;
  if (!content.includes(original)) return null;
  return content.replace(original, replacement);
}

function applyPatches(options = {}) {
  const { strict = require.main === module } = options;

  // 1. Packet.js: ignore harmless packet padding / newer unparsed fields
  const packetPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/classes/Packet.js',
  );
  if (fs.existsSync(packetPath)) {
    let content = fs.readFileSync(packetPath, 'utf8');
    const target =
      "console.error('WARNING: Finished reading ' + (0, MessageClasses_1.nameFromID)(messageID) + ' but we\\'re not at the end of the packet (' + pos + ' < ' + buf.length + ', seq ' + this.sequenceNumber + ')');";
    if (content.includes(target)) {
      content = content.replace(
        target,
        '// Second Life simulator packets frequently contain extra padding or newer unparsed fields; ignore gracefully',
      );
      fs.writeFileSync(packetPath, content, 'utf8');
      console.log('[patch-metaverse] Patched Packet.js successfully.');
    }
  }

  // 2. FriendCommands.js: online status fixes
  const friendCommandsPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/classes/commands/FriendCommands.js',
  );
  if (fs.existsSync(friendCommandsPath)) {
    let fcContent = fs.readFileSync(friendCommandsPath, 'utf8');
    let modified = false;

    const onlineTarget = 'if (this.friendsList.has(uuidStr) === undefined)';
    if (fcContent.includes(onlineTarget)) {
      fcContent = fcContent.replaceAll(onlineTarget, 'if (!this.friendsList.has(uuidStr))');
      modified = true;
    }

    const onlineCheckTarget = 'if (friend && !friend.online) {';
    const onlineCheckReplacement = 'if (friend) {';
    if (fcContent.includes(onlineCheckTarget)) {
      fcContent = fcContent.replace(onlineCheckTarget, onlineCheckReplacement);
      modified = true;
    }

    const offlineCheckTarget = 'if (friend !== undefined && friend.online) {';
    const offlineCheckReplacement = 'if (friend !== undefined) {';
    if (fcContent.includes(offlineCheckTarget)) {
      fcContent = fcContent.replace(offlineCheckTarget, offlineCheckReplacement);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(friendCommandsPath, fcContent, 'utf8');
      console.log('[patch-metaverse] Patched FriendCommands.js successfully for online status.');
    }
  }

  // 3. LoginHandler.js: viewer identity
  const loginPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/LoginHandler.js',
  );
  if (fs.existsSync(loginPath)) {
    const { channel, version } = readViewerIdentity();
    const original = fs.readFileSync(loginPath, 'utf8');
    const patched = patchLoginIdentity(original, channel, version);
    if (patched === null) {
      const message =
        '[patch-metaverse] LoginHandler.js has an unexpected shape; the login would not identify as ' +
        channel +
        '.';
      if (strict) throw new Error(message);
      console.error(message);
    } else if (patched !== original) {
      fs.writeFileSync(loginPath, patched, 'utf8');
      console.log('[patch-metaverse] Login now identifies as ' + channel + ' ' + version + '.');
    }
  }

  // 4. Caps.js: texture capability headers (Accept: image/x-j2c) and error suppression
  const capsPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/classes/Caps.js',
  );
  if (fs.existsSync(capsPath)) {
    let capsContent = fs.readFileSync(capsPath, 'utf8');
    let modified = false;

    const seedRetryPatched = patchCapsSeedRetry(capsContent);
    if (seedRetryPatched === null) {
      const message =
        '[patch-metaverse] Caps.js has an unexpected seed capability request shape; retries were not installed.';
      if (strict) throw new Error(message);
      console.error(message);
    } else if (seedRetryPatched !== capsContent) {
      capsContent = seedRetryPatched;
      modified = true;
    }

    // Enhance requestGet to support texture downloads with proper binary buffer and Accept header
    const requestGetTarget = `    async requestGet(requestURL) {
        const response = await got_1.default.get(requestURL, {
            https: {
                rejectUnauthorized: false,
            },
        });
        return { status: response.statusCode, body: response.body };
    }`;

    const requestGetReplacement = `    async requestGet(requestURL, options = {}) {
        const isTexture = typeof requestURL === 'string' && (requestURL.includes('texture_id=') || requestURL.includes('GetTexture'));
        const headers = {
            ...(isTexture ? {
                'Accept': 'image/x-j2c, image/jp2, application/octet-stream, */*',
                'User-Agent': 'Linkpoint/2.0.0 (Second Life Compatible Viewer)'
            } : {}),
            ...(options.headers || {})
        };
        const response = await got_1.default.get(requestURL, {
            headers,
            responseType: options.responseType || (isTexture ? 'buffer' : undefined),
            https: {
                rejectUnauthorized: false,
            },
            ...options
        });
        return { status: response.statusCode, body: response.body };
    }`;

    if (capsContent.includes(requestGetTarget)) {
      capsContent = capsContent.replace(requestGetTarget, requestGetReplacement);
      modified = true;
    }

    // Suppress raw console.log error dumps on cap calls (e.g. ChatSessionRequest)
    const capErrorDump = `        catch (error) {
            console.log('Error with cap ' + capName);
            console.log(error);
            throw error;
        }`;
    const capErrorSafe = `        catch (error) {
            if (capName !== 'ChatSessionRequest') {
                console.warn('[Caps] Cap ' + capName + ' error: ' + (error.message || error));
            }
            throw error;
        }`;

    if (capsContent.includes(capErrorDump)) {
      capsContent = capsContent.replaceAll(capErrorDump, capErrorSafe);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(capsPath, capsContent, 'utf8');
      console.log(
        '[patch-metaverse] Patched Caps.js successfully for GetTexture and safe error logging.',
      );
    }
  }

  // 5. EventQueueClient.js: proper UUID formatting for ChatSessionRequest accept invitation
  const eqPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/classes/EventQueueClient.js',
  );
  if (fs.existsSync(eqPath)) {
    let eqContent = fs.readFileSync(eqPath, 'utf8');
    let modified = false;

    const chatReqRegex =
      /const requested = \{\s*['"]method['"]:\s*['"]accept invitation['"],\s*['"]session-id['"]:\s*imSessionID\s*\};/;
    if (chatReqRegex.test(eqContent)) {
      eqContent = eqContent.replace(
        chatReqRegex,
        "const requested = {\n                                                    'method': 'accept invitation',\n                                                    'session-id': (imSessionID && typeof imSessionID === 'object' && imSessionID.constructor && imSessionID.constructor.name === 'UUID') ? new LLSD.UUID(imSessionID.toString()) : (typeof imSessionID === 'string' ? new LLSD.UUID(imSessionID) : imSessionID)\n                                                };",
      );
      modified = true;
    }

    const eqCatchRegex = /\}\)\.catch\(\(err\) => \{\s*console\.error\(err\);\s*\}\);/;
    if (eqCatchRegex.test(eqContent)) {
      eqContent = eqContent.replace(
        eqCatchRegex,
        '}).catch((err) => {\n                                                    console.warn("[ChatterBoxInvitation] ChatSessionRequest failed:", err.message || err);\n                                                });',
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(eqPath, eqContent, 'utf8');
      console.log(
        '[patch-metaverse] Patched EventQueueClient.js successfully for ChatSessionRequest.',
      );
    }
  }

  // 6. @caspertech/llsd/index.js: recognize node-metaverse UUID instances as LLSD UUID type
  const llsdPath = path.join(__dirname, '../node_modules/@caspertech/llsd/index.js');
  if (fs.existsSync(llsdPath)) {
    let llsdContent = fs.readFileSync(llsdPath, 'utf8');
    const uuidCheckTarget = `                if (value instanceof UUID)
                {
                    return 'uuid';
                }`;
    const uuidCheckReplacement = `                if (value instanceof UUID || (value && (typeof value.mUUID === 'string' || value.constructor?.name === 'UUID')))
                {
                    return 'uuid';
                }`;

    if (llsdContent.includes(uuidCheckTarget)) {
      llsdContent = llsdContent.replace(uuidCheckTarget, uuidCheckReplacement);
      fs.writeFileSync(llsdPath, llsdContent, 'utf8');
      console.log(
        '[patch-metaverse] Patched @caspertech/llsd index.js successfully for UUID interoperability.',
      );
    }
  }

  // 7. ObjectStoreLite.js: gracefully handle missing objects without error log pollution
  const oslPath = path.join(
    __dirname,
    '../node_modules/@caspertech/node-metaverse/dist/lib/classes/ObjectStoreLite.js',
  );
  if (fs.existsSync(oslPath)) {
    let oslContent = fs.readFileSync(oslPath, 'utf8');
    const missingObjError =
      "console.error('Error retrieving missing object after 5 attempts: ' + localID);";
    if (oslContent.includes(missingObjError)) {
      oslContent = oslContent.replace(
        missingObjError,
        '// Missing object after 5 attempts blacklisted gracefully',
      );
      fs.writeFileSync(oslPath, oslContent, 'utf8');
      console.log(
        '[patch-metaverse] Patched ObjectStoreLite.js successfully for missing object handling.',
      );
    }
  }
}

module.exports = { readViewerIdentity, patchLoginIdentity, patchCapsSeedRetry, applyPatches };

if (require.main === module) applyPatches();
