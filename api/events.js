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
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: 'drgio@440clinic.com', // DWD: impersonar admin del Workspace
  });
}

function buildEventResource({
  patient, procedure, doctor,
  professionalEmail, patientEmail,
  resourceEmails = '',
  extraAttendees = [],
  date, startTime, endTime,
  location, notes, title,
  isVirtual, createMeet, meetLink,
}) {
  const summary = [patient, procedure].filter(Boolean).join(' — ') || title || 'Cita Clínica';

  // Descripción estructurada
  const equipoLine = extraAttendees.length > 0
    ? `Equipo: ${extraAttendees.map(a => `${a.displayName || a.email}${a.role ? ' (' + a.role + ')' : ''}`).join(', ')}`
    : null;

  const descLines = [
    patient       ? `Paciente: ${patient}`           : null,
    patientEmail  ? `Email paciente: ${patientEmail}` : null,
    doctor        ? `Médico: ${doctor}`               : null,
    equipoLine,
    procedure     ? `Procedimiento: ${procedure}`     : null,
    isVirtual     ? `Modalidad: Virtual`              : `Modalidad: Presencial`,
    meetLink      ? `Link: ${meetLink}`                : null,
    notes         ? `Notas: ${notes}`                 : null,
  ].filter(Boolean).join('\n');

  // Attendees: solo externos (paciente + equipo adicional)
  // El profesional NO se agrega como attendee — el evento llega a su calendario
  // vía dual-write (professionalCalendarId). DWD requerido para invitar emails del dominio.
  const isPersonalEmail = (e) => e && !e.includes('@group.calendar.google.com') && !e.includes('@resource.calendar.google.com');

  const attendees = [];
  // Paciente (externo — no requiere DWD)
  if (patientEmail) {
    attendees.push({ email: patientEmail, displayName: patient || patientEmail });
  }
  // Responsables del recurso (emails de personas externas al dominio)
  for (const re of (resourceEmails || '').split(',').map(e => e.trim()).filter(Boolean)) {
    if (isPersonalEmail(re)) attendees.push({ email: re });
  }
  // Equipo adicional
  for (const att of extraAttendees) {
    if (att.email) {
      attendees.push({
        email: att.email,
        displayName: att.displayName
          ? `${att.displayName}${att.role ? ' (' + att.role + ')' : ''}`
          : att.email,
      });
    }
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
      !!(body?.patientEmail || (body?.extraAttendees?.length > 0));

    // ── CREAR ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        professionalCalendarId = '',
        resourceCalendarId = '',
        patientEmail,
        extraAttendees = [],
        patient, procedure, doctor, title,
        date, startTime, endTime,
        location, notes,
        isVirtual = false, createMeet = false, meetLink,
      } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: 'fecha, hora inicio y hora fin son requeridos' });
      }

      const eventBody = buildEventResource({
        patient, procedure, doctor,
        patientEmail,
        extraAttendees,
        date, startTime, endTime,
        location, notes, title,
        isVirtual, createMeet, meetLink,
      });

      const sendUpd = hasInvitees(req.body) ? 'all' : 'none';
      const confVer = isVirtual && createMeet ? 1 : 0;

      // Calendario principal = el del profesional/servicio
      const primaryCalId = professionalCalendarId || resourceCalendarId || 'primary';

      const event = await cal.events.insert({
        calendarId: primaryCalId,
        sendUpdates: sendUpd,
        conferenceDataVersion: confVer,
        resource: eventBody,
      });

      // Dual-write en la sala/recurso para bloquear el espacio (sin attendees ni notificaciones)
      if (resourceCalendarId && resourceCalendarId !== primaryCalId) {
        await cal.events.insert({
          calendarId: resourceCalendarId,
          sendUpdates: 'none',
          conferenceDataVersion: confVer,
          resource: { ...eventBody, attendees: undefined },
        }).catch(err => console.error('[events] dual-write sala falló (no crítico):', err.message));
      }

      return res.status(201).json({ success: true, event: event.data });
    }

    // ── EDITAR ─────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const {
        professionalCalendarId = '',
        resourceCalendarId = 'primary',
        patientEmail,
        extraAttendees = [],
        patient, procedure, doctor, title,
        date, startTime, endTime,
        location, notes,
        isVirtual = false, createMeet = false, meetLink,
      } = req.body;

      if (!id) return res.status(400).json({ error: 'id del evento requerido' });

      const resource = buildEventResource({
        patient, procedure, doctor,
        patientEmail,
        extraAttendees,
        date, startTime, endTime,
        location, notes, title,
        isVirtual, createMeet, meetLink,
      });

      const primaryCalId = professionalCalendarId || resourceCalendarId;

      const event = await cal.events.patch({
        calendarId: primaryCalId,
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
