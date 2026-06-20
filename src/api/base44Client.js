import { supabase, isMissingEnv } from '@/integrations/supabase/client';

// ربط كل كيان بجدوله في قاعدة البيانات
const ENTITY_TABLE = {
  Branch: 'branches',
  Category: 'categories',
  Product: 'products',
  Customer: 'customers',
  Supplier: 'suppliers',
  Order: 'orders',
  StockItem: 'stock_items',
  InventoryLog: 'inventory_logs',
  Expense: 'expenses',
  TableMap: 'tables_map',
  Shift: 'shifts',
  EmployeeProfile: 'employee_profiles',
  LoyaltySettings: 'loyalty_settings',
  StoreProduct: 'store_products',
  StoreOrder: 'store_orders',
};

const SORT_ALIASES = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    created_date: row.created_date ?? row.created_at,
    updated_date: row.updated_date ?? row.updated_at,
  };
}

function normalizePayload(table, payload = {}) {
  const data = { ...payload };

  // تنظيف القيم الفارغة
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === '') data[key] = null;
  }

  // توحيد حقول الاسم حسب الجدول
  if (table === 'employee_profiles') {
    data.name = data.name || data.full_name || 'موظف';
    data.full_name = data.full_name || data.name;
  }
  if (table === 'products') data.name = data.name || data.name_ar || 'منتج';
  if (table === 'categories') data.name = data.name || data.name_ar || 'تصنيف';
  if (table === 'branches') data.name = data.name || data.name_ar || 'الفرع';

  return data;
}

function applySort(query, sort) {
  if (!sort) return query;
  const desc = sort.startsWith('-');
  const rawCol = desc ? sort.slice(1) : sort;
  const col = SORT_ALIASES[rawCol] ?? rawCol;
  return query.order(col, { ascending: !desc });
}

function buildEntity(table) {
  // وضع offline: إرجاع بيانات فارغة بدل crash
  if (isMissingEnv) {
    return {
      async list()           { return []; },
      async filter()         { return []; },
      async get()            { return null; },
      async create(payload)  { return { id: `local_${Date.now()}`, ...payload, created_at: new Date().toISOString() }; },
      async update(id, p)    { return { id, ...p }; },
      async delete()         { return { success: true }; },
    };
  }
  return {
    async list(sort, limit) {
      let q = supabase.from(table).select('*');
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(normalizeRow);
    },

    async filter(criteria = {}, sort, limit) {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(criteria)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) q = q.in(k, v);
        else q = q.eq(k, v);
      }
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(normalizeRow);
    },

    async get(id) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return normalizeRow(data);
    },

    async create(payload) {
      const { data, error } = await supabase
        .from(table)
        .insert(normalizePayload(table, payload))
        .select()
        .single();
      if (error) throw error;
      return normalizeRow(data);
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(table)
        .update(normalizePayload(table, payload))
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return normalizeRow(data);
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  };
}

const entities = {};
for (const [name, table] of Object.entries(ENTITY_TABLE)) {
  entities[name] = buildEntity(table);
}

// كيان المستخدم — نظام الصلاحيات يعمل بـ PIN
entities.User = {
  async list() { return []; },
  async me() { return { id: 'local', role: 'admin', full_name: 'Admin' }; },
};

const auth = {
  async me() { return { id: 'local', role: 'admin', full_name: 'Admin' }; },
  async logout() {
    // استخدام clearSession المشفّرة لمسح كل بيانات الجلسة
    try {
      const { clearSession } = await import('@/lib/security/session');
      clearSession();
    } catch {
      // fallback: مسح يدوي لكل مفاتيح الجلسة
      ['_fs','pin_unlocked','pin_role','pin_employee_id',
       'pin_employee_name','pin_employee_perms','pin_branch_id'].forEach(k =>
        sessionStorage.removeItem(k)
      );
    }
    window.location.href = '/';
  },
  redirectToLogin() {},
};

const integrations = {
  Core: {
    async InvokeLLM() {
      throw new Error('خدمة الذكاء الاصطناعي غير مفعّلة');
    },
    async UploadFile({ file }) {
      // رفع الصورة إلى Supabase Storage إذا كان الـ bucket موجودًا
      try {
        const ext = file.name.split('.').pop();
        const path = `uploads/${Date.now()}.${ext}`;
        const { data, error } = await supabase.storage
          .from('media')
          .upload(path, file, { upsert: true });
        if (!error && data) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
          return { file_url: urlData.publicUrl };
        }
      } catch {}
      // احتياطي: تحويل إلى Data URL
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ file_url: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
  },
};

const users = {
  async inviteUser() { return { success: true }; },
};

export const base44 = { entities, auth, integrations, users };
export default base44;
