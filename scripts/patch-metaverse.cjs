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
