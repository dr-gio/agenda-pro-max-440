import React, { useState, useEffect } from 'react';
import { CalendarConfig } from '../types';

interface AppointmentModalProps {
  calendars: CalendarConfig[];
  onClose: () => void;
  onSaved: () => void;
  editEvent?: {
    id: string;
    calendarId: string;
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
  } | null;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({ calendars, onClose, onSaved, editEvent }) => {
  const today = new Date().toISOString().split('T')[0];

  const resources     = calendars.filter(c => c.active && (c.type === 'resource' || c.type === 'general'));
  const professionals = calendars.filter(c => c.active && (c.type === 'professional' || c.type === 'aesthetic'));

  const [form, setForm] = useState({
    resourceCalendarId: resources[0]?.id || '',
    professionalId: '',
    patient: '',
    patientEmail: '',
    procedure: '',
    date: today,
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    notes: '',
    isVirtual: false,
    meetLink: '',
    createMeet: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editEvent) {
      const start = new Date(editEvent.start);
      const end   = new Date(editEvent.end);
      const pad   = (n: number) => String(n).padStart(2, '0');
      const desc  = editEvent.description || '';
      const getField = (label: string) => {
        const match = desc.match(new RegExp(`${label}: (.+)`));
        return match ? match[1].trim() : '';
      };
      const titleParts = editEvent.title.split(' — ');

      setForm(f => ({
        ...f,
        resourceCalendarId: editEvent.calendarId || resources[0]?.id || '',
        patient:      getField('Paciente')      || titleParts[0] || '',
        patientEmail: getField('Email paciente') || '',
        procedure:    getField('Procedimiento') || titleParts[1] || '',
        date:         editEvent.start.split('T')[0],
        startTime:    `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime:      `${pad(end.getHours())}:${pad(end.getMinutes())}`,
        location:     editEvent.location || '',
        notes:        getField('Notas') || '',
      }));
    }
  }, [editEvent]);

  const selectedProfessional = professionals.find(p => p.id === form.professionalId) || null;

  const handleStartTimeChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    const endH   = String(h + 1 > 23 ? 23 : h + 1).padStart(2, '0');
    setForm(f => ({ ...f, startTime: val, endTime: `${endH}:${String(m).padStart(2, '0')}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const resourceCal        = calendars.find(c => c.id === form.resourceCalendarId);
      const resourceCalendarId = resourceCal?.googleCalendarId || 'primary';
      const professionalEmail  = selectedProfessional?.googleCalendarId || '';
      const doctorName         = selectedProfessional?.label || '';

      // Ubicación: campo manual o nombre de sala
      const locationFinal = form.isVirtual
        ? (form.createMeet ? 'Google Meet (se generará automáticamente)' : form.meetLink || 'Virtual')
        : (form.location || resourceCal?.label || '');

      const url    = editEvent ? `/api/events?id=${editEvent.id}` : '/api/events';
      const method = editEvent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceCalendarId,
          professionalEmail: professionalEmail || undefined,
          patientEmail:      form.patientEmail   || undefined,
          patient:           form.patient,
          procedure:         form.procedure,
          doctor:            doctorName,
          date:              form.date,
          startTime:         form.startTime,
          endTime:           form.endTime,
          location:          locationFinal,
          notes:             form.notes,
          isVirtual:         form.isVirtual,
          createMeet:        form.isVirtual && form.createMeet,
          meetLink:          form.isVirtual && !form.createMeet ? form.meetLink : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar la cita');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editEvent) return;
    if (!confirm('¿Eliminar esta cita? Se notificará al profesional si estaba invitado.')) return;
    setLoading(true);
    try {
      const resourceCal        = calendars.find(c => c.id === editEvent.calendarId);
      const resourceCalendarId = resourceCal?.googleCalendarId || 'primary';
      const res = await fetch(`/api/events?id=${editEvent.id}&resourceCalendarId=${resourceCalendarId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none text-slate-900 text-sm font-medium transition-all";
  const labelClass = "block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-7 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-[2rem] z-10">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              {editEvent ? 'Editar Cita' : 'Nueva Cita'}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">440 Clinic — Google Calendar</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">

          {/* ASIGNACIÓN — Sala + Profesional */}
          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-4">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Asignación</p>

            <div>
              <label className={labelClass}><span className="text-blue-600">Sala / Recurso</span></label>
              <select
                className={inputClass + " cursor-pointer bg-white border-blue-200"}
                value={form.resourceCalendarId}
                onChange={e => setForm(f => ({ ...f, resourceCalendarId: e.target.value }))}
              >
                <option value="">— Sin sala asignada —</option>
                {resources.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                <span className="text-purple-600">Profesional / Médico</span>
                {selectedProfessional?.googleCalendarId && selectedProfessional.googleCalendarId !== 'primary' && (
                  <span className="ml-2 text-emerald-500 normal-case tracking-normal">✓ Recibirá invitación</span>
                )}
              </label>
              <select
                className={inputClass + " cursor-pointer bg-white border-purple-200"}
                value={form.professionalId}
                onChange={e => setForm(f => ({ ...f, professionalId: e.target.value }))}
              >
                <option value="">— Sin profesional asignado —</option>
                {professionals.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}{c.googleCalendarId && c.googleCalendarId !== 'primary' ? ' ✓' : ' (sin email)'}
                  </option>
                ))}
              </select>
              {selectedProfessional && selectedProfessional.googleCalendarId && selectedProfessional.googleCalendarId !== 'primary' && (
                <p className="text-[10px] text-purple-500 mt-1 font-medium">
                  📧 Invitación a: {selectedProfessional.googleCalendarId}
                </p>
              )}
              {selectedProfessional && (!selectedProfessional.googleCalendarId || selectedProfessional.googleCalendarId === 'primary') && (
                <p className="text-[10px] text-amber-500 mt-1 font-medium">
                  ⚠️ Sin email configurado — ve a Configuración → Calendarios para añadirlo.
                </p>
              )}
            </div>
          </div>

          {/* PACIENTE + EMAIL */}
          <div className="p-4 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</p>

            <div>
              <label className={labelClass}>Nombre completo</label>
              <input
                type="text"
                placeholder="Nombre completo del paciente"
                className={inputClass}
                value={form.patient}
                onChange={e => setForm(f => ({ ...f, patient: e.target.value }))}
              />
            </div>

            <div>
              <label className={labelClass}>
                Email del paciente
                <span className="ml-2 normal-case tracking-normal text-slate-400 font-medium">(opcional — recibirá invitación)</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="paciente@email.com"
                  className={inputClass + " pl-10"}
                  value={form.patientEmail}
                  onChange={e => setForm(f => ({ ...f, patientEmail: e.target.value }))}
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              {form.patientEmail && (
                <p className="text-[10px] text-emerald-500 mt-1 font-medium">
                  ✓ El paciente recibirá invitación en su correo
                </p>
              )}
            </div>
          </div>

          {/* PROCEDIMIENTO */}
          <div>
            <label className={labelClass}>Procedimiento / Motivo</label>
            <input
              type="text"
              placeholder="Ej: Consulta, Hiperbárica, Postoperatorio..."
              className={inputClass}
              value={form.procedure}
              onChange={e => setForm(f => ({ ...f, procedure: e.target.value }))}
            />
          </div>

          {/* FECHA Y HORAS */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className={labelClass}>Fecha</label>
              <input
                type="date"
                required
                className={inputClass}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Inicio</label>
              <input
                type="time"
                required
                className={inputClass}
                value={form.startTime}
                onChange={e => handleStartTimeChange(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Fin</label>
              <input
                type="time"
                required
                className={inputClass}
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* MODALIDAD — Presencial / Virtual */}
          <div className="p-4 border border-slate-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Modalidad</p>
                <p className="text-sm font-bold text-slate-700">
                  {form.isVirtual ? '💻 Cita Virtual' : '🏥 Cita Presencial'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isVirtual: !f.isVirtual }))}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${form.isVirtual ? 'bg-blue-500' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${form.isVirtual ? 'translate-x-8' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Presencial: ubicación manual */}
            {!form.isVirtual && (
              <div>
                <label className={labelClass}>Ubicación / Dirección</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej: Sala 1, Consultorio 3, Dirección..."
                    className={inputClass + " pl-10"}
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
            )}

            {/* Virtual: Google Meet auto o link personalizado */}
            {form.isVirtual && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, createMeet: true, meetLink: '' }))}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${form.createMeet ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}
                  >
                    🎥 Google Meet auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, createMeet: false }))}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${!form.createMeet ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}
                  >
                    🔗 Link propio
                  </button>
                </div>

                {form.createMeet && (
                  <p className="text-[11px] text-blue-500 font-medium bg-blue-50 p-2.5 rounded-xl">
                    ✓ Google generará automáticamente el link de Meet y se lo enviará a todos los invitados
                  </p>
                )}

                {!form.createMeet && (
                  <div>
                    <label className={labelClass}>Link de videollamada</label>
                    <div className="relative">
                      <input
                        type="url"
                        placeholder="https://meet.google.com/xxx o https://zoom.us/j/xxx"
                        className={inputClass + " pl-10"}
                        value={form.meetLink}
                        onChange={e => setForm(f => ({ ...f, meetLink: e.target.value }))}
                      />
                      <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* NOTAS */}
          <div>
            <label className={labelClass}>Notas (opcional)</label>
            <textarea
              placeholder="Indicaciones especiales, preparación, etc."
              className={inputClass + " resize-none h-20"}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* RESUMEN */}
          {(form.patient || form.resourceCalendarId || form.professionalId) && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
              {form.patient && <p>👤 <b>Paciente:</b> {form.patient}{form.patientEmail ? ` — ${form.patientEmail}` : ''}</p>}
              {form.resourceCalendarId && <p>🏥 <b>Sala:</b> {resources.find(r => r.id === form.resourceCalendarId)?.label || '—'}</p>}
              {form.professionalId && (
                <p>👨‍⚕️ <b>Profesional:</b> {selectedProfessional?.label || '—'}
                  {selectedProfessional?.googleCalendarId && selectedProfessional.googleCalendarId !== 'primary'
                    ? ' — recibirá invitación'
                    : ''}
                </p>
              )}
              {form.isVirtual
                ? <p>💻 <b>Modalidad:</b> Virtual {form.createMeet ? '(Google Meet automático)' : form.meetLink ? `— ${form.meetLink}` : ''}</p>
                : form.location && <p>📍 <b>Ubicación:</b> {form.location}</p>
              }
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">
              ❌ {error}
            </div>
          )}

          {/* BOTONES */}
          <div className="flex gap-3 pt-2">
            {editEvent && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-5 py-3 bg-red-50 text-red-500 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-red-100 transition-all"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-3 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-5 py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
                : editEvent ? 'Guardar Cambios' : 'Crear Cita'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentModal;
