/* cat.js вЂ” РєРѕС‚-РєР°СЂС‚РёРЅРєР° (assets/cat.png, Pusheen-СЃС‚РёР»СЊ) + С„РёР·РёРєР° РїСЂС‹Р¶РєРѕРІ/РІСЂР°С‰РµРЅРёСЏ */
const Cat = (() => {
    // --- РЎРѕСЃС‚РѕСЏРЅРёРµ ---
    let gameSpeed = 1;
    // Р¤РёР·РёРєР° РїСЂС‹Р¶РєР°
    let velY = 0, posY = 0, rotation = 0, angularVel = 0;

    // РЎРїСЂР°Р№С‚ РєРѕС‚Р° вЂ” Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ Р»РµРЅРёРІРѕ РїСЂРё РїРµСЂРІРѕРј draw().
    // PNG РёРјРµРµС‚ РїСЂРѕР·СЂР°С‡РЅС‹Р№ С„РѕРЅ, СЂР°Р·РјРµСЂ 544x528 (в‰€1.03 С€РёСЂРёРЅР°/РІС‹СЃРѕС‚Р°).
    const catImg = new Image();
    let imgReady = false;
    catImg.onload = () => { imgReady = true; };
    catImg.onerror = () => { console.warn('[Cat] РЅРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ assets/cat.png'); };
    catImg.src = 'assets/cat.png';

    // РџСЂРѕРїРѕСЂС†РёРё PNG (width / height). РЎРёР»СѓСЌС‚ РєРѕС‚Р° РІ PNG РІС‹С‚СЏРЅСѓС‚ С‡СѓС‚СЊ-С‡СѓС‚СЊ РїРѕ РІРµСЂС‚РёРєР°Р»Рё,
    // РїРѕСЌС‚РѕРјСѓ РїСЂРё СЂРµРЅРґРµСЂРµ РјС‹ С‡СѓС‚СЊ СЃР¶РёРјР°РµРј РїРѕ РІС‹СЃРѕС‚Рµ С‡С‚РѕР±С‹ РєРѕС‚ РЅРµ РєР°Р·Р°Р»СЃСЏ РІС‹СЃРѕРєРёРј.
    const IMG_W = 544;
    const IMG_H = 528;

    function setGameSpeed(s) { gameSpeed = Math.max(0.5, Math.min(3, s)); }

    // РџСЂРё С‚Р°РїРµ: РїСЂС‹Р¶РѕРє. Р§РµРј РІС‹С€Рµ gameSpeed вЂ” С‚РµРј РІС‹С€Рµ Рё СЃ РІСЂР°С‰РµРЅРёРµРј.
    function jump(tiny) {
        if (velY > -200) {
            if (tiny) {
                // baseJump подобран так, чтобы пик высоты был ~15 пикс (было ~30)
                // при любой gameSpeed. 15px => |velY| = sqrt(2*2200*15) ~ 257
                // Высоты уменьшены до 0.75 от исходной (×sqrt(0.75) ≈ 0.866 к начальной скорости,
                // потому что h = v²/(2g) — для высоты 0.75h нужна v в √0.75 раз меньше).
                velY = -380 * Math.sqrt(0.75);
                angularVel = 0;
            } else {
                // Высоты прыжков уменьшены до 0.75 от исходной (×sqrt(0.75) ≈ 0.866 к начальной скорости,
                // потому что h = v²/(2g) — для высоты 0.75h нужна v в √0.75 раз меньше).
                const baseJump = (-550 - gameSpeed * 75) * Math.sqrt(0.75);
                velY = baseJump;
                if (gameSpeed > 1.8) {
                    angularVel = (Math.random() > 0.5 ? 1 : -1) * (8 + gameSpeed * 6);
                } else if (gameSpeed > 1.3) {
                    angularVel = (Math.random() > 0.5 ? 1 : -1) * 3;
                } else {
                    angularVel = 0;
                }
            }
        }
    }

    // --- Р РёСЃРѕРІР°РЅРёРµ ---
    // РҐРІРѕСЃС‚/С‚РµР»Рѕ/РјРѕСЂРґР° вЂ” СЌС‚Рѕ СЂР°СЃС‚СЂРѕРІР°СЏ РєР°СЂС‚РёРЅРєР° РІ assets/cat.png (РїСЂРѕР·СЂР°С‡РЅС‹Р№ С„РѕРЅ),
    // РїРѕСЌС‚РѕРјСѓ РЅР°Рј РЅСѓР¶РЅРѕ С‚РѕР»СЊРєРѕ: С‚РµРЅСЊ РїРѕРґ РєРѕС‚РѕРј + drawImage СЃ РІСЂР°С‰РµРЅРёРµРј/РїСЂС‹Р¶РєРѕРј.
    // Mirror state: 1 = normal, -1 = flipped horizontally. Toggled by game-loop
    // during the slow phase as a small visual variety beat.
    let mirror = 1;
    function setMirror(d) { mirror = d >= 0 ? 1 : -1; }
    function toggleMirror() { mirror = -mirror; }

    function draw(c, cx, cy, size) {
        if (!imgReady) return; // sprite not ready yet
        if (!c || !isFinite(cx) || !isFinite(cy) || !isFinite(size) || size <= 0) return;
        // Any canvas-API throw (rotate+drawImage of a tall transparent PNG on
        // some GPU compositors) must not freeze the rAF loop. We reset
        // rotation/angularVel and let the next frame redraw cleanly.
        try {

        c.save();
        const y = cy + posY;
        c.translate(cx, y);
        c.rotate(rotation);

        // Shadow under the cat. The higher the jump, the smaller and fainter.
        const heightFactor = Math.max(0.25, 1 - Math.max(0, -posY) / (size * 2));
        c.save();
        c.globalAlpha = 0.28 * heightFactor;
        c.fillStyle = '#000';
        c.beginPath();
        c.ellipse(0, size * 0.55, size * 0.45 * heightFactor, size * 0.07 * heightFactor, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();

        // Cat bitmap. Keep PNG aspect (~1.03:1) and fit into size x size.
        const aspect = IMG_W / IMG_H;
        let drawW, drawH;
        if (aspect >= 1) {
            drawW = size;
            drawH = size / aspect;
        } else {
            drawH = size;
            drawW = size * aspect;
        }
        c.scale(mirror, 1);
        c.drawImage(catImg, -drawW / 2, -drawH / 2, drawW, drawH);

        c.restore();
        } catch (err) {
            try { c.restore(); } catch (_) {}
            try { console.error('[Cat] draw failed, resetting rotation:', (err && (err.stack || err.message)) || err); } catch (_) {}
            rotation = 0;
            angularVel = 0;
        }
    }

    // Cat is bounded by the current canvas top (slightly inside so the head
    // is just above the visible area). size = current cat height, cy = center Y.
    // Computed on demand from _bounds which game.js keeps in sync via setBounds().
    let _bounds = { cx: 0, cy: 0, size: 100 };
    function setBounds(cx, cy, size) { _bounds.cx = cx; _bounds.cy = cy; _bounds.size = size; }
    function getMaxUp() {
        // cat centered at (cy + posY); posY negative = up. We allow the cat to
        // rise a tiny bit above the canvas so the top of the head almost reaches y=0.
        return -(_bounds.cy - _bounds.size * 0.55);
    }

    function update(dt) {
        // Guard dt: NaN/negative/exploded frame must not poison physics.
        if (!isFinite(dt) || dt < 0) dt = 0;
        if (dt > 0.1) dt = 0.1;
        // Р“СЂР°РІРёС‚Р°С†РёСЏ + РїСЂСѓР¶РёРЅСЏС‰РёР№ РІРѕР·РІСЂР°С‚ РІРЅРёР·
        const GRAVITY = 2200;
        velY += GRAVITY * dt;
        posY += velY * dt;
        const MAX_UP = getMaxUp(); if (posY < MAX_UP) { posY = MAX_UP; if (velY < 0) velY = 0; }
        if (posY >= 0) {
            posY = 0; velY = 0;
            rotation = 0; angularVel = 0;
        }
        // Р’СЂР°С‰РµРЅРёРµ РїРѕ РёРЅРµСЂС†РёРё (Р·Р°С‚СѓС…Р°РµС‚)
        rotation += angularVel * dt;
        // Bound the accumulated angle. ctx.rotate(150) is mathematically fine, but
        // some GPU compositors (mobile Safari / older Chrome) choke on
        // ctx.rotate(huge) + drawImage of a tall transparent PNG, and that has
        // been observed to lock the rAF loop after a tap. Trigonometric identity
        // makes the modulo visually invisible.
        if (!isFinite(rotation)) { rotation = 0; angularVel = 0; }
        else if (Math.abs(rotation) > 6.2831853) {
            rotation = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        }
        angularVel *= Math.pow(0.5, dt * 3);
    }

    // Getter: текущая Y-позиция головы кота (cy + posY). Используется, чтобы
    // рисовать надпись «итоговый счёт» ровно над котом, а не в произвольном
    // месте. Без этого текст «съезжал» бы во время прыжков.
    function getHeadY() { return _bounds.cy + posY; }
    return { draw, update, jump, setGameSpeed, setBounds, setMirror, toggleMirror, getHeadY };
})();
