/**
 * /api/auth.js — Login de staff con nombre + PIN
 * POST { nombre, pin } → { nombre, rol, id }
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

export function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { nombre, pin } = req.body || {};
  if (!nombre || !pin) return res.status(400).json({ error: 'Faltan nombre o PIN' });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, nombre, rol, activo')
    .ilike('nombre', nombre.trim())
    .eq('pin_hash', hashPin(pin))
    .single();

  if (error || !data) return res.status(401).json({ error: 'Nombre o PIN incorrecto' });
  if (!data.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  return res.status(200).json({ id: data.id, nombre: data.nombre, rol: data.rol });
}
