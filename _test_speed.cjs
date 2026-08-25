/* Простой тест: проверка формулы скорости на 2-м круге */
const vm = require('vm');
const fs = require('fs');
const ctx = {
    console,
    performance: { now: () => Date.now() },
    window: { addEventListener: () => {}, AudioContext: undefined },
    document: {
        getElementById: (id) => {
            const e = { id, getContext: () => ({}), addEventListener: () => {}, width: 100, height: 100, classList: { add: () => {}, remove: () => {} } };
            return e;
        },
        addEventListener: () => {},
        createElement: () => ({ appendChild: () => {}, classList: { add: () => {}, remove: () => {} } })
    },
    Image: function() {},
    requestAnimationFrame: () => 0, setTimeout, clearTimeout, setInterval, clearInterval
};
vm.createContext(ctx);
const files = ['js/audio.js', 'js/notes.js', 'js/cat.js', 'js/game.js', 'js/game-loop.js'];
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });

const Game = ctx.window.Game;
const GameLoop = ctx.window.GameLoop;
const state = Game.state;
ctx._t = { v: 0 }; ctx._beats = [0.5, 1, 1.5, 2]; ctx._DUR = 105;
ctx._playing_state = { v: false };
vm.runInContext(`
    Audio.play = () => { _playing_state.v = true; };
    Audio.stop = () => { _playing_state.v = false; _t.v = 0; };
    Audio.getCurrentTime = () => _playing_state.v ? _t.v : 0;
    Audio.isPlaying = () => _playing_state.v;
    Audio.getBeats = () => _beats;
    Audio.getDuration = () => _DUR;
    Audio.getEnergy = () => 0.5;
    Audio.setPlaybackRate = () => {};
    Audio.onEnd = null;
`, ctx);
function advance(s, frameDt = 1/60) {
    const n = Math.round(s / frameDt);
    for (let i = 0; i < n; i++) { state.lastTime = ctx._t.v; ctx._t.v += frameDt; GameLoop.loop(ctx._t.v * 1000); }
}
state.screen = 'menu';
Game.startGame();
state.screen = 'game';
advance(98);
console.log('after 98s: phase=' + state.speedPhase + ' cycle=' + GameLoop.getCycle() + ' speed=' + state.gameSpeed.toFixed(2));
console.log('Expected: phase=2 cycle=2 speed=1.50 (1.5x faster)');
const ok = state.speedPhase === 2 && GameLoop.getCycle() === 2 && state.gameSpeed >= 1.49 && state.gameSpeed <= 1.51;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);