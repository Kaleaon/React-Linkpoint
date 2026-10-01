const fs = require('fs');
const path = require('path');

const packetPath = path.join(__dirname, '../node_modules/@caspertech/node-metaverse/dist/lib/classes/Packet.js');
if (fs.existsSync(packetPath)) {
  let content = fs.readFileSync(packetPath, 'utf8');
  const target = "console.error('WARNING: Finished reading ' + (0, MessageClasses_1.nameFromID)(messageID) + ' but we\\'re not at the end of the packet (' + pos + ' < ' + buf.length + ', seq ' + this.sequenceNumber + ')');";
  if (content.includes(target)) {
    content = content.replace(target, "// Second Life simulator packets frequently contain extra padding or newer unparsed fields; ignore gracefully");
    fs.writeFileSync(packetPath, content, 'utf8');
    console.log('[patch-metaverse] Patched Packet.js successfully.');
  }
}

const friendCommandsPath = path.join(__dirname, '../node_modules/@caspertech/node-metaverse/dist/lib/classes/commands/FriendCommands.js');
if (fs.existsSync(friendCommandsPath)) {
  let fcContent = fs.readFileSync(friendCommandsPath, 'utf8');
  let modified = false;

  // Fix OnlineNotification has() === undefined bug
  const onlineTarget = "if (this.friendsList.has(uuidStr) === undefined)";
  if (fcContent.includes(onlineTarget)) {
    fcContent = fcContent.replaceAll(onlineTarget, "if (!this.friendsList.has(uuidStr))");
    modified = true;
  }

  // Ensure online event fires reliably even if friend object is already present or resolving
  const onlineCheckTarget = "if (friend && !friend.online) {";
  const onlineCheckReplacement = "if (friend) {";
  if (fcContent.includes(onlineCheckTarget)) {
    fcContent = fcContent.replace(onlineCheckTarget, onlineCheckReplacement);
    modified = true;
  }

  const offlineCheckTarget = "if (friend !== undefined && friend.online) {";
  const offlineCheckReplacement = "if (friend !== undefined) {";
  if (fcContent.includes(offlineCheckTarget)) {
    fcContent = fcContent.replace(offlineCheckTarget, offlineCheckReplacement);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(friendCommandsPath, fcContent, 'utf8');
    console.log('[patch-metaverse] Patched FriendCommands.js successfully for online status.');
  }
}
