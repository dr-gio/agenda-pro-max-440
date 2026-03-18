
import React, { useState, useEffect } from 'react';
import { AppRoute, AuthSession } from './types';
import BoardView from './components/BoardView';
import TVView from './components/TVView';
import AdminView from './components/AdminView';
import Login from './components/Login';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.HOME);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as AppRoute;
      if (Object.values(AppRoute).includes(hash)) {
        setCurrentRoute(hash);
      } else {
        setCurrentRoute(AppRoute.HOME);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    // Check existing session in localStorage
    const savedSession = localStorage.getItem('clinic_session');
    if (savedSession) {
      const parsed = JSON.parse(savedSession);
      if (parsed.expiresAt > Date.now()) {
        setSession(parsed);
      } else {
        localStorage.removeItem('clinic_session');
      }
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = (user: string, role: 'admin' | 'viewer') => {
    const newSession: AuthSession = {
      user,
      role,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 // 30 días de sesión
    };
    setSession(newSession);
    localStorage.setItem('clinic_session', JSON.stringify(newSession));

    // Redirect after login if needed
    if (currentRoute === AppRoute.LOGIN) {
      window.location.hash = AppRoute.HOME;
    }
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('clinic_session');
    window.location.hash = AppRoute.LOGIN;
  };

  // Route Guard
  if (!session && currentRoute !== AppRoute.LOGIN) {
    return <Login onLogin={handleLogin} />;
  }

  if (session && session.role !== 'admin' && currentRoute === AppRoute.ADMIN) {
    window.location.hash = AppRoute.HOME;
    return null;
  }

  const renderView = () => {
    switch (currentRoute) {
      case AppRoute.TV:
        return <TVView />;
      case AppRoute.ADMIN:
        return <AdminView session={session} onLogout={logout} />;
      case AppRoute.HOME:
      default:
        return <BoardView session={session} onLogout={logout} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 transition-colors duration-300">
      {renderView()}
    </div>
  );
};

export default App;
