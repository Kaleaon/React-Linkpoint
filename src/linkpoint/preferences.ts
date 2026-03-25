/**
 * Linkpoint PWA - Preferences/Settings Manager
 */

import { Utils } from './utils';

export class PreferencesManager extends Utils.EventEmitter {
  public preferences: any;

  constructor() {
    super();
    this.preferences = this.getDefaultPreferences();
  }

  getDefaultPreferences() {
    return {
      graphics: { quality: 'medium', fov: 60 },
      interface: { theme: 'dark', showFPS: true },
      notifications: { enabled: true, soundEnabled: true }
    };
  }

  init() {
    const saved = Utils.storage.get('linkpoint_preferences');
    if (saved) this.preferences = { ...this.getDefaultPreferences(), ...saved };
  }

  get(category: string, key: string) {
    return this.preferences[category]?.[key];
  }

  set(category: string, key: string, value: any) {
    if (!this.preferences[category]) this.preferences[category] = {};
    this.preferences[category][key] = value;
    Utils.storage.set('linkpoint_preferences', this.preferences);
    this.emit('preference_changed', { category, key, value });
  }
}
