import { supabase } from '@/integrations/supabase/client';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Crown, Delete, AlertTriangle } from 'lucide-react';

export default function PINLogin({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['employeeProfiles'],
    queryFn: async () => { const { data } = await supabase.from('employee_profiles').select('*').eq('is_active', true); return data || []; }
  });

  const handleDigit = (d) => {
    if (locked || checking) return;
    if (pin.length < 4) {
      const newPin = pin + d;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) checkPin(newPin);
    }
  };

  const checkPin = async (enteredPin) => {
    if (locked) return;
    setChecking(true);
    const profile = profiles.find((p) => p.pin === enteredPin);
    if (profile) {
      await supabase.from('employee_profiles').update({ is_online: true }).eq('id', profile.id);
      setAttempts(0);
      onSuccess(profile);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLocked(true);
        setError('تم تجاوز عدد المحاولات. تواصل مع المدير.');
      } else {
        setError(`رمز PIN غير صحيح — محاولة ${newAttempts} من 5`);
      }
      setPin('');
    }
    setChecking(false);
  };

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

  return (
    <div className="fixed inset-0 bg-sidebar flex items-center justify-center z-50">
      <div className="w-full max-w-sm px-4">
        <Card className="p-8 text-center space-y-6 bg-card/98 backdrop-blur-sm shadow-2xl border-gold/20">
          {/* Logo */}
          <div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gold/30">
              <Crown className="w-10 h-10 text-background" />
            </div>
            <h2 className="text-[hsl(var(--background))] text-2xl font-bold">فلسي</h2>
            <p className="text-sm text-muted-foreground mt-1">أدخل رمز PIN للدخول</p>
          </div>

          {/* PIN Dots */}
          <div className="flex justify-center gap-5">
            {[0, 1, 2, 3].map((i) =>
            <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${i < pin.length ? 'bg-gold border-gold scale-125 shadow-sm shadow-gold/50' : 'border-muted-foreground/30'}`} />
            )}
          </div>

          {/* Error */}
          {error &&
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm p-3 rounded-xl">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          }

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {digits.map((d, i) =>
            <button
              key={i}
              disabled={d === null || checking || locked}
              onClick={() => {
                if (d === 'del') {setPin((p) => p.slice(0, -1));setError('');} else
                if (d !== null) handleDigit(String(d));
              }}
              className={`h-16 rounded-2xl text-xl font-bold transition-all active:scale-90 select-none ${
              d === null ? 'invisible' :
              d === 'del' ? 'bg-muted/70 hover:bg-muted text-muted-foreground' :
              locked ? 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed' :
              'bg-muted hover:bg-muted/70 hover:border-gold border-2 border-transparent shadow-sm active:border-gold'}`
              }>
              
                {d === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : d}
              </button>
            )}
          </div>

          {checking &&
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              <span>جارٍ التحقق...</span>
            </div>
          }

          {isLoading && <p className="text-xs text-muted-foreground">جارٍ التحميل...</p>}
          {!locked && <p className="text-xs text-muted-foreground">تواصل مع المدير إذا نسيت رمز PIN</p>}
        </Card>
      </div>
    </div>);

}