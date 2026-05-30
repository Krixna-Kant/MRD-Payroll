
const fs = require('fs');
const content = fs.readFileSync('renderer/js/attendance.js', 'utf8');
const lines = content.split('\n');
let depth = 0;
let output = '';
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let lineDepthChange = 0;
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') { depth++; lineDepthChange++; }
        else if (line[j] === '}') { depth--; lineDepthChange--; }
    }
    if (lineDepthChange !== 0) {
        output += (i+1) + ' (depth ' + depth + '): ' + line.trim() + '\n';
    }
}
fs.writeFileSync('scratch_braces_log.txt', output);
console.log('Final depth: ' + depth);
