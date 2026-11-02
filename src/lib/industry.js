export const INDUSTRY_OPTIONS = [
  { value: 'general', label: 'نشاط تجاري عام', group: 'عام' },
  { value: 'retail', label: 'متجر تجزئة متنوع', group: 'التجارة والمتاجر' },
  { value: 'grocery', label: 'بقالة', group: 'التجارة والمتاجر' },
  { value: 'supermarket', label: 'سوبرماركت', group: 'التجارة والمتاجر' },
  { value: 'produce', label: 'خضار وفواكه', group: 'التجارة والمتاجر' },
  { value: 'butcher', label: 'ملحمة ودواجن وأسماك', group: 'التجارة والمتاجر' },
  { value: 'herbs_spices', label: 'عطارة وبهارات', group: 'التجارة والمتاجر' },
  { value: 'mill', label: 'مطاحن وحبوب ودقيق', group: 'التجارة والمتاجر' },
  { value: 'clothing', label: 'ملابس وأقمشة', group: 'التجارة والمتاجر' },
  { value: 'shoes', label: 'أحذية وحقائب', group: 'التجارة والمتاجر' },
  { value: 'electronics', label: 'إلكترونيات وجوالات', group: 'التجارة والمتاجر' },
  { value: 'auto_parts', label: 'قطع غيار سيارات', group: 'التجارة والمتاجر' },
  { value: 'hardware', label: 'مواد بناء وأدوات', group: 'التجارة والمتاجر' },
  { value: 'perfume', label: 'عطور ومستحضرات', group: 'التجارة والمتاجر' },
  { value: 'jewelry', label: 'ذهب ومجوهرات وإكسسوارات', group: 'التجارة والمتاجر' },
  { value: 'wholesale', label: 'جملة وتوزيع', group: 'التجارة والمتاجر' },
  { value: 'restaurant', label: 'مطعم', group: 'الأغذية والضيافة' },
  { value: 'cafe', label: 'مقهى', group: 'الأغذية والضيافة' },
  { value: 'bakery', label: 'مخبز وحلويات', group: 'الأغذية والضيافة' },
  { value: 'car_wash', label: 'غسيل وعناية سيارات', group: 'الخدمات' },
  { value: 'salon', label: 'صالون وحلاقة', group: 'الخدمات' },
  { value: 'services', label: 'خدمات ومواعيد', group: 'الخدمات' },
];

export const FOOD_INDUSTRIES = ['restaurant', 'cafe', 'bakery'];
export const HOSPITALITY_INDUSTRIES = ['restaurant', 'cafe', 'bakery'];
export const RETAIL_INDUSTRIES = INDUSTRY_OPTIONS
  .filter(item => item.group === 'التجارة والمتاجر')
  .map(item => item.value);

export function getIndustryLabel(value) {
  return INDUSTRY_OPTIONS.find(item => item.value === value)?.label || 'نشاط تجاري عام';
}
