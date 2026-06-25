// ═══════════════════════════════════════════════
// AUDIO ENGINE - CORRIGIDO
// ═══════════════════════════════════════════════
var ctx, micG, playG, masterG, monG, aMic, aPlay, aMasterL, aMasterR;
var audioBuf, srcNode, playing = false, pos = 0, startTime = 0;
var markers = [];
var micGain = .65, playGain = .40, masterGain = .50, monGain = .50;
var micMuted = true, playMuted = true, masterMuted = false;
var micSolo = false, playSolo = false, playMono = false, monOn = true;
var fxOn = true, revOn = false, delOn = false, eqOn = false;
var atMaster = false, atKey = 'C', atMode = 'MAIOR', atSpd = 14, atAmt = .65;
var tunerActive = false, tunerStr = -1;
var vuData = new Uint8Array(128);
var keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var tunerStrings = [
    { n: '6', s: 'E2', f: 82.41 }, { n: '5', s: 'A2', f: 110 },
    { n: '4', s: 'D3', f: 146.83 }, { n: '3', s: 'G3', f: 196 },
    { n: '2', s: 'B3', f: 246.94 }, { n: '1', s: 'E4', f: 329.63 }
];
var libraryFiles = [];
var micStream = null;

function log(m) { console.log(m); var e = document.getElementById('msg'); if (e) e.textContent = m; }
function err(m) { var e = document.getElementById('msg'); if (e) e.textContent = m; document.getElementById('startBtn').style.display = 'block'; }

async function start() {
    try {
        document.getElementById('startBtn').style.display = 'none';
        log('Criando AudioContext...');
        
        // 🔥 AudioContext com latência mínima
        ctx = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
            sampleRate: 48000
        });
        
        // Cria nós de ganho
        micG = ctx.createGain(); micG.gain.value = 0; // MUTE inicial
        playG = ctx.createGain(); playG.gain.value = 0; // MUTE inicial
        masterG = ctx.createGain(); masterG.gain.value = 0.5; // MASTER ABERTO
        monG = ctx.createGain(); monG.gain.value = 0.5;
        
        // Analisadores
        aMic = ctx.createAnalyser(); aMic.fftSize = 256;
        aPlay = ctx.createAnalyser(); aPlay.fftSize = 256;
        aMasterL = ctx.createAnalyser(); aMasterL.fftSize = 256;
        aMasterR = ctx.createAnalyser(); aMasterR.fftSize = 256;
        
        // 🔥 CADEIA DE ÁUDIO CORRETA
        // Mic -> MicGain -> Analyser -> MonGain -> MasterGain -> Analysers -> Destination
        micG.connect(aMic);
        aMic.connect(monG);
        monG.connect(masterG);
        
        // Play -> PlayGain -> Analyser -> MasterGain
        playG.connect(aPlay);
        aPlay.connect(masterG);
        
        // Master -> Analysers -> Destination
        masterG.connect(aMasterL);
        masterG.connect(aMasterR);
        aMasterL.connect(ctx.destination);
        aMasterR.connect(ctx.destination);
        
        log('Microfone...');
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0.001
                }
            });
            var inputNode = ctx.createMediaStreamSource(micStream);
            inputNode.connect(micG);
            log('Microfone OK!');
        } catch (e) {
            log('Microfone indisponivel: ' + e.message);
        }
        
        document.getElementById('sr').textContent = (ctx.sampleRate / 1000).toFixed(1) + 'k';
        document.getElementById('buf').textContent = '128b';
        
        // 🔥 ATUALIZA ESTADO INICIAL DOS BOTÕES
        updateAllButtonStates();
        
        document.getElementById('splash').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        
        loadMarkers();
        buildKeys();
        buildTunerStrings();
        
        // Loop de UI
        setInterval(loop, 80);
        log('✅ PRONTO!');
    } catch (e) {
        log('ERRO: ' + e.message);
        err('Toque para tentar');
    }
}

function updateAllButtonStates() {
    // Mute buttons - inicialmente mutados (exceto master)
    var vm = document.getElementById('voiceMute');
    var pm = document.getElementById('playMute');
    var mm = document.getElementById('masterMute');
    if (vm) vm.classList.add('mute-on');
    if (pm) pm.classList.add('mute-on');
    if (mm) mm.classList.remove('mute-on');
    
    // Ganhos iniciais
    micG.gain.value = 0;
    playG.gain.value = 0;
    masterG.gain.value = masterGain;
    monG.gain.value = monGain;
    
    // FX button
    var fx = document.getElementById('fxOn');
    if (fx) fx.classList.add('on');
    
    // MON SW
    var ms = document.getElementById('monSw');
    if (ms) ms.classList.add('on');
    document.getElementById('monLabel').textContent = 'RETORNO APP';
}

function loop() {
    if (!ctx) return;
    try {
        document.getElementById('lat').textContent = Math.round(ctx.baseLatency * 1000) + 'ms';
        document.getElementById('voiceVu').style.height = (vu(aMic) * 100) + '%';
        document.getElementById('playVu').style.height = (vu(aPlay) * 100) + '%';
        document.getElementById('masterVuL').style.height = (vu(aMasterL) * 100) + '%';
        document.getElementById('masterVuR').style.height = (vu(aMasterR) * 100) + '%';
        if (playing && audioBuf) {
            var t = ctx.currentTime - startTime;
            if (t >= audioBuf.duration) { stopTrack(); }
            else {
                document.getElementById('curTime').textContent = fm(t);
                document.getElementById('seekBar').value = (t / audioBuf.duration) * 1000 || 0;
            }
        }
        if (tunerActive) tunerPitch();
    } catch (e) { }
}

function vu(a) {
    if (!a) return 0;
    a.getByteTimeDomainData(vuData);
    var s = 0;
    for (var i = 0; i < vuData.length; i++) s += Math.abs(vuData[i] - 128);
    return Math.min(1, s / vuData.length / 128 * 1.5);
}

function fm(s) {
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
}

// ═══════════════════════════════════════════════
// CONTROLES DE GANHO - CORRIGIDOS
// ═══════════════════════════════════════════════
function setMic(v) {
    micGain = v;
    if (micG) {
        // 🔥 Se mutado, ganho = 0. Se não, aplica o ganho * 4 (boost interno)
        micG.gain.linearRampToValueAtTime(micMuted ? 0 : v * 4, ctx.currentTime + 0.005);
    }
}

function setPlay(v) {
    playGain = v;
    if (playG) {
        playG.gain.linearRampToValueAtTime(playMuted ? 0 : v, ctx.currentTime + 0.005);
    }
}

function setMaster(v) {
    masterGain = v;
    if (masterG) {
        masterG.gain.linearRampToValueAtTime(masterMuted ? 0 : v, ctx.currentTime + 0.005);
    }
}

function setMon(v) {
    monGain = v;
    if (monG) {
        monG.gain.linearRampToValueAtTime(monOn ? v : 0, ctx.currentTime + 0.005);
    }
}

// ═══════════════════════════════════════════════
// BOTÕES MUTE/SOLO - CORRIGIDOS
// ═══════════════════════════════════════════════
function toggleMute(ch) {
    if (ch === 'voice') {
        micMuted = !micMuted;
        setMic(micGain);
        var b = document.getElementById('voiceMute');
        if (b) {
            if (micMuted) b.classList.add('mute-on');
            else b.classList.remove('mute-on');
        }
    } else if (ch === 'play') {
        playMuted = !playMuted;
        setPlay(playGain);
        var b = document.getElementById('playMute');
        if (b) {
            if (playMuted) b.classList.add('mute-on');
            else b.classList.remove('mute-on');
        }
    } else if (ch === 'master') {
        masterMuted = !masterMuted;
        setMaster(masterGain);
        var b = document.getElementById('masterMute');
        if (b) {
            if (masterMuted) b.classList.add('mute-on');
            else b.classList.remove('mute-on');
        }
    }
}

function toggleSolo(ch) {
    if (ch === 'voice') {
        micSolo = !micSolo;
        var b = document.getElementById('voiceSolo');
        if (b) {
            if (micSolo) b.classList.add('solo-on');
            else b.classList.remove('solo-on');
        }
    } else if (ch === 'play') {
        playSolo = !playSolo;
        var b = document.getElementById('playSolo');
        if (b) {
            if (playSolo) b.classList.add('solo-on');
            else b.classList.remove('solo-on');
        }
    }
}

function toggleMono() {
    playMono = !playMono;
    var b = document.getElementById('monoOn');
    if (b) {
        if (playMono) b.classList.add('on');
        else b.classList.remove('on');
    }
}

function toggleMon() {
    monOn = !monOn;
    setMon(monGain);
    var b = document.getElementById('monSw');
    if (b) {
        if (monOn) b.classList.add('on');
        else b.classList.remove('on');
    }
    document.getElementById('monLabel').textContent = monOn ? 'RETORNO APP' : 'DIRECT MON';
}

function toggleFx() {
    fxOn = !fxOn;
    var b = document.getElementById('fxOn');
    if (b) b.classList.toggle('on');
}

function toggleAt() {
    var b = document.getElementById('atOn');
    if (b) b.classList.toggle('on');
}

function setPan(ch, v) { /* Implementação futura */ }

function resetMixer() {
    setMic(.65); setPlay(.40); setMaster(.50); setMon(.50);
    document.getElementById('micGain').value = 65;
    document.getElementById('playGain').value = 40;
    document.getElementById('masterFader').value = 50;
    document.getElementById('voiceFader').value = 50;
    document.getElementById('playFader').value = 50;
    document.getElementById('monGain').value = 50;
}

// ═══════════════════════════════════════════════
// PLAYBACK
// ═══════════════════════════════════════════════
function togglePlay() {
    if (playing) {
        try { srcNode.stop(); } catch (e) { }
        playing = false;
    } else if (audioBuf) {
        playFrom(pos);
    }
    document.getElementById('playBtn').textContent = playing ? '⏸️' : '▶️';
}

function stopTrack() {
    try { srcNode.stop(); } catch (e) { }
    playing = false;
    pos = 0;
    document.getElementById('playBtn').textContent = '▶️';
    document.getElementById('curTime').textContent = '00:00';
    document.getElementById('seekBar').value = 0;
}

function playFrom(p) {
    if (!audioBuf || !ctx) return;
    try { srcNode.stop(); } catch (e) { }
    srcNode = ctx.createBufferSource();
    srcNode.buffer = audioBuf;
    srcNode.connect(playG);
    srcNode.start(0, p || 0);
    playing = true;
    pos = p || 0;
    startTime = ctx.currentTime - (p || 0);
    document.getElementById('playBtn').textContent = '⏸️';
}

async function loadFile(e) {
    var f = e.target.files[0];
    if (f) {
        try {
            var b = await f.arrayBuffer();
            audioBuf = await ctx.decodeAudioData(b);
            document.getElementById('trackName').textContent = '🎵 ' + f.name.replace(/\.[^/.]+$/, '');
            document.getElementById('durTime').textContent = fm(audioBuf.duration);
            libraryFiles.push(f);
            updateLibList();
            // Desmuta o canal PLAY automaticamente
            if (playMuted) {
                playMuted = false;
                setPlay(playGain);
                var pm = document.getElementById('playMute');
                if (pm) pm.classList.remove('mute-on');
            }
        } catch (ex) {
            log('Erro ao carregar: ' + ex.message);
        }
    }
}

// ═══════════════════════════════════════════════
// MARCADORES
// ═══════════════════════════════════════════════
function loadMarkers() { try { var s = localStorage.getItem('df_markers'); if (s) markers = JSON.parse(s); updMarkerBadge(); } catch (e) { } }
function saveMarkers() { try { localStorage.setItem('df_markers', JSON.stringify(markers)); } catch (e) { } }
function updMarkerBadge() { document.getElementById('markerBadge').textContent = markers.length; }
function showMarkerDlg() { document.getElementById('markerDlg').style.display = 'flex'; }
function closeDlg() { document.getElementById('markerDlg').style.display = 'none'; }
function toggleManTime() { document.getElementById('manTime').style.display = document.getElementById('useCurTime').checked ? 'none' : 'flex'; }

function saveMarker() {
    var n = document.getElementById('markerName').value || 'Marcador';
    var tu;
    if (document.getElementById('useCurTime').checked) {
        tu = (ctx.currentTime - startTime) * 1000000;
    } else {
        var min = parseInt(document.getElementById('mm').value) || 0;
        var sec = parseInt(document.getElementById('ss').value) || 0;
        var ms = parseInt(document.getElementById('ms').value) || 0;
        tu = (min * 60 + sec) * 1000000 + ms * 1000;
    }
    markers.push({ name: n, timeUs: tu });
    markers.sort(function (a, b) { return a.timeUs - b.timeUs; });
    saveMarkers();
    updMarkerBadge();
    closeDlg();
}

function prevMarker() {
    if (!markers.length) return;
    var cur = (ctx.currentTime - startTime) * 1000000;
    var p = markers.filter(function (m) { return m.timeUs < cur - 500000; }).pop() || markers[markers.length - 1];
    if (p) playFrom(p.timeUs / 1000000);
}

function nextMarker() {
    if (!markers.length) return;
    var cur = (ctx.currentTime - startTime) * 1000000;
    var n = markers.find(function (m) { return m.timeUs > cur + 500000; }) || markers[0];
    if (n) playFrom(n.timeUs / 1000000);
}

function exportMarkers() {
    if (!markers.length) { alert('Nenhum marcador'); return; }
    var txt = 'MARCADORES\n----------\n';
    markers.forEach(function (m) {
        var t = m.timeUs / 1000, h = Math.floor(t / 3600000), min = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), ms = Math.floor(t % 1000);
        var ts = (h > 0 ? h.toString().padStart(2, '0') + ':' : '') + min.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0') + '.' + ms.toString().padStart(3, '0');
        txt += ts + ' | ' + m.name + '\n';
    });
    var blob = new Blob([txt], { type: 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'marcadores.txt'; a.click();
}

function importMarkers(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
        var lines = r.result.split('\n'); var newMarkers = [];
        lines.forEach(function (l) {
            if (!l.includes('|')) return; var p = l.split('|'); if (p.length < 2) return;
            var ts = p[0].trim(), nm = p[1].trim(); var tp = ts.split(/[:.]/);
            var h = 0, min = 0, s = 0, ms = 0;
            if (tp.length >= 4) { h = parseInt(tp[0]) || 0; min = parseInt(tp[1]) || 0; s = parseInt(tp[2]) || 0; ms = parseInt(tp[3]) || 0; }
            else if (tp.length >= 3) { min = parseInt(tp[0]) || 0; s = parseInt(tp[1]) || 0; ms = parseInt(tp[2]) || 0; }
            var tu = (h * 3600000 + min * 60000 + s * 1000 + ms) * 1000;
            newMarkers.push({ name: nm, timeUs: tu });
        });
        if (newMarkers.length) { markers = markers.concat(newMarkers); markers.sort(function (a, b) { return a.timeUs - b.timeUs; }); saveMarkers(); updMarkerBadge(); alert(newMarkers.length + ' marcadores importados!'); }
    }; r.readAsText(f);
}

// ═══════════════════════════════════════════════
// EFEITOS
// ═══════════════════════════════════════════════
function toggleFxM() { fxOn = !fxOn; var b = document.getElementById('fxMasterOn'); b.textContent = fxOn ? 'ON' : 'OFF'; b.className = 'tgl' + (fxOn ? ' on' : ''); }
function toggleRev() { revOn = !revOn; var b = document.getElementById('revOn'); b.textContent = revOn ? 'ON' : 'OFF'; b.className = 'tgl' + (revOn ? ' on' : ''); document.getElementById('revBody').style.display = revOn ? 'block' : 'none'; }
function toggleDel() { delOn = !delOn; var b = document.getElementById('delOn'); b.textContent = delOn ? 'ON' : 'OFF'; b.className = 'tgl' + (delOn ? ' on' : ''); document.getElementById('delBody').style.display = delOn ? 'block' : 'none'; }
function toggleEq() { eqOn = !eqOn; var b = document.getElementById('eqOn'); b.textContent = eqOn ? 'ON' : 'OFF'; b.className = 'tgl' + (eqOn ? ' on' : ''); document.getElementById('eqBody').style.display = eqOn ? 'block' : 'none'; }

// ═══════════════════════════════════════════════
// AUTOTUNE
// ═══════════════════════════════════════════════
function buildKeys() { var g = document.getElementById('keyGrid'); if (!g) return; g.innerHTML = ''; keys.forEach(function (k) { var b = document.createElement('button'); b.textContent = k; b.className = k === atKey ? 'on' : ''; b.onclick = function () { atKey = k; buildKeys(); }; g.appendChild(b); }); }
function setMode(m) { atMode = m; document.getElementById('modeMaj').className = 'tgl' + (m === 'MAIOR' ? ' on' : ''); document.getElementById('modeMin').className = 'tgl' + (m === 'MENOR' ? ' on' : ''); document.getElementById('modeChr').className = 'tgl' + (m === 'CROM' ? ' on' : ''); }
function toggleAtM() { atMaster = !atMaster; var b = document.getElementById('atMasterOn'); b.textContent = atMaster ? 'ON' : 'OFF'; b.className = 'tgl' + (atMaster ? ' on' : ''); }

// ═══════════════════════════════════════════════
// AFINADOR
// ═══════════════════════════════════════════════
function buildTunerStrings() { var c = document.getElementById('tunerStrings'); if (!c) return; c.innerHTML = ''; tunerStrings.forEach(function (s, i) { var b = document.createElement('button'); b.innerHTML = '<span class="sn">' + s.n + '</span><span class="ss">' + s.s + '</span>'; b.onclick = function () { tunerStr = (tunerStr === i) ? -1 : i; buildTunerStrings(); }; if (tunerStr === i) b.classList.add('on'); c.appendChild(b); }); }
function toggleTuner() { tunerActive = !tunerActive; var b = document.getElementById('tunerOn'); b.textContent = tunerActive ? '🎸 AFINADOR ON' : '🎸 AFINADOR OFF'; b.className = 'tgl' + (tunerActive ? ' on' : ''); if (!tunerActive) { document.getElementById('tunerNote').textContent = '--'; document.getElementById('tunerFreq').textContent = '0.0 Hz'; document.getElementById('tunerCents').textContent = '0 ¢'; } }
function tunerPitch() {
    if (!aMic) return; var buf = new Float32Array(aMic.fftSize); aMic.getFloatTimeDomainData(buf);
    var zc = 0; for (var i = 1; i < buf.length; i++)if (buf[i - 1] * buf[i] < 0) zc++;
    var zf = zc * ctx.sampleRate / (2 * buf.length); if (zf < 60 || zf > 500) return;
    var cl = Math.round(ctx.sampleRate / zf), mn = Math.max(16, cl - 150), mx = Math.min(buf.length - 1, cl + 150); if (mn >= mx) return;
    var bc = -1, bl = mn; for (var lag = mn; lag < mx; lag++) { var c = 0; for (var i = 0; i < buf.length - lag; i++)c += buf[i] * buf[i + lag]; if (c > bc) { bc = c; bl = lag; } }
    if (bl > 0 && bc > 0.01) { var f = ctx.sampleRate / bl; if (f > 60 && f < 500) { document.getElementById('tunerFreq').textContent = f.toFixed(1) + ' Hz'; var midi = 69 + 12 * Math.log2(f / 440), ni = Math.round(midi) % 12, nn = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], note = nn[((ni % 12) + 12) % 12], cents = Math.round((midi - Math.round(midi)) * 100); document.getElementById('tunerNote').textContent = note; document.getElementById('tunerNote').style.color = Math.abs(cents) < 5 ? '#76FF03' : Math.abs(cents) < 15 ? '#FFD600' : '#FF1744'; document.getElementById('tunerCents').textContent = (cents >= 0 ? '+' : '') + cents + ' ¢'; } }
}

// ═══════════════════════════════════════════════
// BIBLIOTECA
// ═══════════════════════════════════════════════
function updateLibList() { var l = document.getElementById('libList'); l.innerHTML = ''; libraryFiles.forEach(function (f, i) { var d = document.createElement('div'); d.className = 'lib-item'; d.innerHTML = '<div class="play-icon" onclick="loadLibFile(' + i + ')">▶</div><span>' + f.name + '</span>'; l.appendChild(d); }); if (!libraryFiles.length) l.innerHTML = '<p style="color:var(--t2);text-align:center;padding:20px">Nenhum ficheiro</p>'; }
function loadLibFile(i) { var f = libraryFiles[i]; var reader = new FileReader(); reader.onload = function (e) { var b = e.target.result; ctx.decodeAudioData(b, function (buf) { audioBuf = buf; document.getElementById('trackName').textContent = '🎵 ' + f.name.replace(/\.[^/.]+$/, ''); document.getElementById('durTime').textContent = fm(audioBuf.duration); if (playMuted) { playMuted = false; setPlay(playGain); var pm = document.getElementById('playMute'); if (pm) pm.classList.remove('mute-on'); } }); }; reader.readAsArrayBuffer(f); }

// ═══════════════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════════════
function showTab(t) {
    var tabs = ['tabMixer', 'tabEffects', 'tabAutotune', 'tabTuner', 'tabLibrary', 'tabSettings'];
    tabs.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.remove('active'); });
    
    var targetId = 'tab' + t.charAt(0).toUpperCase() + t.slice(1);
    var target = document.getElementById(targetId);
    if (target) target.classList.add('active');
    
    var bs = document.querySelectorAll('.nav button');
    var tabNames = ['mixer', 'effects', 'autotune', 'tuner', 'library', 'settings'];
    bs.forEach(function (b, i) {
        b.classList.remove('active');
        if (tabNames[i] === t) b.classList.add('active');
    });
}

// ═══════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('startBtn').addEventListener('click', start);
    
    // Sliders
    document.getElementById('micGain').addEventListener('input', function (e) { setMic(e.target.value / 100); });
    document.getElementById('playGain').addEventListener('input', function (e) { setPlay(e.target.value / 100); });
    document.getElementById('masterFader').addEventListener('input', function (e) { setMaster(e.target.value / 100); });
    document.getElementById('voiceFader').addEventListener('input', function (e) { setMic(e.target.value / 100); });
    document.getElementById('playFader').addEventListener('input', function (e) { setPlay(e.target.value / 100); });
    document.getElementById('monGain').addEventListener('input', function (e) { setMon(e.target.value / 100); });
    
    // Seek
    document.getElementById('seekBar').addEventListener('input', function (e) {
        if (audioBuf) playFrom((e.target.value / 1000) * audioBuf.duration);
    });
    
    // Auto start
    setTimeout(function () {
        start().catch(function () { err('Toque para iniciar'); });
    }, 800);
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () { });
}
