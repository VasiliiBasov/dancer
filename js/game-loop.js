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
        // Прелюдия (speedPhase === -1): плавная 4-цветная интерполяция фона
        // (pink → cyan → yellow → green → pink), никаких битов музыки.
        // Как только начинают падать ноты (speedPhase !== -1, то есть RAMP_UP
        // и далее до самого конца матча) — фон возвращается в «моргающий»
        // режим: hue качается sin(drawTime), яркость бьётся с энергией,
        // кольца дышат, центральное кольцо реагирует на музыку.
        const isPrelude = s.speedPhase === -1;
        // Финал трека: за 15 секунд до конца начинает показываться итоговый
        // счёт. В этом окне фон ведёт себя так же, как в прелюдии: плавная
        // 4-цветная интерполяция (pink → cyan → yellow → green), никаких
        // битов музыки, никакого моргания.
        const songTimeNow = Audio.getCurrentTime();
        const durNow = Audio.getDuration();
        const isFinale = durNow > 0 && songTimeNow >= durNow - 15;
        const isQuietBg = isPrelude || isFinale;
        let bgHue, bgLight;
        if (isQuietBg) {
            const BG_HUES = [322, 187, 54, 144]; // pink, cyan, yellow, green
            const BG_CYCLE_DUR = 60;
            const bgT = ((s.totalTime % BG_CYCLE_DUR) + BG_CYCLE_DUR) % BG_CYCLE_DUR;
            const bgSeg = BG_CYCLE_DUR / BG_HUES.length;
            const bgIdx = Math.floor(bgT / bgSeg);
            const bgFrom = BG_HUES[bgIdx];
            const bgTo = BG_HUES[(bgIdx + 1) % BG_HUES.length];
            const bgK = (bgT - bgIdx * bgSeg) / bgSeg;
            bgHue = bgFrom + (bgTo - bgFrom) * bgK;
            bgLight = 15;
        } else {
            // Ноты уже идут, но моргание включается не сразу, а с задержкой
            // 4 с после конца прелюдии (PRELUDE_END_TIME = 9 с). До этого —
            // те же статичные значения, что и в прелюдии (hue=260, light=15%).
            const PRELUDE_END_TIME = 9;
            const FADE_BLINK_DELAY = 7;
            if (s.totalTime < PRELUDE_END_TIME + FADE_BLINK_DELAY) {
                bgHue = 260;
                bgLight = 15;
            } else {
                // Моргание как раньше: hue качается ±15° синусом, яркость 15..30%
                // с энергией музыки.
                const hueShift = Math.sin(s.drawTime * 0.5) * 15;
                bgHue = 260 + hueShift;
                bgLight = 15 + energy * 15;
            }
        }
        const bg = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        bg.addColorStop(0, `hsl(${bgHue}, 70%, ${bgLight}%)`);
        bg.addColorStop(1, '#0a0420');
        c.save();
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);

        for (let i = 0; i < 3; i++) {
            // Кольца статичны в прелюдии и в финале (последние 15 с трека —
            // показывается итоговый счёт), иначе мягко дышат ±5 px.
            const r = s.targetRadius * (1.3 + i * 0.4)
                + (isQuietBg ? 0 : Math.sin(s.drawTime * 2 + i) * 5);
            c.strokeStyle = `rgba(255,255,255,${0.05 - i * 0.015})`;
            c.lineWidth = 1;
            c.beginPath();
            c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
            c.stroke();
        }

        // Центральное кольцо: в прелюдии и в финале — статичное (без музыки),
        // в остальных фазах бьётся с энергией.
        const ringAlpha = isQuietBg ? 0.3 : (0.3 + energy * 0.4);
        const ringBlur = isQuietBg ? 20 : (20 + energy * 30);
        c.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
        c.lineWidth = 3;
        c.shadowColor = '#3ef0ff';
        c.shadowBlur = ringBlur;
        c.beginPath();
        c.arc(w / 2, h / 2, s.targetRadius, 0, Math.PI * 2);
        c.stroke();
        c.restore();

        Notes.draw(c, songTime);
        Cat.draw(c, w / 2, h / 2, s.catSize);
        drawParticles(c);

        // За 15 секунд до конца трека в верхней части экрана плавно проявляется
        // итоговый счёт. СЧЁТ + число висят фиксированно над прыгающим котом
        // (НЕ следуют за catHeadY, чтобы они не подпрыгивали вместе с котом),
        // и мягко пульсируют медленно и ровно, без привязки к Audio.getEnergy().
        // Opacity растёт от 0 до 1 за последние 5 секунд до конца.
        const dur = Audio.getDuration();
        if (dur > 0 && songTime >= dur - 15) {
            const into = (songTime - (dur - 15)); // 0..15
            const fade = Math.min(1, Math.max(0, into / 5)); // 0..1 за первые 5с
            // Мягкая пульсация в 3 раза медленнее исходной (≈ 2.4 с на цикл),
            // без привязки к музыке — чисто s.drawTime.
            const pulse = 1 + Math.sin(s.drawTime * (8 / 3)) * 0.04;
            const cx = w / 2;
            // Фиксированная позиция в верхней четверти экрана, не зависящая от
            // положения кота. Кот прыгает в центре (h/2), а счёт висит сверху —
            // они не подпрыгивают синхронно.
            const y = h * 0.22;
            c.save();
            c.globalAlpha = fade;
            c.translate(cx, y);
            c.scale(pulse, pulse);
            // Лейбл «СЧЁТ» — выше числа. Число (56 px) сидит baseline=bottom
            // на y=0 (то есть занимает диапазон [−56, 0]). Лейбл «СЧЁТ» (18 px)
            // поднят на 68 px от нуля, чтобы верх лейбла был на −86 и не
            // пересекался с числом (−56), зазор 12 px даже при масштабе 1.18x.
            c.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.shadowColor = '#3ef0ff';
            c.shadowBlur = 8;
            c.fillText('СЧЁТ', 0, -68);
            // Само число
            c.font = '900 56px system-ui, -apple-system, "Segoe UI", sans-serif';
            c.textBaseline = 'bottom';
            const grad = c.createLinearGradient(0, -64, 0, 0);
            grad.addColorStop(0, '#ffe13e');
            grad.addColorStop(1, '#3eff8c');
            c.fillStyle = grad;
            c.shadowColor = '#ffe13e';
            c.shadowBlur = 14;
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
        // В прелюдии (PHASE_PRELUDE) визуальные таймеры (фоновое «дыхание»,
        // пульсы, кольца цели) и авто-прыжки кота замедляются в 3 раза —
        // накопитель drawTime идёт в 3 раза медленнее реального dt.
        const animScale = (s.speedPhase === -1) ? (1 / 3) : 1;
        s.drawTime = (s.drawTime || 0) + dt * animScale;

        // === Phased speed system ===
        s.speedTimer += dt;
        s.totalTime  = (s.totalTime || 0) + dt;
        // Initialise the phase. undefined — стартуем с прелюдии (-1).
        if (s.speedPhase === undefined) s.speedPhase = -1;
        // Freeze-таймер декрементируется **во всех фазах**. Раньше он
        // декрементировался только в PHASE_SLOW, поэтому в PHASE_RUSH после
        // countdown freezeTimer «залипал» на 4.0 — спавн нот и тапов блокировал-
        // ся навсегда (баг «на 2-м круге нот нет, тапы не работают»).
        s.freezeTimer = (s.freezeTimer || 0);
        if (s.freezeTimer > 0) { s.freezeTimer -= dt; if (s.freezeTimer < 0) s.freezeTimer = 0; }
        const PHASE_RAMP_UP_DUR = 46;
        // Длительность первого круга (PHASE_RAMP_UP). Первые PRELUDE_DUR секунд
        // первого круга — это «прелюдия» (шёпот-прыжки кота, нот нет), в конце
        // неё появляется «3-2-1-Погнали!» и стартует геймплейный первый круг.
        const PRELUDE_DUR       = 9;
        const PRELUDE_END_TIME  = PRELUDE_DUR; // 9 — конец прелюдии
        // Настройки countdown «3-2-1-Погнали!»:
        //   • COUNTDOWN_PER_LABEL = 1.0 с — каждый лейбл («3», «2», «1») идёт
        //     1 секунду; «Погнали!» (последний лейбл) идёт ×2 = 2 секунды.
        //   • COUNTDOWN_FADE = 0.6 с — fade-out после «Погнали!» в game.js.
        // Итого реальная длительность countdown-UI:
        //   COUNTDOWN_PER_LABEL * (n-1) + COUNTDOWN_PER_LABEL * 2 + COUNTDOWN_FADE
        //   = 1*3 + 2 + 0.6 = 5.6 сек. Countdown стартует на
        //   PRELUDE_COUNTDOWN_LEAD=2 сек раньше PRELUDE_END_TIME.
        const COUNTDOWN_PER_LABEL = 1.0;
        const COUNTDOWN_FADE = 0.6;
        const COUNTDOWN_LABELS = 4; // ['3', '2', '1', 'Погнали!']
        // Реальная длительность countdown-UI (включая fade-out «Погнали!»).
        const COUNTDOWN_TOTAL = COUNTDOWN_PER_LABEL * (COUNTDOWN_LABELS - 1)
            + COUNTDOWN_PER_LABEL * 2 + COUNTDOWN_FADE; // 5.6 с
        // На сколько раньше PRELUDE_END_TIME стартует countdown. Текущее значение 1 с
        // сдвигает countdown на 4 секунды позже по сравнению с «идеальным» шагом
        // COUNTDOWN_TOTAL - COUNTDOWN_FADE = 5 с, в результате countdown почти
        // полностью накладывается на первый круг (геймплей стартует раньше).
        const PRELUDE_COUNTDOWN_LEAD = 1;
        // После первого круга — пауза PHASE_SLOW (кот шёпот-прыгает), затем
        // «3-2-1-Погнали!» и второй круг.
        const PHASE_SLOW_DUR    = 44;
        const RUSH_START_TIME   = PHASE_RAMP_UP_DUR + PHASE_SLOW_DUR; // 90
        const RUSH_STEP         = 7;
        // s.speedCycle исторически нигде не записывается — реальный «круг»
        // живёт в замыкании GameLoop как `_cycle`. Без GameLoop.getCycle() cycle
        // всегда = 0, и 2-й круг стартует с той же базовой скоростью, что и 1-й.
        const cycle = (GameLoop && GameLoop.getCycle) ? GameLoop.getCycle() : (s.speedCycle || 0);
        let newSpeed = s.gameSpeed;
        // --- Phase transitions (one-shot) ---
        // PHASE_PRELUDE (-1): стартует с самого начала. Двухшаговый переход в
        // PHASE_RAMP_UP (2):
        //   шаг A (t = PRELUDE_END_TIME - PRELUDE_COUNTDOWN_LEAD): стартует
        //           countdown «3-2-1-Погнали!» (4 лейбла × 1 с + fade-out),
        //           freezeTimer = COUNTDOWN_TOTAL, фаза остаётся -1.
        //   шаг B (t = PRELUDE_END_TIME): переход в фазу 2, bumpCycle,
        //           новый freezeTimer = COUNTDOWN_TOTAL - elapsed, чтобы
        //           спавн нот не начинался, пока countdown-UI полностью
        //           не отыграет (включая «Погнали!» и fade-out).
        if (s.speedPhase === -1 && s.totalTime >= PRELUDE_END_TIME - PRELUDE_COUNTDOWN_LEAD
            && s.totalTime < PRELUDE_END_TIME && !s._preludeCountdownFired) {
            // Шаг A: показываем countdown, фазу не меняем. Вызывается строго
            // один раз за матч (флаг _preludeCountdownFired), иначе каждый
            // кадр [5, 10) дёргал бы showCountdown → innerHTML='' ломал DOM.
            s._preludeCountdownFired = true;
            s.freezeTimer = COUNTDOWN_TOTAL;
            if (window.Game && window.Game.showCountdown) {
                const beats = Audio.getBeats ? (Audio.getBeats() || []) : [];
                window.Game.showCountdown({
                    labels: ['3', '2', '1', 'Погнали!'],
                    beatDur: COUNTDOWN_PER_LABEL,
                    beats
                }, function () { /* loop уже крутится, noop */ });
            }
        }
        if (s.speedPhase === -1 && s.totalTime >= PRELUDE_END_TIME) {
            // Шаг B: конец прелюдии, переходим в геймплей.
            s.speedPhase = 2; s.speedTimer = 0; s.speedStep = 0; s.autoJumpTimer = 0;
            if (bumpCycle) bumpCycle();
            newSpeed = 1.00;
            // freezeTimer должен догореть ровно до конца countdown (COUNTDOWN_TOTAL
            // секунд от старта шага A). К моменту шага B прошло ровно
            // PRELUDE_COUNTDOWN_LEAD секунд countdown, осталось
            // COUNTDOWN_TOTAL - PRELUDE_COUNTDOWN_LEAD = COUNTDOWN_FADE (≈0.6 с).
            // Первые ноты спавнятся уже после fade-out, ни одна нота не падает
            // под активной надписью «Погнали!».
            const countdownLeft = COUNTDOWN_TOTAL - PRELUDE_COUNTDOWN_LEAD;
            s.freezeTimer = Math.max(s.freezeTimer, countdownLeft);
        }
        // PHASE_RAMP_UP (2) -> PHASE_SLOW (1) at t=PHASE_RAMP_UP_DUR (46s):
        // первый круг (сPRELUDE_DUR шёл) закончился, начинается брейк SLOW.
        if (s.speedPhase === 2 && s.totalTime >= PHASE_RAMP_UP_DUR) {
            s.speedPhase = 1; s.speedTimer = 0; s.autoJumpTimer = 0;
            newSpeed = 1.00;
        }
        // PHASE_SLOW (1) -> PHASE_RUSH (3) at t=RUSH_START_TIME (90s).
        // Это «граница кругов»: первый круг закончился, начинается второй.
        // Показываем 3-2-1-«Погнали!» поверх игры, замораживаем спавн нот и
        // тапы на время отсчёта, после чего игра ускоряется.
        if (s.speedPhase === 1 && s.totalTime >= RUSH_START_TIME) {
            s.speedPhase = 3; s.speedTimer = 0; s.speedStep = 0; s.autoJumpTimer = 0;
            // На 2-м круге (cycle=2) стартуем на 1.5x от базовой.
            // Базовая скорость 2-го круга уменьшена на 25 % (× 0.75):
            // было 1.50 → стало 1.125, шаг +0.13 → +0.0975.
            const rushBase = (1.50 + 0.10 * (cycle - 1)) * 0.75;
            const rushStep = 0.13 * 0.75;
            newSpeed = rushBase;
            s._rushBase = rushBase;
            s._rushStep = rushStep;
            if (bumpCycle) bumpCycle();
            s.freezeTimer = 4.0;
            if (window.Game && window.Game.showCountdown) {
                const beats = Audio.getBeats ? (Audio.getBeats() || []) : [];
                let beatDur = 0.5;
                if (beats.length > 1) {
                    let total = 0, n = 0;
                    for (let i = 1; i < Math.min(beats.length, 12); i++) { total += beats[i] - beats[i-1]; n++; }
                    if (n > 0) beatDur = total / n;
                }
                window.Game.showCountdown({
                    labels: ['3', '2', '1', 'Погнали!'],
                    beatDur, beats
                }, function () { /* loop уже крутится, noop */ });
            }
        }
        // --- Per-phase speed calculation ---
        // За 15 секунд до конца трека игра переходит в «финал»: кот делает
        // шёпот-прыжки как в SLOW (jumpRate=1), спавн нот и тапы блокируются.
        // Сюда же добавляется проявление итогового счёта над котом.
        const songTime0 = Audio.getCurrentTime();
        const dur0 = Audio.getDuration();
        const isFinale = dur0 > 0 && songTime0 >= dur0 - 15;
        if (s.speedPhase === -1 || s.speedPhase === 1 || isFinale) {
            // PRELUDE (-1), SLOW (1) и финал трека: кот делает «шёпот-прыжки».
            // На каждый авто-прыжок замораживаем тапы на 0.55 с, чтобы крошечный
            // прыжок кота не конкурировал с геймплеем. Спавн нот заблокирован
            // отдельным условием ниже.
            // В прелюдии прыжки в 3 раза реже (каждые 1.65 с, jumpRate=1/3).
            // В SLOW и в финале — каждые 0.55 с (jumpRate=1), как и было.
            const jumpRate = (s.speedPhase === -1) ? animScale : 1;
            s.autoJumpTimer = (s.autoJumpTimer || 0) + dt * jumpRate;
            if (s.autoJumpTimer >= 0.55) {
                s.autoJumpTimer = 0;
                if (Cat.jump) Cat.jump(true);
                if (Math.random() < 0.30 && Cat.toggleMirror) Cat.toggleMirror();
                s.freezeTimer = 0.55;
            }
            if (isFinale) newSpeed = 1.00;
        } else if (s.speedPhase === 2) {
            // PHASE_RAMP_UP — первый круг (геймплей). Каждые 8 сек добавляем
            // +0.10 к скорости, максимум 1.60x.
            if (s.speedTimer >= 8) { s.speedTimer = 0; s.speedStep += 1; }
            newSpeed = Math.min(1.60, 1.00 + s.speedStep * 0.10);
        } else if (s.speedPhase === 3) {
            // PHASE_RUSH — второй круг: базовая скорость (1.5x уменьшенная на
            // 25 % = ×0.75, см. переход в RUSH). Каждые RUSH_STEP секунд
            // добавляем rushStep (= 0.13 × 0.75). К концу трека успеет подняться.
            if (s.speedTimer >= RUSH_STEP) { s.speedTimer = 0; s.speedStep += 1; }
            const rushBase = s._rushBase != null ? s._rushBase : (1.50 + 0.10 * (cycle - 1)) * 0.75;
            const rushStep = s._rushStep != null ? s._rushStep : 0.13 * 0.75;
            newSpeed = rushBase + s.speedStep * rushStep;
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
        // В фазе 1 (PHASE_SLOW) спавн нот полностью запрещён — это брейк между
        // кругами, где кот шёпот-прыгает в ожидании «3-2-1-Погнали!». Без этого
        // ограничения в начале SLOW иногда падали ещё 1–2 ноты из очереди.
        // Тапы по-прежнему блокируются через `freezeTimer` (во время авто-прыжка).
        if (!frozen && !isFinale && s.speedPhase !== 1 && s.speedPhase !== -1) {
            // На первом круге (PHASE_RAMP_UP) заканчиваем спавн нот на 2 сек
            // раньше — пропускаем те, чей beatTime > конец_первого_круга − 2.
            // Сами ноты не теряются: nextBeatIdx всё равно двигается, и на
            // втором круге (PHASE_RUSH) они заспавнятся по обычной логике.
            const firstCircleEnd = PHASE_RAMP_UP_DUR - 2; // 44
            while (s.nextBeatIdx < beats.length &&
                   beats[s.nextBeatIdx] - tt <= songTime + 0.3) {
                const bt = beats[s.nextBeatIdx];
                if (s.speedPhase === 2 && bt > firstCircleEnd) {
                    // Пропускаем спавн, но двигаем индекс, чтобы не застрять.
                    s.nextBeatIdx++;
                    continue;
                }
                Notes.spawn(bt);
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
