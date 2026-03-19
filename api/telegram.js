/**
 * /api/telegram.js — Bot de Telegram con memoria conversacional para 440 Clinic
 * Usa Claude con historial de conversación por chat_id guardado en Supabase.
 * v2: dual-write (profesional + sala), personalEmail, lee de calendar_configs
 */

import Anthropic from '@anthropic-ai/sdk';
import { google }  from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGoogleAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
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

// ─── Autenticacion del staff via PIN ─────────────────────────────────────────

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

// ─── Google Calendar ──────────────────────────────────────────────────────────

/** Lee calendarios desde calendar_configs (misma tabla que la app principal) */
async function getCalendarsFromSupabase(supabase) {
  try {
    const { data } = await supabase
      .from('calendar_configs')
      .select('calendars')
      .eq('id', 'default')
      .single();
    return data?.calendars || [];
  } catch { return []; }
}

/** Filtra solo emails personales (no IDs de grupo de Google) */
function isPersonalEmail(e) {
  return e && !e.includes('@group.calendar.google.com') && !e.includes('@resource.calendar.google.com');
}

function buildEvent({ patient, patientEmail, procedure, doctor, professionalEmail, date, startTime, endTime, location, notes, agendadoPor }) {
  const title = procedure && patient ? `${procedure} - ${patient}` : patient || procedure || 'Cita Clinica';
  const start = `${date}T${startTime || '09:00'}:00`;
  const end   = (() => {
    if (endTime) return `${date}T${endTime}:00`;
    const [h, m] = (startTime || '09:00').split(':').map(Number);
    return `${date}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  })();

  const desc = [
    patient          && `Paciente: ${patient}`,
    patientEmail     && `Email: ${patientEmail}`,
    doctor           && `Medico/Profesional: ${doctor}`,
    procedure        && `Procedimiento: ${procedure}`,
    notes            && `Notas: ${notes}`,
    agendadoPor      && `Agendado por: @${agendadoPor} (Telegram)`,
    'Agendado via Bot Telegram - 440 Clinic',
  ].filter(Boolean).join('\n');

  const attendees = [];
  if (patientEmail) attendees.push({ email: patientEmail, displayName: patient || patientEmail });
  // Anadir al profesional si tiene correo personal (puede ser lista separada por comas)
  if (professionalEmail) {
    const emails = professionalEmail.split(',').map(e => e.trim()).filter(isPersonalEmail);
    emails.forEach(email => attendees.push({ email, displayName: doctor || email }));
  }

  return {
    summary: title, location: location || '', description: desc,
    start: { dateTime: start, timeZone: 'America/Bogota' },
    end:   { dateTime: end,   timeZone: 'America/Bogota' },
    ...(attendees.length && { attendees, guestsCanSeeOtherGuests: false }),
  };
}

/** Crea evento en un calendario */
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
    description: `Crea una cita en Google Calendar con dual-write:
- SIEMPRE escribe en el calendario principal del profesional/estetista/asesora (calendarId)
- Si hay sala o recurso fisico (resourceCalendarId), tambien escribe ahi para bloquear ese espacio
- Incluye siempre el professionalEmail del calendario seleccionado para enviar invitacion
- Requiere confirmacion previa del usuario`,
    input_schema: {
      type: 'object',
      properties: {
        calendarId:         { type: 'string', description: 'Google Calendar ID del profesional/servicio principal (campo googleCalendarId del calendario)' },
        calendarLabel:      { type: 'string', description: 'Nombre del calendario principal para confirmacion' },
        resourceCalendarId: { type: 'string', description: 'Google Calendar ID del recurso fisico (sala/equipo) — opcional, para bloqueo del espacio' },
        resourceLabel:      { type: 'string', description: 'Nombre del recurso fisico — opcional' },
        professionalEmail:  { type: 'string', description: 'Email personal del profesional (campo personalEmail del calendario) para enviarle invitacion' },
        patient:            { type: 'string', description: 'Nombre completo del paciente' },
        patientEmail:       { type: 'string', description: 'Email del paciente para invitacion — opcional' },
        procedure:          { type: 'string', description: 'Servicio o procedimiento' },
        doctor:             { type: 'string', description: 'Nombre del profesional' },
        date:               { type: 'string', description: 'Fecha YYYY-MM-DD' },
        startTime:          { type: 'string', description: 'Hora inicio HH:MM (24h)' },
        endTime:            { type: 'string', description: 'Hora fin HH:MM (24h)' },
        location:           { type: 'string', description: 'Ubicacion o sala' },
        notes:              { type: 'string', description: 'Notas adicionales' },
      },
      required: ['calendarId', 'calendarLabel', 'patient', 'date', 'startTime'],
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
  const userMessage = body.message.text.trim();
  const supabase    = getSupabase();

  await sendTyping(chatId);

  // Comando /start o /reset
  if (userMessage === '/start' || userMessage === '/reset' || userMessage === '/nueva') {
    await clearHistory(supabase, chatId);
    await supabase.from('staff_users').update({ telegram_chat_id: null }).eq('telegram_chat_id', String(chatId));
    await sendTelegram(chatId,
      `Hola, soy el asistente interno de <b>440 Clinic</b>.\n\nPara continuar, identificate con tu nombre y PIN:\n<code>Nombre PIN</code>\n\nEjemplo: <code>Katherine 1234</code>`
    );
    return res.status(200).json({ ok: true });
  }

  // Verificar si el staff ya esta vinculado
  let staff = await getStaffByChatId(supabase, chatId);

  if (!staff) {
    staff = await tryLinkStaff(supabase, chatId, userMessage);
    if (staff) {
      await sendTelegram(chatId,
        `Bienvenid@ <b>${staff.nombre}</b>.\n\nYa puedes agendar. Dime en que puedo ayudarte:`
      );
      return res.status(200).json({ ok: true });
    }
    await sendTelegram(chatId,
      `Para usar este bot debes identificarte.\n\nEscribe tu nombre y PIN asi:\n<code>Nombre PIN</code>\n\nEjemplo: <code>Katherine 1234</code>\n\nSi no tienes cuenta, pide al administrador que te cree una.`
    );
    return res.status(200).json({ ok: true });
  }

  const username = staff.nombre;

  try {
    // 1. Cargar historial
    const history = await loadHistory(supabase, chatId);

    // 2. Cargar calendarios desde calendar_configs
    const allCalendars = await getCalendarsFromSupabase(supabase);

    const professionalCals = allCalendars.filter(c => c.type === 'professional' || c.type === 'aesthetic');
    const resourceCals     = allCalendars.filter(c => c.type === 'resource');
    const generalCals      = allCalendars.filter(c => c.type === 'general');

    const profCtx = professionalCals.length
      ? professionalCals.map(c =>
          `  - "${c.label}" | googleCalendarId: ${c.googleCalendarId || 'N/A'} | personalEmail: ${c.personalEmail || 'sin email'}`
        ).join('\n')
      : '  (ninguno)';

    const resCtx = resourceCals.length
      ? resourceCals.map(c =>
          `  - "${c.label}" | googleCalendarId: ${c.googleCalendarId || 'N/A'}${c.personalEmail ? ` | invitar: ${c.personalEmail}` : ''}`
        ).join('\n')
      : '  (ninguno)';

    const genCtx = generalCals.length
      ? generalCals.map(c =>
          `  - "${c.label}" | googleCalendarId: ${c.googleCalendarId || 'N/A'}${c.personalEmail ? ` | personalEmail: ${c.personalEmail}` : ''}`
        ).join('\n')
      : '  (ninguno)';

    const today    = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });

    const systemPrompt = `Eres el asistente INTERNO de agendamiento de 440 Clinic by Dr. Gio (canal Telegram).
Hablas UNICAMENTE con el personal de la clinica: recepcionistas, colaboradores y administradores.
NUNCA interactuas con pacientes. Tu funcion es ayudar al equipo a gestionar los calendarios:
agendar citas de pacientes, consultar disponibilidad, registrar bloqueos y coordinar grabaciones.
Eres conversacional, claro y profesional. Hoy es ${today} (${todayISO}).

##########################################
LOGICA DE AGENDAMIENTO (MUY IMPORTANTE)
##########################################
Cada cita se escribe en DOS calendarios:

1. CALENDARIO PRINCIPAL (obligatorio) = el calendario del PROFESIONAL o SERVICIO
   Ejemplos: DRGIO CONSULTAS, DRA SHARON CONSULTAS, KATHERINE, LUCERO, AUDIOVISUAL 440
   - Usa su googleCalendarId como calendarId
   - Usa su personalEmail como professionalEmail (para enviarle la invitacion al evento)

2. RECURSO FISICO (cuando aplica) = sala o equipo que se va a usar
   Ejemplos: CONSULTORIO-440, SALA PROCEDIMIENTOS, CAMARA HIPERBARICA, DEPILACION LASER
   - Usa su googleCalendarId como resourceCalendarId
   - Esto bloquea ese espacio en el calendario del recurso

REGLAS CRITICAS:
- Calendarios RES (resource): NUNCA son el calendario principal, son siempre el recurso secundario
- AUX - BLOQUEOS: solo para bloqueos internos del doctor, NUNCA para citas de pacientes
- AUX - AUDIOVISUAL: para grabaciones, el personalEmail contiene los correos del equipo audiovisual separados por coma
- BLOQUEOS: solo calendarId, sin resourceCalendarId ni professionalEmail

EJEMPLOS DE USO:
  Consulta Dr. Gio → calendarId de "DRGIO CONSULTAS" + resourceCalendarId de "CONSULTORIO-440" + professionalEmail: drgio@440clinic.com
  Procedimiento Sharon → calendarId de "DRA SHARON PROCEDIMIENTOS" + resourceCalendarId de "SALA PROCEDIMIENTOS" + professionalEmail: dra.sharonsantiago@gmail.com
  Hiperbar Katherine → calendarId de "KATHERINE" + resourceCalendarId de "CAMARA HIPERBARICA" + professionalEmail: katherinepertuz833@gmail.com
  Grabacion cirugia → calendarId de "AUDIOVISUAL 440" + professionalEmail: Vanayawork@gmail.com,Ricardrivera27@gmail.com
  Bloqueo Dr. Gio → calendarId de "BLOQUEOS DRGIO" (sin recurso)

##########################################
HORARIO: L-V 8:00-18:00 | Sab 8:00-13:00 | Dom CERRADO
##########################################

FORMATO TITULO: "[Servicio] - [Paciente]"  Ej: "Consulta - Maria Lopez"

##########################################
CALENDARIOS CONFIGURADOS EN EL SISTEMA
##########################################
PROFESIONALES Y ESTETICA:
${profCtx}

RECURSOS Y SALAS:
${resCtx}

GENERALES (bloqueos, asesoras, audiovisual):
${genCtx}

##########################################
REGLAS DE COMPORTAMIENTO
##########################################
1. Recuerdas toda la conversacion. NO vuelvas a preguntar datos ya dados.
2. Reune: paciente, servicio, profesional, fecha, hora. Email del paciente es OPCIONAL.
3. Si falta algun dato, pregunta SOLO ese dato de forma natural.
4. Si el usuario no especifica profesional, pregunta antes de agendar.
5. ANTES de crear, muestra resumen y espera confirmacion "si":

RESUMEN DEL AGENDAMIENTO
Paciente   : [Nombre]
Servicio   : [Tipo]
Profesional: [Nombre]
Fecha      : [Fecha]
Hora       : [Inicio] - [Fin]
Calendario : [Principal] + [Recurso si aplica]
Confirmacion: Si / No

6. Solo llamar crear_cita cuando el usuario confirme con "si".
7. Al llamar crear_cita SIEMPRE incluir professionalEmail del profesional seleccionado.
8. Responde SIEMPRE en espanol, breve y claro.
9. Normaliza: "hiperbar" a "Camara Hiperbar", "hydra" a "Hydrafacial", "post-op" a "Postoperatorio".`;

    // 3. Construir mensajes
    const currentMessages = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const anthropic = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() });

    // 4. Loop agentico
    let loopMessages = [...currentMessages];
    let finalReply   = '';
    const MAX_ITERS  = 5;

    for (let i = 0; i < MAX_ITERS; i++) {
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
            const {
              calendarId, calendarLabel,
              resourceCalendarId, resourceLabel,
              professionalEmail,
              patient, patientEmail, procedure, doctor,
              date, startTime, endTime, location, notes,
            } = tc.input;

            const eventData = {
              patient, patientEmail, procedure, doctor, professionalEmail,
              date, startTime, endTime, location, notes, agendadoPor: username,
            };
            const hasAttendees = !!(patientEmail || professionalEmail);

            // Escritura principal en el calendario del profesional
            const created = await createCalendarEvent(calendarId, eventData, hasAttendees);

            // Dual-write en el recurso fisico (sin enviar invitaciones adicionales)
            let resourceWritten = false;
            if (resourceCalendarId && resourceCalendarId !== calendarId) {
              try {
                await createCalendarEvent(resourceCalendarId, eventData, false);
                resourceWritten = true;
              } catch (err) {
                console.error('[Telegram] Error escribiendo en recurso:', err.message);
              }
            }

            result = JSON.stringify({
              success: true,
              eventId: created.id,
              calendarLabel,
              resourceLabel: resourceWritten ? resourceLabel : null,
              patient, date, startTime,
              professionalNotified: !!professionalEmail,
            });

            await supabase.from('telegram_logs').insert({
              telegram_user_id: String(body.message.from?.id),
              telegram_username: username,
              chat_id: String(chatId),
              message: userMessage,
              action: 'crear_cita',
              calendar_result: JSON.stringify({ calendarLabel, resourceLabel: resourceWritten ? resourceLabel : null, patient, date }),
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
                  : 'Todo el dia',
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

    // 5. Guardar historial
    const updatedHistory = [
      ...currentMessages,
      { role: 'assistant', content: finalReply || 'En que mas puedo ayudarte?' },
    ];
    await saveHistory(supabase, chatId, updatedHistory);

    // 6. Responder en Telegram
    await sendTelegram(chatId, finalReply || 'En que puedo ayudarte?');

  } catch (err) {
    console.error('[Telegram Error]', err);
    await sendTelegram(chatId, `Error interno: ${err.message}\n\nEscribe /reset para reiniciar la conversacion.`);
  }

  return res.status(200).json({ ok: true });
}
