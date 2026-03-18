/**
 * /api/telegram.js — Webhook del Bot de Telegram para 440 Clinic
 *
 * Flujo:
 * 1. Telegram envía POST con el mensaje del usuario
 * 2. Claude (claude-sonnet-4-5) interpreta lenguaje natural en español
 * 3. Se extrae: paciente, procedimiento, fecha, hora, lugar, médico, acción
 * 4. Se ejecuta la acción en Google Calendar (crear / editar / eliminar)
 * 5. Se responde al usuario en Telegram confirmando la acción
 * 6. Se guarda el registro en Supabase tabla: telegram_logs
 *
 * Variables de entorno requeridas:
 *   TELEGRAM_BOT_TOKEN        — Token del bot de Telegram
 *   TELEGRAM_WEBHOOK_SECRET   — Secret para validar que el request viene de Telegram
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('Faltan credenciales de Google: GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY');
  }

  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
  return createClient(url, key);
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function logToSupabase(supabase, record) {
  try {
    await supabase.from('telegram_logs').insert(record);
  } catch (e) {
    console.error('Error guardando log en Supabase:', e);
  }
}

// ─── Parseo de lenguaje natural con Claude ────────────────────────────────────

async function parseAppointmentIntent(userMessage) {
  const client = new Anthropic();
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Bogota',
  });

  const systemPrompt = `Eres el asistente de agendamiento de 440 Clinic. Hoy es ${today} (zona horaria: America/Bogota).
Tu tarea es interpretar mensajes en español sobre citas médicas y devolver un JSON estructurado.

Acciones posibles:
- "crear": agendar una nueva cita
- "editar": modificar una cita existente
- "eliminar": cancelar una cita
- "consultar": ver citas de un día o de un paciente
- "desconocido": el mensaje no es sobre agendamiento

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones), con esta estructura exacta:
{
  "accion": "crear" | "editar" | "eliminar" | "consultar" | "desconocido",
  "paciente": "Nombre del paciente o null",
  "procedimiento": "Tipo de procedimiento/consulta o null",
  "fecha": "YYYY-MM-DD o null",
  "hora_inicio": "HH:MM (24h) o null",
  "hora_fin": "HH:MM (24h) o null",
  "medico": "Nombre del médico o null",
  "lugar": "Sala/consultorio o null",
  "notas": "Notas adicionales o null",
  "evento_id": "ID del evento de Google Calendar si se menciona editar/eliminar uno específico, o null",
  "fecha_consulta": "YYYY-MM-DD si pregunta por citas de un día específico, o null",
  "confianza": "alta" | "media" | "baja",
  "respuesta_sugerida": "Mensaje de confirmación natural en español para enviar al usuario"
}

Reglas:
- Si no se menciona hora de fin, asume 1 hora después de la hora de inicio.
- Si la fecha es "mañana", calcula la fecha real.
- Si dice "lunes", "martes", etc., usa la próxima ocurrencia de ese día.
- Para procedimientos, normaliza: "hiperbárica" → "Cámara Hiperbárica", "post-op" → "Postoperatorio", etc.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

// ─── Operaciones en Google Calendar ──────────────────────────────────────────

async function getCalendarId(intent) {
  // Prioridad: lugar mencionado → médico mencionado → calendario primario
  const supabase = getSupabase();
  const { data } = await supabase.from('calendar_configs').select('calendars').eq('id', 'default').single();
  if (!data || !data.calendars) return 'primary';

  const calendars = Array.isArray(data.calendars) ? data.calendars : [];

  if (intent.lugar) {
    const match = calendars.find(c =>
      c.label.toLowerCase().includes(intent.lugar.toLowerCase()) ||
      intent.lugar.toLowerCase().includes(c.label.toLowerCase())
    );
    if (match?.googleCalendarId) return match.googleCalendarId;
  }

  if (intent.medico) {
    const match = calendars.find(c =>
      c.label.toLowerCase().includes(intent.medico.toLowerCase()) ||
      intent.medico.toLowerCase().includes(c.label.toLowerCase())
    );
    if (match?.googleCalendarId) return match.googleCalendarId;
  }

  return 'primary';
}

function buildEventResource(intent) {
  const title = [intent.paciente, intent.procedimiento].filter(Boolean).join(' — ') || 'Cita Clínica';

  const dateStr = intent.fecha || new Date().toISOString().split('T')[0];
  const startTime = intent.hora_inicio || '09:00';
  const endTime = intent.hora_fin || (() => {
    const [h, m] = startTime.split(':').map(Number);
    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  })();

  const description = [
    intent.paciente ? `Paciente: ${intent.paciente}` : null,
    intent.medico ? `Médico: ${intent.medico}` : null,
    intent.procedimiento ? `Procedimiento: ${intent.procedimiento}` : null,
    intent.notas ? `Notas: ${intent.notas}` : null,
    '📱 Agendado via Bot de Telegram — 440 Clinic',
  ].filter(Boolean).join('\n');

  return {
    summary: title,
    location: intent.lugar || '',
    description,
    start: {
      dateTime: `${dateStr}T${startTime}:00`,
      timeZone: 'America/Bogota',
    },
    end: {
      dateTime: `${dateStr}T${endTime}:00`,
      timeZone: 'America/Bogota',
    },
  };
}

async function crearEvento(intent) {
  const auth = getGoogleAuth();
  const calendarId = await getCalendarId(intent);
  const cal = google.calendar({ version: 'v3', auth });

  const event = await cal.events.insert({
    calendarId,
    resource: buildEventResource(intent),
  });

  return { eventId: event.data.id, htmlLink: event.data.htmlLink, calendarId };
}

async function editarEvento(intent) {
  if (!intent.evento_id) throw new Error('No se proporcionó el ID del evento a editar');
  const auth = getGoogleAuth();
  const calendarId = await getCalendarId(intent);
  const cal = google.calendar({ version: 'v3', auth });

  const event = await cal.events.patch({
    calendarId,
    eventId: intent.evento_id,
    resource: buildEventResource(intent),
  });

  return { eventId: event.data.id, htmlLink: event.data.htmlLink, calendarId };
}

async function eliminarEvento(intent) {
  if (!intent.evento_id) throw new Error('No se proporcionó el ID del evento a eliminar');
  const auth = getGoogleAuth();
  const calendarId = await getCalendarId(intent);
  const cal = google.calendar({ version: 'v3', auth });

  await cal.events.delete({ calendarId, eventId: intent.evento_id });
  return { eliminado: true };
}

async function consultarEventos(intent) {
  const auth = getGoogleAuth();
  const calendarId = await getCalendarId(intent);
  const cal = google.calendar({ version: 'v3', auth });

  const fecha = intent.fecha_consulta || intent.fecha || new Date().toISOString().split('T')[0];
  const timeMin = new Date(`${fecha}T00:00:00-05:00`).toISOString();
  const timeMax = new Date(`${fecha}T23:59:59-05:00`).toISOString();

  const response = await cal.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 10,
  });

  return response.data.items || [];
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Solo aceptamos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validar secret de Telegram (opcional pero recomendado)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== webhookSecret) {
      return res.status(403).json({ error: 'Invalid webhook secret' });
    }
  }

  const body = req.body;

  // Ignorar actualizaciones que no sean mensajes de texto
  if (!body?.message?.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = body.message.chat.id;
  const userId = body.message.from?.id;
  const username = body.message.from?.username || body.message.from?.first_name || 'usuario';
  const userMessage = body.message.text;
  const supabase = getSupabase();

  console.log(`[Telegram] @${username} (${userId}): ${userMessage}`);

  // Enviar "escribiendo..." mientras procesamos
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch (_) {}

  let intent = null;
  let calendarResult = null;
  let errorMsg = null;
  let replyText = '';

  try {
    // 1. Parsear intención con Claude
    intent = await parseAppointmentIntent(userMessage);
    console.log('[Claude Intent]', JSON.stringify(intent));

    // 2. Ejecutar acción en Google Calendar
    switch (intent.accion) {
      case 'crear': {
        if (!intent.fecha || !intent.hora_inicio) {
          replyText = '⚠️ Necesito la <b>fecha</b> y la <b>hora</b> para crear la cita. Por ejemplo:\n"Agenda a María García mañana a las 10am para hiperbárica"';
        } else {
          calendarResult = await crearEvento(intent);
          replyText = intent.respuesta_sugerida || `✅ <b>Cita creada</b>\n👤 ${intent.paciente || 'Sin nombre'}\n📅 ${intent.fecha} a las ${intent.hora_inicio}\n🏥 ${intent.procedimiento || 'Cita general'}`;
        }
        break;
      }

      case 'editar': {
        if (!intent.evento_id) {
          replyText = '⚠️ Para editar una cita necesito el <b>ID del evento</b>. Consulta primero las citas del día para obtenerlo.';
        } else {
          calendarResult = await editarEvento(intent);
          replyText = intent.respuesta_sugerida || `✅ <b>Cita actualizada</b>\n👤 ${intent.paciente || 'Sin nombre'}\n📅 ${intent.fecha} a las ${intent.hora_inicio}`;
        }
        break;
      }

      case 'eliminar': {
        if (!intent.evento_id) {
          replyText = '⚠️ Para eliminar una cita necesito el <b>ID del evento</b>. Consulta primero las citas del día.';
        } else {
          calendarResult = await eliminarEvento(intent);
          replyText = intent.respuesta_sugerida || `🗑️ <b>Cita cancelada</b> correctamente.`;
        }
        break;
      }

      case 'consultar': {
        const eventos = await consultarEventos(intent);
        if (eventos.length === 0) {
          replyText = `📅 No hay citas para el ${intent.fecha_consulta || intent.fecha || 'día solicitado'}.`;
        } else {
          const lista = eventos.map((e, i) => {
            const hora = e.start?.dateTime
              ? new Date(e.start.dateTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
              : 'Todo el día';
            return `${i + 1}. <b>${hora}</b> — ${e.summary || 'Sin título'}`;
          }).join('\n');
          replyText = `📋 <b>Citas del ${intent.fecha_consulta || intent.fecha}:</b>\n\n${lista}`;
        }
        calendarResult = { count: eventos.length };
        break;
      }

      case 'desconocido':
      default: {
        replyText = `🤖 Hola, soy el asistente de <b>440 Clinic</b>. Puedo ayudarte a:\n\n📌 <b>Agendar citas:</b> "Agenda a Juan Pérez el lunes a las 3pm para postoperatorio"\n📌 <b>Consultar agenda:</b> "¿Qué citas hay mañana?"\n📌 <b>Cancelar citas:</b> "Cancela la cita ID abc123"\n\n¿En qué te puedo ayudar?`;
        break;
      }
    }
  } catch (err) {
    console.error('[Telegram Handler Error]', err);
    errorMsg = err.message;
    replyText = `❌ Hubo un error procesando tu solicitud: ${err.message}\n\nIntenta de nuevo o contacta al administrador.`;
  }

  // 3. Responder al usuario en Telegram
  await sendTelegramMessage(chatId, replyText);

  // 4. Guardar log en Supabase
  await logToSupabase(supabase, {
    telegram_user_id: String(userId),
    telegram_username: username,
    chat_id: String(chatId),
    message: userMessage,
    intent: intent ? JSON.stringify(intent) : null,
    action: intent?.accion || 'error',
    calendar_result: calendarResult ? JSON.stringify(calendarResult) : null,
    response_sent: replyText,
    error: errorMsg,
    created_at: new Date().toISOString(),
  });

  return res.status(200).json({ ok: true });
}
