/**
 * /api/metrics.js — Métricas operativas de 440 Clinic
 *
 * GET /api/metrics?startDate=2026-03-01&endDate=2026-03-31
 *
 * Devuelve:
 *  - total: número de citas en el período
 *  - byCalendar: ocupación por sala/recurso
 *  - byDoctor: productividad por doctor
 *  - byProcedure: procedimientos más frecuentes
 *  - byDay: citas por día
 *  - events: array completo para exportar
 */
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

function getGoogleAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

function parseSummary(summary = '') {
  // Formats: "Procedimiento — Paciente" or "Paciente - Procedimiento"
  const sep = summary.includes('—') ? '—' : '-';
  const parts = summary.split(sep).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { procedure: parts[0], patient: parts.slice(1).join(' — ') };
  }
  return { procedure: summary.trim(), patient: '' };
}

function durationMin(start, end) {
  if (!start || !end) return 60;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e)) return 60;
  return Math.max(0, Math.round((e - s) / 60000));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parámetros requeridos: startDate, endDate (YYYY-MM-DD)' });
  }

  try {
    // 1. Get active calendars from Supabase
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data: configs, error: cfgErr } = await supabase
      .from('calendar_configs')
      .select('id, label, type, googleCalendarId')
      .eq('active', true);
    if (cfgErr) throw new Error(cfgErr.message);
    if (!configs || configs.length === 0) return res.status(200).json({ total: 0, byCalendar: {}, byDoctor: {}, byProcedure: [], byDay: {}, events: [] });

    // 2. Fetch events from Google Calendar in parallel
    const auth = getGoogleAuth();
    const cal = google.calendar({ version: 'v3', auth });
    const timeMin = new Date(`${startDate}T00:00:00-05:00`).toISOString();
    const timeMax = new Date(`${endDate}T23:59:59-05:00`).toISOString();

    const fetches = await Promise.allSettled(
      configs
        .filter(c => c.googleCalendarId)
        .map(config =>
          cal.events.list({
            calendarId: config.googleCalendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 2500,
          }).then(r => ({ config, items: r.data.items || [] }))
        )
    );

    // 3. Flatten all events
    const allEvents = [];
    for (const result of fetches) {
      if (result.status !== 'fulfilled') continue;
      const { config, items } = result.value;
      for (const ev of items) {
        const start = ev.start?.dateTime || ev.start?.date || '';
        const end = ev.end?.dateTime || ev.end?.date || '';
        const { procedure, patient } = parseSummary(ev.summary);
        const day = start.split('T')[0];
        const mins = durationMin(start, end);
        allEvents.push({
          calendar: config.label,
          calendarType: config.type,
          procedure,
          patient,
          day,
          start,
          end,
          durationMin: mins,
          description: ev.description || '',
        });
      }
    }

    // 4. Aggregate metrics
    const byCalendar = {};
    const byProcedure = {};
    const byDay = {};
    const byDoctor = {};

    for (const ev of allEvents) {
      // By calendar (all types)
      if (!byCalendar[ev.calendar]) {
        byCalendar[ev.calendar] = { count: 0, minutes: 0, type: ev.calendarType };
      }
      byCalendar[ev.calendar].count++;
      byCalendar[ev.calendar].minutes += ev.durationMin;

      // By procedure
      const proc = ev.procedure || 'Sin especificar';
      byProcedure[proc] = (byProcedure[proc] || 0) + 1;

      // By day
      if (ev.day) byDay[ev.day] = (byDay[ev.day] || 0) + 1;

      // By doctor (professional calendars)
      if (ev.calendarType === 'professional') {
        if (!byDoctor[ev.calendar]) byDoctor[ev.calendar] = { count: 0, minutes: 0 };
        byDoctor[ev.calendar].count++;
        byDoctor[ev.calendar].minutes += ev.durationMin;
      }
    }

    // Sort procedures by frequency
    const topProcedures = Object.entries(byProcedure)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    return res.status(200).json({
      total: allEvents.length,
      period: { startDate, endDate },
      byCalendar,
      byDoctor,
      byProcedure: topProcedures,
      byDay,
      events: allEvents,
    });

  } catch (err) {
    console.error('Metrics Error:', err);
    return res.status(500).json({ error: 'Error calculando métricas', details: err.message });
  }
}
