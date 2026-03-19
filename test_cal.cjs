// mock data to test logic
const configs = [
  { id: '1', label: 'Dr Gio', googleCalendarId: 'drgio@clinic.com', type: 'professional' },
  { id: '2', label: 'Esteticista 1', googleCalendarId: 'este@clinic.com', type: 'aesthetic' },
  { id: '3', label: 'Sala de Procedimientos', googleCalendarId: 'sala1@clinic.com', type: 'resource' }
];

const eventFromGoogle = {
  summary: 'Consulta Paciente',
  creator: { email: 'secretaria@clinic.com', displayName: 'Secretaria' },
  organizer: { email: 'drgio@clinic.com', displayName: 'Dr Gio Organizer' }, // This happens when secretary creates ON BEHALF of Dr Gio!
  attendees: [
    { email: 'sala1@clinic.com', resource: true, self: true } // Only the room is invited if created directly on Dr Gio's calendar and inviting the room
  ]
};

// Simulation of current logic:
let finalBooker = '';
const config = configs[2];

// 1. Check attendees
const professionalAtt = eventFromGoogle.attendees?.find((att) => {
  const matchedConfig = configs.find(c => c.googleCalendarId === att.email);
  return matchedConfig && (matchedConfig.type === 'professional' || matchedConfig.type === 'aesthetic');
});

if (professionalAtt) {
  finalBooker = 'from attendee';
} else {
  // If the secretary creates the event ON IN THE PROFESSIONAL'S calendar and invites the room:
  // The event is hosted by the professional's calendar -> organizer === professional
  const organizerEmail = eventFromGoogle.organizer?.email;
  const matchOrganizer = configs.find(c => c.googleCalendarId === organizerEmail && (c.type === 'professional' || c.type === 'aesthetic'));
  
  if (matchOrganizer) {
    finalBooker = matchOrganizer.label;
    console.log("Matched by organizer:", finalBooker);
  } else {
    console.log("Fallback");
  }
}
