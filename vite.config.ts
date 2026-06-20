import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 8080,
      host: true,
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,       // ❌ لا sourcemaps في production
      minify: 'terser',       // ✅ تشفير وتصغير أقوى
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
      rollupOptions: {
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
