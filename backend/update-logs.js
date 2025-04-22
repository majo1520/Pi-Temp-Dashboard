const fs = require('fs');
const path = require('path');

// Path to server.cjs
const filePath = path.join(__dirname, 'server.cjs');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Replace console.log with logger.log
content = content.replace(/console\.log\(/g, 'logger.log(');

// Replace console.error with logger.error
content = content.replace(/console\.error\(/g, 'logger.error(');

// Write the file back
fs.writeFileSync(filePath, content);

console.log('Updated logging calls in server.cjs'); 