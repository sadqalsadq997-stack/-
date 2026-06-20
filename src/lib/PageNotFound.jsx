import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowRight } from 'lucide-react';

export default function PageNotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4" dir="rtl">
      <div className="text-8xl font-black text-primary/20">404</div>
      <h2 className="text-2xl font-bold text-foreground">الصفحة غير موجودة</h2>
      <p className="text-muted-foreground">عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 h-10 px-5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        <Home className="w-4 h-4" />
        العودة للرئيسية
      </button>
    </div>
  );
}
