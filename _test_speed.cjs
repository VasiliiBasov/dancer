/* Тесты фазового движка: прелюдия (9с) + countdown 5.6с со сдвигом -1с -> 1-й круг -> SLOW -> 2-й круг (rush) */
const vm = require('vm');
const fs = require('fs');

function mockCtx() {
    const noop = () => {};
    const grad = {
        addColorStop: noop
    };
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'canvas') return mockEl();
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
            if (typeof k === 'string') return noop;
            return undefined;
        },
        set: () => true
    });
}

function mockEl() {
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'classList') return mockEl();
            if (k === 'style') return mockEl();
            if (k === 'getContext') return () => mockCtx();
            if (k === 'appendChild') return () => {};
            if (k === 'addEventListener' || k === 'removeEventListener') return () => {};
            if (k === 'add' || k === 'remove') return mockEl();
            if (k === 'toggle') return () => true;
            if (k === 'width' || k === 'height') return 100;
            if (k === 'textContent' || k === 'innerHTML') return '';
            return undefined;
        },
        set: () => true
    });
}

const documentMock = {
    getElementById: () => mockEl(),
    addEventListener: () => {},
    createElement: () => mockEl()
};

const ctx = {
    console,
    performance: { now: () => Date.now() },
    window: { addEventListener: () => {}, AudioContext: undefined },
    document: documentMock,
    Image: function () {},
    requestAnimationFrame: () => 0,
    setTimeout, clearTimeout, setInterval, clearInterval
};

vm.createContext(ctx);
const files = ['js/audio.js', 'js/notes.js', 'js/cat.js', 'js/game.js', 'js/game-loop.js'];
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });

const Game = ctx.window.Game;
const GameLoop = ctx.window.GameLoop;
const state = Game.state;

ctx._t = { v: 0 };
ctx._beats = [0.5, 1, 1.5, 2];
ctx._DUR = 200;
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
    Cat.jump = () => {};
    Cat.setGameSpeed = () => {};
    Cat.toggleMirror = () => {};
    Notes.spawn = () => {};
    Notes.setSpeed = () => {};
    Notes.clear = () => {};
    window.Game.showCountdown = () => {};
`, ctx);

function advance(s, frameDt = 1 / 60) {
    const n = Math.round(s / frameDt);
    for (let i = 0; i < n; i++) {
        state.lastTime = ctx._t.v;
        ctx._t.v += frameDt;
        GameLoop.loop(ctx._t.v * 1000);
    }
}

let pass = true;
function assert(cond, msg) {
    console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg);
    if (!cond) pass = false;
}

// Сценарий 1: прелюдия (t=0..9), до старта countdown (стартует в t=8)
state.speedPhase = undefined;
state.totalTime = 0;
ctx._t.v = 0;
ctx._playing_state.v = true;
Game.startGame();
advance(7);
assert(state.speedPhase === -1 && GameLoop.getCycle() === 0,
    'at t=7s: PRELUDE phase=-1, cycle=0');

// Сценарий 2: конец прелюдии -> 1-й круг (t=9)
advance(2);
assert(state.speedPhase === 2 && GameLoop.getCycle() === 1 && state.gameSpeed.toFixed(2) === '1.00',
    'at t=9s: 1st circle phase=2, cycle=1, speed=1.00');

// Сценарий 3: конец 1-го круга (t=46 -> SLOW)
advance(37);
advance(0.5);
assert(state.speedPhase === 1,
    'at t=~46.5s: 1st circle ends -> SLOW phase=1');

// Сценарий 4: после RUSH_START_TIME (t=90)
// Через 0.5 с после входа в RUSH (после 4 с countdown-freeze) игра стартует
// на (1.50 + 0.10 * (2 - 1)) * 0.75 = 1.125x (2-й круг на 25 % медленнее).
advance(50);
advance(0.5);
assert(state.speedPhase === 3 && GameLoop.getCycle() === 2 && state.gameSpeed >= 1.12 && state.gameSpeed <= 1.13,
    'at t=~96.5s: RUSH phase=3, cycle=2, speed=1.125 (entry, 2nd circle x0.75)');

// Сценарий 5: замедление прыжков кота в прелюдии (-1).
// В PRELUDE накопитель autoJumpTimer растёт dt * animScale = dt/3,
// поэтому прыжок происходит каждые 0.55 / (1/3) = 1.65 с реального времени.
// За 3 с реального времени в PRELUDE происходит ровно 1 прыжок
// (второй был бы на 1.65 с, третий — на 3.30 с — не успел).
state.speedPhase = -1;
state.totalTime = 0;
state.lastTime = 0;
state.autoJumpTimer = 0;
ctx._jumpCount = { v: 0 };
vm.runInContext(`Cat.jump = () => { _jumpCount.v += 1; };`, ctx);
ctx._t.v = 0;
ctx._playing_state.v = true;
advance(3);
assert(ctx._jumpCount.v === 1,
    'PRELUDE: ровно 1 прыжок за 3 с реального времени (jumpRate=1/3)');

// Сценарий 6: в прелюдии drawTime (визуальные таймеры) растёт в 3 раза
// медленнее animTime. За 1 с реального времени drawTime += ~0.33.
const dtBefore = state.drawTime;
state.speedPhase = -1;
advance(1);
const dtDelta = state.drawTime - dtBefore;
assert(dtDelta < 0.4 && dtDelta > 0.25,
    'PRELUDE: drawTime += ~0.33 за 1 с реального времени');

console.log(pass ? 'ALL PASS' : 'SOME FAILED');
process.exit(pass ? 0 : 1);
