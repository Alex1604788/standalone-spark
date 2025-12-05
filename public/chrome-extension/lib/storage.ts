export type RRSettingsV1 = {
  sellerId: string;       // OZON Client-Id
  userId: string;         // Supabase user_id
  email: string;          // service account email
  marketplaceId: string;  // UUID from public.marketplaces.id
  updatedAt: string;      // ISO timestamp
};

const STORAGE_KEY = 'rr_settings_v1';

export async function getSettings(): Promise<RRSettingsV1 | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
}

export async function setSettings(settings: RRSettingsV1): Promise<void> {
  try {
    settings.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    console.log('Settings saved:', { ...settings, sellerId: '***' });
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

export async function clearSettings(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    console.log('Settings cleared');
  } catch (error) {
    console.error('Error clearing settings:', error);
    throw error;
  }
}

export async function clearMarketplaceId(): Promise<void> {
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
