
/**
 * In a real Next.js environment, this would use the 'googleapis' package and
 * a service account from process.env.GOOGLE_SERVICE_ACCOUNT_JSON.
 * For this SPA, we simulate the logic of fetching and normalizing.
 */

import { CalendarConfig, CalendarEvent } from '../types';

export async function fetchCalendarBoard(
  configs: CalendarConfig[],
  date: string = new Date().toISOString().split('T')[0],
  endDate?: string
): Promise<CalendarEvent[]> {
  try {
    // In passing queries to our Vercel function:
    // We can fetch events for a specific calendar ID (if configured)
    // or we might want to iterate through configs if each config maps to a calendar ID.
    // For now, let's assume we fetch events from the PRIMARY calendar or a specific one in env.

    // Fetch events for all active calendars in parallel
    const eventPromises = configs.filter(c => c.active).map(async (config) => {
      try {
        const queryOptions: any = {
          date,
          calendarId: config.googleCalendarId || 'primary'
        };
        if (endDate) {
          queryOptions.endDate = endDate;
        }

        const params = new URLSearchParams(queryOptions);

        const response = await fetch(`/api/calendar?${params.toString()}`);
        if (!response.ok) {
          console.warn(`Failed to fetch calendar ${config.label}: ${response.statusText}`);
          return [];
        }

        const data = await response.json();

        return data.map((event: any) => {
          let title = event.summary || 'Sin título';
          let finalBooker = '';

          // Si el calendario es tipo 'resource' (sala o equipo), extraer qué profesional lo utiliza
          if (config.type === 'resource' || config.type === 'general') {
            const professionals = configs.filter(c => c.type === 'professional' || c.type === 'aesthetic');

            // 1. Recopilar todos los participantes (organizador + invitados)
            const participantEmails: string[] = [];
            if (event.organizer && event.organizer.email) {
              participantEmails.push(event.organizer.email.toLowerCase());
            }
            if (event.attendees && Array.isArray(event.attendees)) {
              event.attendees.forEach((att: any) => {
                if (att.email) participantEmails.push(att.email.toLowerCase());
              });
            }

            // 2. Buscar match por EMAIL en la lista de profesionales configurados
            const matchedByEmail = professionals.find(p => 
              p.googleCalendarId && participantEmails.includes(p.googleCalendarId.toLowerCase())
            );

            if (matchedByEmail) {
              finalBooker = matchedByEmail.label;
            } else {
              // 3. Buscar match por NOMBRE en el TÍTULO del evento
              // Ej: Si el título es "Consulta Dr. Giovanni" y tenemos un profesional con label "Dr. Giovanni"
              const matchedByNameInTitle = professionals.find(p => 
                title.toLowerCase().includes(p.label.toLowerCase()) ||
                (p.label.length > 5 && title.toLowerCase().includes(p.label.toLowerCase().substring(0, 8)))
              );

              if (matchedByNameInTitle) {
                finalBooker = matchedByNameInTitle.label;
              } else {
                // 4. Fallback: Si no hay match profesional, buscar el primer humano invitado (que no sea el recurso)
                const humanAtt = event.attendees?.find((att: any) =>
                  !att.resource && att.email && att.email.toLowerCase() !== config.googleCalendarId?.toLowerCase() && !att.self
                );

                if (humanAtt) {
                  finalBooker = humanAtt.displayName || humanAtt.email.split('@')[0];
                } else if (event.organizer && event.organizer.email && event.organizer.email.toLowerCase() !== config.googleCalendarId?.toLowerCase()) {
                  // Final fallback: Organizador (probablemente la secretaria)
                  finalBooker = event.organizer.displayName || event.organizer.email.split('@')[0];
                } else {
                  finalBooker = 'Personal';
                }
              }
            }

            // Limpiar el título para no mostrar duplicados (ej: "Dr Gio - Consulta" -> "Consulta")
            const cleanBooker = finalBooker.toLowerCase();
            if (finalBooker && title.toLowerCase().startsWith(cleanBooker + ' - ')) {
              title = title.substring(finalBooker.length + 3).trim();
            } else if (finalBooker && title.toLowerCase().startsWith(cleanBooker)) {
              // Si el título empieza por el nombre sin el guion, también limpiar
              const rest = title.substring(finalBooker.length).trim();
              if (rest.startsWith('-') || rest.startsWith(':')) {
                title = rest.substring(1).trim();
              } else if (rest.length > 0 && rest[0] === ' ') {
                 title = rest;
              }
            } else if (finalBooker && title.includes(' - ')) {
              const parts = title.split(' - ');
              if (cleanBooker.includes(parts[0].toLowerCase().trim()) ||
                parts[0].toLowerCase().trim().includes(cleanBooker)) {
                title = parts.slice(1).join(' - ').trim();
              }
            }
          }

          return {
            id: event.id,
            calendarId: config.id,
            calendarLabel: config.label,
            calendarType: config.type,
            title: title,
            booker: finalBooker,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            location: event.location,
            description: event.description,
            source: 'events'
          };
        });
      } catch (e) {
        console.error(`Error fetching calendar ${config.label}:`, e);
        return [];
      }
    });

    const nestedEvents = await Promise.all(eventPromises);
    return nestedEvents.flat();
  } catch (error) {
    throw error;
  }
}

