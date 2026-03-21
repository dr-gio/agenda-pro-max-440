import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = '440 Clinic <citas@440clinic.online>';

function buildICS({ title, description, location, start, end }) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//440 Clinic//Calendar//ES',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@440clinic.com.co`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location || '440 Clinic – Cartagena'}`,
    `ORGANIZER;CN=440 Clinic:mailto:citas@440clinic.online`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function getPatientMessage(procedure) {
  const p = (procedure || '').toLowerCase();
  if (p.includes('cirug') || p.includes('operac') || p.includes('quirurg')) {
    return `Tu procedimiento quirúrgico está programado. El equipo de 440 Clinic estará listo para recibirte. Por favor sigue las instrucciones preoperatorias que te indicó tu médico.`;
  }
  if (p.includes('control') || p.includes('postop') || p.includes('seguimiento')) {
    return `Tu control está confirmado. Si tienes alguna duda o síntoma antes de la cita, no dudes en contactarnos.`;
  }
  if (p.includes('consult') || p.includes('valorac')) {
    return `Tu consulta está confirmada. Recuerda llegar 15 minutos antes y traer tus exámenes o estudios previos si los tienes.`;
  }
  return `Tu cita está confirmada. Recuerda llegar 15 minutos antes. Ante cualquier duda comunícate con nosotros.`;
}

function buildPatientHTML({ toName, to, doctor, procedure, dateStr, timeStr, endTimeStr, location, notes }) {
  const message = getPatientMessage(procedure);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="background: #ffffff; padding: 28px 32px 20px; text-align: center; border-bottom: 1px solid #eef0f4;">
          <img src="https://agenda-pro-max-440.vercel.app/logo.png" alt="440 Clinic" style="height: 52px; width: auto; display: block; margin: 0 auto;" />
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #0a1628; margin: 0 0 8px; font-size: 20px;">✅ Confirmación de Cita</h2>
          <p style="color: #444; margin: 0 0 24px;">Hola <strong>${toName || to}</strong>, ${message}</p>
          <div style="background: #f0f4ff; border-left: 4px solid #2563eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px; width: 130px;">📅 Fecha</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px; text-transform: capitalize;">${dateStr}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🕐 Hora</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${timeStr} – ${endTimeStr}</td></tr>
              ${doctor ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">👨‍⚕️ Doctor</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${doctor}</td></tr>` : ''}
              ${procedure ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🔬 Procedimiento</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${procedure}</td></tr>` : ''}
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">📍 Lugar</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${location || '440 Clinic – Cartagena'}</td></tr>
            </table>
          </div>
          ${notes ? `<p style="color: #666; font-size: 14px; background: #fffbf0; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><strong>Nota:</strong> ${notes}</p>` : ''}
          <p style="color: #888; font-size: 13px;">El archivo <strong>.ics</strong> adjunto te permite agregar esta cita a tu Google Calendar, Outlook o Apple Calendar con un solo clic.</p>
        </div>
        <div style="background: #f0f4ff; padding: 20px; text-align: center;">
          <p style="color: #888; font-size: 12px; margin: 0;">440 Clinic Plastic Surgery · Cartagena, Colombia</p>
          <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Para cambios o cancelaciones comunícate con nosotros al WhatsApp de la clínica.</p>
        </div>
      </div>
    </div>`;
}

function buildCollaboratorHTML({ toName, to, doctor, procedure, dateStr, timeStr, endTimeStr, location, notes }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="background: #ffffff; padding: 28px 32px 20px; text-align: center; border-bottom: 1px solid #eef0f4;">
          <img src="https://agenda-pro-max-440.vercel.app/logo.png" alt="440 Clinic" style="height: 52px; width: auto; display: block; margin: 0 auto;" />
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #0a1628; margin: 0 0 8px; font-size: 20px;">📋 Convocatoria Quirúrgica</h2>
          <p style="color: #444; margin: 0 0 24px;">Estimado/a <strong>${toName || to}</strong>, ha sido convocado/a para participar en el siguiente procedimiento en 440 Clinic. Por favor confirme su asistencia.</p>
          <div style="background: #f0f4ff; border-left: 4px solid #2563eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px; width: 130px;">📅 Fecha</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px; text-transform: capitalize;">${dateStr}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🕐 Hora</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${timeStr} – ${endTimeStr}</td></tr>
              ${doctor ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">👨‍⚕️ Médico a cargo</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${doctor}</td></tr>` : ''}
              ${procedure ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🔬 Procedimiento</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${procedure}</td></tr>` : ''}
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">📍 Lugar</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${location || '440 Clinic – Cartagena'}</td></tr>
            </table>
          </div>
          ${notes ? `<p style="color: #666; font-size: 14px; background: #fffbf0; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><strong>Notas:</strong> ${notes}</p>` : ''}
          <p style="color: #888; font-size: 13px;">El archivo <strong>.ics</strong> adjunto le permite agregar este evento a su calendario personal.</p>
        </div>
        <div style="background: #f0f4ff; padding: 20px; text-align: center;">
          <p style="color: #888; font-size: 12px; margin: 0;">440 Clinic Plastic Surgery · Cartagena, Colombia</p>
          <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Para confirmaciones o cambios comuníquese con el equipo administrativo.</p>
        </div>
      </div>
    </div>`;
}

export async function sendAppointmentEmail({ to, toName, type = 'patient', title, procedure, doctor, start, end, location, notes }) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const dateStr = startDate.toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota'
  });
  const timeStr = startDate.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'
  });
  const endTimeStr = endDate.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'
  });

  const icsContent = buildICS({
    title,
    description: `${procedure || ''}${notes ? ' – ' + notes : ''}`,
    location, start, end,
  });

  const isCollaborator = type === 'collaborator';
  const html = isCollaborator
    ? buildCollaboratorHTML({ toName, to, doctor, procedure, dateStr, timeStr, endTimeStr, location, notes })
    : buildPatientHTML({ toName, to, doctor, procedure, dateStr, timeStr, endTimeStr, location, notes });

  const subject = isCollaborator
    ? `📋 Convocatoria – ${procedure || 'Procedimiento'} – ${dateStr}`
    : `✅ Cita confirmada – ${dateStr} a las ${timeStr}`;

  return resend.emails.send({
    from: FROM,
    to: [to],
    subject,
    html,
    attachments: [{ filename: 'cita-440clinic.ics', content: Buffer.from(icsContent).toString('base64') }],
  });
}
