import React, { useState } from 'react';

// Mapa de profesionales que tienen calendario de bloqueos
const BLOQUEOS_CALENDARS = [
  {
    label: 'Dr. Gio',
    googleCalendarId: 'c_70caeaad5a4502be79ac9d2f97cf53774175baa894a63ee19306ca6d9672ddf7@group.calendar.google.com',
  },
  {
    label: 'Dra. Sharon',
    googleCalendarId: 'c_b479217982bac53b908f1e4ee24498ce284c60f64cd1dd741588c054fb7141c5@group.calendar.google.com',
  },
];

interface BlockModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const BlockModal: React.FC<BlockModalProps> = ({ onClose, onSaved }) => {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    doctor: BLOQUEOS_CALENDARS[0].googleCalendarId,
    motivo: '',
    date: today,
    startTime: '08:00',
    endTime: '09:00',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartTimeChange = (val: string) => {
    const [h, m] = val.split(':').map(Number);
    const endH = String(h + 1 > 23 ? 23 : h + 1).padStart(2, '0');
    setForm(f => ({ ...f, startTime: val, endTime: `${endH}:${String(m).padStart(2, '0')}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.motivo.trim()) { setError('Escribe el motivo del bloqueo'); return; }
    setError('');
    setLoading(true);

    try {
      const selected = BLOQUEOS_CALENDARS.find(c => c.googleCalendarId === form.doctor)!;
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalCalendarId: form.doctor,
          patient: `🔒 ${form.motivo}`,
          procedure: 'Bloqueo de agenda',
          doctor: selected.label,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          notes: `Bloqueado: ${form.motivo}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear el bloqueo');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-500/10 focus:border-red-400 outline-none text-slate-900 text-sm font-medium transition-all";
  const labelClass = "block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="p-7 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-900">🔒 Bloquear Agenda</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">440 Clinic — Bloqueo interno</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">

          {/* Doctor */}
          <div>
            <label className={labelClass}><span className="text-red-500">Médico</span></label>
            <select
              className={inputClass + " cursor-pointer border-red-200"}
              value={form.doctor}
              onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}
            >
              {BLOQUEOS_CALENDARS.map(c => (
                <option key={c.googleCalendarId} value={c.googleCalendarId}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Motivo */}
          <div>
            <label className={labelClass}>Motivo del bloqueo <span className="text-red-400">*</span></label>
            <input
              type="text"
              placeholder="Ej: Cirugía externa, Cena personal, Vacaciones..."
              className={inputClass}
              value={form.motivo}
              onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              autoFocus
              required
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

          {/* Resumen */}
          {form.motivo && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-[11px] text-red-600 space-y-1">
              <p>🔒 <b>{BLOQUEOS_CALENDARS.find(c => c.googleCalendarId === form.doctor)?.label}</b> bloqueado</p>
              <p>📅 {form.date} · {form.startTime} – {form.endTime}</p>
              <p>📝 {form.motivo}</p>
              <p className="text-[10px] text-red-400 mt-1">El bot y el equipo verán este bloqueo al intentar agendar.</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">
              ❌ {error}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
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
              className="flex-1 px-5 py-3 bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Bloqueando...</>
                : '🔒 Bloquear Agenda'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BlockModal;
