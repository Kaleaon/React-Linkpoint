import { describe, it, expect } from 'vitest';
import { XMLRPCClient } from '../xmlrpc-client';

describe('XMLRPCClient', () => {
  describe('generateMAC()', () => {
    it('should return a string', () => {
      const mac = XMLRPCClient.generateMAC();
      expect(typeof mac).toBe('string');
    });

    it('should return a string of exactly 17 characters', () => {
      const mac = XMLRPCClient.generateMAC();
      expect(mac.length).toBe(17);
    });

    it('should match the expected MAC address format (XX:XX:XX:XX:XX:XX)', () => {
      const mac = XMLRPCClient.generateMAC();
      // Format: 6 pairs of uppercase hex digits separated by colons
      const macRegex = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
      expect(mac).toMatch(macRegex);
    });

    it('should generate different MAC addresses on subsequent calls', () => {
      const mac1 = XMLRPCClient.generateMAC();
      const mac2 = XMLRPCClient.generateMAC();
      // It's theoretically possible but practically impossible for them to be the same
      // (1 in 16^12 chance)
      expect(mac1).not.toBe(mac2);
    });
  });
});
