import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineIndicator from './OfflineIndicator';
import SmartNotifications from '@/components/SmartNotifications';
import { Menu, Moon, Sun, Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

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
  const { lang, t, toggleLang, dir } = useI18n();
  const isArabic = lang === 'ar';

  return (
    <div className="min-h-screen bg-background flex" dir={dir}>
      {/* Sidebar desktop */}
      <div className="hidden md:block">
        <Sidebar dark={dark} setDark={setDark} onCollapse={setSidebarCollapsed} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()¶»§q«^