/**
 * /api/staff.js — CRUD de usuarios del equipo (solo admin)
 *
 * GET    /api/staff          → lista staff activos
 * POST   /api/staff          → crear nuevo staff { nombre, pin, rol }
 * PUT    /api/staff?id=...   → actualizar { pin?, rol?, activo? }
 * DELETE /api/staff?id=...   → desactivar (soft delete)
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('staff_users')
      .select('id, nombre, rol, telegram_chat_id, activo, created_at')
      .order('nombre');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { nombre, pin, rol = 'colaborador' } = req.body || {};
    if (!nombre || !pin) return res.status(400).json({ error: 'Faltan nombre o PIN' });
    if (String(pin).length < 4) return res.status(400).json({ error: 'El PIN debe tener al menos 4 dígitos' });

    const { data, error } = await supabase
      .from('staff_users')
      .insert({ nombre: nombre.trim(), pin_hash: hashPin(pin), rol, activo: true })
      .select('id, nombre, rol')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta id' });
    const { pin, rol, activo } = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if (pin !== undefined) updates.pin_hash = hashPin(pin);
    if (rol !== undefined) updates.rol = rol;
    if (activo !== undefined) updates.activo = activo;

    const { error } = await supabase.from('staff_users').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta id' });
    // Soft delete — desactivar en vez de borrar
    const { error } = await supabase
      .from('staff_users')
      .update({ activo: false, telegram_chat_id: null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
