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

  // Separar salas/recursos de profesionales
  const resources  = calendars.filter(c => c.active && (c.type === 'resource' || c.type === 'general'));
  const professionals = calendars.filter(c => c.active && (c.type === 'professional' || c.type === 'aesthetic'));

  const [form, setForm] = useState({
    resourceCalendarId: resources[0]?.id || '',
    professionalId: '',          // ID interno del profesional seleccionado
    patient: '',
    procedure: '',
    date: today,
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editEvent) {
      const start = new Date(editEvent.start);
      const end = new Date(editEvent.end);
      const pad = (n: number) => String(n).padStart(2, '0');
      const desc = editEvent.description || '';
      const getField = (label: string) => {
        const match = desc.match(new RegExp(`${label}: (.+)`));
        return match ? match[1].trim() : '';
      };
      const titleParts = editEvent.title.split(' — ');

      setForm(f => ({
        ...f,
        resourceCalendarId: editEvent.calendarId || resources[0]?.id || '',
        patient: getField('Paciente') || titleParts[0] || '',
        procedure: getField('Procedimiento') || titleParts[1] || '',
        date: editEvent.start.split('T')[0],
        startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
        location: editEvent.location || '',
        notes: getField('Notas') || '',
      }));
    }
  }, [editEvent]);

  // Profesional seleccionado (objeto completo)
  const selectedProfessional = professionals.find(p => p.id === form.professionalId) || null;

  // Auto hora fin (+1h)
  const handleStartTimeChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    const endH = String(h + 1 > 23 ? 23 : h + 1).padStart(2, '0');
    setForm(f => ({ ...f, startTime: val, endTime: `${endH}:${String(m).padStart(2, '0')}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Obtener googleCalendarId del recurso seleccionado
      const resourceCal = calendars.find(c => c.id === form.resourceCalendarId);
      const resourceCalendarId = resourceCal?.googleCalendarId || 'primary';

      // Email del profesional (su googleCalendarId es su email en Google)
      const professionalEmail = selectedProfessional?.googleCalendarId || '';
      const doctorName = selectedProfessional?.label || '';

      const url = editEvent ? `/api/events?id=${editEvent.id}` : '/api/events';
      const method = editEvent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceCalendarId,
          professionalEmail: professionalEmail || undefined,
          patient: form.patient,
          procedure: form.procedure,
          doctor: doctorName,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          location: form.location || (resourceCal?.label || ''),
          notes: form.notes,
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
      const resourceCal = calendars.find(c => c.id === editEvent.calendarId);
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

          {/* SALA / RECURSO + PROFESIONAL — la parte clave */}
          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-4">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Asignación</p>

            {/* Sala */}
            <div>
              <label className={labelClass}>
                <span className="text-blue-600">Sala / Recurso</span>
              </label>
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

            {/* Profesional */}
            <div>
              <label className={labelClass}>
                <span className="text-purple-600">Profesional / Médico</span>
                {selectedProfessional?.googleCalendarId && (
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
                  📧 Se enviará invitación a: {selectedProfessional.googleCalendarId}
                </p>
              )}
              {selectedProfessional && (!selectedProfessional.googleCalendarId || selectedProfessional.googleCalendarId === 'primary') && (
                <p className="text-[10px] text-amber-500 mt-1 font-medium">
                  ⚠️ Este profesional no tiene email configurado. Ve a Configuración → Calendarios para añadirlo.
                </p>
              )}
            </div>
          </div>

          {/* Paciente */}
          <div>
            <label className={labelClass}>Paciente</label>
            <input
              type="text"
              placeholder="Nombre completo del paciente"
              className={inputClass}
              value={form.patient}
              onChange={e => setForm(f => ({ ...f, patient: e.target.value }))}
            />
          </div>

          {/* Procedimiento */}
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

          {/* Fecha y horas */}
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

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas (opcional)</label>
            <textarea
              placeholder="Indicaciones especiales, preparación, etc."
              className={inputClass + " resize-none h-20"}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Resumen de lo que se va a crear */}
          {(form.resourceCalendarId || form.professionalId) && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
              {form.resourceCalendarId && (
                <p>🏥 <b>Sala:</b> {resources.find(r => r.id === form.resourceCalendarId)?.label || '—'}</p>
              )}
              {form.professionalId && (
                <p>👨‍⚕️ <b>Profesional:</b> {selectedProfessional?.label || '—'}
                  {selectedProfessional?.googleCalendarId && selectedProfessional.googleCalendarId !== 'primary'
                    ? ' — recibirá invitación por email'
                    : ' — sin invitación (email no configurado)'}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">
              ❌ {error}
            </div>
          )}

          {/* Actions */}
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
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
              ) : editEvent ? 'Guardar Cambios' : 'Crear Cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentModal;
