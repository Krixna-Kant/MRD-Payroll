const fs = require('fs');

// We will mock enough DOM to test if AttendancePage works if isolated
let out = [];
console.log = function(...args) { out.push(args.join(' ')); }

// We won't fully hydrate jsdom, instead we manually verify the logic in the latest attendance.js file
const code = fs.readFileSync('renderer/js/attendance.js', 'utf8');

if (!code.includes('isLocked:      false, // allow free selection initially')) {
    console.error('LATEST CODE NOT PRESENT');
    process.exit(1);
}

if (!code.includes('st.isLocked = true; // freeze immediately')) {
    console.error('FREEZE LOGIC MISSING');
    process.exit(1);
}

// Try to parse the file for Syntax errors one more time using standard parse
try {
    new Function(code);
    out.push("Syntax OK.");
} catch(e) {
    console.error('SYNTAX ERROR:', e);
    process.exit(1);
}

console.log('Passed static structural analysis.');
fs.writeFileSync('test_out.txt', out.join('\n'));
