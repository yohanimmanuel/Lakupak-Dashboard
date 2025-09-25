// Test what formatCurrencyAmount produces
const { formatCurrencyAmount } = require('./Laku-Marketplace/utils/currencyUtils');

console.log('Testing formatCurrencyAmount:');
console.log('3500000 ->', formatCurrencyAmount(3500000));
console.log('3900000 ->', formatCurrencyAmount(3900000));
console.log('400000 ->', formatCurrencyAmount(400000));

// Test the API parseCurrencyValue function
const parseCurrencyValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,-]/g, '');
    
    if (cleaned.includes('.') && !cleaned.includes(',')) {
      return parseFloat(cleaned.replace(/\./g, '')) || 0;
    }
    
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }
    
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }
    
    if (cleaned.includes('.') && !cleaned.includes(',')) {
      return parseFloat(cleaned.replace(/\./g, '')) || 0;
    }
    
    return parseFloat(cleaned) || 0;
  }
  return 0;
};

console.log('\nTesting parseCurrencyValue:');
console.log('"3.500.000" ->', parseCurrencyValue("3.500.000"));
console.log('"3.900.000" ->', parseCurrencyValue("3.900.000"));
console.log('"400.000" ->', parseCurrencyValue("400.000"));
