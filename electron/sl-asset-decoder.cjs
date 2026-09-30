const sharp = require('sharp');
const { JpxImage } = require('jpeg2000');
const { LLMesh } = require('@caspertech/node-metaverse');

function number(value, axis) {
  if (typeof value?.[axis] === 'number') return value[axis];
  const getter = `get${axis.toUpperCase()}`;
  return typeof value?.[getter] === 'function' ? value[getter]() : 0;
}

async function decodeLLMesh(buffer) {
  const mesh = await LLMesh.from(buffer);
  const level = mesh.lodLevels.high_lod || mesh.lodLevels.medium_lod || mesh.lodLevels.low_lod || mesh.lodLevels.lowest_lod;
  if (!level) throw new Error('LLMesh contains no renderable LOD');
  const vertices = [], normals = [], texCoords = [], indices = [];
  for (const submesh of level) {
    if (submesh.noGeometry || !submesh.position || !submesh.triangleList) continue;
    const offset = vertices.length / 3;
    if (offset + submesh.position.length > 65535) break;
    submesh.position.forEach((point) => vertices.push(number(point, 'x'), number(point, 'y'), number(point, 'z')));
    submesh.position.forEach((_point, index) => {
      const normal = submesh.normal?.[index];
      normals.push(normal ? number(normal, 'x') : 0, normal ? number(normal, 'y') : 0, normal ? number(normal, 'z') : 1);
      const uv = submesh.texCoord0?.[index];
      texCoords.push(uv ? number(uv, 'x') : 0, uv ? number(uv, 'y') : 0);
    });
    submesh.triangleList.forEach((index) => indices.push(offset + index));
  }
  if (!indices.length) throw new Error('LLMesh LOD has no supported geometry');
  return { vertices, normals, texCoords, indices };
}

async function decodePixels(buffer) {
  try {
    const image = new JpxImage();
    image.parse(new Uint8Array(buffer));
    const rgba = Buffer.alloc(image.width * image.height * 4, 255);
    for (const tile of image.tiles) for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
      const source = (y * tile.width + x) * image.componentsCount;
      const target = ((tile.top + y) * image.width + tile.left + x) * 4;
      rgba[target] = tile.items[source];
      rgba[target + 1] = image.componentsCount > 1 ? tile.items[source + 1] : tile.items[source];
      rgba[target + 2] = image.componentsCount > 2 ? tile.items[source + 2] : tile.items[source];
      if (image.componentsCount > 3) rgba[target + 3] = tile.items[source + 3];
    }
    return { data: rgba, width: image.width, height: image.height, channels: 4 };
  } catch {
    const result = await sharp(buffer, { failOn: 'error' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: result.data, width: result.info.width, height: result.info.height, channels: result.info.channels };
  }
}

async function decodeSculpt(buffer, sculptType = 1) {
  const decoded = await decodePixels(buffer);
  const size = Math.max(8, Math.min(64, Math.min(decoded.width, decoded.height)));
  const { data, info } = await sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: decoded.channels } })
    .resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const vertices = [], normals = [], texCoords = [], indices = [];
  const baseType = sculptType & 0x3f, mirror = Boolean(sculptType & 0x80), invert = Boolean(sculptType & 0x40);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const sourceX = mirror ? info.width - 1 - x : x;
    const p = (y * info.width + sourceX) * info.channels;
    vertices.push(data[p] / 255 - 0.5, data[p + 1] / 255 - 0.5, data[p + 2] / 255 - 0.5);
    normals.push(0, 0, invert ? -1 : 1);
    texCoords.push(x / (info.width - 1), y / (info.height - 1));
  }
  const wrapsX = baseType !== 3;
  for (let y = 0; y < info.height - 1; y++) for (let x = 0; x < info.width - (wrapsX ? 0 : 1); x++) {
    const nx = (x + 1) % info.width, a = y * info.width + x, b = y * info.width + nx;
    const c = (y + 1) * info.width + x, d = (y + 1) * info.width + nx;
    if (invert) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
  }
  return { vertices, normals, texCoords, indices };
}

async function decodeJPEG2000(buffer) {
  const decoded = await decodePixels(buffer);
  return { width: decoded.width, height: decoded.height, rgba: decoded.data.toString('base64') };
}

module.exports = { decodeLLMesh, decodeSculpt, decodeJPEG2000 };
