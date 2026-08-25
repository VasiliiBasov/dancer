/* audio.js — загрузка MP3, воспроизведение, beat-анализ */
const Audio = (() => {
    let ctx = null, buffer = null, source = null, analyser = null, gain = null, freqData = null;
    let startTime = 0, pauseOffset = 0, isPlaying = false, volume = 0.6;
    const MIN_BEAT_GAP = 0.22;
    let beatTimes = [], beatTimesAnalyzed = false;
    let onStatus = () => {};
    function setStatus(text) { onStatus(text); }

    async function load(url, statusCb) {
        if (statusCb) onStatus = statusCb;
        setStatus('Загружаем музыку...');
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const res = await fetch(url);
        if (!res.ok) throw new Error('Не удалось загрузить MP3: ' + res.status);
        const arr = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        gain = ctx.createGain();
        gain.gain.value = volume;
        analyser.connect(gain);
        gain.connect(ctx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        return buffer.duration;
    }
    function play() {
        if (!buffer || isPlaying) return;
        if (ctx.state === 'suspended') ctx.resume();
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        source.start(0, pauseOffset);
        startTime = ctx.currentTime - pauseOffset;
        isPlaying = true;
        source.onended = () => {
            if (isPlaying) {
                isPlaying = false; pauseOffset = 0;
                if (api.onEnd) api.onEnd();
            }
        };
    }
    function pause() {
        if (!isPlaying) return;
        pauseOffset = ctx.currentTime - startTime;
        try { source.stop(); } catch (e) {}
        source.disconnect();
        isPlaying = false;
    }
    function stop() {
        if (source) { try { source.stop(); } catch (e) {} source.disconnect(); }
        isPlaying = false; pauseOffset = 0;
    }
    function getCurrentTime() { return isPlaying ? ctx.currentTime - startTime : pauseOffset; }
    function getDuration() { return buffer ? buffer.duration : 0; }
    function isPlayingNow() { return isPlaying; }
    function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (gain) gain.gain.value = volume; }
    function getEnergy() {
        if (!analyser) return 0;
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        const lowEnd = Math.min(64, freqData.length);
        for (let i = 0; i < lowEnd; i++) sum += freqData[i];
        return sum / (lowEnd * 255);
    }
    async function analyzeBeats() {
        if (beatTimesAnalyzed) return beatTimes;
        if (!buffer) return [];
        setStatus('Анализируем ритм кота...');
        const offline = new OfflineAudioContext(1, buffer.length, 44100);
        const src = offline.createBufferSource();
        src.buffer = buffer; src.connect(offline.destination); src.start(0);
        const rendered = await offline.startRendering();
        const data = rendered.getChannelData(0);
        const len = data.length, hop = 1024, frameDur = hop / 44100;
        const energies = [];
        for (let pos = 0; pos + 1024 < len; pos += hop) {
            let rms = 0;
            for (let i = 0; i < 1024; i++) { const s = data[pos + i]; rms += s * s; }
            rms = Math.sqrt(rms / 1024);
            energies.push(rms);
        }
        const win = 43;
        const beats = [];
        for (let i = win; i < energies.length - win; i++) {
            let s = 0, n = 0;
            for (let k = i - win; k < i + win; k++) { s += energies[k]; n++; }
            const mean = s / n;
            let sumSq = 0;
            for (let k = i - win; k < i + win; k++) sumSq += (energies[k] - mean) ** 2;
            const v = Math.sqrt(sumSq / n);
            const threshold = mean + v * 1.3;
            const e = energies[i];
            if (e > threshold && e > energies[i - 1] && e >= energies[i + 1]) {
                const t = i * frameDur;
                if (t - (beats.length ? beats[beats.length - 1] : -10) > MIN_BEAT_GAP) {
                    beats.push(t);
                }
            }
        }
        const filtered = [];
        let lastT = -10;
        for (const t of beats) {
            if (t - lastT > 0.24) { filtered.push(t); lastT = t; }
        }
        if (filtered.length === 0 || filtered[0] > 0.6) filtered.unshift(0.5);
        beatTimes = filtered;
        beatTimesAnalyzed = true;
        setStatus('Котик готов! Нажми "Начать"');
        return beatTimes;
    }
    const api = {
        load, play, pause, stop,
        getCurrentTime, getDuration,
        isPlaying: isPlayingNow,
        setVolume, getEnergy,
        getBeats: () => beatTimes,
        analyzeBeats,
        onEnd: null
    };
    return api;
})();
