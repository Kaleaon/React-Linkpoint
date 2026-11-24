#!/usr/bin/env node
/**
 * Offline Second Life Upstream Provenance & Conformance Vector Verifier
 *
 * 1. Validates every JSON file in `test-vectors/` (excluding `schemas/`) against its
 *    corresponding JSON Schema in `test-vectors/schemas/`.
 * 2. Verifies 1-to-1 UDP wire message ID parity across:
 *    - `test-vectors/protocol/master_message_template_vectors.json`
 *    - `src/linkpoint/sl-message-types.ts` (`MessageIDs`)
 *    - `android-kotlin/core/src/main/kotlin/app/linkpoint/core/net/Wire.kt` (`object Msg`)
 * 3. Verifies `docs/official-sources.md` documents all 12 official Linden Lab repositories
 *    and 10 ecosystem TPV/protocol/simulator repositories with zero dead `secondlife/llsd` links.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const SCHEMA_BY_SUBDIR = {
  llsd: 'llsd_vectors_schema.json',
  math: 'math_vectors_schema.json',
  mesh: 'mesh_vectors_schema.json',
  protocol: 'protocol_vectors_schema.json',
  textures: 'texture_vectors_schema.json',
};

const REQUIRED_OFFICIAL_LL_REPOS = [
  'https://github.com/secondlife/viewer',
  'https://github.com/secondlife/master-message-template',
  'https://github.com/secondlife/lsl-definitions',
  'https://github.com/secondlife/slua',
  'https://github.com/secondlife/python-llsd',
  'https://github.com/secondlife/python-llbase',
  'https://github.com/secondlife/dullahan',
  'https://github.com/secondlife/autobuild',
  'https://github.com/secondlife/build-variables',
  'https://github.com/secondlife/llca',
  'https://github.com/secondlife/3p-openjpeg',
  'https://github.com/secondlife/3p-webrtc-build',
];

const REQUIRED_ECOSYSTEM_REPOS = [
  'https://github.com/FirestormViewer/phoenix-firestorm',
  'https://github.com/KittyBarnett/RLVa',
  'https://github.com/Kaleaon/Lumiya-redux',
  'https://github.com/cinderblocks/radegast',
  'https://github.com/AlchemyViewer/Alchemy',
  'https://github.com/cinderblocks/libremetaverse',
  'https://github.com/caspertech/node-metaverse',
  'https://github.com/opensim/opensim',
  'https://github.com/HalcyonGrid',
  'https://github.com/Kaleaon/linkpoint-design',
];

function matchesJsonType(value, expectedType) {
  switch (expectedType) {
    case 'null':
      return value === null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

function validateAgainstSchema(value, schema, jsonPath = '$', errors = []) {
  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = allowedTypes.some((t) => matchesJsonType(value, t));
    if (!ok) {
      errors.push(
        `${jsonPath}: expected type ${allowedTypes.join('|')}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
      );
      return errors;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(
      `${jsonPath}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
    );
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(
      `${jsonPath}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]`,
    );
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${jsonPath}: string length ${value.length} < minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${jsonPath}: string length ${value.length} > maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === 'string') {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(
          `${jsonPath}: string ${JSON.stringify(value)} does not match /${schema.pattern}/`,
        );
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${jsonPath}: number ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${jsonPath}: number ${value} > maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${jsonPath}: array length ${value.length} < minItems ${schema.minItems}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${jsonPath}: array length ${value.length} > maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        validateAgainstSchema(value[i], schema.items, `${jsonPath}[${i}]`, errors);
      }
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, reqKey)) {
          errors.push(`${jsonPath}: missing required property "${reqKey}"`);
        }
      }
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(props, k)) {
        validateAgainstSchema(v, props[k], `${jsonPath}.${k}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${jsonPath}: unexpected additional property "${k}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateAgainstSchema(v, schema.additionalProperties, `${jsonPath}.${k}`, errors);
      }
    }
  }

  return errors;
}

function listVectorFiles(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'schemas') continue;
      results.push(...listVectorFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results.sort();
}

function parseTypeScriptMessageIds(tsFilePath) {
  const src = fs.readFileSync(tsFilePath, 'utf8');
  const blockMatch = src.match(/export const MessageIDs\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!blockMatch) {
    throw new Error(
      `Could not locate "export const MessageIDs = { ... } as const;" in ${tsFilePath}`,
    );
  }
  const map = new Map();
  for (const line of blockMatch[1].split('\n')) {
    const cleaned = line.replace(/\/\/.*$/, '').trim();
    const mFn = cleaned.match(
      /^([A-Z0-9_]+)\s*:\s*(high|medium|low|fixed)FrequencyId\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*,?$/,
    );
    if (mFn) {
      const name = mFn[1];
      const kind = mFn[2];
      const num = mFn[3].toLowerCase().startsWith('0x')
        ? Number.parseInt(mFn[3], 16) >>> 0
        : Number.parseInt(mFn[3], 10) >>> 0;
      let wireId = 0;
      if (kind === 'high') wireId = num & 0xff;
      else if (kind === 'medium') wireId = (0xff00 | (num & 0xff)) >>> 0;
      else if (kind === 'low') wireId = (0xffff0000 | (num & 0xffff)) >>> 0;
      else if (kind === 'fixed') wireId = (0xffffff00 | (num & 0xff)) >>> 0;
      map.set(name, wireId >>> 0);
      continue;
    }
    const m = cleaned.match(/^([A-Z0-9_]+)\s*:\s*(0x[0-9a-fA-F]+|\d+)\s*,?$/);
    if (m) {
      const val =
        m[2].startsWith('0x') || m[2].startsWith('0X')
          ? Number.parseInt(m[2], 16) >>> 0
          : Number.parseInt(m[2], 10) >>> 0;
      map.set(m[1], val);
    }
  }
  return map;
}

function parseKotlinMessageIds(ktFilePath) {
  const src = fs.readFileSync(ktFilePath, 'utf8');
  const blockMatch = src.match(/object\s+Msg\s*\{([\s\S]*?)\n\s*\}/);
  if (!blockMatch) {
    throw new Error(`Could not locate "object Msg { ... }" in ${ktFilePath}`);
  }
  const map = new Map();
  for (const line of blockMatch[1].split('\n')) {
    const cleaned = line.replace(/\/\/.*$/, '').trim();
    const mFn = cleaned.match(
      /^val\s+([A-Za-z0-9_]+)\s*=\s*(high|medium|low|fixed)\(\s*(0x[0-9a-fA-F]+|\d+)[uU]?\s*\)/,
    );
    if (mFn) {
      const name = mFn[1];
      const kind = mFn[2];
      const num = mFn[3].toLowerCase().startsWith('0x')
        ? Number.parseInt(mFn[3], 16) >>> 0
        : Number.parseInt(mFn[3], 10) >>> 0;
      let wireId = 0;
      if (kind === 'high') wireId = num & 0xff;
      else if (kind === 'medium') wireId = (0xff00 | (num & 0xff)) >>> 0;
      else if (kind === 'low') wireId = (0xffff0000 | (num & 0xffff)) >>> 0;
      else if (kind === 'fixed') wireId = (0xffffff00 | (num & 0xff)) >>> 0;
      map.set(name, wireId >>> 0);
      continue;
    }
    const mConst = cleaned.match(
      /^const\s+val\s+([A-Za-z0-9_]+)\s*(?::\s*Int)?\s*=\s*(0x[0-9a-fA-F]+|\d+)/,
    );
    if (mConst) {
      const wireId = mConst[2].toLowerCase().startsWith('0x')
        ? Number.parseInt(mConst[2], 16) >>> 0
        : Number.parseInt(mConst[2], 10) >>> 0;
      map.set(mConst[1], wireId >>> 0);
    }
  }
  return map;
}

const failures = [];

// 1. Validate all test-vectors JSON files against their JSON Schemas
const vectorsDir = path.join(repoRoot, 'test-vectors');
const schemasDir = path.join(vectorsDir, 'schemas');
const vectorFiles = listVectorFiles(vectorsDir);

if (vectorFiles.length === 0) {
  failures.push('No test-vector JSON files found in test-vectors/');
}

for (const vecPath of vectorFiles) {
  const rel = path.relative(vectorsDir, vecPath);
  const topDir = rel.split(path.sep)[0];
  const schemaFile = SCHEMA_BY_SUBDIR[topDir];
  if (!schemaFile) {
    failures.push(`test-vectors/${rel}: no schema mapping registered for directory "${topDir}"`);
    continue;
  }
  const schemaPath = path.join(schemasDir, schemaFile);
  if (!fs.existsSync(schemaPath)) {
    failures.push(`test-vectors/${rel}: missing schema file test-vectors/schemas/${schemaFile}`);
    continue;
  }
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const data = JSON.parse(fs.readFileSync(vecPath, 'utf8'));
  const schemaErrors = validateAgainstSchema(data, schema, `test-vectors/${rel}`);
  failures.push(...schemaErrors);
}

// 2. Verify wire message ID parity between master_message_template_vectors.json, sl-message-types.ts, and Wire.kt
const protocolVectorsPath = path.join(
  vectorsDir,
  'protocol',
  'master_message_template_vectors.json',
);
const tsMsgPath = path.join(repoRoot, 'src', 'linkpoint', 'sl-message-types.ts');
const ktWirePath = path.join(
  repoRoot,
  'android-kotlin',
  'core',
  'src',
  'main',
  'kotlin',
  'app',
  'linkpoint',
  'core',
  'net',
  'Wire.kt',
);

const protocolDoc = JSON.parse(fs.readFileSync(protocolVectorsPath, 'utf8'));
const tsIds = parseTypeScriptMessageIds(tsMsgPath);
const ktIds = parseKotlinMessageIds(ktWirePath);

for (const msg of protocolDoc.messages) {
  const expectedWireId = msg.wire_id >>> 0;
  const tsVal = tsIds.get(msg.ts_constant);
  if (tsVal === undefined) {
    failures.push(`TS MessageIDs missing "${msg.ts_constant}" for canonical message "${msg.name}"`);
  } else if (tsVal !== expectedWireId) {
    failures.push(
      `TS MessageIDs.${msg.ts_constant} = 0x${tsVal.toString(16)}, expected 0x${expectedWireId.toString(16)} (${msg.name})`,
    );
  }

  const ktVal = ktIds.get(msg.kotlin_constant);
  if (ktVal === undefined) {
    failures.push(
      `Kotlin Wire.kt Msg missing "${msg.kotlin_constant}" for canonical message "${msg.name}"`,
    );
  } else if (ktVal !== expectedWireId) {
    failures.push(
      `Kotlin Msg.${msg.kotlin_constant} = 0x${ktVal.toString(16)}, expected 0x${expectedWireId.toString(16)} (${msg.name})`,
    );
  }
}

// Also ensure Kotlin Msg has no drift constants outside canonical template vectors
const canonicalKtValues = new Map(
  protocolDoc.messages.map((m) => [m.kotlin_constant, m.wire_id >>> 0]),
);
for (const [ktKey, ktWireId] of ktIds.entries()) {
  if (!canonicalKtValues.has(ktKey)) {
    failures.push(
      `Kotlin Msg.${ktKey} (0x${ktWireId.toString(16)}) is not tracked in master_message_template_vectors.json`,
    );
  }
}

// Also ensure every TS MessageIDs entry matches a canonical wire ID (including documented legacy aliases)
const validWireIds = new Set(protocolDoc.messages.map((m) => m.wire_id >>> 0));
for (const [tsKey, tsWireId] of tsIds.entries()) {
  if (!validWireIds.has(tsWireId)) {
    failures.push(`TS MessageIDs.${tsKey} has non-canonical wire ID 0x${tsWireId.toString(16)}`);
  }
}

// 3. Verify docs/official-sources.md upstream repository registry
const officialSourcesPath = path.join(repoRoot, 'docs', 'official-sources.md');
const officialSourcesText = fs.readFileSync(officialSourcesPath, 'utf8');

for (const repoUrl of REQUIRED_OFFICIAL_LL_REPOS) {
  if (!officialSourcesText.includes(repoUrl)) {
    failures.push(`docs/official-sources.md missing official Linden Lab repository: ${repoUrl}`);
  }
}
for (const repoUrl of REQUIRED_ECOSYSTEM_REPOS) {
  if (!officialSourcesText.includes(repoUrl)) {
    failures.push(`docs/official-sources.md missing ecosystem repository: ${repoUrl}`);
  }
}
if (/https?:\/\/github\.com\/secondlife\/llsd(?![-a-z0-9_])/i.test(officialSourcesText)) {
  failures.push(
    'docs/official-sources.md references non-existent github.com/secondlife/llsd (use secondlife/python-llsd)',
  );
}

if (failures.length > 0) {
  console.error(`[sl-sources] ${failures.length} verification failure(s):`);
  for (const err of failures) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  `[sl-sources] Verified ${vectorFiles.length} test-vector files against schemas, ${protocolDoc.messages.length} canonical UDP wire IDs across TS & Kotlin (${tsIds.size} TS constants, ${ktIds.size} Kotlin constants), and ${REQUIRED_OFFICIAL_LL_REPOS.length + REQUIRED_ECOSYSTEM_REPOS.length} upstream repository citations.`,
);
