import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, Car, Palette,
  LayoutDashboard, ShoppingCart, Package, Layers, Users,
  Truck, BarChart3, Settings, ChevronLeft, ChevronRight,
  UtensilsCrossed, Warehouse, Receipt, UserCog,
  Store, CreditCard, LogOut, Sparkles, GitBranch,
  ChevronDown, ChefHat, Gift, User, Headphones, Globe, Crown,
  Shield, BellRing
, BookOpen} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { canAccess, ROLE_LABELS } from '@/lib/permissions';
import { loadSession, clearSession } from '@/lib/security/session';
import Logo, { LogoMark } from '@/components/brand/Logo';
import AccountNumber from '@/components/AccountNumber';
import { FOOD_INDUSTRIES } from '@/lib/industry';
import { useI18n } from '@/lib/i18n';

const ALL_ITEMS = [
  { path: '/',                icon: LayoutDashboard, label: 'لوحة التحكم'           },
  { path: '/pos',             icon: ShoppingCart,    label: 'نقطة البيع'            },
  { path: '/orders',          icon: Receipt,         label: 'الطلبات'               },
  { path: '/tables',          icon: UtensilsCrossed, label: 'الطاولات',   food: true },
  { path: '/kitchen',         icon: ChefHat,         label: 'المطبخ',     food: true },
  { path: '/pager',           icon: BellRing,        label: 'البيجر الإلكتروني', foo���q�^