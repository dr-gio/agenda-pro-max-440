/**
 * /api/cron-recordatorios.js
 * Cron job diario — 8:00 AM Colombia (13:00 UTC)
 * Envía recordatorio por Resend a pacientes con cita al día siguiente.
 */

import { google } from 'googleapis';
import { sendReminderEmail } from './sendEmail.js';

function getGoogleAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

// Solo calendarios médicos/clínicos — evitar duplicados de calendarios de recursos
const CALENDARS_CRON = {
  'MED – DRGIO – CIRUGIAS':            'c_b9f953604caec86debee86bb868c6ed5e4f5b18819ccdd8836c3ebe1af378379@group.calendar.google.com',
  'MED – DRGIO – CONSULTAS':           'c_2f698452093c24e34655f6ad8eced5a0af5cb81cb3edb8ee1a73641218df5946@group.calendar.google.com',
  'MED – DRGIO – PROCEDIMIENTOS':      'c_027c2cf46ff6e8c549726faacabceb721f60bf60855253091092e04b0773ec8d@group.calendar.google.com',
  'MED – DRA SHARON – CONSULTAS':      'c_959415d5074f82ff5d268b71a731f9b52c1e1e6720796bdfec3f4bf7dac9ac33@group.calendar.google.com',
  'MED – DRA SHARON – PROCEDIMIENTOS': 'c_16b1923b6ac89b3811141ff2b012cacf3d689b38e7d511a1ac988b22cdbcfc59@group.calendar.google.com',
  'EST – AGENDA1 – KATHERINE':         'c_2b5fb75963371788032e879b6b08ac5dfe288bacb3283a02551c148959fcf936@group.calendar.google.com',
  'EST – AGENDA2 – LIA':               'c_b70c7d774950db95b33610b5d90878f93957dc84ec55f53cf6dbfb14d1321124@group.calendar.google.com',
  'EST – AGENDA3 – ROXANA':            'c_872c4a1e3bbd6bf337f5e0d0df9912f9505db6f83877b5923461654a3dd8a28a@group.calendar.google.com',
};

function parseMeta(description = '') {
  const get = (key) => {
    const match = description.match(new RegExp(`${key}:\\s*(.+)`));
    return match ? match[1].trim() : null;
  };
  return {
    patient:      get('Paciente'),
    patientEmail: get('Email paciente'),
    procedure:    get('Procedimiento'),
    doctor:       get('Profesional'),
  };
}

export default async function handler(req, res) {
  // Seguridad: solo Vercel cron o quien tenga el CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Mañana en hora Colombia
    const nowColombia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const tomorrow = new Date(nowColombia);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm   = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd   = String(tomorrow.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const timeMin = `${dateStr}T00:00:00-05:00`;
    const timeMax = `${dateStr}T23:59:59-05:00`;

    const auth = getGoogleAuth();
    const cal  = google.calendar({ version: 'v3', auth });

    const sent = [];
    const processed = new Set(); // evitar duplicar email si mismo paciente aparece en 2 calendarios

    for (const [calLabel, calId] of Object.entries(CALENDARS_CRON)) {
      let events = [];
      try {
        const response = await cal.events.list({
          calendarId: calId,
          timeMin, timeMax,
          singleEvents: true,
          orderBy: 'startTime',
        });
        events = response.data.items || [];
      } catch (e) {
        console.error(`[cron] error listando ${calLabel}:`, e.message);
        continue;
      }

      for (const event of events) {
        if (!event.start?.dateTime) continue; // ignorar eventos de día completo

        const { patient, patientEmail, procedure, doctor } = parseMeta(event.description || '');
        if (!patientEmail) continue;

        const dedupeKey = `${patientEmail}::${event.id}`;
        if (processed.has(dedupeKey)) continue;
        processed.add(dedupeKey);

        const startDate = new Date(event.start.dateTime);
        const timeStr = startDate.toLocaleTimeString('es-CO', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
        });

        try {
          await sendReminderEmail({
            to: patientEmail,
            toName: patient,
            procedure: procedure || event.summary,
            doctor,
            date: dateStr,
            timeStr,
            location: event.location || '',
          });
          sent.push({ patient, patientEmail, time: timeStr, calendar: calLabel });
          console.log(`[cron] recordatorio enviado → ${patientEmail} (${timeStr})`);
        } catch (e) {
          console.error(`[cron] error enviando a ${patientEmail}:`, e.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      date: dateStr,
      total: sent.length,
      sent,
    });

  } catch (err) {
    console.error('[cron] error general:', err);
    return res.status(500).json({ error: err.message });
  }
}
