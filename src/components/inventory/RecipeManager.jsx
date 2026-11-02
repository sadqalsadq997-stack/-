import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ChefHat, Plus, Trash2, Save, Loader2, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';

const sar = value => `${Number(value || 0).toLocaleString('ar-SA', { maximumFractionDigits: 3 })} ر.س`;

export default function RecipeManager() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState([]);
  const [notes, setNotes] = useState('');
  const [recipeExists, setRecipeExists] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['recipe-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('id,name,name_ar,is_ingredient,is_active')
        .eq('is_ingredient', false).eq('is_active', true).order('name_ar');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: ingredients = [], isLoading: ingredientsLoading } = useQuery({
    queryKey: ['recipe-ingredients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('id,name,name_ar,unit_type,stock_quantity,cost_price,is_ingredient,is_active')
        .eq('is_ingredient', true).eq('is_active', true).order('name_ar');
      if (error) throw error;
      return data || [];
    },
  });

  const ingredientById = useMemo(() => Object.fromEntries(ingredients.map(i => [i.id, i])), [ingredients]);
  const estimatedCost = useMemo(() => rows.reduce((sum, row) => {
    const ingredient = ingredientById[row.ingredient_product_id];
    const quantity = Number(row.quantity_per_sale || 0);
    const waste = Number(row.waste_percent || 0);
    return sum + quantity * (1 + waste / 100) * Number(ingredient?.cost_price || 0);
  }, 0), [rows, ingredientById]);

  useEffect(() => {
    let alive = true;
    async function loadRecipe() {
      if (!productId) {
        setRows([]);
        setNotes('');
        setRecipeExists(false);
        return;
      }
      setLoadingRecipe(true);
      const { data, error } = await supabase.from('product_recipes')
        .select('id,notes,product_recipe_items(id,ingredient_product_id,quantity_per_sale,unit,waste_percent)')
        .eq('product_id', productId).maybeSingle();
      if (!alive) return;
      if (error) {
        toast.error(error.message || 'تعذر تحميل الوصفة');
        setRows([]);
        setRecipeExists(false);
      } else {
        setRecipeExists(Boolean(data?.id));
        setNotes(data?.notes || '');
        setRows((data?.product_recipe_items || []).map((item, index) => ({
          key: item.id || `saved-${index}`,
          ingredient_product_id: item.ingredient_product_id,
          quantity_per_sale: String(item.quantity_per_sale),
          unit: item.unit,
          waste_percent: String(item.waste_percent ?? 0),
        })));
      }
      setLoadingRecipe(false);
    }
    loadRecipe();
    return () => { alive = false; };
  }, [productId]);

  function addRow() {
    const used = new Set(rows.map(row => row.ingredient_product_id));
    const ingredient = ingredients.find(item => !used.has(item.id));
    if (!ingredient) {
      toast.error(ingredients.length ? 'تمت إضافة جميع المكونات المتاحة' : 'أضف مواد خام أولاً من صفحة المنتجات');
      return;
    }
    setRows(current => [...current, {
      key: `new-${Date.now()}-${current.length}`,
      ingredient_product_id: ingredient.id,
      quantity_per_sale: '1',
      unit: ingredient.unit_type || 'piece',
      waste_percent: '0',
    }]);
  }

  function updateRow(index, patch) {
    setRows(current => current.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.ingredient_product_id) next.unit = ingredientById[patch.ingredient_product_id]?.unit_type || 'piece';
      return next;
    }));
  }

  async function saveRecipe() {
    if (!productId) return toast.error('اختر المنتج أولاً');
    if (!rows.length && !recipeExists) return toast.error('أضف مكوّناً واحداً على الأقل');
    if (!rows.length && recipeExists && !window.confirm('هل تريد حذف الوصفة وإرجاع خصم مخزون المنتج نفسه؟')) return;
    const seen = new Set();
    let payload;
    try {
      payload = rows.map(row => {
        const quantity = Number(row.quantity_per_sale);
        const waste = Number(row.waste_percent || 0);
        if (!row.ingredient_product_id || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(waste) || waste < 0 || waste > 100) {
          throw new Error('تحقق من المكوّن والكمية ونسبة الهدر');
        }
        if (seen.has(row.ingredient_product_id)) throw new Error('لا تكرر المكوّن نفسه في الوصفة');
        seen.add(row.ingredient_product_id);
        return {
          ingredient_product_id: row.ingredient_product_id,
          quantity_per_sale: quantity,
          unit: row.unit,
          waste_percent: waste,
        };
      });
    } catch (error) {
      toast.error(error.message);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('save_product_recipe', {
        p_product_id: productId,
        p_items: payload,
        p_notes: notes,
      });
      if (error) throw error;
      setRecipeExists(payload.length > 0);
      toast.success(payload.length ? `تم حفظ الوصفة — ${data?.items || payload.length} مكوّن` : 'تم حذف الوصفة');
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['inventory-logs'] });
    } catch (error) {
      toast.error(error.message || 'تعذر حفظ الوصفة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black"><ChefHat className="h-5 w-5 text-primary" /> وصفات المنتجات</h2>
          <p className="mt-1 text-xs text-muted-foreground">حدد مكونات كل منتج، وسيخصم النظام الكميات تلقائياً عند إصدار فاتورة البيع.</p>
        </div>
        <button onClick={() => navigate('/products')} className="rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted">إضافة مادة خام</button>
      </div>

      {ingredients.length === 0 && !ingredientsLoading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>لا توجد مواد خام بعد. أنشئ منتجاً من صفحة المنتجات وفعّل خيار «مادة خام / مكوّن وصفة» ثم أدخل وحدته وتكلفته.</div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="mb-1 block text-xs font-bold text-muted-foreground">المنتج المراد إعداد وصفته</label>
        <select value={productId} onChange={e => setProductId(e.target.value)} disabled={productsLoading}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">اختر المنتج...</option>
          {products.map(product => <option key={product.id} value={product.id}>{product.name_ar || product.name}</option>)}
        </select>
      </div>

      {productId && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">مكونات الوصفة</h3>
              <p className="text-[11px] text-muted-foreground">الكميات محسوبة لإنتاج وحدة واحدة من المنتج.</p>
            </div>
            <button onClick={addRow} disabled={ingredientsLoading || rows.length >= ingredients.length}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-40">
              <Plus className="h-4 w-4" /> إضافة مكوّن
            </button>
          </div>

          {loadingRecipe ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
              لم تُحدد وصفة لهذا المنتج بعد.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const ingredient = ingredientById[row.ingredient_product_id];
                const usedByOthers = new Set(rows.filter((_, i) => i !== index).map(item => item.ingredient_product_id));
                return (
                  <div key={row.key} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">المادة الخام</label>
                      <select value={row.ingredient_product_id} onChange={e => updateRow(index, { ingredient_product_id: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                        {ingredients.map(item => <option key={item.id} value={item.id} disabled={usedByOthers.has(item.id)}>{item.name_ar || item.name} — {item.unit_type || 'piece'}</option>)}
                      </select>
                      <p className="mt-1 text-[10px] text-muted-foreground">المتاح: {Number(ingredient?.stock_quantity || 0).toLocaleString('ar-SA')} {ingredient?.unit_type || ''}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">الكمية لكل منتج</label>
                      <input type="number" min="0.0001" step="0.001" value={row.quantity_per_sale}
                        onChange={e => updateRow(index, { quantity_per_sale: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">الهدر %</label>
                      <input type="number" min="0" max="100" step="0.1" value={row.waste_percent}
                        onChange={e => updateRow(index, { waste_percent: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" />
                    </div>
                    <button onClick={() => setRows(current => current.filter((_, i) => i !== index))}
                      className="flex h-10 items-center justify-center rounded-lg bg-red-500/10 px-3 text-red-600 hover:bg-red-500/20">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">ملاحظات الوصفة</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="مثال: تسخين الخبز قبل الإضافة..." />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div>
              <p className="text-xs text-muted-foreground">تكلفة المكونات التقديرية لكل وحدة</p>
              <p className="text-lg font-black text-primary">{sar(estimatedCost)}</p>
            </div>
            <button onClick={saveRecipe} disabled={saving || loadingRecipe || ingredientsLoading || (!rows.length && !recipeExists)}
              className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'جارٍ الحفظ...' : rows.length ? 'حفظ الوصفة' : recipeExists ? 'حذف الوصفة' : 'أضف مكوّناً'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
