import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 8080,
      host: true,
      // نفس وكيل /api/db الموجود في Vercel — للتشغيل المحلي (npm run dev)
      // القيم من .env بدون بادئة VITE_ فلا تدخل في كود المتصفح
      proxy: env.SUPABASE_URL ? {
        '/api/db': {
          target: env.SUPABASE_URL,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/db/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              const key = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
              req.setHeader('apikey', key);
              const auth = req.getHeader('authorization');
              if (!auth || auth === 'Bearer felsy-public') req.setHeader('authorization', `Bearer ${key}`);
            });
          },
        },
      } : undefined,
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,       // ❌ لا sourcemaps في production
      minify: isSsrBuild ? false : 'terser',
      terserOptions: {
        compress: {
          drop_console:  true,   // ✅ حذف كل console.log
          drop_debugger: true,   // ✅ حذف debugger
          pure_funcs: ['console.log','console.warn','console.error','console.info'],
          passes: 3,
        },
        mangle: {
          toplevel: true,        // ✅ تغيير أسماء الوظائف
          eval:     true,
        },
        format: {
          comments: false,       // ✅ حذف كل التعليقات
        },
      },
      rollupOptions: isSsrBuild ? { output: { entryFileNames: '[name].js', assetFileNames: 'assets/[hash][extname]' } } : {
        output: {
          // أسماء ملفات مشوشة بـ hash
          entryFileNames:   'assets/[hash].js',
          chunkFileNames:   'assets/[hash].js',
          assetFileNames:   'assets/[hash][extname]',
          manualChunks: {
            vendor:   ['react','react-dom','react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
    // لا تكشف المتغيرات الحساسة
    define: {
      __DEV__: mode !== 'production',
    },
  };
});
