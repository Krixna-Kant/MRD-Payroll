const fs = require('fs');
function fixLine(path) {
    let s = fs.readFileSync(path, 'utf8');
    s = s.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
    fs.writeFileSync(path, s);
}
fixLine('renderer/js/attendance.js');
console.log('Fixed attendance.js');
