/**
 * Tug of War: Citadels of Aethelgard
 * CampaignStorage: LocalStorage Persistence Boundary (Section 3.4 & GOVERNANCE.md)
 * Strictly isolates browser web storage APIs from headless core simulation logic.
 */

import { CampaignManager } from '../../core/campaign/CampaignManager';

export const CAMPAIGN_STORAGE_KEY = 'tug_of_war_campaign_save_v1';

export class CampaignStorage {
  /**
   * Serializes and writes active campaign run to window.localStorage.
   */
  public static save(manager: CampaignManager): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      const json = manager.serialize();
      window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, json);
    } catch (err) {
      console.error('[CampaignStorage] Failed to save campaign run:', err);
    }
  }

  /**
   * Loads and deserializes saved campaign run from window.localStorage.
   * Returns null if no save exists or if data is corrupt.
   */
  public static load(): CampaignManager | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return CampaignManager.deserialize(raw);
    } catch (err) {
      console.error('[CampaignStorage] Failed to restore campaign run:', err);
      return null;
    }
  }

  /**
   * Clears saved campaign run from window.localStorage.
   */
  public static clear(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
    } catch (err) {
      console.error('[CampaignStorage] Failed to clear campaign run:', err);
    }
  }

  /**
   * Checks whether a serialized campaign run is stored in window.localStorage.
   */
  public static hasSavedRun(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      return window.localStorage.getItem(CAMPAIGN_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }
}
