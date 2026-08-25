/* game.js — состояние, экраны, ввод */
(function() {
    const state = {
        screen: 'loading', score: 0, combo: 0, maxCombo: 0, multiplier: 1,
        perfectCount: 0, goodCount: 0, missCount: 0,
        nextBeatIdx: 0, lastTime: 0, animTime: 0,
        particles: [], catSize: 0, targetRadius: 0,
        // Прогрессия: игра ускоряется каждые 8 секунд
        gameSpeed: 1, speedTimer: 0, speedStep: 0
    };
    const screens = {
        loading: document.getElementById('loading'),
        menu: document.getElementById('menu'),
        game: document.getElementById('game'),
        end: document.getElementById('end')
    };
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const el = (id) => document.getElementById(id);
    const scoreEl = el('score'), comboEl = el('combo'), multEl = el('mult');
    const feedbackEl = el('feedback');
    const startBtn = el('startBtn'), againBtn = el('againBtn'), menuBtn = el('menuBtn');
    const fScore = el('final-score'), fCombo = el('final-combo');
    const fPerfect = el('final-perfect'), fGood = el('final-good'), fMiss = el('final-miss');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth, h = window.innerHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const minDim = Math.min(w, h);
        state.catSize = minDim * 0.18;
        state.targetRadius = state.catSize * 1.05;
        Notes.setTarget(state.targetRadius);
        Notes.setCenter(w / 2, h / 2);
        // Размер нот: на мобильных (<=480px) уменьшаем до 2/3 от десктопа, чтобы кольца
        // не закрывали кота. matchMedia обновляется автоматически при повороте
        // экрана / ресайзе окна, поэтому достаточно вызывать в resize().
        const isMobile = window.matchMedia
            ? window.matchMedia('(max-width: 480px)').matches
            : (minDim <= 480);
        Notes.setSizeMultiplier(isMobile ? 2 / 3 : 1);
        // Keep Cat in sync with the current canvas so its jump ceiling is correct.
        if (Cat.setBounds) Cat.setBounds(w / 2, h / 2, state.catSize);
    }
    window.addEventListener('resize', resize);
    window.addEventListener('load', resize);
    // orientationchange срабатывает на мобильных при повороте экрана ДО того,
    // как innerWidth/innerHeight обновятся — поэтому делаем двойной rAF.
    window.addEventListener('orientationchange', () => {
        requestAnimationFrame(() => requestAnimationFrame(resize));
    });
    // visualViewport учитывает появление/скрытие экранной клавиатуры (если бы
    // были input'ы), но и без неё помогает на iOS при resize-баре Safari.
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
    }

    function showScreen(name) {
        state.screen = name;
        for (const k in screens) screens[k].classList.toggle('visible', k === name);
    }

    async function init() {
        const bar = el('loading-bar');
        const setBar = (pct) => { if (bar) bar.style.width = pct + '%'; };
        try {
            await Audio.load('assets/song.mp3', (text) => {
                el('loading-text').textContent = text;
                // Парсим «Загружаем музыку… NN%» и обновляем прогресс-бар.
                const m = /(\d{1,3})\s*%/.exec(text);
                if (m) setBar(Math.min(100, +m[1]));
                else if (/Декодируем/i.test(text)) setBar(100);
            });
            setBar(100);
            await Audio.analyzeBeats();
            setTimeout(() => showScreen('menu'), 300);
        } catch (err) {
            console.error('[Game] init error:', err);
            el('loading-text').textContent = 'Ошибка: ' + (err && err.message ? err.message : String(err));
        }
    }
    init();

    // Глобальный перехват ошибок: без него падение в requestAnimationFrame просто
    // замораживает экран без какого-либо сообщения.
    window.addEventListener('error', (e) => {
        console.error('[Global error]', e.error || e.message);
        try { el('loading-text').textContent = '⚠️ ' + (e.message || 'script error'); } catch(_) {}
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[Unhandled promise]', e.reason);
        try { el('loading-text').textContent = '⚠️ ' + (e.reason && e.reason.message || 'error'); } catch(_) {}
    });

    startBtn.addEventListener('click', startGame);
    againBtn.addEventListener('click', startGame);
    menuBtn.addEventListener('click', () => { Audio.stop(); resetStats(); showScreen('menu'); });

    function handleTap() {
        if (state.screen !== 'game' || !Audio.isPlaying()) return;
        if (state.freezeTimer && state.freezeTimer > 0) return;
        // За 15 секунд до конца трека тапы блокируются — игра уже завершается,
        // нот нет, поверх всего проявляется финальный счёт.
        const dur = Audio.getDuration ? Audio.getDuration() : 0;
        const t = Audio.getCurrentTime();
        if (dur > 0 && t >= dur - 15) return;
        const r = Notes.tryHit(t);
        Cat.jump();
        if (r) applyHit(r);
        addTapParticles(r ? false : true);
    }
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            if (state.screen === 'menu') startGame();
            else if (state.screen === 'game') handleTap();
        }
    });
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); handleTap(); });

    // Глобальный handle активного countdown, чтобы при повторном вызове
    // (рестарт, новый раунд) отменить старые setTimeout и не плодить
    // наложенные «Погнали!» поверх друг друга.
    let activeCountdown = null;

    function showCountdown(steps, onDone) {
        const el = document.getElementById('countdown');
        if (!el) { onDone(); return; }

        // ДИАГНОСТИКА: считаем вызовы чтобы понять почему появляется дубль
        showCountdown._callCount = (showCountdown._callCount || 0) + 1;
        console.log('[CD] showCountdown call #' + showCountdown._callCount
            + ' | activeCountdown=' + (activeCountdown ? 'yes' : 'no')
            + ' | step=' + (steps.labels ? steps.labels.join(',') : '?'));

        // Если предыдущий countdown ещё крутится — отменяем его
        if (activeCountdown) {
            activeCountdown.cancel();
        }

        let beatInt = null;
        const timers = []; // все setTimeout этого вызова — отменяем при cancel/finish

        const finish = () => {
            // Очищаем ВСЕ pending setTimeout этого цикла
            for (const t of timers) clearTimeout(t);
            timers.length = 0;
            if (beatInt) { clearInterval(beatInt); beatInt = null; }
            // Снимаем pulse/animation чтобы CSS-анимация не оставляла
            // розовый «след» на падающем fade-out.
            el.querySelectorAll('.cd-main').forEach((n) => {
                n.classList.remove('pulse');
                n.style.animation = 'none';
            });
            el.innerHTML = '';
            el.classList.remove('with-score');
            if (activeCountdown) activeCountdown.cancelled = true;
            activeCountdown = null;
            onDone();
        };

        const cancel = () => {
            for (const t of timers) clearTimeout(t);
            timers.length = 0;
            if (beatInt) { clearInterval(beatInt); beatInt = null; }
            // Снимаем анимацию с ЛЮБЫХ .cd-main внутри countdown, иначе
            // CSS-pulse у старого элемента продолжает крутиться и оставляет
            // «розовый призрак» рядом с новым синим «Погнали!».
            el.querySelectorAll('.cd-main').forEach((n) => {
                n.classList.remove('pulse');
                n.style.animation = 'none';
                void n.offsetWidth; // форс-перезапуск анимации
                n.style.animation = '';
            });
            el.innerHTML = '';
            el.classList.remove('with-score', 'visible');
            if (activeCountdown) activeCountdown.cancelled = true;
        };

        activeCountdown = { cancel, cancelled: false };

        el.classList.add('visible');
        if (steps.roundScore !== undefined && steps.roundScore !== null) el.classList.add('with-score');
        el.innerHTML = '';
        // ДИАГНОСТИКА: проверяем что innerHTML действительно очистил DOM
        const leftoverMains = el.querySelectorAll('.cd-main').length;
        if (leftoverMains > 0) {
            console.warn('[CD] WARNING: after innerHTML="", .cd-main count=' + leftoverMains);
        }
        const main = document.createElement('div'); main.className = 'cd-main'; el.appendChild(main);
        const sub = document.createElement('div'); sub.className = 'cd-sub';
        if (steps.roundLabel) sub.textContent = steps.roundLabel + ': ' + steps.roundScore;
        if (steps.roundScore !== undefined && steps.roundScore !== null) el.appendChild(sub); else sub.remove();

        // Auto-fit: задаём визуальную ширину надписи = 1/3 видимого экрана.
        // Объявляем ПОСЛЕ создания main, иначе ReferenceError на main.
        function fitToWidth() {
            const target = window.innerWidth / 3;
            const savedMax = main.style.maxWidth;
            const savedPadL = main.style.paddingLeft;
            const savedPadR = main.style.paddingRight;
            main.style.maxWidth = 'none';
            main.style.paddingLeft = '0';
            main.style.paddingRight = '0';
            void main.offsetWidth;
            const natural = main.scrollWidth;
            main.style.maxWidth = savedMax;
            main.style.paddingLeft = savedPadL;
            main.style.paddingRight = savedPadR;
            if (natural > target && natural > 0) {
                const k = target / natural;
                main.style.transform = `scale(${k})`;
                main.style.transformOrigin = 'center center';
            } else {
                main.style.transform = '';
            }
            if (window.console && console.log) {
                console.log('[CD] "' + main.textContent + '" natural=' + natural + 'px target=' + Math.round(target) + 'px → k=' + (natural > target ? (target/natural).toFixed(3) : '1'));
            }
        }

        const beatDur = steps.beatDur || 0.5;
        const labels = steps.labels || ['3', '2', '1', 'Погнали!'];
        let acc = 0;
        for (let i = 0; i < labels.length; i++) {
            (function(idx, lbl) {
                const isLast = (idx === labels.length - 1);
                const dur = isLast ? beatDur * 2 : beatDur;
                timers.push(setTimeout(() => {
                    // Если этот countdown уже отменён — ничего не делаем
                    if (!activeCountdown || activeCountdown.cancelled) return;
                    main.textContent = lbl;
                    main.dataset.tone = isLast ? 'go' : 'num';
                    main.classList.remove('pulse');
                    void main.offsetWidth;
                    main.classList.add('pulse');
                    requestAnimationFrame(() => requestAnimationFrame(fitToWidth));
                    if (isLast) {
                        timers.push(setTimeout(() => {
                            if (activeCountdown && !activeCountdown.cancelled) {
                                el.classList.remove('visible');
                            }
                        }, dur * 600));
                    }
                }, acc * 1000));
            })(i, labels[i]);
            acc += (i === labels.length - 1) ? beatDur * 2 : beatDur;
        }
        timers.push(setTimeout(finish, acc * 1000));
        if (steps.beats && steps.beats.length > 0) {
            const start = performance.now();
            beatInt = setInterval(() => {
                if (!activeCountdown || activeCountdown.cancelled) {
                    clearInterval(beatInt); beatInt = null;
                    return;
                }
                const e = (performance.now() - start) / 1000;
                const nearest = steps.beats.reduce((p, c) => (Math.abs(c - e) < Math.abs(p - e)) ? c : p, steps.beats[0]);
                if (Math.abs(nearest - e) < 0.06) {
                    main.classList.remove('pulse');
                    void main.offsetWidth;
                    main.classList.add('pulse');
                }
            }, 60);
        }
    }

    function startGame() {
        resetStats(); showScreen('game'); resize();
        Notes.clear(); state.nextBeatIdx = 0;
        state.gameSpeed = 1; state.speedTimer = 0; state.speedStep = 0;
        state.freezeTimer = 0;
        // Сбросить флаг «countdown уже показан», чтобы он сработал заново
        // после рестарта (game-loop.js дёргает showCountdown строго один раз
        // за матч на отрезке [PRELUDE_END_TIME-LEAD, PRELUDE_END_TIME)).
        state._preludeCountdownFired = false;
        // Полный сброс фазового движка для корректного рестарта.
        state.speedPhase = undefined; // game-loop переинициализирует в -1
        state.totalTime = 0;
        state.autoJumpTimer = 0;
        Notes.setSpeed(1);
        if (Cat.setGameSpeed) Cat.setGameSpeed(1);
        Audio.stop();
        Audio.play();
        if (Audio.setPlaybackRate) Audio.setPlaybackRate(1);
        // Сбрасываем счётчик кругов. Цикл 0 = прелюдия, 1 = первый круг, 2 = второй.
        if (GameLoop && GameLoop.resetCycle) GameLoop.resetCycle();
        state.lastTime = performance.now() / 1000;
        // Прелюдия стартует сразу, без «3-2-1-Погнали!» в начале — countdown
        // появится в конце прелюдии автоматически из game-loop.js.
        requestAnimationFrame(GameLoop.loop);
    }
    function resetStats() {
        state.score = 0; state.combo = 0; state.maxCombo = 0; state.multiplier = 1;
        state.perfectCount = 0; state.goodCount = 0; state.missCount = 0;
        state.particles = [];
    }
    function endGame() {
        Audio.stop();
        fScore.textContent = state.score;
        fCombo.textContent = state.maxCombo;
        fPerfect.textContent = state.perfectCount;
        fGood.textContent = state.goodCount;
        fMiss.textContent = state.missCount;
        showScreen('end');
    }
    Audio.onEnd = endGame;

    function applyHit(r) {
        if (r.quality === 'perfect') {
            state.score += 100 * state.multiplier; state.combo++;
            state.perfectCount++;
            showFeedback('PERFECT!', 'perfect');
        } else if (r.quality === 'good') {
            state.score += 50 * state.multiplier; state.combo++;
            state.goodCount++;
            showFeedback('GOOD', 'good');
        } else {
            state.missCount++; state.combo = 0;
            showFeedback('MISS', 'miss');
        }
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        updateMultiplier(); updateHUD();
    }
    function updateMultiplier() {
        const c = state.combo;
        if (c >= 30) state.multiplier = 4;
        else if (c >= 15) state.multiplier = 3;
        else if (c >= 5) state.multiplier = 2;
        else state.multiplier = 1;
    }
    function updateHUD() {
        scoreEl.textContent = state.score;
        comboEl.textContent = state.combo;
        multEl.textContent = '×' + state.multiplier;
    }
    function showFeedback(text, cls) {
        feedbackEl.textContent = text;
        feedbackEl.className = 'feedback show ' + cls;
        clearTimeout(showFeedback._t);
        showFeedback._t = setTimeout(() => { feedbackEl.className = 'feedback ' + cls; }, 400);
    }
    function addTapParticles(empty) {
        const w = window.innerWidth, h = window.innerHeight;
        const n = empty ? 4 : 12;
        const vBase = empty ? 60 : 100;
        const lifeBase = empty ? 0.2 : 0.4;
        const palette = empty ? ['#888', '#aaa', '#666'] : ['#ff3ec9', '#3ef0ff', '#ffe13e', '#3eff8c'];
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = vBase + Math.random() * (empty ? 80 : 200);
            state.particles.push({
                x: w / 2, y: h / 2,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                life: lifeBase + Math.random() * 0.2, age: 0,
                color: palette[Math.floor(Math.random() * palette.length)]
            });
        }
    }
    window.Game = { state, startGame, endGame, applyHit, updateMultiplier, updateHUD, showFeedback, addTapParticles, showCountdown };
})();
