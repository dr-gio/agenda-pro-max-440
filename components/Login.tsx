
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (user: string, role: 'admin' | 'viewer', staffId: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Credenciales incorrectas');
        return;
      }
      // rol en la DB es 'admin' o 'colaborador' → mapeamos a 'admin' | 'viewer'
      const role: 'admin' | 'viewer' = data.rol === 'admin' ? 'admin' : 'viewer';
      onLogin(data.nombre, role, data.id);
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center">
          <img src="/logo.png" alt="440 Clinic Logo" className="h-20 mx-auto mb-6 object-contain" />
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">440 Clinic</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">Acceso del Personal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              type="text"
              required
              placeholder="Ej: Katherine"
              className="block w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-slate-900"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN</label>
            <input
              type="password"
              required
              inputMode="numeric"
              maxLength={8}
              placeholder="••••"
              className="block w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-slate-900 tracking-[0.5em] text-center text-xl"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white font-black py-3 rounded-xl hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98] uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>

        <div className="text-[10px] text-slate-300 text-center uppercase tracking-widest font-bold">
          <p>© 2026 440 Clinic Operational System</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
