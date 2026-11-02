import assert from 'node:assert/strict';
import { INDUSTRY_OPTIONS, FOOD_INDUSTRIES, RETAIL_INDUSTRIES, getIndustryLabel } from './industry.js';

const values = INDUSTRY_OPTIONS.map(item => item.value);
assert.equal(new Set(values).size, values.length, 'industry values must be unique');
for (const value of ['grocery', 'supermarket', 'produce', 'herbs_spices', 'mill', 'clothing', 'shoes', 'electronics', 'auto_parts', 'wholesale']) {
  assert.ok(values.includes(value), `missing supported industry: ${value}`);
}
assert.ok(FOOD_INDUSTRIES.includes('restaurant'));
assert.ok(FOOD_INDUSTRIES.includes('bakery'));
assert.ok(!FOOD_INDUSTRIES.includes('grocery'));
assert.ok(RETAIL_INDUSTRIES.includes('supermarket'));
assert.equal(getIndustryLabel('produce'), 'خضار وفواكه');
assert.equal(getIndustryLabel('unknown'), 'نشاط تجاري عام');
console.log('industry profile tests passed');
