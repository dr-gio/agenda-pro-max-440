import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarConfig, CalendarEvent, AppRoute } from '../types';
import { storage } from '../lib/storage';
import { fetchCalendarBoard } from '../lib/google';

const TVView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalendarConfig[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [hasError, setHasError] = useState(false);
  const [aiInsight, setAiInsight] = useState("Sincronizando flujo...");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lastAiRun, setLastAiRun] = useState<number>(0);

  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedWeekCalendarId, setSelectedWeekCalendarId] = useState<string>('');

  const [filterType, setFilterType] = useState<'all' | 'professional' | 'resource' | 'general' | 'aesthetic'>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilter = params.get('filter') as any;
    if (urlFilter && ['all', 'professional', 'resource', 'general', 'aesthetic'].includes(urlFilter)) return urlFilter;

    const saved = localStorage.getItem('tv_filter_type');
    if (saved && ['all', 'professional', 'resource', 'general', 'aesthetic'].includes(saved)) return saved as any;

    return 'all';
  });

  const updateFilter = (type: 'all' | 'professional' | 'resource' | 'general' | 'aesthetic') => {
    setFilterType(type);
    localStorage.setItem('tv_filter_type', type);
  };

  const runAIAnalysis = async (currentEvents: CalendarEvent[], targetDate: string) => {
    const now = Date.now();
    if (now - lastAiRun < 600000 && lastAiRun !== 0) {
      return;
    }

    if (currentEvents.length === 0) {
      setAiInsight("Sin eventos para analizar.");
      return;
    }

    setIsAiLoading(true);
    try {
      const slimEvents = currentEvents.map(e => ({
        cal: e.calendarId,
        t: e.title,
        s: e.start.split('T')[1]?.substring(0, 5) || e.start,
        e: e.end.split('T')[1]?.substring(0, 5) || e.end
      }));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: slimEvents, date: targetDate })
      });

      if (response.ok) {
        const { insight } = await response.json();
        setAiInsight(insight);
        setLastAiRun(now);
      } else {
        setAiInsight("Análisis no disponible.");
      }
    } catch (e) {
      console.warn("AI Error", e);
      setAiInsight("Reintentando conexión...");
    } finally {
      setIsAiLoading(false);
    }
  };

  const loadData = useCallback(async (
    dateToLoad: string = selectedDate,
    mode: 'day' | 'week' = viewMode,
    weekCalId: string = selectedWeekCalendarId
  ) => {
    try {
      const configs = await storage.getCalendars();
      const activeConfigs = configs.filter(c => c.active);
      setCalendars(activeConfigs.sort((a, b) => a.sort - b.sort));

      let data: CalendarEvent[] = [];

      if (mode === 'day') {
        data = await fetchCalendarBoard(activeConfigs, dateToLoad);
      } else {
        if (weekCalId) {
          const cal = activeConfigs.find(c => c.id === weekCalId);
          if (cal) {
            const current = new Date(dateToLoad + "T00:00:00");
            const day = current.getDay();
            const diff = current.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(current.setDate(diff));
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);

            const startStr = monday.toISOString().split('T')[0];
            const endStr = sunday.toISOString().split('T')[0];

            data = await fetchCalendarBoard([cal], startStr, endStr);
          }
        }
      }

      setEvents(data);
      setHasError(false);

      runAIAnalysis(data, dateToLoad);
    } catch (e) {
      console.error("Refresh Error", e);
      setHasError(true);
    }
  }, [selectedDate, viewMode, selectedWeekCalendarId, lastAiRun]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    loadData(newDate, viewMode, selectedWeekCalendarId);
  };

  const shiftDate = (days: number) => {
    const current = new Date(selectedDate + "T00:00:00");
    if (viewMode === 'week') days *= 7;
    current.setDate(current.getDate() + days);
    const dateStr = current.toISOString().split('T')[0];
    handleDateChange(dateStr);
  };

  const handleModeChange = (mode: 'day' | 'week') => {
    setViewMode(mode);
    if (mode === 'week' && !selectedWeekCalendarId && calendars.length > 0) {
      setSelectedWeekCalendarId(calendars[0].id);
      loadData(selectedDate, mode, calendars[0].id);
    } else {
      loadData(selectedDate, mode, selectedWeekCalendarId);
    }
  };

  const handleWeekCalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedWeekCalendarId(val);
    loadData(selectedDate, viewMode, val);
  };

  useEffect(() => {
    const subscription = storage.subscribeToCalendarChanges(() => {
      console.log("Realtime: Refreshing TV View due to configuration change");
      loadData(selectedDate, viewMode, selectedWeekCalendarId);
    });

    loadData(selectedDate, viewMode, selectedWeekCalendarId);

    const interval = setInterval(() => {
      loadData(selectedDate, viewMode, selectedWeekCalendarId);
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [selectedDate, viewMode, selectedWeekCalendarId]);

  useEffect(() => {
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timeInterval);
  }, []);

  const filteredCalendars = useMemo(() => {
    return calendars.filter(c => filterType === 'all' || c.type === filterType);
  }, [calendars, filterType]);

  const getSubLabel = (type: string) => {
    switch (type) {
      case 'professional': return 'ESPECIALISTA';
      case 'aesthetic': return 'ESTETICISTA';
      case 'general': return 'EQUIPAMIENTO';
      case 'resource':
      default: return 'SALA / RECURSO';
    }
  };

  interface DisplayColumn {
    id: string;
    label: string;
    subLabel: string;
    avatarUrl?: string;
    current: CalendarEvent[];
    upcoming: CalendarEvent[];
  }

  const displayColumns: DisplayColumn[] = useMemo(() => {
    const now = currentTime.getTime();
    if (viewMode === 'day') {
      return filteredCalendars.map(cal => {
        const calEvents = events.filter(e => e.calendarId === cal.id);
        return {
          id: cal.id,
          label: cal.label,
          subLabel: getSubLabel(cal.type),
          avatarUrl: cal.avatarUrl,
          current: calEvents.filter(e => {
            const start = new Date(e.start).getTime();
            const end = new Date(e.end).getTime();
            return now >= start && now <= end;
          }),
          upcoming: calEvents.filter(e => new Date(e.start).getTime() > now)
        };
      });
    } else {
      // WEEK VIEW
      const current = new Date(selectedDate + "T00:00:00");
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current.setDate(diff));

      const cols: DisplayColumn[] = [];
      const todayStr = new Date().toISOString().split('T')[0];

      for (let i = 0; i < 7; i++) {
        const dateObj = new Date(monday);
        dateObj.setDate(monday.getDate() + i);
        const dateStr = dateObj.toISOString().split('T')[0];

        const dayEvents = events.filter(e => e.start.startsWith(dateStr));

        cols.push({
          id: dateStr,
          label: dateObj.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase(),
          subLabel: dateObj.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
          current: dayEvents.filter(e => {
            const start = new Date(e.start).getTime();
            const end = new Date(e.end).getTime();
            return dateStr === todayStr && now >= start && now <= end;
          }),
          upcoming: dayEvents.filter(e => {
            if (dateStr < todayStr) return false;
            if (dateStr === todayStr) {
              return new Date(e.start).getTime() > now;
            }
            return true;
          })
        });
      }
      return cols;
    }
  }, [events, filteredCalendars, currentTime, viewMode, selectedDate]);

  return (
    <div className="h-screen w-screen bg-[#020617] text-white flex flex-col overflow-hidden font-sans">
      {/* TOP BAR */}
      <div className="h-1 text-center text-[8px] text-slate-700 tracking-[1em] font-black uppercase py-4">440CLINIC Display System</div>

      {/* HEADER */}
      <header className="h-20 flex items-center justify-between px-8 border-b border-slate-900 bg-[#020617] relative">
        <div className="flex items-center gap-6">
          <img src="/logo.png" alt="440 Clinic Logo" className="h-12 w-auto object-contain bg-white p-1 rounded-lg" />
          <div className="h-8 w-[1px] bg-slate-800"></div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-white leading-none">MONITOR OPERATIVO</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasError ? 'bg-red-600' : 'bg-emerald-500'}`}></span>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${hasError ? 'text-red-500' : 'text-emerald-500'}`}>
                {hasError ? 'ERROR DE CONEXIÓN' : 'SISTEMA CONECTADO'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-900/50 rounded-xl p-2 border border-slate-800">
            <button
              onClick={() => shiftDate(-1)}
              className="p-4 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="relative px-6 flex flex-col items-center min-w-[140px]">
              <input type="date" value={selectedDate} onChange={(e) => handleDateChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
              <span className="text-[10px] font-black text-blue-500 tracking-[0.2em]">{viewMode === 'week' ? 'SEMANA DEL' : 'FECHA'}</span>
              <span className="text-xl font-black tracking-tight text-white uppercase italic">
                {selectedDate === new Date().toISOString().split('T')[0] && viewMode === 'day'
                  ? 'HOY'
                  : selectedDate.split('-').reverse().join('/')}
              </span>
            </div>
            <button
              onClick={() => shiftDate(1)}
              className="p-4 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="text-right border-l border-slate-800 pl-6">
            <div className="text-3xl font-black text-[#42a5f5] tabular-nums leading-none tracking-tight">
              {currentTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
              {currentTime.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-[240px] bg-[#020617] border-r border-slate-900 flex flex-col p-4 overflow-y-auto space-y-4">

          <div className="mb-4">
            <h2 className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-3 px-0.5">MODO DE VISTA</h2>
            <div className="flex gap-2 p-1.5 bg-slate-900/50 rounded-lg border border-slate-800">
              <button
                onClick={() => handleModeChange('day')}
                className={`flex-1 text-xs font-black uppercase tracking-widest py-3 rounded-md transition-all ${viewMode === 'day' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
              >
                DIARIA
              </button>
              <button
                onClick={() => handleModeChange('week')}
                className={`flex-1 text-xs font-black uppercase tracking-widest py-3 rounded-md transition-all ${viewMode === 'week' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
              >
                SEMANAL
              </button>
            </div>
          </div>

          {viewMode === 'day' ? (
            <div className="mb-4">
              <h2 className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-3 px-0.5">FILTRAR VISTA</h2>
              <div className="space-y-2">
                {[
                  { id: 'all', label: 'TODO', icon: 'M4 6h16M4 12h16M4 18h16' },
                  { id: 'professional', label: 'DOCTORES', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                  { id: 'aesthetic', label: 'ESTÉTICA', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { id: 'resource', label: 'SALAS', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                  { id: 'general', label: 'OTROS', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateFilter(t.id as any)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all ${filterType === t.id
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-slate-900/40 border-slate-800/50 text-slate-400 hover:border-slate-700'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={t.icon} />
                    </svg>
                    <span className="text-[11px] font-black uppercase tracking-widest">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <h2 className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-3 px-0.5">SELECCIONAR CALENDARIO</h2>
              <select
                value={selectedWeekCalendarId}
                onChange={handleWeekCalChange}
                className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold p-3.5 rounded-xl outline-none cursor-pointer hover:border-slate-700 transition duration-300"
              >
                {calendars.map(cal => (
                  <option key={cal.id} value={cal.id}>{cal.label}</option>
                ))}
              </select>
            </div>
          )}


          <div className={`mb-4 transition-all duration-500 ${isAiLoading ? 'opacity-100 scale-[1.02]' : 'opacity-90'}`}>
            <h2 className="text-[7px] font-black text-blue-500 uppercase tracking-widest mb-2 flex justify-between items-center px-0.5">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {isAiLoading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isAiLoading ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'bg-blue-900/50'}`}></span>
                </span>
                IA AGENT
              </span>
              {isAiLoading && <span className="text-[6px] animate-pulse">ANALYZING...</span>}
            </h2>
            <div className={`p-3 rounded-xl border transition-all duration-500 ${isAiLoading ? 'bg-blue-950/20 border-blue-500/40 shadow-inner' : 'bg-slate-900/40 border-slate-800/50'}`}>
              <p className="text-[10px] leading-tight italic text-slate-400 font-medium">
                {aiInsight}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <h2 className="text-[7px] font-black text-red-600 uppercase tracking-widest mb-2 px-0.5">ALERTS</h2>
            <div className="space-y-1.5">
              {(!aiInsight.toLowerCase().includes("sin conflictos") && !isAiLoading && aiInsight !== "Sincronizando flujo...") ? (
                <div className="p-2.5 rounded-lg border border-red-500 bg-red-500/10 animate-pulse">
                  <p className="text-[10px] text-red-500 font-black leading-tight uppercase italic mb-1">
                    Atención Requerida
                  </p>
                  <p className="text-[8px] text-red-200/80 leading-tight">
                    La IA ha detectado posibles conflictos en la agenda.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/40 opacity-50">
                  <p className="text-[8px] text-slate-500 font-bold leading-tight uppercase italic">
                    Sistema OK
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN GRID */}
        <main className="flex-1 flex overflow-x-auto bg-[#020617] no-scrollbar">
          {displayColumns.length === 0 && viewMode === 'week' ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-black text-lg">
              CARGANDO SEMANA...
            </div>
          ) : displayColumns.map(col => {
            const { current, upcoming } = col;
            return (
              <div key={col.id} className="min-w-[calc((100vw-240px)/7)] flex-1 border-r border-slate-900 flex flex-col last:border-r-0">
                {/* Column Header */}
                <div className="p-4 border-b border-slate-900 bg-slate-900/40 flex flex-col items-center gap-3 text-center">
                  {col.avatarUrl && viewMode === 'day' ? (
                    <img src={col.avatarUrl} alt={col.label} className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-700 shadow-md mb-2" />
                  ) : viewMode === 'day' ? (
                    <div className="w-24 h-24 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl font-black text-slate-500 border-2 border-slate-700 mb-2">
                      {col.label.substring(0, 1).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl font-black text-blue-500/50 border-2 border-slate-700 mb-2 shadow-inner">
                      {new Date(col.id).getDate()}
                    </div>
                  )}
                  <div className="w-full">
                    <h3 className="text-xl font-black text-white tracking-tight uppercase leading-tight">
                      {col.label}
                    </h3>
                    <p className="text-xs text-blue-500/80 uppercase tracking-widest font-black mt-1">
                      {col.subLabel}
                    </p>
                  </div>
                </div>

                {/* EN CURSO / ESTADO ACTUAL */}
                <div className="space-y-2 p-2.5 pb-1">
                  <div className="flex justify-between items-center px-0.5">
                    <h4 className="text-[7px] font-black text-slate-600 uppercase tracking-widest">LIVE</h4>
                    <span className={`text-[6px] font-black px-1 py-0.5 rounded-sm ${current.length > 0 ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                      {current.length > 0 ? 'BUSY' : 'FREE'}
                    </span>
                  </div>

                  {current.length > 0 ? (
                    current.map(e => (
                      <div key={e.id} className="p-3.5 rounded-xl bg-blue-600 border-l-4 border-blue-300 shadow-lg flex flex-col justify-center min-h-[80px]">
                        <div className="text-sm font-mono text-blue-50 text-center mb-1.5 font-bold border-b border-blue-400/30 pb-1">
                          {new Date(e.start).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })} - {new Date(e.end).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                        {e.booker && (
                          <div className="text-xs bg-blue-800/60 text-blue-50 px-2 py-1 rounded shadow-sm inline-block self-start mb-1 font-black uppercase tracking-wider">
                            👨‍⚕️ {e.booker}
                          </div>
                        )}
                        <h5 className="text-lg font-black text-white leading-tight mt-0.5" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.title}</h5>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 rounded-lg bg-slate-900/20 border border-slate-800/10 flex items-center justify-center opacity-40">
                      <span className="text-[8px] font-black text-slate-700 tracking-[0.3em] uppercase">READY</span>
                    </div>
                  )}
                </div>

                {/* PRÓXIMOS */}
                <div className="space-y-1.5 p-2.5 pt-1.5 flex-1 overflow-y-auto no-scrollbar">
                  <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                    <h4 className="text-[7px] font-black text-slate-800 uppercase tracking-widest">PLAN</h4>
                    <div className="h-[1px] flex-1 bg-slate-900/50"></div>
                  </div>
                  {upcoming.length > 0 ? (
                    <div className="space-y-1">
                      {upcoming.slice(0, 15).map((e, idx) => (
                        <div key={e.id} className={`p-2.5 rounded-lg border transition-all ${idx === 0 ? 'bg-slate-900 border-slate-700' : 'bg-slate-900/10 border-slate-800/20 opacity-40'}`}>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-mono text-blue-500 font-black">
                              {new Date(e.start).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                          </div>
                          {e.booker && (
                            <div className="text-[10px] text-blue-400 font-black mb-1 border-l-2 border-blue-500 pl-1.5 inline-block bg-blue-900/30 px-2 py-0.5 rounded-r-sm uppercase tracking-widest">
                              👨‍⚕️ {e.booker}
                            </div>
                          )}
                          <h5 className="text-base font-bold leading-tight text-slate-300">{e.title}</h5>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-4 flex items-center justify-center">
                      <p className="text-[6px] font-black text-slate-900 uppercase italic">END</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </main>
      </div>

      {/* FOOTER BAR */}
      <footer className="h-8 bg-[#020617] border-t border-slate-900 flex items-center px-8">
        <div className="w-full bg-slate-900/50 h-3 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-slate-800/50 w-1/4 animate-[pulse_2s_infinite]"></div>
        </div>
      </footer>
    </div>
  );
};

export default TVView;

