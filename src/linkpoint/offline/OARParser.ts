import { LocalRegion, LocalPrim } from './LocalGridServer';
import { Utils } from '../utils';

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
      prims: []
    };

    if (typeof fileData === 'string' && fileData.includes('<SceneObjectGroup>')) {
      const prims = this.parseSceneObjectXml(fileData);
      region.prims = prims;
    }

    return {
      metadata: {
        majorVersion: 1,
        minorVersion: 0,
        regionName,
        creationTimestamp: Date.now()
      },
      region,
      assets: []
    };
  }

  public parseSceneObjectXml(xmlString: string): LocalPrim[] {
    const prims: LocalPrim[] = [];
    const groupMatches = xmlString.match(/<SceneObjectGroup>[\s\S]*?<\/SceneObjectGroup>/g) || [];

    for (const groupXml of groupMatches) {
      const nameMatch = groupXml.match(/<Name>(.*?)<\/Name>/);
      const descMatch = groupXml.match(/<Description>(.*?)<\/Description>/);
      const posMatch = groupXml.match(/<GroupPosition><X>(.*?)<\/X><Y>(.*?)<\/Y><Z>(.*?)<\/Z><\/GroupPosition>/);
      const rotMatch = groupXml.match(/<RotationOffset><X>(.*?)<\/X><Y>(.*?)<\/Y><Z>(.*?)<\/Z><W>(.*?)<\/W><\/RotationOffset>/);
      const scaleMatch = groupXml.match(/<Scale><X>(.*?)<\/X><Y>(.*?)<\/Y><Z>(.*?)<\/Z><\/Scale>/);

      const prim: LocalPrim = {
        id: Utils.generateUUID(),
        name: nameMatch ? nameMatch[1] : 'Object',
        description: descMatch ? descMatch[1] : '',
        position: {
          x: posMatch ? parseFloat(posMatch[1]) : 128,
          y: posMatch ? parseFloat(posMatch[2]) : 128,
          z: posMatch ? parseFloat(posMatch[3]) : 22
        },
        rotation: {
          x: rotMatch ? parseFloat(rotMatch[1]) : 0,
          y: rotMatch ? parseFloat(rotMatch[2]) : 0,
          z: rotMatch ? parseFloat(rotMatch[3]) : 0,
          w: rotMatch ? parseFloat(rotMatch[4]) : 1
        },
        scale: {
          x: scaleMatch ? parseFloat(scaleMatch[1]) : 0.5,
          y: scaleMatch ? parseFloat(scaleMatch[2]) : 0.5,
          z: scaleMatch ? parseFloat(scaleMatch[3]) : 0.5
        },
        shape: 'box',
        textureAssets: []
      };

      prims.push(prim);
    }

    return prims;
  }
}
