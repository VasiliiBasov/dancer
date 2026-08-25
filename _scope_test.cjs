const vm = require('vm');
const fs = require('fs');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/game-loop.js', 'utf8'), ctx);
console.log('typeof GameLoop after game-loop.js:', vm.runInContext('typeof GameLoop', ctx));