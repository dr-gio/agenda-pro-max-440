/**
 * /api/chat.js — Chatbox de agendamiento IA para 440 Clinic (web app)
 *
 * Flujo:
 * 1. El frontend envía { messages, calendars, date }
 * 2. Claude interpreta lenguaje natural en español
 * 3. Si detecta intención de agendar → crea evento en Google Calendar
 * 4. Devuelve respuesta en texto al chat de la app
 *
 * Variables de entorno requeridas:
 *   ANTHROPIC_API_KEY
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

async function logChatAction({ userName, isAdmin, userMessage, action, calendarLabel, patient, date, success, error }) {
  try {
    const supabase = getSupabase();
    await supabase.from('chat_logs').insert({
      user_name: userName,
      role: isAdmin ? 'admin' : 'colaborador',
      message: userMessage,
      action,
      calendar_label: calendarLabel,
      patient,
      date,
      success,
      error: error || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Error guardando chat log:', e);
  }
}

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Faltan credenciales de Google');
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

function buildEventResource({ patient, procedure, doctor, professionalEmail, date, startTime, endTime, location, notes, agendadoPor }) {
  const summary = procedure
    ? `${procedure}${patient ? ' — ' + patient : ''}`
    : patient || 'Nueva cita';

  const start = new Date(`${date}T${startTime || '09:00'}:00-05:00`);
  const end = endTime
    ? new Date(`${date}T${endTime}:00-05:00`)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const attendees = [];
  if (professionalEmail) {
    attendees.push({ email: professionalEmail, displayName: doctor || professionalEmail });
  }

  const descriptionParts = [];
  if (patient) descriptionParts.push(`Paciente: ${patient}`);
  if (doctor) descriptionParts.push(`Médico: ${doctor}`);
  if (notes) descriptionParts.push(`Notas: ${notes}`);
  descriptionParts.push(`Agendado por: ${agendadoPor || 'App 440 Clinic'}`);
  descriptionParts.push('Fuente: Chatbox IA — 440 Clinic App');

  return {
    summary,
    location: location || '',
    description: descriptionParts.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'America/Bogota' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Bogota' },
    ...(attendees.length > 0 && { attendees }),
  };
}

async function createEvent(calendarId, eventResource, sendInvite) {
  const auth = getGoogleAuth();
  const cal = google.calendar({ version: 'v3', auth });
  const res = await cal.events.insert({
    calendarId,
    resource: eventResource,
    sendUpdates: sendInvite ? 'all' : 'none',
  });
  return res.data;
}

async function listEvents(calendarId, date) {
  const auth = getGoogleAuth();
  const cal = google.calendar({ version: 'v3', auth });
  const start = new Date(`${date}T00:00:00-05:00`);
  const end = new Date(`${date}T23:59:59-05:00`);
  const res = await cal.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const { messages = [], calendars = [], selectedDate, userName = 'Usuario', isAdmin = false } = req.body;
  const today = selectedDate || new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Bogota',
  });
  const todayISO = selectedDate || new Date().toISOString().split('T')[0];

  // Build calendars context
  const resourceCals = calendars.filter(c => c.type === 'resource' || c.type === 'general');
  const professionalCals = calendars.filter(c => c.type === 'professional' || c.type === 'aesthetic');

  const calsContext = [
    resourceCals.length > 0 ? `SALAS/RECURSOS:\n${resourceCals.map(c => `  - "${c.label}" (id: ${c.id}, googleCalendarId: ${c.googleCalendarId || 'N/A'})`).join('\n')}` : '',
    professionalCals.length > 0 ? `PROFESIONALES:\n${professionalCals.map(c => `  - "${c.label}" (id: ${c.id}, email: ${c.googleCalendarId !== 'primary' ? c.googleCalendarId : 'sin email configurado'})`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `Eres el asistente de agendamiento de 440 Clinic (clínica de cirugía plástica y estética en Colombia).
Tu misión es ayudar a agendar citas de forma conversacional en español.

FECHA ACTUAL: ${today}
FECHA ISO: ${todayISO}

RECURSOS DISPONIBLES EN LA CLÍNICA:
${calsContext || 'No hay calendarios configurados aún.'}

INSTRUCCIONES:
1. Cuando el usuario quiera AGENDAR una cita:
   - Pídele los datos que falten: paciente, procedimiento, fecha, hora, sala/recurso, profesional.
   - Cuando tengas todos los datos necesarios (mínimo: paciente, fecha, hora, sala), llama la función create_appointment.
   - La sala es OBLIGATORIA para crear el evento (es el calendario principal).
   - El profesional es OPCIONAL pero si lo asignas, recibirá invitación a su Google Calendar.

2. Cuando el usuario quiera VER disponibilidad:
   - Llama check_availability con la sala y fecha que mencione.
   - Si no menciona sala, lista las salas disponibles para que elija.

3. Cuando el usuario quiera CANCELAR o tiene dudas generales → responde con amabilidad.

4. SIEMPRE responde en español, de forma breve y clara.
5. Confirma los datos antes de crear el evento.
6. Si falta algún dato clave, pregunta de manera natural (no como formulario).
7. Formato de horas: HH:MM (24h, ej: 14:30).
8. Si el usuario dice "mañana", "el lunes", etc., calcula la fecha correcta desde ${todayISO}.`;

  const tools = [
    {
      name: 'create_appointment',
      description: 'Crea una cita en el calendario de la sala/recurso seleccionada. Opcionalmente invita al profesional.',
      input_schema: {
        type: 'object',
        properties: {
          calendarId: { type: 'string', description: 'googleCalendarId de la sala/recurso donde se agenda (campo googleCalendarId del calendario)' },
          calendarLabel: { type: 'string', description: 'Nombre de la sala para mostrar en la confirmación' },
          patient: { type: 'string', description: 'Nombre del paciente' },
          procedure: { type: 'string', description: 'Procedimiento o motivo de la cita' },
          date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
          startTime: { type: 'string', description: 'Hora de inicio HH:MM (24h)' },
          endTime: { type: 'string', description: 'Hora de fin HH:MM (24h), opcional' },
          doctor: { type: 'string', description: 'Nombre del doctor o profesional, opcional' },
          professionalEmail: { type: 'string', description: 'Email Google Calendar del profesional para enviarle invitación, opcional' },
          location: { type: 'string', description: 'Sala o ubicación adicional, opcional' },
          notes: { type: 'string', description: 'Notas adicionales, opcional' },
        },
        required: ['calendarId', 'calendarLabel', 'patient', 'date', 'startTime'],
      },
    },
    {
      name: 'check_availability',
      description: 'Consulta los eventos de una sala en una fecha para ver disponibilidad.',
      input_schema: {
        type: 'object',
        properties: {
          calendarId: { type: 'string', description: 'googleCalendarId del calendario a consultar' },
          calendarLabel: { type: 'string', description: 'Nombre de la sala' },
          date: { type: 'string', description: 'Fecha a consultar en formato YYYY-MM-DD' },
        },
        required: ['calendarId', 'calendarLabel', 'date'],
      },
    },
  ];

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Agentic loop
    let currentMessages = [...anthropicMessages];
    let finalText = '';
    let toolResults = [];
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

      // Collect text from this response
      const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
      if (textBlocks.length > 0) finalText = textBlocks.join('\n');

      if (response.stop_reason !== 'tool_use') break;

      // Process tool calls
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      // Add assistant message to conversation
      currentMessages.push({ role: 'assistant', content: response.content });

      const toolResultContent = [];

      for (const toolCall of toolUseBlocks) {
        let toolResult;

        if (toolCall.name === 'create_appointment') {
          const { calendarId, calendarLabel, patient, procedure, date, startTime, endTime, doctor, professionalEmail, location, notes } = toolCall.input;
          try {
            const eventResource = buildEventResource({ patient, procedure, doctor, professionalEmail, date, startTime, endTime, location, notes, agendadoPor: userName });
            const created = await createEvent(calendarId, eventResource, !!professionalEmail);
            // Log de trazabilidad
            await logChatAction({ userName, isAdmin, userMessage: messages[messages.length - 1]?.content || '', action: 'crear_cita', calendarLabel, patient, date, success: true });
            toolResult = JSON.stringify({
              success: true,
              eventId: created.id,
              eventLink: created.htmlLink,
              calendarLabel,
              patient,
              procedure,
              date,
              startTime,
              endTime,
              doctor,
              agendadoPor: userName,
              professionalInvited: !!professionalEmail,
            });
          } catch (err) {
            await logChatAction({ userName, isAdmin, userMessage: messages[messages.length - 1]?.content || '', action: 'crear_cita', calendarLabel, patient, date, success: false, error: err.message });
            toolResult = JSON.stringify({ success: false, error: err.message });
          }
        } else if (toolCall.name === 'check_availability') {
          const { calendarId, calendarLabel, date } = toolCall.input;
          try {
            const events = await listEvents(calendarId, date);
            if (events.length === 0) {
              toolResult = JSON.stringify({ calendarLabel, date, events: [], message: 'Sin citas ese día, disponible todo el día.' });
            } else {
              const formatted = events.map(e => ({
                title: e.summary,
                start: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }) : 'Todo el día',
                end: e.end?.dateTime ? new Date(e.end.dateTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }) : '',
              }));
              toolResult = JSON.stringify({ calendarLabel, date, events: formatted });
            }
          } catch (err) {
            toolResult = JSON.stringify({ success: false, error: err.message });
          }
        }

        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: toolResult,
        });
      }

      currentMessages.push({ role: 'user', content: toolResultContent });
    }

    // Get final text response
    if (!finalText) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg?.role === 'assistant') {
        const textBlocks = Array.isArray(lastMsg.content)
          ? lastMsg.content.filter(b => b.type === 'text').map(b => b.text)
          : [lastMsg.content];
        finalText = textBlocks.join('\n');
      }
    }

    // One more call if we only have tool results
    if (!finalText || finalText.trim() === '') {
      const lastResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });
      finalText = lastResponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    return res.status(200).json({ reply: finalText || '¿En qué puedo ayudarte?' });

  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'Error procesando el mensaje', details: error.message });
  }
}
