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

  const [form, setForm] = useState({
    calendarId: calendars[0]?.googleCalendarId || 'primary',
    patient: '',
    procedure: '',
    doctor: '',
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

      // Intentar extraer campos del description
      const desc = editEvent.description || '';
      const getField = (label: string) => {
        const match = desc.match(new RegExp(`${label}: (.+)`));
        return match ? match[1].trim() : '';
      };

      // Extraer paciente y procedimiento del título "Paciente — Procedimiento"
      const titleParts = editEvent.title.split(' — ');

      setForm({
        calendarId: editEvent.calendarId || calendars[0]?.googleCalendarId || 'primary',
        patient: getField('Paciente') || titleParts[0] || '',
        procedure: getField('Procedimiento') || titleParts[1] || '',
        doctor: getField('Médico') || '',
        date: editEvent.start.split('T')[0],
        startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
        location: editEvent.location || '',
        notes: getField('Notas') || '',
      });
    }
  }, [editEvent]);

  // Auto-calcular hora fin (1 hora después)
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
      // Buscar el googleCalendarId del calendario seleccionado
      const selectedCal = calendars.find(c => c.id === form.calendarId);
      const googleCalId = selectedCal?.googleCalendarId || 'primary';

      const url = editEvent ? `/api/events?id=${editEvent.id}` : '/api/events';
      const method = editEvent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, calendarId: googleCalId }),
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
    if (!confirm('¿Eliminar esta cita definitivamente?')) return;
    setLoading(true);
    try {
      const selectedCal = calendars.find(c => c.id === editEvent.calendarId);
      const googleCalId = selectedCal?.googleCalendarId || 'primary';
      const res = await fetch(`/api/events?id=${editEvent.id}&calendarId=${googleCalId}`, { method: 'DELETE' });
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-7 space-y-4">

          {/* Calendario destino */}
          <div>
            <label className={labelClass}>Calendario / Sala</label>
            <select
              className={inputClass + " cursor-pointer"}
              value={form.calendarId}
              onChange={e => setForm(f => ({ ...f, calendarId: e.target.value }))}
            >
              {calendars.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
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

          {/* Médico */}
          <div>
            <label className={labelClass}>Médico Responsable</label>
            <input
              type="text"
              placeholder="Nombre del médico o especialista"
              className={inputClass}
              value={form.doctor}
              onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}
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

          {/* Ubicación */}
          <div>
            <label className={labelClass}>Ubicación / Sala (opcional)</label>
            <input
              type="text"
              placeholder="Ej: Consultorio 1, Sala de Procedimientos..."
              className={inputClass}
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            />
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
