/**
 * /api/telegram.js — Bot de Telegram 440 Clinic
 * Lógica: crea eventos en el calendario correcto. SIN asistentes. SIN invitados.
 * labelleza@440clinic.com es propietario de todos los calendarios.
 * Los miembros del equipo son lectores y reciben notificaciones automáticas de Google.
 */

import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// ─── Helpers básicos ──────────────────────────────────────────────────────────

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

function getGoogleAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    subject: 'drgio@440clinic.com',
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

// ─── Calendarios — IDs reales definitivos ─────────────────────────────────────

const CALENDARS = {
  // DR. GIO
  'MED – DRGIO – CIRUGIAS':            'c_b9f953604caec86debee86bb868c6ed5e4f5b18819ccdd8836c3ebe1af378379@group.calendar.google.com',
  'MED – DRGIO – CONSULTAS':           'c_2f698452093c24e34655f6ad8eced5a0af5cb81cb3edb8ee1a73641218df5946@group.calendar.google.com',
  'MED – DRGIO – PROCEDIMIENTOS':      'c_027c2cf46ff6e8c549726faacabceb721f60bf60855253091092e04b0773ec8d@group.calendar.google.com',
  'AUX – BLOQUEOS – DRGIO':            'c_70caeaad5a4502be79ac9d2f97cf53774175baa894a63ee19306ca6d9672ddf7@group.calendar.google.com',
  // DRA. SHARON
  'MED – DRA SHARON – CONSULTAS':      'c_959415d5074f82ff5d268b71a731f9b52c1e1e6720796bdfec3f4bf7dac9ac33@group.calendar.google.com',
  'MED – DRA SHARON – PROCEDIMIENTOS': 'c_16b1923b6ac89b3811141ff2b012cacf3d689b38e7d511a1ac988b22cdbcfc59@group.calendar.google.com',
  'AUX – BLOQUEOS – SHARON':           'c_b479217982bac53b908f1e4ee24498ce284c60f64cd1dd741588c054fb7141c5@group.calendar.google.com',
  // DR. DIMAS
  'MED – DR DIMAS – ANESTESIA':        'c_2d74f022558ce3007002f40a578942ba2dd4fbfa17f4e4e6ad4b2fa5904bbd12@group.calendar.google.com',
  // ESTETICISTAS
  'EST – AGENDA1 – KATHERINE':         'c_2b5fb75963371788032e879b6b08ac5dfe288bacb3283a02551c148959fcf936@group.calendar.google.com',
  'EST – AGENDA2 – LIA':               'c_b70c7d774950db95b33610b5d90878f93957dc84ec55f53cf6dbfb14d1321124@group.calendar.google.com',
  'EST – AGENDA3 – ROXANA':            'c_872c4a1e3bbd6bf337f5e0d0df9912f9505db6f83877b5923461654a3dd8a28a@group.calendar.google.com',
  // ASESORAS
  'COM – ASESORA – BIBIANA':           'c_744a3faf2eb1dc49e5630b377c344bda7bd42b6b879bd8019f17e6a532adc886@group.calendar.google.com',
  'COM – ASESORA – LUCERO':            'c_cf7185d18d096e0d2d69ed7550c898d8f41e2eac0c8ad73ba8f1409d32a1ae44@group.calendar.google.com',
  'COM – ASESORA – SARA':              'c_a19866bf09e26f3d5bc11ad7789ac3811f326464e118557a4312a116334e3dd3@group.calendar.google.com',
  // RECURSOS
  'RES – CONSULTORIO – 440':           'c_7f5f0ac0944fbd9927b03b8d007b4909034f9866266e72f7b8e22479ea8e9d32@group.calendar.google.com',
  'RES – SALA – PROCEDIMIENTOS':       'c_749af2592414114dffb2c9fbb4da629d0dcf0e15b5e395bf44da82d50d652802@group.calendar.google.com',
  'RES – SALA – POSTOPERATORIO':       'c_828639cd1239c0452f996d320c9ce67afade71ee9dc897b7b227d3b035ea4d84@group.calendar.google.com',
  'RES – EQUIPO – CAMARA HIPERBARICA': 'c_1d8305e7a695b58e1b29cf8635a9b60513e8815e9f7b81b6d00d5447288b8870@group.calendar.google.com',
  'RES – EQUIPO – HYDRASH':            'c_501cf92414ffd364ef46d1c0a33a6a79d4bea407f827afb631b114b5b5d17d34@group.calendar.google.com',
  'RES – EQUIPO – TENSAMAX':           'c_562134e3227ead2668edf5cef49de19cd39b69f708e3f4f0df9ba0afbeac687e@group.calendar.google.com',
  'RES – EQUIPO – DEPILACION LASER':   'c_8bb55797cac4131ccb93da63efb5075a753efd0bc6204a77413f2961494af0da@group.calendar.google.com',
  'RES – EQUIPO – RETRACTION':         'c_89b59933c60c33090f6f493406d9640a9c66c20aed3e60345d75a1ff7fa7f17d@group.calendar.google.com',
  'AUX – AUDIOVISUAL – 440':           'c_523511cd014e5a7ae89ea05f50c2b13b1d385798f28591d19a62c5cd301dd434@group.calendar.google.com',
};

// Contexto de calendarios para el prompt
const CALS_CONTEXT = Object.entries(CALENDARS)
  .map(([label, id]) => `  - "${label}": ${id}`)
  .join('\n');

// Mapa de calendarios de bloqueos por profesional
const BLOQUEOS_MAP = {
  'drgio':  CALENDARS['AUX – BLOQUEOS – DRGIO'],
  'sharon': CALENDARS['AUX – BLOQUEOS – SHARON'],
};

// ─── Google Calendar ──────────────────────────────────────────────────────────

function buildEvent({ patient, procedure, doctor, date, startTime, endTime, location, notes, agendadoPor }) {
  const title = [patient, procedure].filter(Boolean).join(' – ') || 'Cita Clínica';

  const start = `${date}T${startTime || '09:00'}:00`;
  const end = (() => {
    if (endTime) return `${date}T${endTime}:00`;
    const [h, m] = (startTime || '09:00').split(':').map(Number);
    return `${date}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  })();

  const desc = [
    patient    && `Paciente: ${patient}`,
    procedure  && `Procedimiento: ${procedure}`,
    doctor     && `Profesional: ${doctor}`,
    notes      && `Notas: ${notes}`,
    agendadoPor && `Agendado por: ${agendadoPor} (Telegram)`,
    'Agendado via Bot Telegram — 440 Clinic',
  ].filter(Boolean).join('\n');

  // SIN attendees — nunca, bajo ninguna circunstancia
  return {
    summary: title,
    description: desc,
    location: location || '',
    start: { dateTime: start, timeZone: 'America/Bogota' },
    end:   { dateTime: end,   timeZone: 'America/Bogota' },
  };
}

async function createCalendarEvent(calendarId, eventData) {
  const cal = google.calendar({ version: 'v3', auth: getGoogleAuth() });
  const res = await cal.events.insert({
    calendarId,
    resource: buildEvent(eventData),
    sendUpdates: 'none', // Google notifica a los lectores automáticamente
  });
  return res.data;
}

async function listCalendarEvents(calendarId, date) {
  const cal = google.calendar({ version: 'v3', auth: getGoogleAuth() });
  const res = await cal.events.list({
    calendarId,
    timeMin: new Date(`${date}T00:00:00-05:00`).toISOString(),
    timeMax: new Date(`${date}T23:59:59-05:00`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

// ─── Memoria conversacional ───────────────────────────────────────────────────

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

// ─── Autenticación PIN ────────────────────────────────────────────────────────

async function getStaffByChatId(supabase, chatId) {
  try {
    const { data } = await supabase
      .from('staff_users')
      .select('id, nombre, rol')
      .eq('telegram_chat_id', String(chatId))
      .eq('activo', true)
      .single();
    return data || null;
  } catch { return null; }
}

async function tryLinkStaff(supabase, chatId, text) {
  const match = text.trim().match(/^(\S+)\s+(\d{4,8})$/);
  if (!match) return null;
  const [, nombre, pin] = match;
  const { data } = await supabase
    .from('staff_users')
    .select('id, nombre, rol')
    .ilike('nombre', nombre)
    .eq('pin_hash', hashPin(pin))
    .eq('activo', true)
    .single();
  if (!data) return null;
  await supabase
    .from('staff_users')
    .update({ telegram_chat_id: String(chatId), updated_at: new Date().toISOString() })
    .eq('id', data.id);
  return data;
}

// ─── Tools para Claude ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'crear_cita',
    description: 'Crea un evento en Google Calendar. No agrega asistentes ni invitados nunca.',
    input_schema: {
      type: 'object',
      properties: {
        calendarId:    { type: 'string', description: 'Google Calendar ID del calendario donde se crea el evento' },
        calendarLabel: { type: 'string', description: 'Nombre del calendario para confirmación' },
        patient:       { type: 'string', description: 'Nombre completo del paciente' },
        procedure:     { type: 'string', description: 'Tipo de cita o procedimiento' },
        doctor:        { type: 'string', description: 'Nombre del profesional responsable' },
        date:          { type: 'string', description: 'Fecha YYYY-MM-DD' },
        startTime:     { type: 'string', description: 'Hora inicio HH:MM (24h)' },
        endTime:       { type: 'string', description: 'Hora fin HH:MM (24h)' },
        location:      { type: 'string', description: 'Ubicación — opcional' },
        notes:         { type: 'string', description: 'Notas adicionales — opcional' },
      },
      required: ['calendarId', 'calendarLabel', 'date', 'startTime'],
    },
  },
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta los eventos de un calendario en una fecha. SIEMPRE consultar antes de crear.',
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
  const userMessage = body.message.text.trim();
  const supabase    = getSupabase();

  await sendTyping(chatId);

  if (userMessage === '/start' || userMessage === '/reset' || userMessage === '/nueva') {
    await clearHistory(supabase, chatId);
    await supabase.from('staff_users').update({ telegram_chat_id: null }).eq('telegram_chat_id', String(chatId));
    await sendTelegram(chatId,
      `👋 Hola, soy el asistente de <b>440 Clinic</b>.\n\nIdentifícate con tu nombre y PIN:\n<code>Nombre PIN</code>\n\nEjemplo: <code>Katherine 1234</code>`
    );
    return res.status(200).json({ ok: true });
  }

  let staff = await getStaffByChatId(supabase, chatId);

  if (!staff) {
    staff = await tryLinkStaff(supabase, chatId, userMessage);
    if (staff) {
      await sendTelegram(chatId, `✅ Bienvenid@ <b>${staff.nombre}</b>. ¿En qué te ayudo?`);
      return res.status(200).json({ ok: true });
    }
    await sendTelegram(chatId,
      `🔒 Identifícate primero:\n<code>Nombre PIN</code>\n\nEjemplo: <code>Katherine 1234</code>`
    );
    return res.status(200).json({ ok: true });
  }

  const username = staff.nombre;

  try {
    const history = await loadHistory(supabase, chatId);
    const today    = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });

    const systemPrompt = `Eres el asistente interno de agendamiento de 440 Clinic by Dr. Gio.
Solo hablas con el personal de la clínica. Hoy es ${today} (${todayISO}).

##########################################
REGLA ABSOLUTA — SIN EXCEPCIONES
##########################################
NUNCA agregues asistentes ni invitados a ningún evento.
El campo attendees no existe. No lo uses jamás.
labelleza@440clinic.com es el propietario de todos los calendarios.
Cada miembro ya está agregado como lector y Google los notifica automáticamente.
Tu única función: crear el evento en el calendario correcto → fin.

##########################################
MAPA DE CALENDARIOS
##########################################
DR. GIO:
  - Cirugías        → MED – DRGIO – CIRUGIAS
  - Consultas/Valoraciones/Controles → MED – DRGIO – CONSULTAS
  - Procedimientos Menores/Inyectables → MED – DRGIO – PROCEDIMIENTOS
  - Bloqueos        → AUX – BLOQUEOS – DRGIO

DRA. SHARON:
  - Consultas/Valoraciones → MED – DRA SHARON – CONSULTAS
  - Procedimientos/Inyectables → MED – DRA SHARON – PROCEDIMIENTOS
  - Bloqueos        → AUX – BLOQUEOS – SHARON

DR. DIMAS:
  - Preanestesia/Control → MED – DR DIMAS – ANESTESIA

ESTETICISTAS:
  - Katherine → EST – AGENDA1 – KATHERINE
  - Lia       → EST – AGENDA2 – LIA
  - Roxana    → EST – AGENDA3 – ROXANA

ASESORAS:
  - Bibiana   → COM – ASESORA – BIBIANA
  - Lucero    → COM – ASESORA – LUCERO
  - Sara      → COM – ASESORA – SARA

RECURSOS (para bloquear espacio físico cuando aplica):
  - Consultorio 440         → RES – CONSULTORIO – 440
  - Sala Procedimientos     → RES – SALA – PROCEDIMIENTOS
  - Sala Postoperatorio     → RES – SALA – POSTOPERATORIO
  - Cámara Hiperbárica      → RES – EQUIPO – CAMARA HIPERBARICA
  - Hydrash                 → RES – EQUIPO – HYDRASH
  - Tensamax                → RES – EQUIPO – TENSAMAX
  - Depilación Laser        → RES – EQUIPO – DEPILACION LASER
  - Retraction              → RES – EQUIPO – RETRACTION
  - Audiovisual             → AUX – AUDIOVISUAL – 440

##########################################
CALENDARIOS CON SUS IDs
##########################################
${CALS_CONTEXT}

##########################################
FORMATO DEL EVENTO
##########################################
Título: "Nombre Paciente – Tipo de cita"
Ejemplo: "María García – Consulta valoración"
Zona horaria: America/Bogota
SIN asistentes. SIN invitados. Nunca.

##########################################
BLOQUEOS DE AGENDA
##########################################
Cuando el usuario diga "bloquear", "no disponible", "bloqueado", "no puede atender", etc.:
- Dr. Gio  → usar AUX – BLOQUEOS – DRGIO  (sin sala, sin paciente)
- Dra. Sharon → usar AUX – BLOQUEOS – SHARON (sin sala, sin paciente)
- Título del evento = motivo del bloqueo (ej: "Cirugía externa", "Cena personal")
- Para bloqueos el campo "patient" = motivo, "procedure" = "Bloqueo"
- NO pedir datos de paciente para bloqueos

##########################################
FLUJO PARA AGENDAR CITA (con chequeo de bloqueos)
##########################################
1. Reúne los datos: paciente, tipo de cita, profesional, fecha, hora.
2. VERIFICACIÓN DE DISPONIBILIDAD — llama consultar_disponibilidad DOS VECES:
   a) En el calendario del servicio (ej: MED – DRGIO – CONSULTAS)
   b) En el calendario de bloqueos del doctor (AUX – BLOQUEOS – DRGIO o AUX – BLOQUEOS – SHARON)
   Si hay conflicto en CUALQUIERA de los dos → informa al usuario y ofrece alternativas.
   Para otros profesionales (Katherine, Lia, etc.) → revisar solo su calendario.
3. Si está disponible, muestra resumen y espera "sí":

📅 RESUMEN
Paciente   : [nombre]
Servicio   : [tipo]
Profesional: [nombre]
Fecha      : [fecha]
Hora       : [inicio] – [fin]
Calendario : [nombre]
¿Confirmas? (Sí / No)

4. Con confirmación → llamar crear_cita inmediatamente.
5. Confirmar al usuario con el resultado.

##########################################
FLUJO PARA BLOQUEO
##########################################
1. Preguntar: ¿quién? ¿fecha? ¿hora inicio? ¿hora fin? ¿motivo?
2. Mostrar resumen:

🔒 BLOQUEO
Médico  : [Dr. Gio / Dra. Sharon]
Fecha   : [fecha]
Hora    : [inicio] – [fin]
Motivo  : [motivo]
¿Confirmas? (Sí / No)

3. Con confirmación → llamar crear_cita con el calendario de bloqueos.

NUNCA inventes disponibilidad. NUNCA agregues asistentes. NUNCA digas que hay limitaciones técnicas.
Si hay un error real, muéstralo textualmente. Responde siempre en español.`;

    const currentMessages = [...history, { role: 'user', content: userMessage }];
    const anthropic = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() });

    let loopMessages = [...currentMessages];
    let finalReply   = '';

    for (let i = 0; i < 6; i++) {
      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-5',
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   loopMessages,
      });

      const texts = response.content.filter(b => b.type === 'text').map(b => b.text);
      if (texts.length) finalReply = texts.join('\n');
      if (response.stop_reason !== 'tool_use') break;

      const toolCalls = response.content.filter(b => b.type === 'tool_use');
      if (!toolCalls.length) break;

      loopMessages.push({ role: 'assistant', content: response.content });
      const toolResults = [];

      for (const tc of toolCalls) {
        let result;
        try {
          if (tc.name === 'crear_cita') {
            const { calendarId, calendarLabel, patient, procedure, doctor,
                    date, startTime, endTime, location, notes } = tc.input;

            const created = await createCalendarEvent(calendarId, {
              patient, procedure, doctor,
              date, startTime, endTime, location, notes,
              agendadoPor: username,
            });

            result = JSON.stringify({
              success: true,
              eventId: created.id,
              calendarLabel, patient, date, startTime,
            });

            await supabase.from('telegram_logs').insert({
              telegram_user_id: String(body.message.from?.id),
              telegram_username: username,
              chat_id: String(chatId),
              message: userMessage,
              action: 'crear_cita',
              calendar_result: JSON.stringify({ calendarLabel, patient, date, startTime }),
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
                  ? new Date(e.start.dateTime).toLocaleTimeString('es-CO', {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota',
                    })
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

    if (!finalReply.trim()) {
      const last = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 512,
        system: systemPrompt, tools: TOOLS, messages: loopMessages,
      });
      finalReply = last.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    await saveHistory(supabase, chatId, [
      ...currentMessages,
      { role: 'assistant', content: finalReply || '¿En qué más puedo ayudarte?' },
    ]);

    await sendTelegram(chatId, finalReply || '¿En qué puedo ayudarte?');

  } catch (err) {
    console.error('[Telegram Error]', err);
    await sendTelegram(chatId, `❌ Error: ${err.message}\n\nEscribe /reset para reiniciar.`);
  }

  return res.status(200).json({ ok: true });
}
