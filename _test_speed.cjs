/* Тесты фазового движка: прелюдия -> 1-й круг -> SLOW -> 2-й круг (rush) */
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

// Сценарий 1: прелюдия (t=0..15)
state.speedPhase = undefined;
state.totalTime = 0;
ctx._t.v = 0;
ctx._playing_state.v = true;
Game.startGame();
advance(14);
assert(state.speedPhase === -1 && GameLoop.getCycle() === 0,
    'at t=14s: PRELUDE phase=-1, cycle=0');

// Сценарий 2: сразу после прелюдии (t=16)
advance(2);
assert(state.speedPhase === 2 && GameLoop.getCycle() === 1 && state.gameSpeed.toFixed(2) === '1.00',
    'at t=16s: 1st circle phase=2, cycle=1, speed=1.00');

// Сценарий 3: конец 1-го круга (t=46 -> SLOW)
advance(30);
advance(0.5);
assert(state.speedPhase === 1,
    'at t=~46.5s: 1st circle ends -> SLOW phase=1');

// Сценарий 4: после RUSH_START_TIME (t=90)
advance(50);
advance(0.5);
assert(state.speedPhase === 3 && GameLoop.getCycle() === 2 && state.gameSpeed >= 1.59 && state.gameSpeed <= 1.61,
    'at t=~96.5s: RUSH phase=3, cycle=2, speed=1.60 (entry)');

console.log(pass ? 'ALL PASS' : 'SOME FAILED');
process.exit(pass ? 0 : 1);
