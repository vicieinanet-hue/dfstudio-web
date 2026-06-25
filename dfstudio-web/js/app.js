var audioContext, micStream, workletNode, analyserMic, analyserPlay, analyserMaster;
var micGainNode, playGainNode, masterGainNode, monGainNode;
var audioBuffer, sourceNode, isPlaying = false, playbackPosition = 0, sourceStartTime = 0;
var markers = [];
var micGain = 0.65, playGain = 0.40, masterGain = 0.50, monGain = 0.50;
var isMicMuted = true, isPlayMuted = true, isMasterMuted = true;
var isMicSolo = false, isPlaySolo = false, isPlayMono = false, monitorEnabled = false;
var fxEnabled = true, autotuneEnabled = false;
var vuData = new Uint8Array(128);

function logMsg(msg) { console.log(msg); var el=document.getElementById('logMsg'); if(el) el.textContent=msg; }
function showError(msg) { document.getElementById('errorMsg').textContent=msg; document.getElementById('startBtn').style.display='block'; }

async function initAudio() {
    try {
        document.getElementById('startBtn').style.display='none';
        document.getElementById('errorMsg').textContent='';
        logMsg('A criar AudioContext...');
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        
        micGainNode = audioContext.createGain(); micGainNode.gain.value = 0;
        playGainNode = audioContext.createGain(); playGainNode.gain.value = 0;
        masterGainNode = audioContext.createGain(); masterGainNode.gain.value = 0;
        monGainNode = audioContext.createGain(); monGainNode.gain.value = 0;
        
        analyserMic = audioContext.createAnalyser(); analyserMic.fftSize = 256;
        analyserPlay = audioContext.createAnalyser(); analyserPlay.fftSize = 256;
        analyserMaster = audioContext.createAnalyser(); analyserMaster.fftSize = 256;
        
        micGainNode.connect(analyserMic);
        analyserMic.connect(monGainNode);
        monGainNode.connect(masterGainNode);
        playGainNode.connect(analyserPlay);
        analyserPlay.connect(masterGainNode);
        masterGainNode.connect(analyserMaster);
        analyserMaster.connect(audioContext.destination);
        
        logMsg('A pedir microfone...');
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            var inputNode = audioContext.createMediaStreamSource(micStream);
            inputNode.connect(micGainNode);
            logMsg('Microfone OK!');
        } catch(micErr) { logMsg('Microfone indisponível: ' + micErr.message); }
        
        document.getElementById('sampleRate').textContent = (audioContext.sampleRate/1000).toFixed(1)+'k';
        document.getElementById('bufferSize').textContent = '128b';
        
        // Desmuta master
        isMasterMuted = false;
        masterGainNode.gain.value = masterGain;
        document.getElementById('masterMute').classList.remove('active');
        
        document.getElementById('splash').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        
        setInterval(updateUI, 80);
        logMsg('✅ DF STUDIO PRONTO!');
    } catch(e) {
        logMsg('ERRO: ' + e.message);
        showError('Toque no botão para tentar novamente');
    }
}

function updateUI() {
    if(!audioContext) return;
    try {
        document.getElementById('latency').textContent = Math.round(audioContext.baseLatency*1000)+'ms';
        document.getElementById('voiceVuFill').style.height = (getVu(analyserMic)*100)+'%';
        document.getElementById('playVuFill').style.height = (getVu(analyserPlay)*100)+'%';
        document.getElementById('masterVuFill').style.height = (getVu(analyserMaster)*100)+'%';
        if(isPlaying && audioBuffer) {
            var ct = audioContext.currentTime - sourceStartTime;
            document.getElementById('currentTime').textContent = formatTime(ct);
            document.getElementById('seekBar').value = (ct/audioBuffer.duration)*1000||0;
        }
    } catch(e) {}
}

function getVu(analyser) {
    if(!analyser) return 0;
    analyser.getByteTimeDomainData(vuData);
    var s=0; for(var i=0;i<vuData.length;i++) s+=Math.abs(vuData[i]-128);
    return Math.min(1, s/vuData.length/128*1.5);
}

function formatTime(s) { var m=Math.floor(s/60), sec=Math.floor(s%60); return m.toString().padStart(2,'0')+':'+sec.toString().padStart(2,'0'); }

function setMicGain(v) { micGain=v; if(micGainNode) micGainNode.gain.value=isMicMuted?0:v*4; }
function setPlayGain(v) { playGain=v; if(playGainNode) playGainNode.gain.value=isPlayMuted?0:v; }
function setMasterGain(v) { masterGain=v; if(masterGainNode) masterGainNode.gain.value=isMasterMuted?0:v; }
function setMonGain(v) { monGain=v; if(monGainNode) monGainNode.gain.value=monitorEnabled?v:0; }

function toggleMute(ch) {
    if(ch==='voice'){ isMicMuted=!isMicMuted; setMicGain(micGain); return isMicMuted; }
    if(ch==='play'){ isPlayMuted=!isPlayMuted; setPlayGain(playGain); return isPlayMuted; }
    if(ch==='master'){ isMasterMuted=!isMasterMuted; setMasterGain(masterGain); return isMasterMuted; }
}
function toggleSolo(ch) { if(ch==='voice') isMicSolo=!isMicSolo; else isPlaySolo=!isPlaySolo; }
function togglePlayMono(){ isPlayMono=!isPlayMono; return isPlayMono; }
function toggleMonitor(){ monitorEnabled=!monitorEnabled; setMonGain(monGain); return monitorEnabled; }
function toggleFx(){ fxEnabled=!fxEnabled; document.getElementById('fxBtn').classList.toggle('active'); }
function toggleAutotune(){ autotuneEnabled=!autotuneEnabled; document.getElementById('atBtn').classList.toggle('active'); }
function setPan(ch,v){}

function togglePlay() {
    if(isPlaying){ try{sourceNode.stop();}catch(e){} isPlaying=false; }
    else if(audioBuffer){ playFromPosition(playbackPosition); }
    document.getElementById('playBtn').textContent = isPlaying?'▶️':'⏸️';
}
function stopTrack() { try{sourceNode.stop();}catch(e){} isPlaying=false; playbackPosition=0; document.getElementById('playBtn').textContent='▶️'; }
function prevTrack() { playFromPosition(0); }
function nextTrack() { playFromPosition(0); }

function playFromPosition(pos) {
    if(!audioBuffer||!audioContext) return;
    try{sourceNode.stop();}catch(e){}
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(playGainNode);
    sourceNode.start(0, pos||0);
    isPlaying = true; playbackPosition = pos||0;
    sourceStartTime = audioContext.currentTime - (pos||0);
    document.getElementById('playBtn').textContent = '⏸️';
}

async function handleFileUpload(event) {
    var file = event.target.files[0];
    if(file) {
        try {
            var buf = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(buf);
            document.getElementById('trackName').textContent = '🎵 ' + file.name.replace(/\.[^/.]+$/,'');
            document.getElementById('durationTime').textContent = formatTime(audioBuffer.duration);
        } catch(e) { logMsg('Erro: '+e.message); }
    }
}

function showMarkerDialog() { document.getElementById('markerDialog').style.display='flex'; }
function closeMarkerDialog() { document.getElementById('markerDialog').style.display='none'; }
function toggleManualTime() { document.getElementById('manualTime').style.display = document.getElementById('useCurrentTime').checked?'none':'flex'; }

function saveMarker() {
    var name = document.getElementById('markerName').value || 'Marcador';
    var timeUs;
    if(document.getElementById('useCurrentTime').checked) { timeUs = (audioContext.currentTime - sourceStartTime)*1000000; }
    else { var min=parseInt(document.getElementById('markerMin').value)||0; var sec=parseInt(document.getElementById('markerSec').value)||0; var ms=parseInt(document.getElementById('markerMs').value)||0; timeUs = (min*60+sec)*1000000 + ms*1000; }
    markers.push({name:name, timeUs:timeUs});
    document.getElementById('markerCount').textContent = markers.length + ' marc';
    closeMarkerDialog();
}

function prevMarker() {
    if(!markers.length) return;
    var cur = (audioContext.currentTime - sourceStartTime)*1000000;
    var sorted = markers.slice().sort(function(a,b){return a.timeUs-b.timeUs;});
    var prev = sorted.filter(function(m){return m.timeUs < cur-500000;}).pop() || sorted[sorted.length-1];
    if(prev) playFromPosition(prev.timeUs/1000000);
}

function nextMarker() {
    if(!markers.length) return;
    var cur = (audioContext.currentTime - sourceStartTime)*1000000;
    var sorted = markers.slice().sort(function(a,b){return a.timeUs-b.timeUs;});
    var next = sorted.find(function(m){return m.timeUs > cur+500000;}) || sorted[0];
    if(next) playFromPosition(next.timeUs/1000000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('startBtn').addEventListener('click', initAudio);
    document.getElementById('micGain').addEventListener('input', function(e){ setMicGain(e.target.value/100); });
    document.getElementById('playGain').addEventListener('input', function(e){ setPlayGain(e.target.value/100); });
    document.getElementById('masterFader').addEventListener('input', function(e){ setMasterGain(e.target.value/100); });
    document.getElementById('voiceFader').addEventListener('input', function(e){ setMicGain(e.target.value/100); });
    document.getElementById('playFader').addEventListener('input', function(e){ setPlayGain(e.target.value/100); });
    document.getElementById('monGain').addEventListener('input', function(e){ setMonGain(e.target.value/100); });
    document.getElementById('seekBar').addEventListener('input', function(e){ if(audioBuffer) playFromPosition((e.target.value/1000)*audioBuffer.duration); });
    
    setTimeout(function() {
        initAudio().catch(function() { showError('Toque no botão para iniciar'); });
    }, 800);
});

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }
