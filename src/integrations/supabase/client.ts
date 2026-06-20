import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// التحقق من صحة القيم — ليست فارغة أو placeholder
const isValidUrl = rawUrl && rawUrl.startsWith('https://') && rawUrl.includes('.supabase.co');
const isValidKey = rawKey && rawKey.length > 20 && rawKey !== 'placeholder-key';

export const isMissingEnv = !isValidUrl || !isValidKey;

const supabaseUrl     = isValidUrl ? rawUrl! : 'https://placeholder.supabase.co';
const supabaseAnonKey = isValidKey ? rawKey! : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

if (isMissingEnv) {
  console.warn(
    '[Felsy] ⚠️ مفاتيح Supabase غير مضبوطة في .env\n' +
    '  أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY\n' +
    '  النظام يعمل الآن بوضع PIN المحلي فقط'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: !isMissingEnv,
  },
  global: {
    // منع الأخطاء من إيقاف التطبيق عند غياب المفاتيح
    fetch: isMissingEnv
      ? (_url: RequestInfo, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 }))
      : undefined,
  },
});
