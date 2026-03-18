/**
 * CORRECCIÓN BUG CRÍTICO: Reemplazado @vercel/kv (paquete faltante, storage distinto al frontend)
 * por Supabase — mismo storage que usa lib/storage.ts en el frontend.
 */
import { createClient } from '@supabase/supabase-js';

const CONFIG_ID = 'default';
const API_KEY_SETTING_KEY = 'gemini_api_key';

function getSupabase() {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
    return createClient(url, key);
}

export default async function handler(req, res) {
    try {
        const supabase = getSupabase();

        if (req.method === 'GET') {
            const { type } = req.query;

            if (type === 'api_key') {
                const { data, error } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', API_KEY_SETTING_KEY)
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                return res.status(200).json({ apiKey: data?.value || '' });
            }

            const { data, error } = await supabase
                .from('calendar_configs')
                .select('calendars')
                .eq('id', CONFIG_ID)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return res.status(200).json(data?.calendars || null);
        }

        if (req.method === 'POST') {
            const { type, data } = req.body;

            if (type === 'api_key') {
                const { error } = await supabase.from('app_settings').upsert({
                    key: API_KEY_SETTING_KEY,
                    value: data,
                    updated_at: new Date().toISOString(),
                });
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            const { error } = await supabase.from('calendar_configs').upsert({
                id: CONFIG_ID,
                calendars: data,
                updated_at: new Date().toISOString(),
            });
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Config API Error:', error);
        return res.status(500).json({ error: 'Failed to handle config', details: error.message });
    }
}
