/**
 * /api/telegram.js — Bot de Telegram con memoria conversacional para 440 Clinic
 * Usa Claude con historial de conversación por chat_id guardado en Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { google }  from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key     = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function sendTyping(chatId) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {});
}

// ─── Memoria de conversación en Supabase ──────────────────────────────────────

async function loadHistory(supabase, chatId) {
  try {
    const { data } = await supabase
      .from('telegram_conversations')
      .select('messages')
      .eq('chat_id', String(chatId))
      .single();
    return data?.messages || [];
  } catch { return []; }
}

async function saveHistory(supabase, chatId, messages) {
  // Guardar solo los últimos 20 mensajes para no acumular demasiado
  const trimmed = messages.slice(-20);
  try {
    await supabase
      .from('telegram_conversations')
      .upsert({ chat_id: String(chatId), messages: trimmed, updated_at: new Date().toISOString() });
  } catch (e) { console.error('Error guardando historial:', e); }
}

async function clearHistory(supabase, chatId) {
  try {
    await supabase.from('telegram_conversations').delete().eq('chat_id', String(chatId));
  } catch {}
}

// ─── Google Calendar ──────────────────────────────────────────────────────────

async function getCalendarsFromSupabase(supabase) {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'calendars')
      .single();
    return data?.value || [];
  } catch { return []; }
}

function buildEvent({ patient, patientEmail, procedure, doctor, date, startTime, endTime, location, notes }) {
  const title = procedure && patient ? `${procedure} – ${patient}` : patient || procedure || 'Cita Clínica';
  const start = `${date}T${startTime || '09:00'}:00`;
  const end   = (() => {
    if (endTime) return `${date}T${endTime}:00`;
    const [h, m] = (startTime || '09:00').split(':').map(Number);
    return `${date}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  })();

  const desc = [
    patient      && `Paciente: ${patient}`,
    patientEmail && `Email: ${patientEmail}`,
    doctor       && `Médico: ${doctor}`,
    procedure    && `Procedimiento: ${procedure}`,
    notes        && `Notas: ${notes}`,
    '📱 Agendado via Bot Telegram — 440 Clinic',
  ].filter(Boolean).join('\n');

  const attendees = patientEmail
    ? [{ email: patientEmail, displayName: patient || patientEmail }]
    : [];

  return {
    summary: title, location: location || '', description: desc,
    start: { dateTime: start, timeZone: 'America/Bogota' },
    end:   { dateTime: end,   timeZone: 'America/Bogota' },
    ...(attendees.length && { attendees, guestsCanSeeOtherGuests: false }),
  };
}

async function createCalendarEvent(calendarId, eventData, sendInvite) {
  const cal = google.calendar({ version: 'v3', auth: getGoogleAuth() });
  const res = await cal.events.insert({
    calendarId,
    resource: buildEvent(eventData),
    sendUpdates: sendInvite ? 'all' : 'none',
  });
  return res.data;
}

async function listCalendarEvents(calendarId, date) {
  const cal = google.calendar({ version: 'v3', auth: getGoogleAuth() });
  const res = await cal.events.list({
    calendarId,
    timeMin: new Date(`${date}T00:00:00-05:00`).toISOString(),
    timeMax: new Date(`${date}T23:59:59-05:00`).toISOString(),
    singleEvents: true, orderBy: 'startTime',
  });
  return res.data.items || [];
}

// ─── Tools para Claude ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'crear_cita',
    description: 'Crea una cita en Google Calendar. Requiere confirmación previa del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        calendarId:    { type: 'string', description: 'Google Calendar ID del calendario principal (MED/EST/COM)' },
        calendarLabel: { type: 'string', description: 'Nombre del calendario para confirmación' },
        patient:       { type: 'string', description: 'Nombre completo del paciente' },
        patientEmail:  { type: 'string', description: 'Email del paciente para invitación' },
        procedure:     { type: 'string', description: 'Servicio o procedimiento' },
        doctor:        { type: 'string', description: 'Nombre del profesional' },
        date:          { type: 'string', description: 'Fecha YYYY-MM-DD' },
        startTime:     { type: 'string', description: 'Hora inicio HH:MM (24h)' },
        endTime:       { type: 'string', description: 'Hora fin HH:MM (24h)' },
        location:      { type: 'string', description: 'Ubicación o sala' },
        notes:         { type: 'string', description: 'Notas adicionales' },
      },
      required: ['calendarId', 'calendarLabel', 'patient', 'patientEmail', 'date', 'startTime'],
    },
  },
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta los eventos de un calendario en una fecha para ver disponibilidad.',
    input_schema: {
      type: 'object',
      properties: {
        calendarId:    { type: 'string', description: 'Google Calendar ID a consultar' },
        calendarLabel: { type: 'string', description: 'Nombre del calendario' },
        date:          { type: 'string', description: 'Fecha YYYY-MM-DD' },
      },
      required: ['calendarId', 'calendarLabel', 'date'],
    },
  },
];

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret  = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const incomingSecret = (req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  if (webhookSecret && incomingSecret !== webhookSecret) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  const body = req.body;
  if (!body?.message?.text) return res.status(200).json({ ok: true });

  const chatId      = body.message.chat.id;
  const username    = body.message.from?.username || body.message.from?.first_name || 'usuario';
  const userMessage = body.message.text.trim();
  const supabase    = getSupabase();

  await sendTyping(chatId);

  // Comando /start o /reset → limpiar historial
  if (userMessage === '/start' || userMessage === '/reset' || userMessage === '/nueva') {
    await clearHistory(supabase, chatId);
    await sendTelegram(chatId,
      `👋 Hola, soy el asistente de <b>440 Clinic</b>.\n\nPuedo ayudarte a:\n📅 <b>Agendar citas</b> — dime paciente, servicio, fecha y hora\n🔍 <b>Consultar disponibilidad</b> — pregúntame por una fecha\n\nEscribe en español natural, por ejemplo:\n<i>"Agenda a María García para consulta con el Dr. Gio el lunes a las 10am"</i>`
    );
    return res.status(200).json({ ok: true });
  }

  try {
    // 1. Cargar historial de conversación
    const history = await loadHistory(supabase, chatId);

    // 2. Cargar calendarios configurados
    const calendars = await getCalendarsFromSupabase(supabase);
    const calsCtx   = calendars.length
      ? calendars.map(c => `  - "${c.label}" (id: ${c.id}, googleCalendarId: ${c.googleCalendarId || 'N/A'})`).join('\n')
      : '  (Sin calendarios configurados aún)';

    const today    = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });

    const systemPrompt = `Eres el asistente de agendamiento de 440 Clinic by Dr. Gio (canal Telegram).
Eres conversacional, claro y profesional. Hoy es ${today} (${todayISO}).

##########################################
ESTRUCTURA DE CALENDARIOS 440 CLINIC
##########################################
MÉDICOS (MED):
- MED – DRGIO – CIRUGIAS
- MED – DRGIO – CONSULTAS        → RES – CONSULTORIO – 440 | 30 min
- MED – DRGIO – PROCEDIMIENTOS   → RES – SALA – PROCEDIMIENTOS | 60 min
- MED – SHARON – CONSULTAS       → RES – CONSULTORIO – 440 | 30 min
- MED – SHARON – PROCEDIMIENTOS  → RES – SALA – PROCEDIMIENTOS | 60 min
- MED – DIMAS – PREANESTESIA     → RES – CONSULTORIO – 440 | 20 min

ESTÉTICA (EST):
- EST – AGENDA1 – KATHERINE  |  EST – AGENDA2 – LIA  |  EST – AGENDA3 – ROXANA
  (Postoperatorio → RES – SALA – POSTOPERATORIO | 60 min)
  (Depilación     → RES – EQUIPO – DEPILACION   | 60 min)
  (Hydrafacial    → RES – EQUIPO – HYDRASH       | 60 min)
  (Hiperbárica    → RES – EQUIPO – CAMARA        | 60 min)

COMERCIAL (COM):
- COM – ASESORA – LUCERO | COM – ASESORA – SARA  → 30 min

AUXILIARES (AUX):
- AUX – BLOQUEOS – DRGIO    → bloqueos internos Dr. Gio (NUNCA pacientes)
- AUX – BLOQUEOS – SHARON   → bloqueos internos Sharon (NUNCA pacientes)
- AUX – AUDIOVISUAL – 440   → agenda del equipo audiovisual para grabaciones
  (se invita al equipo cuando se va a filmar una cirugía, consulta o procedimiento)

REGLA CRÍTICA:
- RES: NUNCA es el calendario principal de una cita de paciente (es recurso secundario)
- AUX – BLOQUEOS: solo para bloqueos internos, NUNCA pacientes
- AUX – AUDIOVISUAL – 440: SÍ se agenda aquí cuando se va a grabar contenido;
  se invita al equipo audiovisual a la cirugía/consulta/procedimiento correspondiente

##########################################
HORARIO: L-V 8:00-18:00 | Sáb 8:00-13:00 | Dom CERRADO
##########################################

FORMATO TÍTULO: "[Servicio] – [Paciente]"  Ej: "Consulta – María López"

##########################################
CALENDARIOS CONFIGURADOS EN EL SISTEMA:
##########################################
${calsCtx}

##########################################
REGLAS DE COMPORTAMIENTO
##########################################
1. Recuerdas toda la conversación — NO vuelvas a preguntar datos ya dados.
2. Reúne: paciente, email paciente, servicio, profesional, fecha y hora.
3. Si falta algún dato → pregunta SOLO ese dato, de forma natural.
4. Si el usuario no especifica profesional → pregunta antes de agendar.
5. ANTES de crear, muestra el resumen y espera "sí":

📅 RESUMEN DEL AGENDAMIENTO
─────────────────────────
Paciente   : [Nombre]
Email      : [Email]
Servicio   : [Tipo]
Profesional: [Nombre]
Fecha      : [Fecha]
Hora       : [Inicio] – [Fin]
Calendario : [Nombre]
─────────────────────────
¿Confirmas? (Sí / No)

6. Solo llamar crear_cita cuando el usuario confirme con "sí".
7. Responde SIEMPRE en español, breve y claro.
8. Normaliza: "hiperbárica"→"Cámara Hiperbárica", "hydra"→"Hydrafacial", "post-op"→"Postoperatorio".`;

    // 3. Construir mensajes para Claude
    const currentMessages = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const anthropic = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() });

    // 4. Loop agéntico
    let loopMessages  = [...currentMessages];
    let finalReply    = '';
    const MAX_ITERS   = 5;

    for (let i = 0; i < MAX_ITERS; i++) {
      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-5',
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   loopMessages,
      });

      // Recopilar texto
      const texts = response.content.filter(b => b.type === 'text').map(b => b.text);
      if (texts.length) finalReply = texts.join('\n');

      if (response.stop_reason !== 'tool_use') break;

      // Procesar tool calls
      const toolCalls = response.content.filter(b => b.type === 'tool_use');
      if (!toolCalls.length) break;

      loopMessages.push({ role: 'assistant', content: response.content });

      const toolResults = [];

      for (const tc of toolCalls) {
        let result;
        try {
          if (tc.name === 'crear_cita') {
            const { calendarId, calendarLabel, patient, patientEmail, procedure, doctor,
                    date, startTime, endTime, location, notes } = tc.input;
            const created = await createCalendarEvent(calendarId,
              { patient, patientEmail, procedure, doctor, date, startTime, endTime, location, notes },
              !!patientEmail
            );
            result = JSON.stringify({ success: true, eventId: created.id, calendarLabel, patient, date, startTime });
            // Log
            await supabase.from('telegram_logs').insert({
              telegram_user_id: String(body.message.from?.id),
              telegram_username: username, chat_id: String(chatId),
              message: userMessage, action: 'crear_cita',
              calendar_result: JSON.stringify({ calendarLabel, patient, date }),
              created_at: new Date().toISOString(),
            }).catch(() => {});
          } else if (tc.name === 'consultar_disponibilidad') {
            const { calendarId, calendarLabel, date } = tc.input;
            const events = await listCalendarEvents(calendarId, date);
            result = JSON.stringify({
              calendarLabel, date,
              events: events.map(e => ({
                title: e.summary,
                start: e.start?.dateTime
                  ? new Date(e.start.dateTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
                  : 'Todo el día',
              })),
            });
          }
        } catch (err) {
          result = JSON.stringify({ success: false, error: err.message });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: result });
      }

      loopMessages.push({ role: 'user', content: toolResults });
    }

    // Si no tenemos texto final, pedir una respuesta más
    if (!finalReply.trim()) {
      const last = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 512,
        system: systemPrompt, tools: TOOLS, messages: loopMessages,
      });
      finalReply = last.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    // 5. Guardar historial actualizado
    const updatedHistory = [
      ...currentMessages,
      { role: 'assistant', content: finalReply || '¿En qué más puedo ayudarte?' },
    ];
    await saveHistory(supabase, chatId, updatedHistory);

    // 6. Responder en Telegram
    await sendTelegram(chatId, finalReply || '¿En qué puedo ayudarte?');

  } catch (err) {
    console.error('[Telegram Error]', err);
    await sendTelegram(chatId, `❌ Error interno: ${err.message}\n\nEscribe /reset para reiniciar la conversación.`);
  }

  return res.status(200).json({ ok: true });
}
