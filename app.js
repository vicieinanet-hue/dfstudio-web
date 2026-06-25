// ================================================================
// DF STUDIO PRO - WEB APP (COMPLETO E CORRIGIDO)
// ================================================================

// ===== ESTADO GLOBAL =====
const state = {
    audioCtx: null,
    processorNode: null,
    micGainNode: null,
    playGainNode: null,
    masterGainNode: null,
    monGainNode: null,
    analyserMic: null,
    analyserPlay: null,
    analyserMaster: null,
    audioBuffer: null,
    sourceNode: null,
    isPlaying: false,
    playbackPosition: 0,
    sourceStartTime: 0,
    markers: [],
    micMuted: false,
    playMuted: true,
    masterMuted: false,
    micSolo: false,
    playSolo: false,
    playMono: false,
    monitorEnabled: true,
    fxEnabled: true,
    autotuneEnabled: false,
    atKey: 'C',
    atMode: 'MAIOR',
    atSpeed: 14,
    atAmount: 0.65,
    atFormant: 0,
    atDetune: 0,
    autoKeyEnabled: true,
    effects: {
        reverb: false,
        reverbMix: 0.25,
        delay: false,
        delayMix: 0.20,
        delayTime: 250,
        delayFb: 0.4,
        chorus: false,
        chorusMix: 0.3,
        chorusRate: 0.5,
        eq: false,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        comp: false,
        compRatio: 4,
        compThresh: -20,
        gate: false,
        gateThresh: -45
    },
    vuInterval: null,
    tunerActive: false,
    tunerString: -1,
    recordedChunks: [],
    isRecording: false,
    recordingStartTime: 0,
    recDuration: 0,
    recTimer: null,
    recorder: null
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STRING_FREQS = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
const STRING_NAMES = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const logMsg = msg => { console.log(msg); const el = $('logMsg'); if(el) el.textContent = msg; };
const showError = msg => { $('errorMsg').textContent = msg; $('startBtn').style.display = 'block'; };

// ================================================================
// INICIALIZAÇÃO
// ================================================================

async function initAudio() {
    try {
        $('startBtn').style.display = 'none';
        $('errorMsg').textContent = '';
        logMsg('A criar AudioContext...');

        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
            sampleRate: 48000
        });

        // Carregar AudioWorklet
        logMsg('A carregar AudioWorklet...');
        await state.audioCtx.audioWorklet.addModule('audio-processor.js');
        state.processorNode = new AudioWorkletNode(state.audioCtx, 'audio-processor');
        logMsg('AudioWorklet carregado!');

        // Configurar listener do processor
        setupProcessorListener();

        // Configurar nós
        state.micGainNode = state.audioCtx.createGain();
        state.micGainNode.gain.value = 2.6;

        state.playGainNode = state.audioCtx.createGain();
        state.playGainNode.gain.value = 0;

        state.masterGainNode = state.audioCtx.createGain();
        state.masterGainNode.gain.value = 0.5;

        state.monGainNode = state.audioCtx.createGain();
        state.monGainNode.gain.value = 0.5;

        state.analyserMic = state.audioCtx.createAnalyser();
        state.analyserMic.fftSize = 256;

        state.analyserPlay = state.audioCtx.createAnalyser();
        state.analyserPlay.fftSize = 256;

        state.analyserMaster = state.audioCtx.createAnalyser();
        state.analyserMaster.fftSize = 256;

        // Roteamento: Mic → Processador → Analisador → Monitor → Master
        state.micGainNode.connect(state.processorNode);
        state.processorNode.connect(state.analyserMic);
        state.analyserMic.connect(state.monGainNode);
        state.monGainNode.connect(state.masterGainNode);

        // Playback → Master
        state.playGainNode.connect(state.analyserPlay);
        state.analyserPlay.connect(state.masterGainNode);

        state.masterGainNode.connect(state.analyserMaster);
        state.masterGainNode.connect(state.audioCtx.destination);

        // Configurar efeitos no processor
        syncEffectsToProcessor();
        syncAutotuneToProcessor();

        // Pedir microfone
        logMsg('A pedir microfone...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0.01
                }
            });
            const micSource = state.audioCtx.createMediaStreamSource(stream);
            micSource.connect(state.micGainNode);
            logMsg('Microfone OK!');
        } catch (micErr) {
            logMsg('Microfone indisponivel: ' + micErr.message);
            showError('Erro no microfone. Permita o acesso.');
        }

        // Atualizar UI
        $('sampleRate').textContent = (state.audioCtx.sampleRate / 1000).toFixed(1) + 'k';
        $('bufferSize').textContent = '128b';

        // Estatísticas
        state.vuInterval = setInterval(updateUI, 50);

        // Esconder splash
        $('splash').style.display = 'none';
        $('app').classList.add('visible');

        // Inicializar teclado piano
        initPianoKeys();

        logMsg('✅ DF STUDIO PRONTO! Latência: ~' + Math.round(state.audioCtx.baseLatency * 1000) + 'ms');

    } catch (e) {
        logMsg('ERRO: ' + e.message);
        showError('Toque no botao para tentar novamente');
    }
}

// ================================================================
// UI UPDATE
// ================================================================

function updateUI() {
    if (!state.audioCtx) return;
    try {
        const lat = state.audioCtx.baseLatency * 1000;
        $('latency').textContent = Math.round(lat) + 'ms';

        $('voiceVuFill').style.height = (getVu(state.analyserMic) * 100) + '%';
        $('playVuFill').style.height = (getVu(state.analyserPlay) * 100) + '%';
        $('masterVuFill').style.height = (getVu(state.analyserMaster) * 100) + '%';

        if (state.isPlaying && state.audioBuffer) {
            const ct = state.audioCtx.currentTime - state.sourceStartTime;
            $('currentTime').textContent = formatTime(ct);
            $('seekBar').value = (ct / state.audioBuffer.duration) * 1000 || 0;
        }
    } catch (e) {}
}

function getVu(analyser) {
    if (!analyser) return 0;
    const data = new Uint8Array(128);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
    return Math.min(1, (sum / data.length) / 128 * 2.5);
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
}

// ================================================================
// MIC / GAIN CONTROLS
// ================================================================

function setMicGain(v) {
    const val = v / 100;
    if (state.micGainNode) {
        state.micGainNode.gain.value = state.micMuted ? 0 : val * 4;
    }
}

function setPlayGain(v) {
    const val = v / 100;
    if (state.playGainNode) {
        state.playGainNode.gain.value = state.playMuted ? 0 : val;
    }
}

function setMasterGain(v) {
    const val = v / 100;
    if (state.masterGainNode) {
        state.masterGainNode.gain.value = state.masterMuted ? 0 : val;
    }
}

function setMonGain(v) {
    const val = v / 100;
    if (state.monGainNode) {
        state.monGainNode.gain.value = state.monitorEnabled ? val : 0;
    }
}

// ================================================================
// MUTE / SOLO
// ================================================================

function toggleMute(ch) {
    let muted;
    if (ch === 'voice') {
        state.micMuted = !state.micMuted;
        muted = state.micMuted;
        setMicGain(parseFloat($('micGain').value));
        $('voiceMute').classList.toggle('mute-active', muted);
    } else if (ch === 'play') {
        state.playMuted = !state.playMuted;
        muted = state.playMuted;
        setPlayGain(parseFloat($('playGain').value));
        $('playMute').classList.toggle('mute-active', muted);
    } else {
        state.masterMuted = !state.masterMuted;
        muted = state.masterMuted;
        setMasterGain(parseFloat($('masterFader').value));
        $('masterMute').classList.toggle('mute-active', muted);
    }
}

function toggleSolo(ch) {
    if (ch === 'voice') {
        state.micSolo = !state.micSolo;
        if (state.micSolo) {
            state.playSolo = false;
            $('playSolo').classList.remove('solo-active');
        }
        $('voiceSolo').classList.toggle('solo-active', state.micSolo);
    } else {
        state.playSolo = !state.playSolo;
        if (state.playSolo) {
            state.micSolo = false;
            $('voiceSolo').classList.remove('solo-active');
        }
        $('playSolo').classList.toggle('solo-active', state.playSolo);
    }
}

function togglePlayMono() {
    state.playMono = !state.playMono;
    $('playMonoBtn').classList.toggle('active', state.playMono);
    if (state.processorNode) {
        state.processorNode.port.postMessage({
            type: 'setPlayMono',
            value: state.playMono
        });
    }
}

function toggleMonitor() {
    state.monitorEnabled = !state.monitorEnabled;
    setMonGain(parseFloat($('monGain').value));
    $('monitorBtn').classList.toggle('active', state.monitorEnabled);
    if (state.processorNode) {
        state.processorNode.port.postMessage({
            type: 'setMonitor',
            value: state.monitorEnabled
        });
    }
}

function setPan(ch, val) {
    if (state.processorNode) {
        state.processorNode.port.postMessage({
            type: 'setPan',
            channel: ch,
            value: val
        });
    }
    // UI feedback
    const container = ch === 'voice' ? $('channelVoice') : ch === 'play' ? $('channelPlay') : $('channelMaster');
    container.querySelectorAll('.btn-row button').forEach(btn => {
        const label = btn.textContent.trim();
        if (label === 'L' || label === 'C' || label === 'R') {
            const isActive = (label === 'L' && val <= -0.33) ||
                           (label === 'C' && Math.abs(val) < 0.33) ||
                           (label === 'R' && val >= 0.33);
            btn.classList.toggle('active', isActive);
        }
    });
}

// ================================================================
// FX MASTER
// ================================================================

function toggleFx() {
    state.fxEnabled = !state.fxEnabled;
    $('fxBtn').classList.toggle('active', state.fxEnabled);
    $('fxMasterToggle').classList.toggle('active', state.fxEnabled);
    if (state.processorNode) {
        state.processorNode.port.postMessage({
            type: 'setFxMaster',
            value: state.fxEnabled
        });
    }
}

function toggleFxMaster() {
    state.fxEnabled = !state.fxEnabled;
    $('fxBtn').classList.toggle('active', state.fxEnabled);
    $('fxMasterToggle').classList.toggle('active', state.fxEnabled);
    if (state.processorNode) {
        state.processorNode.port.postMessage({
            type: 'setFxMaster',
            value: state.fxEnabled
        });
    }
}

// ================================================================
// EFFECTS
// ================================================================

function toggleEffect(name) {
    const toggle = $(name + 'Toggle');
    if (!toggle) return;
    const isOn = toggle.classList.contains('active');
    toggle.classList.toggle('active', !isOn);
    state.effects[name] = !isOn;
    syncEffectsToProcessor();
}

function syncEffectsToProcessor() {
    if (!state.processorNode) return;
    const e = state.effects;
    state.processorNode.port.postMessage({
        type: 'setEffects',
        data: {
            reverb: e.reverb,
            reverbMix: e.reverbMix,
            delay: e.delay,
            delayMix: e.delayMix,
            delayTime: e.delayTime,
            delayFb: e.delayFb,
            chorus: e.chorus,
            chorusMix: e.chorusMix,
            chorusRate: e.chorusRate,
            eq: e.eq,
            eqLow: e.eqLow,
            eqMid: e.eqMid,
            eqHigh: e.eqHigh,
            comp: e.comp,
            compRatio: e.compRatio,
            compThresh: e.compThresh,
            gate: e.gate,
            gateThresh: e.gateThresh
        }
    });
}

// ================================================================
// AUTO-TUNE
// ================================================================

function toggleAutotune() {
    state.autotuneEnabled = !state.autotuneEnabled;
    $('atBtn').classList.toggle('active', state.autotuneEnabled);
    $('atMasterToggle').classList.toggle('active', state.autotuneEnabled);
    syncAutotuneToProcessor();
}

function toggleAutotuneMaster() {
    state.autotuneEnabled = !state.autotuneEnabled;
    $('atBtn').classList.toggle('active', state.autotuneEnabled);
    $('atMasterToggle').classList.toggle('active', state.autotuneEnabled);
    syncAutotuneToProcessor();
}

function syncAutotuneToProcessor() {
    if (!state.processorNode) return;
    state.processorNode.port.postMessage({
        type: 'setAutotune',
        data: {
            enabled: state.autotuneEnabled,
            key: state.atKey,
            mode: state.atMode,
            speed: state.atSpeed,
            amount: state.atAmount,
            formant: state.atFormant,
            detune: state.atDetune,
            autoKey: state.autoKeyEnabled
        }
    });
}

function initPianoKeys() {
    const container = $('pianoKeys');
    if (!container) return;
    container.innerHTML = '';
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    keys.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'piano-key' + (key.includes('#') ? ' sharp' : '');
        btn.textContent = key;
        btn.dataset.key = key;
        btn.onclick = () => setAtKey(key);
        if (key === state.atKey) btn.classList.add('active');
        container.appendChild(btn);
    });
}

function setAtKey(key) {
    state.atKey = key;
    document.querySelectorAll('#pianoKeys .piano-key').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === key);
    });
    syncAutotuneToProcessor();
}

function setAtMode(mode) {
    state.atMode = mode;
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    syncAutotuneToProcessor();
}

function toggleAutoKey() {
    state.autoKeyEnabled = !state.autoKeyEnabled;
    $('autoKeyToggle').classList.toggle('active', state.autoKeyEnabled);
    syncAutotuneToProcessor();
}

function applyPreset(name) {
    const presets = {
        'FORRO': { key: 'C', mode: 'MAIOR', speed: 14, amount: 0.52, formant: 0, detune: 0 },
        'PISEIRO': { key: 'C', mode: 'MENOR', speed: 7, amount: 0.72, formant: 0, detune: -2 },
        'SERTANEJO': { key: 'C', mode: 'MAIOR', speed: 18, amount: 0.42, formant: 0, detune: 0 }
    };
    const p = presets[name];
    if (!p) return;
    state.atKey = p.key;
    state.atMode = p.mode;
    state.atSpeed = p.speed;
    state.atAmount = p.amount;
    state.atFormant = p.formant;
    state.atDetune = p.detune;

    // UI
    document.querySelectorAll('#pianoKeys .piano-key').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === p.key);
    });
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === p.mode);
    });
    $('atSpeed').value = p.speed;
    $('atSpeedVal').textContent = p.speed + 'ms';
    $('atAmount').value = p.amount * 100;
    $('atAmountVal').textContent = Math.round(p.amount * 100) + '%';
    $('atFormant').value = p.formant;
    $('atFormantVal').textContent = p.formant;
    $('atDetune').value = p.detune;
    $('atDetuneVal').textContent = p.detune + 'c';

    if (!state.autotuneEnabled) toggleAutotune();
    syncAutotuneToProcessor();
}

function resetAutotune() {
    state.atKey = 'C';
    state.atMode = 'MAIOR';
    state.atSpeed = 14;
    state.atAmount = 0.65;
    state.atFormant = 0;
    state.atDetune = 0;
    state.autoKeyEnabled = true;

    document.querySelectorAll('#pianoKeys .piano-key').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === 'C');
    });
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === 'MAIOR');
    });
    $('atSpeed').value = 14;
    $('atSpeedVal').textContent = '14ms';
    $('atAmount').value = 65;
    $('atAmountVal').textContent = '65%';
    $('atFormant').value = 0;
    $('atFormantVal').textContent = '0';
    $('atDetune').value = 0;
    $('atDetuneVal').textContent = '0c';
    $('autoKeyToggle').classList.add('active');

    syncAutotuneToProcessor();
}

// ================================================================
// PLAYBACK
// ================================================================

function togglePlay() {
    if (state.isPlaying) {
        try { state.sourceNode.stop(); } catch(e) {}
        state.isPlaying = false;
        $('playBtn').textContent = '▶️';
    } else if (state.audioBuffer) {
        playFromPosition(state.playbackPosition);
        $('playBtn').textContent = '⏸️';
    }
}

function stopTrack() {
    try { state.sourceNode.stop(); } catch(e) {}
    state.isPlaying = false;
    state.playbackPosition = 0;
    $('playBtn').textContent = '▶️';
    $('seekBar').value = 0;
    $('currentTime').textContent = '00:00';
}

function prevTrack() {
    stopTrack();
    playFromPosition(0);
}

function nextTrack() {
    stopTrack();
    playFromPosition(0);
}

function playFromPosition(pos) {
    if (!state.audioBuffer || !state.audioCtx) return;
    try { state.sourceNode.stop(); } catch(e) {}
    state.sourceNode = state.audioCtx.createBufferSource();
    state.sourceNode.buffer = state.audioBuffer;
    state.sourceNode.connect(state.playGainNode);
    state.sourceNode.start(0, pos || 0);
    state.isPlaying = true;
    state.playbackPosition = pos || 0;
    state.sourceStartTime = state.audioCtx.currentTime - (pos || 0);
    $('playBtn').textContent = '⏸️';
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const buf = await file.arrayBuffer();
        state.audioBuffer = await state.audioCtx.decodeAudioData(buf);
        $('trackName').textContent = '🎵 ' + file.name.replace(/\.[^/.]+$/, '');
        $('durationTime').textContent = formatTime(state.audioBuffer.duration);
        loadMarkersForTrack(file.name);
        playFromPosition(0);
    } catch (e) {
        logMsg('Erro: ' + e.message);
    }
}

// ================================================================
// MARKERS
// ================================================================

function showMarkerDialog() {
    $('markerDialog').classList.add('visible');
}

function closeMarkerDialog() {
    $('markerDialog').classList.remove('visible');
}

function toggleManualTime() {
    const checked = $('useCurrentTime').checked;
    $('manualTime').style.display = checked ? 'none' : 'flex';
}

function saveMarker() {
    const name = $('markerName').value || 'Marcador';
    let timeUs;
    if ($('useCurrentTime').checked) {
        timeUs = (state.audioCtx.currentTime - state.sourceStartTime) * 1000000;
    } else {
        const min = parseInt($('markerMin').value) || 0;
        const sec = parseInt($('markerSec').value) || 0;
        const ms = parseInt($('markerMs').value) || 0;
        timeUs = (min * 60 + sec) * 1000000 + ms * 1000;
    }
    state.markers.push({ name, timeUs });
    updateMarkerUI();
    closeMarkerDialog();
    $('markerName').value = '';
}

function updateMarkerUI() {
    $('markerCount').textContent = state.markers.length + ' marc';
    const trackName = $('trackName').textContent.replace('🎵 ', '');
    if (trackName && trackName !== 'Nenhuma música carregada') {
        try {
            localStorage.setItem('markers_' + trackName, JSON.stringify(state.markers));
        } catch(e) {}
    }
}

function loadMarkersForTrack(trackName) {
    try {
        const data = localStorage.getItem('markers_' + trackName);
        if (data) {
            state.markers = JSON.parse(data);
            updateMarkerUI();
        } else {
            state.markers = [];
            updateMarkerUI();
        }
    } catch(e) {
        state.markers = [];
        updateMarkerUI();
    }
}

function prevMarker() {
    if (!state.markers.length) return;
    const cur = (state.audioCtx.currentTime - state.sourceStartTime) * 1000000;
    const sorted = [...state.markers].sort((a, b) => a.timeUs - b.timeUs);
    const prev = sorted.filter(m => m.timeUs < cur - 500000).pop() || sorted[sorted.length - 1];
    if (prev) playFromPosition(prev.timeUs / 1000000);
}

function nextMarker() {
    if (!state.markers.length) return;
    const cur = (state.audioCtx.currentTime - state.sourceStartTime) * 1000000;
    const sorted = [...state.markers].sort((a, b) => a.timeUs - b.timeUs);
    const next = sorted.find(m => m.timeUs > cur + 500000) || sorted[0];
    if (next) playFromPosition(next.timeUs / 1000000);
}

function showMarkersList() {
    const container = $('markersListContainer');
    container.innerHTML = '';
    const sorted = [...state.markers].sort((a, b) => a.timeUs - b.timeUs);
    sorted.forEach((m, i) => {
        const totalMs = m.timeUs / 1000;
        const h = Math.floor(totalMs / 3600000);
        const min = Math.floor((totalMs % 3600000) / 60000);
        const sec = Math.floor((totalMs % 60000) / 1000);
        const ms = Math.floor(totalMs % 1000);
        const timeStr = h > 0 ? `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}` :
                               `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
        const div = document.createElement('div');
        div.className = 'marker-item';
        div.innerHTML = `
            <span class="time">${timeStr}</span>
            <span class="name">${m.name}</span>
            <span class="del" onclick="deleteMarker(${i})">✕</span>
        `;
        div.onclick = () => playFromPosition(m.timeUs / 1000000);
        container.appendChild(div);
    });
    $('markersListDialog').classList.add('visible');
}

function closeMarkersList() {
    $('markersListDialog').classList.remove('visible');
}

function deleteMarker(index) {
    state.markers.splice(index, 1);
    updateMarkerUI();
    showMarkersList();
}

// ================================================================
// TABS
// ================================================================

function switchTab(tab) {
    document.querySelectorAll('.nav-bar button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-bar button[data-tab="${tab}"]`).classList.add('active');

    $('mixerContainer').style.display = tab === 'mixer' ? 'flex' : 'none';
    $('effectsPanel').classList.toggle('visible', tab === 'effects');
    $('autotunePanel').classList.toggle('visible', tab === 'autotune');
    $('libraryPanel').style.display = tab === 'library' ? 'flex' : 'none';
    $('settingsPanel').style.display = tab === 'settings' ? 'flex' : 'none';

    if (tab === 'library') updateLibraryList();
}

// ================================================================
// LIBRARY
// ================================================================

function updateLibraryList() {
    const container = $('libraryList');
    if (!container) return;
    container.innerHTML = '';
    try {
        const tracks = JSON.parse(localStorage.getItem('library_tracks') || '[]');
        if (tracks.length === 0) {
            container.innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px;">Nenhuma música importada</div>';
            return;
        }
        tracks.forEach((track, i) => {
            const div = document.createElement('div');
            div.className = 'marker-item';
            div.innerHTML = `
                <span class="name">${track.name}</span>
                <span style="color:var(--text2);font-size:9px;">${track.size}</span>
                <span class="del" onclick="removeTrack(${i})">✕</span>
            `;
            div.onclick = () => loadTrackFromStorage(track);
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px;">Erro ao carregar biblioteca</div>';
    }
}

function loadTrackFromStorage(track) {
    alert('Carregue a música novamente usando o botão 📁');
}

function removeTrack(index) {
    try {
        const tracks = JSON.parse(localStorage.getItem('library_tracks') || '[]');
        tracks.splice(index, 1);
        localStorage.setItem('library_tracks', JSON.stringify(tracks));
        updateLibraryList();
    } catch(e) {}
}

// ================================================================
// TUNER
// ================================================================

function openTuner() {
    $('tunerDialog').classList.add('visible');
    state.tunerActive = true;
    // Reset UI
    document.getElementById('tunerMeter').style.width = '50%';
    document.getElementById('tunerMeter').style.background = '#FF6D00';
    document.getElementById('tunerStatus').textContent = 'Toque uma nota';
    document.getElementById('tunerNote').textContent = '--';
    document.getElementById('tunerFreq').textContent = '0 Hz';
    // Reset selected string
    state.tunerString = -1;
    document.querySelectorAll('#tunerDialog .piano-key').forEach(btn => btn.classList.remove('active'));
    startTunerDetection();
}

function closeTuner() {
    $('tunerDialog').classList.remove('visible');
    state.tunerActive = false;
    state.tunerString = -1;
    if (state.processorNode) {
        state.processorNode.port.postMessage({ type: 'stopTuner' });
    }
}

function selectTunerString(index) {
    state.tunerString = index;
    document.querySelectorAll('#tunerDialog .piano-key').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
}

function startTunerDetection() {
    if (!state.processorNode) return;
    state.processorNode.port.postMessage({ type: 'startTuner' });
}

function updateTunerUI(freq, note) {
    if (!state.tunerActive) return;
    
    const noteEl = document.getElementById('tunerNote');
    const freqEl = document.getElementById('tunerFreq');
    const meterEl = document.getElementById('tunerMeter');
    const statusEl = document.getElementById('tunerStatus');
    
    if (!noteEl) return;
    
    noteEl.textContent = note || '--';
    noteEl.style.color = note && note !== '--' ? '#00BCD4' : '#666';
    
    freqEl.textContent = (freq || 0).toFixed(1) + ' Hz';

    let targetFreq = 0;
    if (state.tunerString >= 0 && state.tunerString < STRING_FREQS.length) {
        targetFreq = STRING_FREQS[state.tunerString];
    } else if (freq > 0) {
        let minDiff = Infinity;
        STRING_FREQS.forEach((f, i) => {
            const diff = Math.abs(freq - f);
            if (diff < minDiff) { minDiff = diff; targetFreq = f; }
        });
    }
    
    if (targetFreq > 0 && freq > 0) {
        const cents = 1200 * Math.log2(freq / targetFreq);
        const percent = 50 + cents / 50 * 25;
        meterEl.style.width = Math.max(0, Math.min(100, percent)) + '%';
        
        const absCents = Math.abs(cents);
        let status = 'Toque uma nota';
        let color = '#FF6D00';
        if (absCents < 3) { 
            status = '✅ AFINADO!'; 
            color = '#76FF03'; 
        } else if (cents < 0) { 
            status = '🔽 BAIXO ' + Math.round(absCents) + 'c'; 
            color = '#FFD600'; 
        } else { 
            status = '🔼 ALTO ' + Math.round(absCents) + 'c'; 
            color = '#FF1744'; 
        }
        statusEl.textContent = status;
        meterEl.style.background = color;
    } else {
        meterEl.style.width = '50%';
        statusEl.textContent = freq > 0 ? 'Detectando...' : 'Toque uma nota';
        meterEl.style.background = '#FF6D00';
    }
}

// ================================================================
// BACKUP
// ================================================================

function exportBackup() {
    const data = {
        version: 1,
        timestamp: Date.now(),
        markers: state.markers,
        settings: {
            fxEnabled: state.fxEnabled,
            autotuneEnabled: state.autotuneEnabled,
            atKey: state.atKey,
            atMode: state.atMode,
            atSpeed: state.atSpeed,
            atAmount: state.atAmount,
            effects: state.effects
        }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DF_Studio_Backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.markers) {
                state.markers = data.markers;
                updateMarkerUI();
            }
            if (data.settings) {
                state.fxEnabled = data.settings.fxEnabled ?? true;
                state.autotuneEnabled = data.settings.autotuneEnabled ?? false;
                state.atKey = data.settings.atKey || 'C';
                state.atMode = data.settings.atMode || 'MAIOR';
                state.atSpeed = data.settings.atSpeed || 14;
                state.atAmount = data.settings.atAmount || 0.65;
                if (data.settings.effects) {
                    Object.assign(state.effects, data.settings.effects);
                }
                $('fxBtn').classList.toggle('active', state.fxEnabled);
                $('fxMasterToggle').classList.toggle('active', state.fxEnabled);
                $('atBtn').classList.toggle('active', state.autotuneEnabled);
                $('atMasterToggle').classList.toggle('active', state.autotuneEnabled);
                syncEffectsToProcessor();
                syncAutotuneToProcessor();
            }
            alert('✅ Backup importado com sucesso!');
        } catch(err) {
            alert('❌ Erro ao importar backup: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// ================================================================
// GRAVAÇÃO
// ================================================================

function startRecording() {
    if (state.isRecording || !state.audioCtx) return;
    state.isRecording = true;
    state.recordedChunks = [];
    state.recordingStartTime = Date.now();

    const dest = state.audioCtx.createMediaStreamDestination();
    state.masterGainNode.connect(dest);

    const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = e => {
        if (e.data.size > 0) state.recordedChunks.push(e.data);
    };
    recorder.onstop = () => {
        const blob = new Blob(state.recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'DF_Studio_Recording_' + new Date().toISOString().slice(0,19).replace(/[:-]/g, '') + '.webm';
        a.click();
        URL.revokeObjectURL(url);
        state.masterGainNode.disconnect(dest);
        state.isRecording = false;
        if (state.recTimer) {
            clearInterval(state.recTimer);
            state.recTimer = null;
        }
        logMsg('⏹️ Gravação finalizada');
    };

    state.recorder = recorder;
    recorder.start(1000);

    state.recTimer = setInterval(() => {
        state.recDuration = Math.floor((Date.now() - state.recordingStartTime) / 1000);
    }, 500);

    logMsg('🔴 Gravando...');
}

function stopRecording() {
    if (state.recorder && state.isRecording) {
        state.recorder.stop();
    }
}

// ================================================================
// PROCESSOR LISTENER
// ================================================================

function setupProcessorListener() {
    if (!state.processorNode) return;
    state.processorNode.port.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'pitchDetected') {
            $('detectedPitch').textContent = msg.frequency + ' Hz';
            $('detectedKey').textContent = msg.note || '--';
            if (state.tunerActive) {
                updateTunerUI(msg.frequency, msg.note);
            }
        }
        if (msg.type === 'tunerData') {
            updateTunerUI(msg.frequency, msg.note);
        }
    };
}

// ================================================================
// EVENT LISTENERS
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    $('startBtn').addEventListener('click', initAudio);

    // Sliders
    $('micGain').addEventListener('input', e => setMicGain(parseFloat(e.target.value)));
    $('voiceFader').addEventListener('input', e => setMicGain(parseFloat(e.target.value)));
    $('playGain').addEventListener('input', e => setPlayGain(parseFloat(e.target.value)));
    $('playFader').addEventListener('input', e => setPlayGain(parseFloat(e.target.value)));
    $('masterFader').addEventListener('input', e => setMasterGain(parseFloat(e.target.value)));
    $('monGain').addEventListener('input', e => setMonGain(parseFloat(e.target.value)));

    // Seek bar
    $('seekBar').addEventListener('input', e => {
        if (state.audioBuffer) {
            const pos = (e.target.value / 1000) * state.audioBuffer.duration;
            if (state.isPlaying) {
                try { state.sourceNode.stop(); } catch(e) {}
                playFromPosition(pos);
            } else {
                state.playbackPosition = pos;
            }
        }
    });

    // Effects sliders
    $('revMix').addEventListener('input', e => {
        state.effects.reverbMix = parseFloat(e.target.value) / 100;
        $('revMixVal').textContent = e.target.value + '%';
        syncEffectsToProcessor();
    });
    $('delayMix').addEventListener('input', e => {
        state.effects.delayMix = parseFloat(e.target.value) / 100;
        $('delayMixVal').textContent = e.target.value + '%';
        syncEffectsToProcessor();
    });
    $('delayTime').addEventListener('input', e => {
        state.effects.delayTime = parseFloat(e.target.value);
        $('delayTimeVal').textContent = e.target.value + 'ms';
        syncEffectsToProcessor();
    });
    $('delayFb').addEventListener('input', e => {
        state.effects.delayFb = parseFloat(e.target.value) / 100;
        $('delayFbVal').textContent = e.target.value + '%';
        syncEffectsToProcessor();
    });
    $('chorusMix').addEventListener('input', e => {
        state.effects.chorusMix = parseFloat(e.target.value) / 100;
        $('chorusMixVal').textContent = e.target.value + '%';
        syncEffectsToProcessor();
    });
    $('chorusRate').addEventListener('input', e => {
        state.effects.chorusRate = parseFloat(e.target.value) / 100;
        $('chorusRateVal').textContent = e.target.value + '%';
        syncEffectsToProcessor();
    });
    $('eqLow').addEventListener('input', e => {
        state.effects.eqLow = parseFloat(e.target.value);
        $('eqLowVal').textContent = e.target.value + 'dB';
        syncEffectsToProcessor();
    });
    $('eqMid').addEventListener('input', e => {
        state.effects.eqMid = parseFloat(e.target.value);
        $('eqMidVal').textContent = e.target.value + 'dB';
        syncEffectsToProcessor();
    });
    $('eqHigh').addEventListener('input', e => {
        state.effects.eqHigh = parseFloat(e.target.value);
        $('eqHighVal').textContent = e.target.value + 'dB';
        syncEffectsToProcessor();
    });
    $('compRatio').addEventListener('input', e => {
        state.effects.compRatio = parseFloat(e.target.value);
        $('compRatioVal').textContent = e.target.value + ':1';
        syncEffectsToProcessor();
    });
    $('compThresh').addEventListener('input', e => {
        state.effects.compThresh = parseFloat(e.target.value);
        $('compThreshVal').textContent = e.target.value + 'dB';
        syncEffectsToProcessor();
    });
    $('gateThresh').addEventListener('input', e => {
        state.effects.gateThresh = parseFloat(e.target.value);
        $('gateThreshVal').textContent = e.target.value + 'dB';
        syncEffectsToProcessor();
    });

    // AutoTune sliders
    $('atSpeed').addEventListener('input', e => {
        state.atSpeed = parseFloat(e.target.value);
        $('atSpeedVal').textContent = e.target.value + 'ms';
        syncAutotuneToProcessor();
    });
    $('atAmount').addEventListener('input', e => {
        state.atAmount = parseFloat(e.target.value) / 100;
        $('atAmountVal').textContent = e.target.value + '%';
        syncAutotuneToProcessor();
    });
    $('atFormant').addEventListener('input', e => {
        state.atFormant = parseFloat(e.target.value);
        $('atFormantVal').textContent = e.target.value;
        syncAutotuneToProcessor();
    });
    $('atDetune').addEventListener('input', e => {
        state.atDetune = parseFloat(e.target.value);
        $('atDetuneVal').textContent = e.target.value + 'c';
        syncAutotuneToProcessor();
    });

    // Buffer size
    $('bufferSizeSlider').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        $('bufferInfo').textContent = val + ' samples';
        $('bufferSize').textContent = val + 'b';
        if (state.processorNode) {
            state.processorNode.port.postMessage({
                type: 'setBufferSize',
                value: val
            });
        }
    });

    // Inicialização automática
    setTimeout(() => {
        initAudio().catch(() => {
            showError('Toque no botao para iniciar');
        });
    }, 800);

    document.querySelector('[data-mode="MAIOR"]').classList.add('active');
    $('autoKeyToggle').classList.add('active');
    updateLibraryList();
});

// ================================================================
// SERVICE WORKER
// ================================================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ================================================================
// EXPORT GLOBAL
// ================================================================

window.initAudio = initAudio;
window.togglePlay = togglePlay;
window.toggleFx = toggleFx;
window.toggleAutotune = toggleAutotune;
window.toggleFxMaster = toggleFxMaster;
window.toggleAutotuneMaster = toggleAutotuneMaster;
window.toggleMute = toggleMute;
window.toggleSolo = toggleSolo;
window.togglePlayMono = togglePlayMono;
window.toggleMonitor = toggleMonitor;
window.setPan = setPan;
window.setMicGain = setMicGain;
window.setPlayGain = setPlayGain;
window.setMasterGain = setMasterGain;
window.setMonGain = setMonGain;
window.toggleEffect = toggleEffect;
window.setAtKey = setAtKey;
window.setAtMode = setAtMode;
window.toggleAutoKey = toggleAutoKey;
window.applyPreset = applyPreset;
window.resetAutotune = resetAutotune;
window.switchTab = switchTab;
window.showMarkerDialog = showMarkerDialog;
window.closeMarkerDialog = closeMarkerDialog;
window.toggleManualTime = toggleManualTime;
window.saveMarker = saveMarker;
window.prevMarker = prevMarker;
window.nextMarker = nextMarker;
window.showMarkersList = showMarkersList;
window.closeMarkersList = closeMarkersList;
window.deleteMarker = deleteMarker;
window.prevTrack = prevTrack;
window.nextTrack = nextTrack;
window.stopTrack = stopTrack;
window.handleFileUpload = handleFileUpload;
window.openTuner = openTuner;
window.closeTuner = closeTuner;
window.selectTunerString = selectTunerString;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.updateTunerUI = updateTunerUI;
