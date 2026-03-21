import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function buildICS({ title, description, location, start, end, organizer }) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//440 Clinic//Calendar//ES',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@440clinic.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location || '440 Clinic – Cartagena'}`,
    `ORGANIZER;CN=440 Clinic:mailto:${organizer || 'noreply@440clinic.com'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function sendAppointmentEmail({ to, toName, title, procedure, doctor, start, end, location, notes }) {
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
    location,
    start,
    end,
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="background: #0a1628; padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 4px;">440 CLINIC</h1>
          <p style="color: #8899aa; margin: 8px 0 0; font-size: 12px; letter-spacing: 2px;">PLASTIC SURGERY</p>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #0a1628; margin: 0 0 8px; font-size: 20px;">Confirmación de Cita</h2>
          <p style="color: #666; margin: 0 0 24px;">Hola <strong>${toName || to}</strong>, tu cita ha sido confirmada.</p>

          <div style="background: #f0f4ff; border-left: 4px solid #2563eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px; width: 120px;">📅 Fecha</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px; text-transform: capitalize;">${dateStr}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🕐 Hora</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${timeStr} – ${endTimeStr}</td></tr>
              ${doctor ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">👨‍⚕️ Doctor</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${doctor}</td></tr>` : ''}
              ${procedure ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🔬 Procedimiento</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${procedure}</td></tr>` : ''}
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px;">📍 Lugar</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${location || '440 Clinic – Cartagena'}</td></tr>
            </table>
          </div>

          ${notes ? `<p style="color: #666; font-size: 14px; background: #fffbf0; border-radius: 8px; padding: 12px;"><strong>Nota:</strong> ${notes}</p>` : ''}

          <p style="color: #888; font-size: 13px; margin-top: 24px;">El archivo adjunto <strong>.ics</strong> te permite agregar esta cita a tu Google Calendar, Outlook o Apple Calendar con un solo clic.</p>
        </div>
        <div style="background: #f0f4ff; padding: 20px; text-align: center;">
          <p style="color: #888; font-size: 12px; margin: 0;">440 Clinic Plastic Surgery · Cartagena, Colombia</p>
          <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Para cambios o cancelaciones comunícate con nosotros.</p>
        </div>
      </div>
    </div>
  `;

  return resend.emails.send({
    from: '440 Clinic <onboarding@resend.dev>',
    to: [to],
    subject: `✅ Cita confirmada – ${dateStr} a las ${timeStr}`,
    html,
    attachments: [{ filename: 'cita-440clinic.ics', content: Buffer.from(icsContent).toString('base64') }],
  });
}
