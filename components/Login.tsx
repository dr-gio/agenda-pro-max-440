
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (user: string, role: 'admin' | 'viewer') => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username === 'admin' && password === '440clinic2026') {
      onLogin('440 Clinic', 'admin');
    } else {
      setError('Credenciales incorrectas');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center">
          <img src="/logo.png" alt="440 Clinic Logo" className="h-20 mx-auto mb-6 object-contain" />
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">440 Clinic</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">Operational Board Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Usuario</label>
            <input
              type="text"
              required
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <input
              type="password"
              required
              className="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98]"
          >
            Entrar
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
