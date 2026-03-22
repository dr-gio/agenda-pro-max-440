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

  // CIRUGÍA
  if (p.includes('cirug') || p.includes('operac') || p.includes('quirurg') ||
      p.includes('lipo') || p.includes('abdomi') || p.includes('rinoplas') ||
      p.includes('mamop') || p.includes('implante') || p.includes('bleparo') ||
      p.includes('gluteo') || p.includes('facelift') || p.includes('lifting')) {
    return `¡Tu cirugía está confirmada! 🎉 Estamos muy emocionados de acompañarte en este paso tan importante.
<br><br>
Recuerda tener en cuenta lo siguiente antes de tu procedimiento:
<br><br>
🔹 <b>Sigue al pie de la letra</b> todas las indicaciones preoperatorias que te dio el Dr. Gio en tu consulta.<br>
🔹 <b>Lleva contigo</b> todos los documentos firmados, exámenes de laboratorio y estudios que te solicitaron.<br>
🔹 <b>Llega 30 minutos antes</b> de tu hora programada para el proceso de admisión.<br>
🔹 <b>Ven acompañado/a</b> — un familiar o persona de confianza debe estar disponible durante y después del procedimiento.<br>
🔹 <b>No ingieras alimentos ni líquidos</b> desde la medianoche del día anterior (a menos que tu médico indique lo contrario).<br>
🔹 <b>¿Tienes dudas de último momento?</b> Comunícate directamente con tu asesora — estamos aquí para ti.
<br><br>
¡Nos vemos pronto! El equipo de 440 Clinic estará listo para brindarte la mejor atención. 💙`;
  }

  // CONTROL POSTOPERATORIO
  if (p.includes('control') || p.includes('postop') || p.includes('seguimiento') ||
      p.includes('post-op') || p.includes('revision') || p.includes('revisión')) {
    return `Tu cita de control está confirmada. ¡Qué bueno saber que vas bien en tu recuperación! 💙
<br><br>
Algunos recordatorios para tu visita:
<br><br>
🔹 <b>Llega 10 minutos antes</b> de tu hora programada.<br>
🔹 <b>Trae tus medicamentos actuales</b> si aún los estás tomando, para revisión del Dr. Gio.<br>
🔹 <b>Anota cualquier duda o síntoma</b> que hayas tenido — no hay pregunta pequeña, todas son importantes.<br>
🔹 <b>Trae fotos</b> de tu evolución si las tienes, son muy útiles para el seguimiento.<br>
🔹 Si presentas algún síntoma inusual <b>antes de la cita</b>, contáctanos de inmediato sin esperar.
<br><br>
¡Nos vemos pronto! Estamos muy orgullosos de tu proceso. 🌟`;
  }

  // CONSULTA / VALORACIÓN
  if (p.includes('consult') || p.includes('valorac') || p.includes('primera vez') ||
      p.includes('primeravez') || p.includes('valora')) {
    return `Tu consulta de valoración está confirmada. ¡Bienvenido/a a 440 Clinic! Estamos emocionados de conocerte y escuchar tus metas. 💙
<br><br>
Para que tu consulta sea la mejor experiencia posible:
<br><br>
🔹 <b>Llega 15 minutos antes</b> para completar tu registro sin afanes.<br>
🔹 <b>Trae exámenes o estudios</b> previos relacionados con el procedimiento de tu interés, si los tienes.<br>
🔹 <b>Si tienes fotos de referencia</b> de resultados que te gustan, tráelas — son muy útiles para la consulta.<br>
🔹 <b>Ven con todas tus preguntas</b> — el Dr. Gio dedicará el tiempo necesario para responderte todo.<br>
🔹 Recuerda que esta consulta es confidencial y completamente personalizada para ti.
<br><br>
¡Te esperamos con los brazos abiertos! 🌟`;
  }

  // PROCEDIMIENTO ESTÉTICO / INYECTABLE / MENOR
  if (p.includes('procedim') || p.includes('inyect') || p.includes('bótox') ||
      p.includes('botox') || p.includes('rellen') || p.includes('facial') ||
      p.includes('laser') || p.includes('láser') || p.includes('depilac') ||
      p.includes('hydrash') || p.includes('tensamax') || p.includes('hifu') ||
      p.includes('peeling') || p.includes('limpieza')) {
    return `Tu cita para procedimiento estético está confirmada. ¡Nos encanta seguir acompañándote en tu proceso! 💙
<br><br>
Recuerda lo siguiente:
<br><br>
🔹 <b>Llega 10 minutos antes</b> de tu hora programada.<br>
🔹 <b>Ven con el rostro o zona a tratar sin maquillaje</b> ni cremas aplicadas (si aplica).<br>
🔹 <b>Hidratación:</b> mantente bien hidratado/a el día anterior y el día del procedimiento.<br>
🔹 Si tienes algún medicamento en curso o antecedente relevante, <b>infórmalo a tu esteticista</b> al llegar.<br>
🔹 ¿Tienes alguna duda? Escríbele a tu asesora con confianza.
<br><br>
¡Te esperamos lista/o para lucir increíble! ✨`;
  }

  // ANESTESIA / PREANESTESIA
  if (p.includes('anestesia') || p.includes('preanestesia') || p.includes('valoracion anestesia')) {
    return `Tu cita de valoración anestésica está confirmada. Este es un paso fundamental para garantizar tu seguridad en el procedimiento. 💙
<br><br>
🔹 <b>Llega 15 minutos antes.</b><br>
🔹 <b>Trae todos tus exámenes</b> de laboratorio y estudios solicitados.<br>
🔹 <b>Informa sobre cualquier medicamento</b> que estés tomando actualmente, alergias o antecedentes médicos relevantes.<br>
🔹 Esta consulta es obligatoria y determinante para la autorización de tu cirugía.
<br><br>
¡Estamos contigo en cada paso del proceso! 🌟`;
  }

  // DEFAULT
  return `Tu cita está confirmada. ¡Te esperamos! 💙
<br><br>
🔹 <b>Llega 15 minutos antes</b> de tu hora programada.<br>
🔹 Si tienes alguna duda o necesitas cambiar tu cita, comunícate con tu asesora.<br>
🔹 Estamos disponibles para ayudarte en lo que necesites.
<br><br>
¡Nos vemos pronto en 440 Clinic! 🌟`;
}

function buildPatientHTML({ toName, to, doctor, procedure, dateStr, timeStr, endTimeStr, location, notes }) {
  const message = getPatientMessage(procedure);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="background: #0a1628; padding: 36px 40px; text-align: center;">
          <img src="https://agenda-pro-max-440.vercel.app/logo_white.png" alt="440 Clinic" style="height: 72px; width: auto; display: block; margin: 0 auto;" />
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
        <div style="background: #0a1628; padding: 36px 40px; text-align: center;">
          <img src="https://agenda-pro-max-440.vercel.app/logo_white.png" alt="440 Clinic" style="height: 72px; width: auto; display: block; margin: 0 auto;" />
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

export async function sendCancellationEmail({ to, toName, procedure, doctor, date, startTime }) {
  const startDate = new Date(`${date}T${startTime || '00:00'}:00-05:00`);
  const dateStr = startDate.toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
  });
  const timeStr = startTime
    ? startDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="background: #0a1628; padding: 36px 40px; text-align: center;">
          <img src="https://agenda-pro-max-440.vercel.app/logo_white.png" alt="440 Clinic" style="height: 72px; width: auto; display: block; margin: 0 auto;" />
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #c0392b; margin: 0 0 8px; font-size: 20px;">❌ Cita Cancelada</h2>
          <p style="color: #444; margin: 0 0 24px;">Hola <strong>${toName || to}</strong>, te informamos que la siguiente cita ha sido cancelada.</p>
          <div style="background: #fff5f5; border-left: 4px solid #c0392b; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; font-size: 14px; width: 130px;">📅 Fecha</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px; text-transform: capitalize;">${dateStr}</td></tr>
              ${timeStr ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🕐 Hora</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${timeStr}</td></tr>` : ''}
              ${doctor ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">👨‍⚕️ Doctor</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${doctor}</td></tr>` : ''}
              ${procedure ? `<tr><td style="padding: 6px 0; color: #666; font-size: 14px;">🔬 Procedimiento</td><td style="padding: 6px 0; color: #0a1628; font-weight: bold; font-size: 14px;">${procedure}</td></tr>` : ''}
            </table>
          </div>
          <p style="color: #444; font-size: 14px;">Si deseas reprogramar tu cita o tienes alguna pregunta, comunícate directamente con tu asesora en 440 Clinic.</p>
        </div>
        <div style="background: #f0f4ff; padding: 20px; text-align: center;">
          <p style="color: #888; font-size: 12px; margin: 0;">440 Clinic Plastic Surgery · Barranquilla, Colombia</p>
          <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Lamentamos los inconvenientes ocasionados.</p>
        </div>
      </div>
    </div>`;

  return resend.emails.send({
    from: FROM,
    to: [to],
    subject: `❌ Cita cancelada – ${dateStr}${timeStr ? ' a las ' + timeStr : ''}`,
    html,
  });
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
