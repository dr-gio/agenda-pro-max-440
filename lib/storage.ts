
import { CalendarConfig } from '../types';
import { DEFAULT_CALENDARS } from '../constants';
import { supabase } from './supabaseClient';

const CONFIG_ID = 'default';
const API_KEY_SETTING_KEY = 'gemini_api_key';

// Cache local para mejorar el rendimiento
let calendarsCache: CalendarConfig[] | null = null;
let apiKeyCache: string | null = null;

export const storage = {
  // Sync version (returns cache or defaults)
  getCalendarsSync: (): CalendarConfig[] => {
    if (calendarsCache) return calendarsCache;

    // Intentar leer de localStorage como backup temporal
    const localData = localStorage.getItem('calendars:v1');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch {
        return DEFAULT_CALENDARS;
      }
    }

    return DEFAULT_CALENDARS;
  },

  // Async version (fetches from Supabase)
  getCalendars: async (): Promise<CalendarConfig[]> => {
    try {
      const { data, error } = await supabase
        .from('calendar_configs')
        .select('calendars')
        .eq('id', CONFIG_ID)
        .single();

      if (error) {
        console.warn('Error fetching calendars from Supabase:', error);
        // Si no existe, crear con defaults
        if (error.code === 'PGRST116') {
          await storage.seedDefaults();
          return DEFAULT_CALENDARS;
        }
        return storage.getCalendarsSync();
      }

      if (data && data.calendars) {
        const calendars = Array.isArray(data.calendars) ? data.calendars : DEFAULT_CALENDARS;
        calendarsCache = calendars;
        // Actualizar localStorage como backup
        localStorage.setItem('calendars:v1', JSON.stringify(calendars));
        return calendars;
      }

      return DEFAULT_CALENDARS;
    } catch (e) {
      console.warn("Supabase fetch error, falling back to local cache", e);
      return storage.getCalendarsSync();
    }
  },

  saveCalendars: async (calendars: CalendarConfig[]) => {
    // Actualizar cache
    calendarsCache = calendars;
    // Actualizar localStorage como backup
    localStorage.setItem('calendars:v1', JSON.stringify(calendars));

    try {
      const { error } = await supabase
        .from('calendar_configs')
        .upsert({
          id: CONFIG_ID,
          calendars: calendars,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error("Failed to save calendars to Supabase", error);
        throw error;
      }

      console.log('✅ Calendars saved to Supabase successfully');
    } catch (e) {
      console.error("Failed to save to cloud storage", e);
      throw e;
    }
  },

  seedDefaults: async () => {
    await storage.saveCalendars(DEFAULT_CALENDARS);
    return DEFAULT_CALENDARS;
  },

  getApiKey: async (): Promise<string> => {
    // Devolver cache si existe
    if (apiKeyCache) return apiKeyCache;

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', API_KEY_SETTING_KEY)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn("API Key fetch error from Supabase", error);
      }

      if (data && data.value) {
        apiKeyCache = data.value;
        // Actualizar localStorage como backup
        localStorage.setItem(API_KEY_SETTING_KEY, data.value);
        return data.value;
      }
    } catch (e) {
      console.warn("API Key fetch error", e);
    }

    // Fallback a localStorage
    const localKey = localStorage.getItem(API_KEY_SETTING_KEY) || '';
    apiKeyCache = localKey;
    return localKey;
  },

  saveApiKey: async (key: string) => {
    // Actualizar cache
    apiKeyCache = key;
    // Actualizar localStorage como backup
    localStorage.setItem(API_KEY_SETTING_KEY, key);

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: API_KEY_SETTING_KEY,
          value: key,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error("Failed to save API key to Supabase", error);
        throw error;
      }

      console.log('✅ API Key saved to Supabase successfully');
    } catch (e) {
      console.error("Failed to save API key to cloud", e);
      throw e;
    }
  },

  getAiHistory: async (limit = 20) => {
    try {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("Failed to fetch AI history", e);
      return [];
    }
  },

  subscribeToCalendarChanges: (onUpdate: () => void) => {
    return supabase
      .channel('calendar-configs-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_configs' },
        (payload) => {
          console.log('🔄 Real-time update received:', payload);
          onUpdate();
        }
      )
      .subscribe();
  },

  uploadAvatar: async (file: File, path: string) => {
    return supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: true
    });
  },

  getPublicUrl: (path: string) => {
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }
};

