import { DOMParser, Element as XMLElement } from '@xmldom/xmldom';
import { LocalRegion, LocalPrim } from './LocalGridServer';
import { Utils } from '../utils';
import { gridConsole, GridConsole, LOG_COMPONENTS } from './GridConsole';

export interface OARMetadata {
  majorVersion: number;
  minorVersion: number;
  regionName: string;
  creationTimestamp: number;
}

export interface ParsedOAR {
  metadata: OARMetadata;
  region: LocalRegion;
  assets: Array<{ id: string; name: string; assetType: string; data: Uint8Array | string }>;
}

export class OARParser {
  private console: GridConsole;

  constructor(console: GridConsole = gridConsole) {
    this.console = console;
  }

  public async parseOAR(fileData: ArrayBuffer | Uint8Array | string): Promise<ParsedOAR> {
    const defaultRegionId = Utils.generateUUID();
    const regionName = 'Imported OAR Region';

    const region: LocalRegion = {
      id: defaultRegionId,
      name: regionName,
      locX: 1000,
      locY: 1000,
      serverURI: 'http://127.0.0.1:9000/',
      simIp: '127.0.0.1',
      simPort: 9000,
      terrainHeightmap: new Float32Array(256 * 256).fill(21),
      prims: [],
    };

    this.console.info(LOG_COMPONENTS.ARCHIVER, 'Loading OAR data into a new region...');

    if (typeof fileData === 'string') {
      if (fileData.includes('<SceneObjectGroup>')) {
        try {
          const prims = this.parseSceneObjectXml(fileData);
          region.prims = prims;
          this.console.info(
            LOG_COMPONENTS.ARCHIVER,
            `Loaded ${prims.length} object(s) into region "${regionName}".`,
          );
        } catch (e) {
          this.console.captureError(
            LOG_COMPONENTS.ARCHIVER,
            'Failed to parse SceneObjectGroup XML.',
            e,
          );
        }
      } else {
        this.console.warn(
          LOG_COMPONENTS.ARCHIVER,
          'No <SceneObjectGroup> elements found in the supplied data; the region was created empty.',
        );
      }
    } else {
      // Binary .oar archives are gzipped tar; only the scene XML path is implemented so far.
      this.console.warn(
        LOG_COMPONENTS.ARCHIVER,
        'Binary OAR archives are not supported yet; supply SceneObjectGroup XML instead. The region was created empty.',
      );
    }

    return {
      metadata: {
        majorVersion: 1,
        minorVersion: 0,
        regionName,
        creationTimestamp: Date.now(),
      },
      region,
      assets: [],
    };
  }

  public parseSceneObjectXml(xmlString: string): LocalPrim[] {
    if (!xmlString || xmlString.trim() === '') {
      return [];
    }

    const prims: LocalPrim[] = [];

    try {
      const cleanXml = xmlString.replace(/^\s*<\?xml[^>]*\?>/i, '');
      const wrappedXml = `<root>${cleanXml}</root>`;

      const parser = new DOMParser({
        onError: (level: 'warning' | 'error' | 'fatalError', msg: string) => {
          this.console.debug(LOG_COMPONENTS.ARCHIVER, `XML parse ${level}: ${msg}`);
        },
      });

      const doc = parser.parseFromString(wrappedXml, 'text/xml');
      const groupElements = doc.getElementsByTagName('SceneObjectGroup');

      for (let i = 0; i < groupElements.length; i++) {
        const groupEl = groupElements[i];

        const nameEl = groupEl.getElementsByTagName('Name')[0];
        const rawNameText = nameEl?.textContent;
        const hasName = Boolean(nameEl && rawNameText && rawNameText.trim().length > 0);
        const name = hasName && rawNameText ? rawNameText.trim() : 'Object';

        const descEl = groupEl.getElementsByTagName('Description')[0];
        const description = descEl?.textContent ?? '';

        const posEl = groupEl.getElementsByTagName('GroupPosition')[0];
        const rotEl = groupEl.getElementsByTagName('RotationOffset')[0];
        const scaleEl = groupEl.getElementsByTagName('Scale')[0];

        const prim: LocalPrim = {
          id: Utils.generateUUID(),
          name,
          description,
          position: {
            x: this.getFloatChild(posEl, 'X', 128),
            y: this.getFloatChild(posEl, 'Y', 128),
            z: this.getFloatChild(posEl, 'Z', 22),
          },
          rotation: {
            x: this.getFloatChild(rotEl, 'X', 0),
            y: this.getFloatChild(rotEl, 'Y', 0),
            z: this.getFloatChild(rotEl, 'Z', 0),
            w: this.getFloatChild(rotEl, 'W', 1),
          },
          scale: {
            x: this.getFloatChild(scaleEl, 'X', 0.5),
            y: this.getFloatChild(scaleEl, 'Y', 0.5),
            z: this.getFloatChild(scaleEl, 'Z', 0.5),
          },
          shape: 'box',
          textureAssets: [],
        };

        if (!hasName) {
          this.console.debug(
            LOG_COMPONENTS.ARCHIVER,
            `Object ${prim.id} has no <Name>; imported as "Object".`,
          );
        }

        prims.push(prim);
      }
    } catch (e) {
      this.console.captureError(
        LOG_COMPONENTS.ARCHIVER,
        'Error encountered during XML DOM parsing.',
        e,
      );
    }

    return prims;
  }

  private getFloatChild(
    parent: XMLElement | null | undefined,
    tagName: string,
    defaultValue: number,
  ): number {
    if (!parent) return defaultValue;
    const elem = parent.getElementsByTagName(tagName)[0];
    if (!elem || elem.textContent === null || elem.textContent === undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(elem.textContent.trim());
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
}
