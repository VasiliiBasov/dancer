/* game-loop.js — основной render + update */
const GameLoop = (function() {
    let _cycle = 0;
    const colors = ['#ff3ec9', '#3ef0ff', '#ffe13e', '#3eff8c'];

    function updateParticles(dt) {
        const ps = window.Game.state.particles;
        for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.age += dt;
            if (p.age >= p.life) { ps.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 400 * dt;
            p.vx *= 0.96;
        }
    }

    function drawParticles(c) {
        c.save();
        for (const p of window.Game.state.particles) {
            const a = 1 - p.age / p.life;
            c.globalAlpha = a;
            c.fillStyle = p.color;
            c.shadowColor = p.color;
            c.shadowBlur = 12;
            c.beginPath();
            c.arc(p.x, p.y, 4 * a, 0, Math.PI * 2);
            c.fill();
        }
        c.restore();
    }

    function draw(c, songTime) {
        const w = window.innerWidth, h = window.innerHeight;
        const s = window.Game.state;
        const energy = Audio.getEnergy();
        const hueShift = Math.sin(s.animTime * 0.5) * 15;
        const bg = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        bg.addColorStop(0, `hsl(${260 + hueShift}, 70%, ${15 + energy * 15}%)`);
        bg.addColorStop(1, '#0a0420');
        c.save();
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);

        for (let i = 0; i < 3; i++) {
            const r = s.targetRadius * (1.3 + i * 0.4) + Math.sin(s.animTime * 2 + i) * 5;
            c.strokeStyle = `rgba(255,255,255,${0.05 - i * 0.015})`;
            c.lineWidth = 1;
            c.beginPath();
            c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
            c.stroke();
        }

        c.strokeStyle = `rgba(255, 255, 255, ${0.3 + energy * 0.4})`;
        c.lineWidth = 3;
        c.shadowColor = '#3ef0ff';
        c.shadowBlur = 20 + energy * 30;
        c.beginPath();
        c.arc(w / 2, h / 2, s.targetRadius, 0, Math.PI * 2);
        c.stroke();
        c.restore();

        Notes.draw(c, songTime);
        Cat.draw(c, w / 2, h / 2, s.catSize);
        drawParticles(c);

        // За 15 секунд до конца трека над котом плавно проявляется итоговый
        // счёт и пульсирует в такт музыке (через Audio.getEnergy()).
        // Opacity растёт от 0 до 1 за последние 5 секунд до конца.
        const dur = Audio.getDuration();
        if (dur > 0 && songTime >= dur - 15) {
            const into = (songTime - (dur - 15)); // 0..15
            const fade = Math.min(1, Math.max(0, into / 5)); // 0..1 за первые 5с
            const energyBeat = energy; // 0..1, тем выше — тем сильнее «удар»
            const scale = 1 + energyBeat * 0.18;
            const pulse = 1 + Math.sin(s.animTime * 8) * 0.04 + energyBeat * 0.10;
            const cx = w / 2;
            const catHeadY = (Cat.getHeadY) ? Cat.getHeadY() : h / 2;
            const y = catHeadY - s.catSize * 1.05;
            c.save();
            c.globalAlpha = fade;
            c.translate(cx, y);
            c.scale(scale * pulse, scale * pulse);
            // Лейбл «СЧЁТ»
            c.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.shadowColor = '#3ef0ff';
            c.shadowBlur = 8 + energyBeat * 18;
            c.fillText('СЧЁТ', 0, -8);
            // Само число
            c.font = '900 56px system-ui, -apple-system, "Segoe UI", sans-serif';
            const grad = c.createLinearGradient(0, -64, 0, 0);
            grad.addColorStop(0, '#ffe13e');
            grad.addColorStop(1, '#3eff8c');
            c.fillStyle = grad;
            c.shadowColor = '#ffe13e';
            c.shadowBlur = 14 + energyBeat * 24;
            c.fillText(String(s.score), 0, 0);
            c.restore();
        }

        // Прогресс-бар внизу (поверх всего, кроме DOM-оверлеев)
        if (dur > 0) {
            const p = Math.min(1, songTime / dur);
            c.save();
            c.fillStyle = 'rgba(255,255,255,0.1)';
            c.fillRect(0, h - 4, w, 4);
            c.fillStyle = '#3ef0ff';
            c.shadowColor = '#3ef0ff';
            c.shadowBlur = 8;
            c.fillRect(0, h - 4, w * p, 4);
            c.restore();
        }
    }

    function loop(now) {
        // Outer guard: any uncaught throw inside the rAF body used to silently
        // break the requestAnimationFrame chain and freeze the screen.
        try {
        _loopInner(now);
        requestAnimationFrame(loop);
        } catch (err) {
            try { console.error('[GameLoop] frame crashed:', (err && (err.stack || err.message)) || err); } catch (_) {}
            // Still schedule next frame so the loop does not die.
            requestAnimationFrame(loop);
        }
    }
    function _loopInner(now) {
        // Game — это публичный объект, экспортированный game.js как
        // `window.Game = {...}`. Lexical const GameLoop здесь виден всем
        // последующим скриптам, но Game — нет (объявлен не const), поэтому
        // обращаемся через глобал.
        const s = window.Game.state;
        if (s.screen !== 'game') return;
        const t = now / 1000;
        let _dt = t - s.lastTime; if (!isFinite(_dt) || _dt < 0) _dt = 0; const dt = Math.min(0.05, _dt);
        s.lastTime = t;
        s.animTime += dt;

        // === Phased speed system ===
        s.speedTimer += dt;
        s.totalTime  = (s.totalTime || 0) + dt;
        // Initialise the phase. undefined is neither 0/1/2 so we must seed it once.
        if (s.speedPhase === undefined) s.speedPhase = 0;
        // Freeze-таймер декрементируется **во всех фазах**. Раньше он
        // декрементировался только в PHASE_SLOW, поэтому в PHASE_RUSH после
        // countdown freezeTimer «залипал» на 4.0 — спавн нот и тапов блокировал-
        // ся навсегда (баг «на 2-м круге нот нет, тапы не работают»).
        s.freezeTimer = (s.freezeTimer || 0);
        if (s.freezeTimer > 0) { s.freezeTimer -= dt; if (s.freezeTimer < 0) s.freezeTimer = 0; }
        const PHASE_RAMP_UP_DUR = 48;
        // Длительность «первого круга» = RUSH_START_TIME − PHASE_RAMP_UP_DUR.
        // По умолчанию 44 сек (было 48 — укорочено на 2 сек, чтобы пауза
        // «3-2-1-Погнали!» появлялась немного раньше).
        const PHASE_SLOW_DUR    = 44;
        const RUSH_START_TIME   = PHASE_RAMP_UP_DUR + PHASE_SLOW_DUR; // 92
        const RUSH_STEP         = 7;
        // s.speedCycle исторически нигде не записывается — реальный «круг»
        // живёт в замыкании GameLoop как `_cycle`. Без GameLoop.getCycle() cycle
        // всегда = 0, и 2-й круг стартует с той же базовой скоростью, что и 1-й.
        const cycle = (GameLoop && GameLoop.getCycle) ? GameLoop.getCycle() : (s.speedCycle || 0);
        let newSpeed = s.gameSpeed;
        // --- Phase transitions (one-shot) ---
        // PHASE_RAMP_UP (0) -> PHASE_SLOW (1) at t=48s
        if (s.speedPhase === 0 && s.totalTime >= PHASE_RAMP_UP_DUR) {
            s.speedPhase = 1; s.speedTimer = 0; s.autoJumpTimer = 0;
            newSpeed = 1.00;

        }
        // PHASE_SLOW (1) -> PHASE_RUSH (2) at t=RUSH_START_TIME (92s).
        // Это «граница кругов»: первый круг закончился, начинается второй.
        // Показываем 3-2-1-«Погнали!» поверх игры, замораживаем спавн нот и
        // тапы на время отсчёта, после чего игра ускоряется.
        if (s.speedPhase === 1 && s.totalTime >= RUSH_START_TIME) {
            s.speedPhase = 2; s.speedTimer = 0; s.speedStep = 0; s.autoJumpTimer = 0;
            // На 2-м круге (cycle=2 после bumpCycle в game.js:startGame +
            // bumpCycle здесь) стартуем на 1.5x от базовой. (cycle-1)
            // компенсирует первый bumpCycle в game.js, давая ровно 1.50.
            // 3-й круг (cycle=3): 1.60 и т.д.
            newSpeed = 1.50 + 0.10 * (cycle - 1);
            if (bumpCycle) bumpCycle();
            // Заморозить ноты/тапы на время countdown (≈ 3.5 с — 4 шага по 0.5 с
            // плюс последний двойной). Реальная длительность считается в
            // showCountdown, но freezeTimer декрементируется каждый кадр и
            // безопасно «пересидит» если countdown чуть длиннее.
            s.freezeTimer = 4.0;
            if (window.Game && window.Game.showCountdown) {
                const beats = Audio.getBeats ? (Audio.getBeats() || []) : [];
                let beatDur = 0.5;
                if (beats.length > 1) {
                    let total = 0, n = 0;
                    for (let i = 1; i < Math.min(beats.length, 12); i++) { total += beats[i] - beats[i-1]; n++; }
                    if (n > 0) beatDur = total / n;
                }
                // Без roundLabel/roundScore — под «3-2-1-Погнали!» ничего не пишем,
                // чтобы не показывать промежуточный итог между кругами.
                window.Game.showCountdown({
                    labels: ['3', '2', '1', 'Погнали!'],
                    beatDur, beats
                }, function () { /* loop уже крутится, noop */ });
            }
        }
        // --- Per-phase speed calculation ---
        if (s.speedPhase === 0) {
            if (s.speedTimer >= 8) { s.speedTimer = 0; s.speedStep += 1; }
            const baseSpeed = cycle === 0 ? 1.00 : 1.10;
            newSpeed = Math.min(1.60, baseSpeed + s.speedStep * 0.10);
        } else if (s.speedPhase === 1) {
            // SLOW phase: кот делает «шёпот-прыжки» (jump(true) — пара пикселей).
            // На каждый авто-прыжок замораживаем ноты и тапы на 0.55 с —
            // чтобы крошечный прыжок кота не конкурировал с геймплеем.
            // freezeTimer уже декрементирован выше, общий для всех фаз.
            s.autoJumpTimer = (s.autoJumpTimer || 0) + dt;
            if (s.autoJumpTimer >= 0.55) {
                s.autoJumpTimer = 0;
                if (Cat.jump) Cat.jump(true);
                if (Math.random() < 0.30 && Cat.toggleMirror) Cat.toggleMirror();
                s.freezeTimer = 0.55; // на полсекунды убираем ноты и блокируем тапы
            }
            newSpeed = 1.00;
        } else if (s.speedPhase === 2) {
            if (s.speedTimer >= RUSH_STEP) { s.speedTimer = 0; s.speedStep += 1; }
            // 2-й круг: базовая скорость 1.50 (= 1.5x). Каждые RUSH_STEP секунд
            // добавляем +0.13. К концу трека успеет подняться ещё на несколько
            // ступеней. Формула согласована с transition-блоком выше.
            newSpeed = (1.50 + 0.10 * (cycle - 1)) + s.speedStep * 0.13;
        }
        if (newSpeed !== s.gameSpeed) {
            s.gameSpeed = newSpeed;
            Notes.setSpeed(s.gameSpeed);
            Cat.setGameSpeed(s.gameSpeed);
            if (Audio.setPlaybackRate) Audio.setPlaybackRate(s.gameSpeed);
        }
        const songTime = Audio.getCurrentTime();
        const beats = Audio.getBeats();
        const tt = Notes.getTravelTime();

        // Periodically GC old notes. The notes array grows monotonically
        // (see notes.js: no splice/pop/shift anywhere), so prune dead ones
        // once per second to keep long sessions from bloating memory.
        s.cleanupTimer = (s.cleanupTimer || 0) + dt;
        if (s.cleanupTimer >= 1) {
            s.cleanupTimer = 0;
            Notes.cleanup(songTime - 2);
        }
        const frozen = s.freezeTimer && s.freezeTimer > 0;
        if (!frozen) {
            while (s.nextBeatIdx < beats.length &&
                   beats[s.nextBeatIdx] - tt <= songTime + 0.3) {
                Notes.spawn(beats[s.nextBeatIdx]);
                s.nextBeatIdx++;
            }
            Notes.update(songTime);
        } else {
            // Во время «шёпот-прыжка» просто сдвигаем индекс, чтобы не накапливать спавны,
            // но нот на экране не появляется.
            while (s.nextBeatIdx < beats.length &&
                   beats[s.nextBeatIdx] - tt <= songTime + 0.3) {
                s.nextBeatIdx++;
            }
        }
        Cat.update(dt);
        updateParticles(dt);

        // За 15 секунд до конца трека нотам не засчитываем промахи — игра уже
        // завершается, ноты просто уходят за экран, счёт не должен штрафоваться.
        const _endFreeze = Audio.getDuration() > 0 && songTime >= Audio.getDuration() - 15;
        for (const n of Notes.getActiveNotes(songTime)) {
            const tt = Notes.getTravelTime();
            const elapsed = songTime - (n.beatTime - tt);
            if (elapsed > tt + 0.2) {
                n.state = 'missed';
                if (!_endFreeze) {
                    s.combo = 0;
                    s.missCount++;
                    window.Game.updateMultiplier();
                    window.Game.updateHUD();
                }
            }
        }

        const _cv = document.getElementById('canvas'); if (_cv) { const _cctx = _cv.getContext('2d'); if (_cctx) draw(_cctx, songTime); }
    }

    function bumpCycle() { _cycle += 1; }
    const api = { loop, bumpCycle, getCycle: () => _cycle, resetCycle: () => { _cycle = 0; } };
    // Дублируем на window — game.js использует GameLoop через lexical const,
    // но внешний код (тесты, отладка) обычно достаёт через window.*. Также
    // упрощает инспекцию из DevTools в продакшене.
    if (typeof window !== 'undefined') window.GameLoop = api;
    return api;
})();
