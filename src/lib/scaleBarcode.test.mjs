import assert from 'node:assert/strict';
import { isValidEan13, parseScaleBarcode, decodeScaleValue } from './scaleBarcode.js';

const withCheck = body => {
  const digits = body.split('').map(Number);
  const sum = digits.reduce((total,digit,index)=>total+digit*(index%2===0?1:3),0);
  return body + String((10-(sum%10))%10);
};
const validPrice = withCheck('200123400350');
assert.equal(validPrice.length,13);
assert.equal(isValidEan13(validPrice),true);
assert.deepEqual(parseScaleBarcode(validPrice,'20'),{
  isScaleItem:true,itemCode:'01234',rawValue:350,rawBarcode:validPrice
});
assert.deepEqual(decodeScaleValue(parseScaleBarcode(validPrice),{
  scale_value_type:'price',scale_value_divisor:100
}),{type:'price',value:3.5});
assert.equal(parseScaleBarcode(validPrice,'21').isScaleItem,false);
assert.equal(parseScaleBarcode(validPrice.slice(0,12)+'9').isScaleItem,false);
assert.equal(parseScaleBarcode('1234567890123').isScaleItem,false);
const weight = withCheck('200123400750');
assert.deepEqual(decodeScaleValue(parseScaleBarcode(weight),{
  scale_value_type:'weight',scale_value_divisor:1000
}),{type:'weight',value:0.75});
console.log('scale barcode tests passed');
