import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineIndicator from './OfflineIndicator';
import SmartNotifications from '@/components/SmartNotifications';
import { Menu, Moon, Sun } from 'lucide-react';

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('felsy_dark_mode');
    if (saved !== null) return saved === '1';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('felsy_dark_mode', dark ? '1' : '0');
  }, [dark]);

  return [dark, setDark];
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useDarkMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar desktop */}
      <div className="hidden md:block">
        <Sidebar dark={dark} setDark={setDark} onCollapse={setSidebarCollapsed} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full z-50">
            <Sidebar dark={dark} setDark={setDark} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 min-h-screen flex flex-col ${
          sidebarCollapsed ? 'md:mr-[68px]' : 'md:mr-[252px]'
        }`}
      >
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-xl hover:bg-muted press-3d">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-black text-lg text-primary tracking-tight">فلسي</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-xl hover:bg-muted press-3d transition-colors"
              title={dark ? 'وضع نهاري' : 'وضع ليلي'}
            >
              {dark
                ? <Sun className="w-4.5 h-4.5 text-amber-400" />
                : <Moon className="w-4.5 h-4.5 text-slate-500" />}
            </button>
            <SmartNotifications />
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6 max-w-screen-xl mx-auto w-full page-enter">
          <Outlet />
        </div>
      </main>

      <OfflineIndicator />
    </div>
  );
}
