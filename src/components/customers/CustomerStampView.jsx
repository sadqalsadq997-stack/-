import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import StampCard from './StampCard';
import { Button } from '@/components/ui/button';
import { Stamp } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerStampView({ customer, onStampAdded }) {
  const queryClient = useQueryClient();

  const { data: loyaltySettings = [] } = useQuery({
    queryKey: ['loyaltySettings'],
    queryFn: async () => {
      const { data } = await supabase.from('loyalty_settings').select('*').limit(1);
      return data || [];
    },
  });

  const settings = loyaltySettings[0] || {};
  const stampsThreshold = settings.stamps_threshold || 10;
  const stampIcon = settings.stamp_icon || '⭐';
  const rewardDesc = settings.stamps_reward || 'هدية مجانية';
  const primaryColor = settings.card_color_primary || '#c0392b';

  const currentStamps = customer?.stamps || 0;
  const isRewardReady = currentStamps >= stampsThreshold;

  const addStampMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('customers').update({
        stamps: currentStamps + 1,
      }).eq('id', customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      const newStamps = currentStamps + 1;
      if (newStamps >= stampsThreshold) {
        toast.success(`🎉 ${customer.name} اكتملت طوابعه! يستحق: ${rewardDesc}`, { duration: 6000 });
      } else {
        toast.success(`تم إضافة طابع — متبقي ${stampsThreshold - newStamps} طوابع`);
      }
      if (onStampAdded) onStampAdded();
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('customers').update({ stamps: 0 }).eq('id', customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`تم صرف الجائزة لـ ${customer.name} ✓`);
    },
  });

  return (
    <div className="space-y-3">
      <StampCard
        customer={customer}
        stampsThreshold={stampsThreshold}
        stampIcon={stampIcon}
        rewardDesc={rewardDesc}
        primaryColor={primaryColor}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold h-11"
          onClick={() => addStampMutation.mutate()}
          disabled={addStampMutation.isPending || isRewardReady}
        >
          <Stamp className="w-4 h-4 ml-2" />
          {addStampMutation.isPending ? 'جارٍ...' : 'إضافة طابع'}
        </Button>
        {isRewardReady && (
          <Button
            variant="outline"
            className="flex-1 border-amber-400 text-amber-600 hover:bg-amber-50 font-bold h-11"
            onClick={() => redeemMutation.mutate()}
            disabled={redeemMutation.isPending}
          >
            🎁 صرف الجائزة
          </Button>
        )}
      </div>
    </div>
  );
}
