const fs = require('fs');
let s = fs.readFileSync('renderer/js/payments.js', 'utf8');
s = s.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('renderer/js/payments.js', s);
console.log('Fixed syntax!');
