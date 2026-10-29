import React, { useEffect, useRef } from 'react';

/**
 * BarcodeScanner — يستمع لمدخلات الباركود من قارئ الليزر.
 * قارئ الليزر يُدخل الأحرف بسرعة عالية جداً وينهي بـ Enter.
 * يعمل في الخلفية بدون واجهة مرئية.
 *
 * منطق التمييز بين الليزر والكتابة اليدوية:
 * - الليزر: أقل من 50ms بين كل حرف والتالي
 * - الكتابة اليدوية: أكثر من 100ms بين الأحرف
 */
export default function BarcodeScanner({ onScan, disabled = false }) {
  const bufferRef    = useRef('');
  const timerRef     = useRef(null);
  const lastKeyTime  = useRef(0);

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e) => {
      // تجاهل الـ textarea فقط
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'textarea') return;

      const now = Date.now();
      const timeSinceLast = now - lastKeyTime.current;

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        // قارئ الليزر ينهي بـ Enter وعادةً يكون الباركود 3+ أحرف
        if (barcode.length >= 3 && timeSinceLast < 500) {
          onScan(barcode);
          // منع الإرسال الافتراضي للنموذج فقط إذا كان من قارئ الليزر
          if (timeSinceLast < 100) e.preventDefault();
        }
        bufferRef.current = '';
        clearTimeout(timerRef.current);
        lastKeyTime.current = 0;
        return;
      }

      // لوحة المفاتيح العربية تحوّل حروف الباركود لحروف عربية — نقرأ الزر الفعلي بدلها
      const fromCode = /^Digit(\d)$/.exec(e.code)?.[1] ?? /^Numpad(\d)$/.exec(e.code)?.[1]
        ?? /^Key([A-Z])$/.exec(e.code)?.[1] ?? (e.code === 'Minus' ? '-' : null);
      const ch = e.key.length === 1 && /[\x20-\x7E]/.test(e.key) ? e.key : fromCode;

      // تجميع الأحرف القابلة للطباعة فقط
      if (ch) {
        // إذا كان الوقت بين الضغطات صغير جداً — قارئ ليزر
        if (bufferRef.current.length === 0 || timeSinceLast < 80) {
          bufferRef.current += ch;
          lastKeyTime.current = now;
          clearTimeout(timerRef.current);
          // تنظيف البفّر إذا لم يصل Enter خلال 500ms
          timerRef.current = setTimeout(() => {
            bufferRef.current = '';
            lastKeyTime.current = 0;
          }, 500);
        } else {
          // كتابة يدوية عادية — أعد ضبط البفّر
          bufferRef.current = ch;
          lastKeyTime.current = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [onScan, disabled]);

  return null;
}
