import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Truck, Plus, PackagePlus, Warehouse, Loader2, ReceiptText, Trash2, Save, FileUp, ExternalLink, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { printHTML, esc, printFonts } from '@/lib/print';

const money = (value, lang = 'ar') => Number(value || 0).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = value => Number(value || 0);
const activeBranch = () => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}'); } catch { return {}; } };

export default function Purchases() {
  const branch = activeBranch();
  const { lang, t, dir } = useI18n();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierVat, setSupplierVat] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierStreet, setSupplierStreet] = useState('');
  const [supplierBuilding, setSupplierBuilding] = useState('');
  const [supplierDistrict, setSupplierDistrict] = useState('');
  const [supplierCity, setSupplierCity] = useState('');
  const [supplierPostal, setSupplierPostal] = useState('');
  const [supplierCountry, setSupplierCo¶»§q«^