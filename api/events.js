/**
 * /api/events.js — Crear, editar y eliminar eventos en Google Calendar
 *
 * Soporta:
 * - Sala/Recurso (resourceCalendarId)
 * - Invitar Profesional (professionalEmail) → aparece en su calendario
 * - Invitar Paciente (patientEmail) → recibe invitación en su correo
 * - Cita Virtual con Google Meet automático (createMeet: true)
 * - Cita Virtual con link propio (meetLink)
 * - Ubicación personalizada
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

function buildEventResource({
  patient, procedure, doctor,
  professionalEmail, patientEmail,
  date, startTime, endTime,
  location, notes, title,
  isVirtual, createMeet, meetLink,
}) {
  const summary = [patient, procedure].filter(Boolean).join(' — ') || title || 'Cita Clínica';

  // Descripción estructurada
  const descLines = [
    patient       ? `Paciente: ${patient}`       : null,
    patientEmail  ? `Email paciente: ${patientEmail}` : null,
    doctor        ? `Médico: ${doctor}`           : null,
    procedure     ? `Procedimiento: ${procedure}` : null,
    isVirtual     ? `Modalidad: Virtual`          : `Modalidad: Presencial`,
    meetLink      ? `Link: ${meetLink}`            : null,
    notes         ? `Notas: ${notes}`             : null,
  ].filter(Boolean).join('\n');

  // Attendees: profesional + paciente (si tienen email)
  const attendees = [];
  if (professionalEmail) {
    attendees.push({ email: professionalEmail, displayName: doctor || professionalEmail });
  }
  if (patientEmail) {
    attendees.push({ email: patientEmail, displayName: patient || patientEmail });
  }

  // Ubicación final
  let locationFinal = location || '';
  if (isVirtual && meetLink && !createMeet) {
    locationFinal = meetLink;
  }

  const resource = {
    summary,
    location: locationFinal,
    description: descLines,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: 'America/Bogota' },
    end:   { dateTime: `${date}T${endTime}:00`,   timeZone: 'America/Bogota' },
    ...(attendees.length > 0 && { attendees }),
    ...(attendees.length > 0 && { guestsCanSeeOtherGuests: false }),
  };

  // Google Meet automático
  if (isVirtual && createMeet) {
    resource.conferenceData = {
      createRequest: {
        requestId: `440clinic-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return resource;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = getAuth();
    const cal  = google.calendar({ version: 'v3', auth });

    const hasInvitees = (body) =>
      !!(body?.professionalEmail || body?.patientEmail);

    // ── CREAR ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        resourceCalendarId = 'primary',
        professionalEmail, patientEmail,
        patient, procedure, doctor, title,
        date, startTime, endTime,
        location, notes,
        isVirtual = false, createMeet = false, meetLink,
      } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: 'fecha, hora inicio y hora fin son requeridos' });
      }

      const resource = buildEventResource({
        patient, procedure, doctor,
        professionalEmail, patientEmail,
        date, startTime, endTime,
        location, notes, title,
        isVirtual, createMeet, meetLink,
      });

      const event = await cal.events.insert({
        calendarId: resourceCalendarId,
        sendUpdates: hasInvitees(req.body) ? 'all' : 'none',
        conferenceDataVersion: isVirtual && createMeet ? 1 : 0,
        resource,
      });

      return res.status(201).json({ success: true, event: event.data });
    }

    // ── EDITAR ─────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const {
        resourceCalendarId = 'primary',
        professionalEmail, patientEmail,
        patient, procedure, doctor, title,
        date, startTime, endTime,
        location, notes,
        isVirtual = false, createMeet = false, meetLink,
      } = req.body;

      if (!id) return res.status(400).json({ error: 'id del evento requerido' });

      const resource = buildEventResource({
        patient, procedure, doctor,
        professionalEmail, patientEmail,
        date, startTime, endTime,
        location, notes, title,
        isVirtual, createMeet, meetLink,
      });

      const event = await cal.events.patch({
        calendarId: resourceCalendarId,
        eventId: id,
        sendUpdates: hasInvitees(req.body) ? 'all' : 'none',
        conferenceDataVersion: isVirtual && createMeet ? 1 : 0,
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
