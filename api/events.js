/**
 * /api/events.js — Crear, editar y eliminar eventos en Google Calendar
 *
 * Soporta:
 * - Asignar evento a una Sala/Recurso (resourceCalendarId)
 * - Invitar al Profesional como attendee (professionalEmail) → aparece en su calendario
 * - Invitar ambos si se desea
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

function buildEventResource({ patient, procedure, doctor, professionalEmail,
                               date, startTime, endTime, location, notes, title }) {
  const summary = [patient, procedure].filter(Boolean).join(' — ') || title || 'Cita Clínica';

  const description = [
    patient       ? `Paciente: ${patient}`           : null,
    doctor        ? `Médico: ${doctor}`               : null,
    procedure     ? `Procedimiento: ${procedure}`     : null,
    notes         ? `Notas: ${notes}`                 : null,
  ].filter(Boolean).join('\n');

  // Attendees: el profesional invitado si se proporcionó su email
  const attendees = [];
  if (professionalEmail) {
    attendees.push({ email: professionalEmail, displayName: doctor || professionalEmail });
  }

  return {
    summary,
    location: location || '',
    description,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Bogota' },
    end:   { dateTime: `${date}T${endTime}:00`,   timeZone: 'America/Bogota' },
    ...(attendees.length > 0 && { attendees }),
    // Enviar invitación por email al profesional
    ...(attendees.length > 0 && { guestsCanSeeOtherGuests: false }),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = getAuth();
    const cal = google.calendar({ version: 'v3', auth });

    // ── CREAR ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        resourceCalendarId = 'primary', // Sala / Recurso
        professionalEmail,               // Email del calendario del profesional (googleCalendarId)
        patient, procedure, doctor, title,
        date, startTime, endTime, location, notes,
      } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: 'fecha, hora inicio y hora fin son requeridos' });
      }

      const resource = buildEventResource({
        patient, procedure, doctor, professionalEmail,
        date, startTime, endTime, location, notes, title,
      });

      // Crear en el calendario del recurso (sala) con sendUpdates para notificar al profesional
      const event = await cal.events.insert({
        calendarId: resourceCalendarId,
        sendUpdates: professionalEmail ? 'all' : 'none',
        resource,
      });

      return res.status(201).json({ success: true, event: event.data });
    }

    // ── EDITAR ─────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const {
        resourceCalendarId = 'primary',
        professionalEmail,
        patient, procedure, doctor, title,
        date, startTime, endTime, location, notes,
      } = req.body;

      if (!id) return res.status(400).json({ error: 'id del evento requerido' });

      const resource = buildEventResource({
        patient, procedure, doctor, professionalEmail,
        date, startTime, endTime, location, notes, title,
      });

      const event = await cal.events.patch({
        calendarId: resourceCalendarId,
        eventId: id,
        sendUpdates: professionalEmail ? 'all' : 'none',
        resource,
      });

      return res.status(200).json({ success: true, event: event.data });
    }

    // ── ELIMINAR ───────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id, resourceCalendarId = 'primary' } = req.query;
      if (!id) return res.status(400).json({ error: 'id del evento requerido' });
      await cal.events.delete({
        calendarId: resourceCalendarId,
        eventId: id,
        sendUpdates: 'all',
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Events API Error:', error);
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
}
