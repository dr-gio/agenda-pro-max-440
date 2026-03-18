
import React, { useState, useEffect, useRef } from 'react';
import { AuthSession, CalendarConfig, CalendarType, AppRoute } from '../types';
import { storage } from '../lib/storage';
import { TIMEZONE } from '../constants';

interface AdminViewProps {
  session: AuthSession | null;
  onLogout: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ session, onLogout }) => {
  const [calendars, setCalendars] = useState<CalendarConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendars' | 'settings'>('dashboard');
  const [form, setForm] = useState<Partial<CalendarConfig>>({
    id: '', label: '', type: 'resource', active: true, showDetails: true, sort: 1, timezone: TIMEZONE, googleCalendarId: '', avatarUrl: ''
  });
  const [apiKey, setApiKey] = useState('');
  const [aiHistory, setAiHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAdminData = async () => {
    const cals = await storage.getCalendars();
    setCalendars(cals.sort((a, b) => a.sort - b.sort));
    const key = await storage.getApiKey();
    setApiKey(key);
    const history = await storage.getAiHistory();
    setAiHistory(history);
  };

  useEffect(() => {
    loadAdminData();

    // Suscripción Realtime
    const subscription = storage.subscribeToCalendarChanges(() => {
      console.log("Realtime: Refreshing Admin View");
      loadAdminData();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    let newCals;
    if (editingId) {
      newCals = calendars.map(c => c.id === editingId ? { ...c, ...form } : c);
    } else {
      if (calendars.find(c => c.id === form.id)) {
        alert("El ID de calendario ya existe. Por favor usa uno único.");
        return;
      }
      newCals = [...calendars, form as CalendarConfig];
    }

    await storage.saveCalendars(newCals);
    setCalendars(newCals.sort((a, b) => a.sort - b.sort));
    setEditingId(null);
    setForm({
      id: '',
      label: '',
      type: 'resource',
      active: true,
      showDetails: true,
      sort: calendars.length + 1,
      timezone: TIMEZONE,
      googleCalendarId: '',
      avatarUrl: ''
    });
  };

  const handleSaveApiKey = async () => {
    await storage.saveApiKey(apiKey);
    alert('Google API Key guardada correctamente en la nube.');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este calendario definitivamente?")) return;
    const newCals = calendars.filter(c => c.id !== id);
    await storage.saveCalendars(newCals);
    setCalendars(newCals);
  };

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newCals = [...calendars];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newCals.length) return;

    const tempSort = newCals[index].sort;
    newCals[index].sort = newCals[target].sort;
    newCals[target].sort = tempSort;

    await storage.saveCalendars(newCals);
    setCalendars(newCals.sort((a, b) => a.sort - b.sort));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida.');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      // Sanitizar el ID para evitar errores de Supabase Storage (espacios, tildes, etc)
      const sanitizedId = (form.id || 'avatar')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase();

      const fileName = `${sanitizedId}-${Date.now()}.${fileExt}`;
      const filePath = fileName; // El bucket ya es 'avatars'

      console.log('Intentando subir archivo:', filePath);
      const { data, error } = await storage.uploadAvatar(file, filePath);

      if (error) {
        console.error('Error de Supabase Storage:', error);
        throw error;
      }

      console.log('Subida exitosa, obteniendo URL pública para:', filePath);
      const publicUrl = storage.getPublicUrl(filePath);
      console.log('URL Pública generada:', publicUrl);

      setForm(prev => ({ ...prev, avatarUrl: publicUrl }));
    } catch (error: any) {
      console.error('Error subiendo imagen:', error);
      alert('Error al subir la imagen: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSeed = async () => {
    if (confirm("¿Restaurar la configuración inicial? Esto sobrescribirá tus cambios en la nube.")) {
      const defaults = await storage.seedDefaults();
      setCalendars(defaults);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 bg-slate-50 pb-32">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-6">
            <img src="/logo.png" alt="440 Clinic Logo" className="h-16 w-auto object-contain" />
            <div className="h-12 w-px bg-slate-200 hidden md:block"></div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Configuración</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">440 Clinic Ops Center</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-6 bg-slate-200/50 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              DASHBOARD
            </button>
            <button
              onClick={() => setActiveTab('calendars')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'calendars' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              CALENDARIOS
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              IA & AJUSTES
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.location.hash = AppRoute.HOME}
            className="px-6 py-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 text-[11px] font-black shadow-sm transition-all text-slate-600 uppercase tracking-widest"
          >
            VOLVER AL TABLERO
          </button>
          <button onClick={onLogout} className="text-red-500 text-[11px] font-bold hover:bg-red-50 px-4 py-2 rounded-xl uppercase tracking-widest">SALIR</button>
        </div>
      </header >

      {activeTab === 'dashboard' ? (
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Recursos</span>
              <div className="text-4xl font-black text-slate-900">{calendars.filter(c => c.type === 'resource').length}</div>
              <p className="text-xs text-slate-500 mt-2">Salas y áreas operativas</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Profesionales</span>
              <div className="text-4xl font-black text-blue-600">{calendars.filter(c => c.type === 'professional').length}</div>
              <p className="text-xs text-slate-500 mt-2">Especialistas activos</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-pink-600">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Esteticistas</span>
              <div className="text-4xl font-black">{calendars.filter(c => c.type === 'aesthetic').length}</div>
              <p className="text-xs text-slate-500 mt-2">Personal de estética</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Estado IA</span>
              <div className="text-4xl font-black text-emerald-500">{apiKey ? 'ON' : 'OFF'}</div>
              <p className="text-xs text-slate-500 mt-2">Gemini 1.5 Flash</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Backup Cloud</span>
              <div className="text-4xl font-black text-slate-900">100%</div>
              <p className="text-xs text-slate-500 mt-2">Supabase Database</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-black text-slate-900 mb-6">Resumen Operativo</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-600">Calendarios Totales</span>
                  <span className="font-black text-slate-900">{calendars.length}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-600">Calendarios Activos</span>
                  <span className="font-black text-emerald-600">{calendars.filter(c => c.active).length}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-600">Categoría: Otros</span>
                  <span className="font-black text-slate-900">{calendars.filter(c => c.type === 'general').length}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-600 p-10 rounded-3xl shadow-xl shadow-blue-600/20 text-white">
              <h3 className="text-xl font-black mb-6 uppercase tracking-wider">Próximos Reportes</h3>
              <p className="text-blue-100 leading-relaxed font-medium mb-8">
                Estamos trabajando en la integración de reportes de ocupación y análisis de productividad por especialista.
              </p>
              <div className="flex gap-4">
                <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase block mb-1 text-blue-200">Exportar</span>
                  <span className="text-sm font-bold">PDF / EXCEL</span>
                </div>
                <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase block mb-1 text-blue-200">IA Analysis</span>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="text-sm font-bold hover:text-white transition-colors uppercase"
                  >
                    VER HISTORIAL
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* AI HISTORY MODAL */}
          {showHistory && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">Historial IA</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Análisis Recientes de Flujo</p>
                  </div>
                  <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-4">
                  {aiHistory.length > 0 ? aiHistory.map((h, i) => (
                    <div key={i} className={`p-6 rounded-3xl border ${h.has_conflicts ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(h.created_at).toLocaleString('es-CO')}
                        </span>
                        {h.has_conflicts && (
                          <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Conflicto</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed italic">"{h.insight}"</p>
                    </div>
                  )) : (
                    <p className="text-center py-10 text-slate-400 font-bold uppercase tracking-widest text-xs">No hay historial disponible</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'calendars' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          <div className="lg:col-span-1">
            {/* FORMULARIO DE CALENDARIO */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-black mb-6 text-slate-800">
                {editingId ? 'Editar Calendario' : 'Añadir Calendario'}
              </h2>
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">ID Interno</label>
                  <input
                    required
                    placeholder="ej: consultorio_1"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 transition-all font-medium"
                    value={form.id}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-blue-600 mb-2 tracking-widest">Google Calendar ID</label>
                  <input
                    required
                    placeholder="ej: c_xxxxxxxxxx@group.calendar.google.com"
                    className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 transition-all font-medium"
                    value={form.googleCalendarId}
                    onChange={(e) => setForm({ ...form, googleCalendarId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Nombre Visible</label>
                  <input
                    required
                    placeholder="ej: Consultorio 1"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 transition-all font-medium"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Foto del Médico / Recurso</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {form.avatarUrl ? (
                        <img src={form.avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/*"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className={`w-full py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isUploading ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {isUploading ? 'SUBIENDO...' : 'SUBIR FOTO'}
                      </button>
                      <input
                        placeholder="O pega la URL directamente..."
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 outline-none text-[10px] transition-all font-medium"
                        value={form.avatarUrl || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, avatarUrl: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Categoría</label>
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold appearance-none cursor-pointer"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as CalendarType })}
                  >
                    <option value="resource">Sala / Recurso</option>
                    <option value="professional">Profesional</option>
                    <option value="aesthetic">Esteticista</option>
                    <option value="general">Otros / Equipos</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-5 h-5 rounded border-slate-300 pointer-events-none" checked={form.active} readOnly />
                    <span className="text-sm font-bold text-slate-700" onClick={() => setForm({ ...form, active: !form.active })}>Activo</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-5 h-5 rounded border-slate-300 pointer-events-none" checked={form.showDetails} readOnly />
                    <span className="text-sm font-bold text-slate-700" onClick={() => setForm({ ...form, showDetails: !form.showDetails })}>Detalles</span>
                  </label>
                </div>

                <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition-all">
                  {editingId ? 'GUARDAR CAMBIOS' : 'AÑADIR CALENDARIO'}
                </button>
                {editingId && (
                  <button type="button" onClick={() => setEditingId(null)} className="w-full text-slate-400 font-bold py-2">Cancelar Edición</button>
                )}
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Recurso / Especialista</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Tipo</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {calendars.map((cal, idx) => (
                    <tr key={cal.id} className={`${!cal.active ? 'opacity-40' : ''} hover:bg-slate-50/50 transition-colors`}>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          {cal.avatarUrl ? (
                            <img src={cal.avatarUrl} alt={cal.label} className="w-10 h-10 rounded-full object-cover border-2 border-slate-100 shadow-sm" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-black">
                              {cal.label.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{cal.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cal.googleCalendarId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${cal.type === 'professional' ? 'bg-purple-100 text-purple-600' :
                            cal.type === 'aesthetic' ? 'bg-pink-100 text-pink-600' :
                              cal.type === 'resource' ? 'bg-blue-100 text-blue-600' :
                                'bg-slate-100 text-slate-600'
                          }`}>
                          {cal.type}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingId(cal.id); setForm(cal); }} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                          <button onClick={() => handleDelete(cal.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleSeed} className="text-slate-400 text-xs font-bold hover:text-slate-600 uppercase tracking-widest">Restaurar Valores por Defecto</button>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-10 shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 bg-blue-50 rounded-2xl text-blue-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Configuración de Inteligencia Artificial</h2>
                <p className="text-slate-500 font-medium">Google Gemini — Operational Refinement</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">API KEY SECRETA (GEMINI 1.5 PRO)</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Introduce tu clave secreta de Google AI"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 font-mono text-lg transition-all"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={handleSaveApiKey}
                className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 uppercase tracking-widest"
              >
                Actualizar y Probar Conexión
              </button>
              <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-800 font-medium leading-relaxed">
                  Esta clave permite que la IA analice los conflictos entre salas y doctores para darte recomendaciones inteligentes en el Modo TV.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default AdminView;
