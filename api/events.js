/**
 * /api/events.js — Crear, editar y eliminar eventos en Google Calendar
 *
 * POST   /api/events         → Crear nuevo evento
 * PATCH  /api/events?id=xxx  → Editar evento
 * DELETE /api/events?id=xxx  → Eliminar evento
 */

import { google } from 'googleapis';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = getAuth();
    const cal = google.calendar({ version: 'v3', auth });

    // ── CREAR ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { calendarId = 'primary', title, patient, procedure, doctor,
              date, startTime, endTime, location, notes } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: 'fecha, hora inicio y hora fin son requeridos' });
      }

      const summary = [patient, procedure].filter(Boolean).join(' — ') || title || 'Cita Clínica';
      const description = [
        patient   ? `Paciente: ${patient}`     : null,
        doctor    ? `Médico: ${doctor}`         : null,
        procedure ? `Procedimiento: ${procedure}` : null,
        notes     ? `Notas: ${notes}`           : null,
      ].filter(Boolean).join('\n');

      const event = await cal.events.insert({
        calendarId,
        resource: {
          summary,
          location: location || '',
          description,
          start: { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Bogota' },
          end:   { dateTime: `${date}T${endTime}:00`,   timeZone: 'America/Bogota' },
        },
      });

      return res.status(201).json({ success: true, event: event.data });
    }

    // ── EDITAR ─────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const { calendarId = 'primary', title, patient, procedure, doctor,
              date, startTime, endTime, location, notes } = req.body;

      if (!id) return res.status(400).json({ error: 'id del evento requerido' });

      const patch = {};
      if (title || patient || procedure) {
        patch.summary = [patient, procedure].filter(Boolean).join(' — ') || title;
      }
      if (location !== undefined) patch.location = location;
      if (date && startTime) patch.start = { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Bogota' };
      if (date && endTime)   patch.end   = { dateTime: `${date}T${endTime}:00`,   timeZone: 'America/Bogota' };
      if (notes !== undefined || doctor !== undefined) {
        patch.description = [
          patient   ? `Paciente: ${patient}`     : null,
          doctor    ? `Médico: ${doctor}`         : null,
          procedure ? `Procedimiento: ${procedure}` : null,
          notes     ? `Notas: ${notes}`           : null,
        ].filter(Boolean).join('\n');
      }

      const event = await cal.events.patch({ calendarId, eventId: id, resource: patch });
      return res.status(200).json({ success: true, event: event.data });
    }

    // ── ELIMINAR ───────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id, calendarId = 'primary' } = req.query;
      if (!id) return res.status(400).json({ error: 'id del evento requerido' });
      await cal.events.delete({ calendarId, eventId: id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Events API Error:', error);
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
}
