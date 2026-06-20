/**
 * ProtectedRoute — Enterprise Route Guard
 *
 * 3 طبقات حماية:
 *  1. Authentication: هل تسجّل الدخول؟
 *  2. Authorization:  هل تملك الصلاحية؟ → 403
 *  3. SEO:           ضبط metadata تلقائياً لكل صفحة
 */
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { loadSession } from '@/lib/security/session';
import { canAccessRoute } from '@/lib/rbac';
import { setSEO, PAGE_SEO } from '@/lib/seo';
import { AuditHelper } from '@/lib/audit';
import { ShieldX, Home } from 'lucide-react';

function ForbiddenPage({ path, role }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
      <div className="text-center space-y-4 p-8 max-w-md">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-950 rounded-3xl flex items-center justify-center mx-auto">
          <ShieldX className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-3xl font-black text-foreground">403</h1>
        <p className="text-lg font-semibold text-foreground">غير مصرح بالوصول</p>
        <p className="text-sm text-muted-foreground">
          ليس لديك صلاحية الوصول لهذه الصفحة.
          <br />المسار: <code className="bg-muted px-1 rounded text-xs">{path}</code>
        </p>
        <a href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">
          <Home className="w-4 h-4" /> الصفحة الرئيسية
        </a>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requiredResource, requiredAction = 'view' }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, authed: false, allowed: false, role: null });

  useEffect(() => {
    loadSession().then(sess => {
      if (!sess || !sess.unlocked) {
        setState({ loading: false, authed: false, allowed: false, role: null });
        return;
      }
      const allowed = canAccessRoute(sess.role, location.pathname, sess.perms);
      if (!allowed) {
        // تسجيل محاولة الوصول غير المصرح
        AuditHelper.loginFailed?.(`محاولة وصول غير مصرح — ${location.pathname}`);
      }
      setState({ loading: false, authed: true, allowed, role: sess.role });
    });

    // ضبط SEO تلقائياً
    const seoConfig = PAGE_SEO[location.pathname];
    if (seoConfig) setSEO(seoConfig);
  }, [location.pathname]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!state.authed) return <Navigate to="/auth/login" replace state={{ from: location }} />;
  if (!state.allowed) return <ForbiddenPage path={location.pathname} role={state.role} />;
  return children;
}
