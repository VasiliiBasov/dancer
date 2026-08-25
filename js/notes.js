/* === notes.js — кольца-ноты, сжимающиеся к коту === */

const Notes = (() => {
    const BASE_TRAVEL_TIME = 1.4; // базовое время (секунд) от спавна до кота
    const HIT_RADIUS = 0.95;  // идеальный радиус (относительно целевого)
    const PERFECT_WINDOW = 0.12;  // ± от идеала
    const GOOD_WINDOW = 0.25;

    let speed = 1; // множитель скорости (1 = норма, 2 = вдвое быстрее)
    function getTravelTime() { return BASE_TRAVEL_TIME / speed; }

    // Множитель размера нот: 1 = норма (десктоп), 1/3 = мобильные.
    // Управляется через setSizeMultiplier() из game.js (зависит от matchMedia).
    let sizeMul = 1;
    function setSizeMultiplier(m) { sizeMul = Math.max(0.1, Math.min(2, m)); }
    function getSizeMultiplier() { return sizeMul; }

    let notes = [];
    let targetRadius = 80; // установит game.js
    let centerX = 0, centerY = 0;

    const colors = ['#3ef0ff', '#ff3ec9', '#ffe13e', '#3eff8c', '#ff8a3e'];

    function setTarget(r) { targetRadius = r; }
    function setCenter(x, y) { centerX = x; centerY = y; }

    function spawn(beatTime) {
        const angle = Math.random() * Math.PI * 2;
        const startRadius = targetRadius * 3.5;
        notes.push({
            beatTime: beatTime,
            angle: angle,
            startRadius: startRadius,
            color: colors[Math.floor(Math.random() * colors.length)],
            state: 'live', // live | hit | missed
            hitQuality: null,
            spawnTime: performance.now() / 1000
        });
    }

    function clear() { notes = []; }

    // Drop dead notes (already 'hit' or 'missed') older than the threshold.
    // Live notes are never removed, so the visible gameplay is unaffected.
    // Called ~once/sec from game-loop.js to keep the array bounded on long
    // sessions (it was previously append-only — unbounded growth).
    function cleanup(deadBefore) {
        let alive = 0;
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (n.state === 'live' || n.beatTime > deadBefore) {
                notes[alive++] = n;
            }
        }
        notes.length = alive;
    }

    function getActiveNotes(currentTime) {
        return notes.filter(n => n.state === 'live');
    }

    // Вызывается при тапе. Возвращает { quality, points, missedLate } или null
    // missedLate=true означает: нота была в окне, но diff > GOOD (реальный промах по ноте)
    // null означает: в окне не было ни одной ноты (тап в пустоту) — НЕ сбрасываем комбо
    function tryHit(currentTime) {
        // 1) ищем ноту в "хит-окне" [progress 0.7..1.15] — это когда игрок реально мог попасть
        let best = null;
        let bestDiff = Infinity;
        for (const n of notes) {
            if (n.state !== 'live') continue;
            const tt = getTravelTime();
            const elapsed = currentTime - (n.beatTime - tt);
            const progress = elapsed / tt;
            if (progress < 0.7 || progress > 1.15) continue;
            const diff = Math.abs(progress - 1);
            if (diff < bestDiff) { bestDiff = diff; best = n; }
        }
        // 2) если в окне нет ни одной ноты — тап в пустоту, не наказываем
        if (!best) return null;
        // 3) иначе — игрок метил в ноту
        if (bestDiff <= PERFECT_WINDOW) {
            best.state = 'hit'; best.hitQuality = 'perfect';
            return { quality: 'perfect', points: 100, combo: true };
        }
        if (bestDiff <= GOOD_WINDOW) {
            best.state = 'hit'; best.hitQuality = 'good';
            return { quality: 'good', points: 50, combo: true };
        }
        // 4) была нота, но игрок мимо — да, сброс комбо, но не двойной miss
        best.state = 'hit'; best.hitQuality = 'miss';
        return { quality: 'miss', points: 0, combo: false, missedLate: true };
    }

    function update(currentTime) {
        for (const n of notes) {
            if (n.state !== 'live') continue;
            const tt = getTravelTime();
            const elapsed = currentTime - (n.beatTime - tt);
            const progress = elapsed / tt;
            if (progress > 1.3) {
                n.state = 'missed';
                n.hitQuality = 'miss';
            }
        }
    }

    function draw(ctx, currentTime) {
        for (const n of notes) {
            if (n.state === 'hit' && n.hitQuality === 'miss') continue;
            const tt = getTravelTime();
            const elapsed = currentTime - (n.beatTime - tt);
            const progress = elapsed / tt;
            if (progress < 0 || progress > 1.3) continue;
            if (progress < 0) continue;
            const radius = n.startRadius + (targetRadius * HIT_RADIUS - n.startRadius) * easeInCubic(Math.min(1, progress));
            const x = centerX + Math.cos(n.angle) * radius;
            const y = centerY + Math.sin(n.angle) * radius;

            ctx.save();
            if (n.state === 'hit') {
                drawHitEffect(ctx, x, y, n.color, n.hitQuality, currentTime - n.beatTime);
            } else {
                drawLiveNote(ctx, x, y, n.color, progress);
            }
            ctx.restore();
        }
    }

    function drawLiveNote(ctx, x, y, color, progress) {
        const baseSize = 30 * sizeMul;
        const size = baseSize * (1 - progress * 0.3);
        const alpha = progress < 0.1 ? progress / 0.1 : (progress > 1 ? 1 - (progress - 1) / 0.3 : 1);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        // Внешнее свечение
        const grad = ctx.createRadialGradient(x, y, size * 0.3, x, y, size * 1.5);
        grad.addColorStop(0, color + 'ff');
        grad.addColorStop(0.5, color + '60');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Кольцо
        ctx.strokeStyle = color;
        ctx.lineWidth = 4 * sizeMul;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * sizeMul;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Внутренний круг
        ctx.fillStyle = color + '40';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawHitEffect(ctx, x, y, color, quality, dt) {
        const dur = quality === 'perfect' ? 0.4 : 0.3;
        const t = Math.min(1, dt / dur);
        const size = (30 + t * 60) * sizeMul;
        const alpha = 1 - t;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6 * sizeMul * (1 - t);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        // Частицы
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + dt * 4;
            const r = size * 0.7;
            const px = x + Math.cos(a) * r;
            const py = y + Math.sin(a) * r;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(px, py, 4 * sizeMul * (1 - t), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function easeInCubic(t) { return t * t * t; }

    return {
        setTarget, setCenter, spawn, clear, cleanup, update, draw, tryHit,
        getActiveNotes, getTravelTime, HIT_RADIUS, setSpeed: s => speed = Math.max(0.5, Math.min(3, s)), getSpeed: () => speed,
        setSizeMultiplier, getSizeMultiplier
    };
})();
