import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Settings as SettingsIcon, Building2, Printer, Shield, Save, Loader2, FileCheck, UserCircle, Palette, ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import ZatcaCenter from './ZatcaCenter';
import AccountTab from '@/components/settings/AccountTab';
import MenuDesignTab from '@/components/settings/MenuDesignTab';
import { getPrinterSettings, savePrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';
import { uploadImage } from '@/lib/images';
import { INDUSTRY_OPTIONS } from '@/lib/industry';

const TABS = [
  { id: 'account',  label: 'الحساب والاشتراك', icon: UserCircle },
  { id: 'business', label: 'بيانات المنشأة',   icon: Building2  },
  { id: 'menu',     label: 'تصميم المنيو',     icon: Palette    },
  { id: 'zatca',    label: 'الفوترة (ZATCA)',  icon: FileCheck  },
  { id: 'printer',  label: 'الطابعة',          icon: Printer    },
  { id: 'security', label: 'الأمان',           icon: Shield     },
];

// الحقول اللي يحفظها تبويب "بيانات المنشأة" فقط (ما نرسل الصف كامل)
const BUSINESS_FIELDS = ['business_name', 'vat_number', 'cr_number', 'phone', 'address', 'city', 'industry_type', 'logo_url'];

export default function Settings() {
  const [params, setParams] = useSe���q�^