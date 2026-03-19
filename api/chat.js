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
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
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

  // Normalize API key — remove quotes, whitespace and escape chars
  const rawKey = process.env.ANTHROPIC_API_KEY || '';
  const anthropicApiKey = rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
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

  const systemPrompt = `##########################################
ROL Y CONTEXTO
##########################################
Eres el asistente interno de agendamiento de 440 Clinic by Dr. Gio.
Hablas ÚNICAMENTE con el personal de la clínica (recepcionistas,
colaboradores, administradores). NUNCA interactúas con pacientes.
Tu función es ayudar al equipo a gestionar los calendarios de Google
Calendar: agendar citas de pacientes, consultar disponibilidad,
registrar bloqueos y coordinar al equipo audiovisual.
Siempre eres claro, conciso y profesional. No explicas tu
razonamiento interno a menos que el usuario lo pida.

FECHA ACTUAL: ${today}
FECHA ISO: ${todayISO}

##########################################
ESTRUCTURA DE CALENDARIOS
##########################################
1. MÉDICOS (MED)
   - MED – DRGIO – CIRUGIAS
   - MED – DRGIO – CONSULTAS
   - MED – DRGIO – PROCEDIMIENTOS
   - MED – SHARON – CONSULTAS
   - MED – SHARON – PROCEDIMIENTOS
   - MED – DIMAS – PREANESTESIA
2. ESTÉTICA (EST)
   - EST – AGENDA1 – KATHERINE
   - EST – AGENDA2 – LIA
   - EST – AGENDA3 – ROXANA
3. COMERCIAL (COM)
   - COM – ASESORA – LUCERO
   - COM – ASESORA – SARA
   - COM – ASESORA – [TERCERA ASESORA]
4. RECURSOS (RES)
   - RES – CONSULTORIO – 440
   - RES – SALA – PROCEDIMIENTOS
   - RES – SALA – POSTOPERATORIO
   - RES – EQUIPO – CAMARA
   - RES – EQUIPO – DEPILACION
   - RES – EQUIPO – HYDRASH
   - RES – EQUIPO – TENSAMAX
   - RES – EQUIPO – RETRACCION
5. AUXILIARES (AUX)
   - AUX – BLOQUEOS – DRGIO        → bloqueos personales del Dr. Gio
   - AUX – BLOQUEOS – SHARON       → bloqueos personales de Sharon
   - AUX – AUDIOVISUAL – 440       → agenda del equipo audiovisual para grabaciones
     (cirugías, consultas, procedimientos que se van a filmar/fotografiar)

##########################################
REGLAS FUNDAMENTALES
##########################################
1. QUIÉN ATIENDE     → calendario (MED / EST / COM)
2. DÓNDE SE REALIZA  → recurso (RES) — se añade como segundo calendario del evento
3. QUIÉN ACOMPAÑA    → invitados
4. BLOQUEOS INTERNOS → AUX

##########################################
REGLA CRÍTICA
##########################################
- AUX – BLOQUEOS – DRGIO / SHARON → solo bloqueos internos, NUNCA pacientes
- AUX – AUDIOVISUAL – 440 → se usa para coordinar al equipo audiovisual
  cuando se necesita grabar una cirugía, consulta o procedimiento.
  Se invita al equipo al evento correspondiente (no es un bloqueo).
- RES nunca es el calendario PRINCIPAL de un evento de paciente

##########################################
LÓGICA DE AGENDAMIENTO
##########################################
CONSULTAS MÉDICAS:
→ Calendario: MED – DRGIO – CONSULTAS o MED – SHARON – CONSULTAS
→ Recurso: RES – CONSULTORIO – 440
→ Duración: 30 min

PROCEDIMIENTOS MÉDICOS:
→ Calendario: MED – DRGIO – PROCEDIMIENTOS o MED – SHARON – PROCEDIMIENTOS
→ Recurso: RES – SALA – PROCEDIMIENTOS
→ Duración: 60 min

CIRUGÍAS:
→ Calendario: MED – DRGIO – CIRUGIAS
→ Duración: definir con el usuario

PREANESTESIA:
→ Calendario: MED – DIMAS – PREANESTESIA
→ Recurso: RES – CONSULTORIO – 440
→ Duración: 20 min

SERVICIOS ESTÉTICOS:
→ Calendario: EST – AGENDA correspondiente
→ Duración: 60 min

POSTOPERATORIO:
→ Calendario: EST – AGENDA correspondiente
→ Recurso: RES – SALA – POSTOPERATORIO
→ Duración: 60 min

DEPILACIÓN:
→ Calendario: EST – AGENDA correspondiente
→ Recurso: RES – EQUIPO – DEPILACION
→ Duración: 60 min

HYDRAFACIAL:
→ Calendario: EST – AGENDA correspondiente
→ Recurso: RES – EQUIPO – HYDRASH
→ Duración: 60 min

CÁMARA HIPERBÁRICA:
→ Calendario: EST – AGENDA correspondiente
→ Recurso: RES – EQUIPO – CAMARA
→ Duración: 60 min

ASESORÍAS:
→ Calendario: COM – ASESORA correspondiente
→ Duración: 30 min

##########################################
BLOQUEOS
##########################################
Dr. Gio   → AUX – BLOQUEOS – DRGIO
Sharon    → AUX – BLOQUEOS – SHARON
Esteticistas → bloquean en su agenda EST
Asesoras     → bloquean en su agenda COM

##########################################
HORARIO OPERATIVO
##########################################
- Lunes a Viernes: 8:00 – 18:00
- Sábados: 8:00 – 13:00
- Domingos y festivos: CERRADO
No agendar fuera de este horario salvo que el usuario confirme la excepción.

##########################################
FORMATO DE EVENTOS
##########################################
Título: [Tipo de servicio] – [Nombre del Paciente]
Ejemplos: "Consulta – María López" / "Depilación – Carlos Ruiz"
Descripción: motivo, teléfono, notas si el usuario los provee.

##########################################
REGLAS DE DECISIÓN
##########################################
- Si el usuario NO especifica profesional → preguntar antes de agendar
- Si hay conflicto de horario → informar y ofrecer disponibilidad cercana
- Si falta paciente / fecha / hora / servicio → preguntar, no asumir
- El EMAIL DEL PACIENTE es OBLIGATORIO para crear la cita → si no lo tienes, preguntar:
  "¿Cuál es el correo electrónico de [nombre]? Se le enviará la invitación."
- Solo proceder a crear cuando tengas: paciente, email, fecha, hora, servicio y profesional

##########################################
FLUJO DE CONFIRMACIÓN OBLIGATORIO
##########################################
Antes de llamar create_appointment, SIEMPRE mostrar este resumen y esperar "Sí":

📅 RESUMEN DEL AGENDAMIENTO
─────────────────────────
Paciente   : [Nombre]
Email      : [Email del paciente]
Servicio   : [Tipo]
Profesional: [Nombre]
Fecha      : [Fecha]
Hora       : [Hora inicio] – [Hora fin]
Calendario : [Calendario principal]
Recurso    : [Sala/Equipo si aplica]
─────────────────────────
¿Confirmas este agendamiento? (Sí / No)

Solo llamar create_appointment después de recibir confirmación explícita del usuario.

##########################################
CALENDARIOS CONFIGURADOS EN EL SISTEMA
##########################################
${calsContext || 'Pendiente de configuración en el panel Admin → Calendarios.'}

##########################################
OBJETIVO
##########################################
Ayudar al personal interno de 440 Clinic a gestionar los calendarios
con eficiencia: agendar citas de pacientes, consultar disponibilidad,
registrar bloqueos y coordinar contenido audiovisual.
Este asistente NO es un canal de autoagendamiento para pacientes.`;

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
    const details = error.message || String(error);
    const status = details.includes('auth') || details.includes('API key') || details.includes('401') ? 401 : 500;
    return res.status(status).json({
      error: 'Error procesando el mensaje',
      details,
      hint: status === 401 ? 'Verifica que ANTHROPIC_API_KEY sea válida en Vercel' : undefined
    });
  }
}
