import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, Car, Palette,
  LayoutDashboard, ShoppingCart, Package, Layers, Users,
  Truck, BarChart3, Settings, ChevronLeft, ChevronRight,
  UtensilsCrossed, Warehouse, Receipt, UserCog,
  Store, CreditCard, LogOut, Sparkles, GitBranch,
  ChevronDown, ChefHat, Gift, User, Headphones, Globe, Crown,
  Plug, Shield
, BookOpen} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { canAccess, ROLE_LABELS } from '@/lib/permissions';
import felsynLogo from '@/assets/felsy-logo.png';

const ALL_ITEMS = [
  { path: '/',                icon: LayoutDashboard, label: 'لوحة التحكم'           },
  { path: '/pos',             icon: ShoppingCart,    label: 'نقطة البيع'            },
  { path: '/orders',          icon: Receipt,         label: 'الطلبات'               },
  { path: '/tables',          icon: UtensilsCrossed, label: 'الطاولات',   food: true },
  { path: '/kitchen',         icon: ChefHat,         label: 'المطبخ',     food: true },
  { path: '/kiosk',           icon: Plug,            label: 'الكشك والبيجر', food: true },
  { path: '/products',        icon: Package,         label: 'المتجر'                },
  { path: '/categories',      icon: Layers,          label: 'التصنيفات'             },
  { path: '/inventory',       icon: Warehouse,       label: 'المخزون'               },
  { path: '/customers',       icon: Users,           label: 'العملاء'               },
  { path: '/estore',          icon: Store,           label: 'المتجر الإلكتروني'     },
  { path: '/invoices',        icon: Receipt,         label: 'الفواتير'              },
  { path: '/suppliers',       icon: Truck,           label: 'الموردين'              },
  { path: '/expenses',        icon: CreditCard,      label: 'المصروفات'             },
  { path: '/analytics',       icon: BarChart3,       label: 'التحليلات'             },
  { path: '/employees',       icon: UserCog,         label: 'الموظفون'              },
  { path: '/loyalty',         icon: Gift,            label: 'برنامج الولاء'         },
  { path: '/car-orders',      icon: Car,             label: 'طلبات السيارات', carOnly: true },
  { path: '/ai',              icon: Sparkles,        label: 'المساعد الذكي'         },
  { path: '/support',         icon: Headphones,      label: 'الدعم الفني'           },
  { path: '/admin-support',   icon: Headphones,      label: 'تذاكر الدعم', adminOnly: true },
  { path: '/domain',          icon: Globe,           label: 'الدومين', ownerOnly: true },
  { path: '/theme',           icon: Palette,         label: 'تخصيص الواجهة', adminOnly: true },
  { path: '/subscriptions',   icon: Crown,           label: 'الاشتراكات', ownerOnly: true },
  { path: '/accounting',      icon: BookOpen,        label: 'المحاسبة' },
  { path: '/zatca-admin',     icon: Shield,          label: 'ZATCA مراقبة', adminOnly: true },
  { path: '/settings',        icon: Settings,        label: 'الإعدادات'             },
];

const FOOD_INDUSTRIES = ['restaurant', 'cafe'];

function getSession() {
  try {
    return {
      role:  sessionStorage.getItem('pin_role') || 'admin',
      perms: JSON.parse(sessionStorage.getItem('pin_employee_perms') || '{}'),
      name:  sessionStorage.getItem('pin_employee_name') || 'المدير',
    };
  } catch { return { role: 'admin', perms: {}, name: 'المدير' }; }
}

export default function Sidebar({ dark, setDark, onCollapse }) {
  const [collapsed,    setCollapsed]    = useState(false);
  const [branches,     setBranches]     = useState([]);
  const [activeBranch, setActiveBranch] = useState(() => {
    try { return JSON.parse(localStorage.getItem('activeBranch') || 'null'); }
    catch { return null; }
  });
  const [branchOpen, setBranchOpen] = useState(false);
  const location  = useLocation();
  const sess      = getSession();

  const handleCollapse = (val) => {
    setCollapsed(val);
    if (onCollapse) onCollapse(val);
  };

  useEffect(() => {
    supabase.from('branches').select('*').then(({ data }) => {
      setBranches(data ?? []);
      if (!activeBranch && data?.length) {
        const first = data[0];
        setActiveBranch(first);
        localStorage.setItem('activeBranch', JSON.stringify(first));
      }
    });
  }, []);

  const selectBranch = (b) => {
    setActiveBranch(b);
    localStorage.setItem('activeBranch', JSON.stringify(b));
    setBranchOpen(false);
  };

  const industryType = activeBranch?.industry_type || 'general';
  const isFood = FOOD_INDUSTRIES.includes(industryType);

  const menuItems = ALL_ITEMS.filter(item => {
    if (item.food && !isFood) return false;
    if (item.carOnly && industryType !== 'car_wash') return false;
    if (item.adminOnly && sess.role !== 'admin') return false;
    if (item.ownerOnly && sess.role !== 'admin') return false;
    return canAccess(sess.role, sess.perms, item.path);
  });

  const handleLogout = () => {
    sessionStorage.clear();
    window.location.replace('/');
  };

  return (
    <aside className={cn(
      'fixed right-0 top-0 h-screen bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]',
      'z-50 transition-all duration-300 flex flex-col border-l border-[hsl(var(--sidebar-border))]',
      collapsed ? 'w-[68px]' : 'w-[252px]'
    )}>

      {/* ─── الشعار الرسمي ─── */}
      <div className="flex items-center justify-between h-[70px] px-3 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))]">
        {!collapsed ? (
          <div className="flex items-center gap-2 w-full">
            <img
              src={felsynLogo}
              alt="Felsy"
              className="h-10 w-auto object-contain rounded-xl flex-shrink-0"
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}
            />
          </div>
        ) : (
          <img
            src={felsynLogo}
            alt="Felsy"
            className="h-9 w-9 mx-auto object-contain rounded-xl"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
          />
        )}
      </div>

      {/* ─── معلومات المستخدم ─── */}
      {!collapsed && (
        <div className="px-3 py-2.5 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))/50]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[hsl(var(--sidebar-foreground))] truncate">{sess.name}</p>
              <p className="text-[10px] text-[hsl(var(--sidebar-foreground))/50] truncate">
                {ROLE_LABELS[sess.role] || 'موظف'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── اختيار الفرع ─── */}
      {!collapsed && (sess.role === 'admin' || sess.role === 'branch_manager') && branches.length > 1 && (
        <div className="px-3 py-2 border-b border-[hsl(var(--sidebar-border))] relative">
          <button
            onClick={() => setBranchOpen(o => !o)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-foreground))/70]"
          >
            <GitBranch className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs truncate flex-1 text-right">
              {activeBranch?.name_ar || activeBranch?.name || 'اختر فرعاً'}
            </span>
            <ChevronDown className={cn('w-3 h-3 transition-transform', branchOpen && 'rotate-180')} />
          </button>
          {branchOpen && (
            <div className="absolute right-3 left-3 top-full mt-1 bg-[hsl(var(--sidebar-background))] border border-[hsl(var(--sidebar-border))] rounded-xl shadow-2xl z-50 overflow-hidden">
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => selectBranch(b)}
                  className={cn(
                    'w-full text-right px-3 py-2.5 text-xs hover:bg-[hsl(var(--sidebar-accent))] transition-colors',
                    activeBranch?.id === b.id && 'text-primary bg-primary/10'
                  )}
                >
                  {b.name_ar || b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── القائمة ─── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {menuItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-[hsl(var(--sidebar-foreground))/65] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]'
              )}
            >
              {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-l-full" />
              )}
              <item.icon className={cn('w-[18px] h-[18px] flex-shrink-0', isActive && 'text-primary')} />
              {!collapsed && (
                <span className="text-[13px] font-medium truncate">{item.label}</span>
              )}
              {collapsed && (
                <div className="absolute right-full mr-2.5 px-2.5 py-1.5 bg-[hsl(var(--sidebar-background))] border border-[hsl(var(--sidebar-border))] rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ─── الأسفل ─── */}
      <div className="p-2.5 border-t border-[hsl(var(--sidebar-border))] space-y-1">
        {setDark && (
          <button
            onClick={() => setDark(d => !d)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-foreground))/60]"
          >
            {dark
              ? <Sun  className="w-4 h-4 text-amber-400 flex-shrink-0" />
              : <Moon className="w-4 h-4 flex-shrink-0" />}
            {!collapsed && <span className="text-[13px]">{dark ? 'وضع نهاري' : 'وضع ليلي'}</span>}
          </button>
        )}
        <button
          onClick={() => handleCollapse(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-xl hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-foreground))/40]"
        >
          {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-destructive/15 text-[hsl(var(--sidebar-foreground))/45] hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-[13px]">تسجيل الخروج</span>}
        </button>
      </div>
    </aside>
  );
}
