/**
 * @typedef {Object} RRSettingsV1
 * @property {string} sellerId - OZON Client-Id
 * @property {string} userId - Supabase user_id
 * @property {string} email - Service account email
 * @property {string} marketplaceId - UUID from public.marketplaces.id
 * @property {string} updatedAt - ISO timestamp
 */

const STORAGE_KEY = 'rr_settings_v1';

/**
 * Get saved settings
 * @returns {Promise<RRSettingsV1|null>}
 */
export async function getSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
}

/**
 * Save settings
 * @param {RRSettingsV1} settings
 * @returns {Promise<void>}
 */
export async function setSettings(settings) {
  try {
    settings.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    console.log('Settings saved:', { ...settings, sellerId: '***' });
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

/**
 * Clear all settings
 * @returns {Promise<void>}
 */
export async function clearSettings() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    console.log('Settings cleared');
  } catch (error) {
    console.error('Error clearing settings:', error);
    throw error;
  }
}

/**
 * Clear only marketplace ID (for switching stores)
 * @returns {Promise<void>}
 */
export async function clearMarketplaceId() {
  try {
    const settings = await getSettings();
    if (settings) {
      settings.marketplaceId = '';
      await setSettings(settings);
      console.log('Marketplace ID cleared');
    }
  } catch (error) {
    console.error('Error clearing marketplace ID:', error);
    throw error;
  }
}
