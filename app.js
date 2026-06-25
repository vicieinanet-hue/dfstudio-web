// ═══════════════════════════════════════════════
// AUDIO ENGINE
// ═══════════════════════════════════════════════
var audioContext, micStream, micGainNode, playGainNode, masterGainNode, monGainNode;
var analyserMic, analyserPlay, analyserMaster;
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
        micGainNode.connect(analyserMic); analyserMic.connect(monGainNode);
        monGainNode.connect(masterGainNode);
        playGainNode.connect(analyserPlay); analyserPlay.connect(masterGainNode);
        masterGainNode.connect(analyserMaster); analyserMaster.connect(audioContext.destination);
        logMsg('A pedir microfone...');
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            audioContext.createMediaStreamSource(micStream).connect(micGainNode);
            logMsg('Microfone OK!');
        } catch(micErr) { logMsg('Microfone indisponivel'); }
        document.getElementById('sampleRate').textContent = (audioContext.sampleRate/1000).toFixed(1)+'k';
        isMasterMuted = false; masterGainNode.gain.value = masterGain;
        document.getElementById('masterMute').classList.remove('active');
        document.getElementById('splash').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        loadMarkers();
        buildTunerUI();
        buildKeyGrid();
        setInterval(updateUI, 80);
        logMsg('✅ DF STUDIO PRONTO!');
    } catch(e) { logMsg('ERRO: ' + e.message); showError('Toque no botao para tentar'); }
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
        if(tunerActive && analyserMic) updateTunerPitch();
    } catch(e) {}
}

function getVu(a) { if(!a) return 0; a.getByteTimeDomainData(vuData); var s=0; for(var i=0;i<vuData.length;i++) s+=Math.abs(vuData[i]-128); return Math.min(1,s/vuData.length/128*1.5); }
function formatTime(s) { var m=Math.floor(s/60), sec=Math.floor(s%60); return m.toString().padStart(2,'0')+':'+sec.toString().padStart(2,'0'); }

function setMicGain(v) { micGain=v; if(micGainNode) micGainNode.gain.value=isMicMuted?0:v*4; }
function setPlayGain(v) { playGain=v; if(playGainNode) playGainNode.gain.value=isPlayMuted?0:v; }
function setMasterGain(v) { masterGain=v; if(masterGainNode) masterGainNode.gain.value=isMasterMuted?0:v; }
function setMonGain(v) { monGain=v; if(monGainNode) monGainNode.gain.value=monitorEnabled?v:0; }

function toggleMute(ch) {
    var muted;
    if(ch==='voice'){ isMicMuted=!isMicMuted; setMicGain(micGain); muted=isMicMuted; }
    else if(ch==='play'){ isPlayMuted=!isPlayMuted; setPlayGain(playGain); muted=isPlayMuted; }
    else { isMasterMuted=!isMasterMuted; setMasterGain(masterGain); muted=isMasterMuted; }
    var btn = document.getElementById((ch==='voice'?'voiceMute':ch==='play'?'playMute':'masterMute'));
    if(btn) { if(muted) btn.classList.add('mute-active'); else btn.classList.remove('mute-active'); }
}
function toggleSolo(ch) {
    if(ch==='voice') isMicSolo=!isMicSolo; else isPlaySolo=!isPlaySolo;
    var btn = document.getElementById((ch==='voice'?'voiceSolo':'playSolo'));
    if(btn) { var a=(ch==='voice')?isMicSolo:isPlaySolo; if(a) btn.classList.add('solo-active'); else btn.classList.remove('solo-active'); }
}
function togglePlayMono(){ isPlayMono=!isPlayMono; var b=document.getElementById('playMonoBtn'); if(b){if(isPlayMono)b.classList.add('active');else b.classList.remove('active');} }
function toggleMonitor(){ monitorEnabled=!monitorEnabled; setMonGain(monGain); var b=document.getElementById('monitorBtn'); if(b){if(monitorEnabled)b.classList.add('active');else b.classList.remove('active');} }
function toggleFx(){ fxEnabled=!fxEnabled; document.getElementById('fxBtn').classList.toggle('active'); }
function toggleAutotune(){ autotuneEnabled=!autotuneEnabled; document.getElementById('atBtn').classList.toggle('active'); }
function setPan(ch,v){}

function togglePlay() {
    if(isPlaying){ try{sourceNode.stop();}catch(e){} isPlaying=false; }
    else if(audioBuffer){ playFromPosition(playbackPosition); }
    document.getElementById('playBtn').textContent = isPlaying?'⏸️':'▶️';
}
function stopTrack() { try{sourceNode.stop();}catch(e){} isPlaying=false; playbackPosition=0; document.getElementById('playBtn').textContent='▶️'; }
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
    if(file) { try { var buf=await file.arrayBuffer(); audioBuffer=await audioContext.decodeAudioData(buf); document.getElementById('trackName').textContent='🎵 '+file.name.replace(/\.[^/.]+$/,''); document.getElementById('durationTime').textContent=formatTime(audioBuffer.duration); } catch(e) { logMsg('Erro: '+e.message); } }
}

// ═══════════════════════════════════════════════
// MARCADORES (LocalStorage)
// ═══════════════════════════════════════════════
function loadMarkers() {
    try { var saved = localStorage.getItem('dfstudio_markers'); if(saved) markers = JSON.parse(saved); updateMarkerCount(); } catch(e) {}
}
function saveMarkersToStorage() { try { localStorage.setItem('dfstudio_markers', JSON.stringify(markers)); } catch(e) {} }
function updateMarkerCount() { document.getElementById('markerCount').textContent = markers.length + ' marc'; }

function showMarkerDialog() { document.getElementById('markerDialog').style.display='flex'; }
function closeMarkerDialog() { document.getElementById('markerDialog').style.display='none'; }
function toggleManualTime() { document.getElementById('manualTime').style.display = document.getElementById('useCurrentTime').checked?'none':'flex'; }

function saveMarker() {
    var name = document.getElementById('markerName').value || 'Marcador';
    var timeUs;
    if(document.getElementById('useCurrentTime').checked) { timeUs = (audioContext.currentTime - sourceStartTime)*1000000; }
    else { var min=parseInt(document.getElementById('markerMin').value)||0; var sec=parseInt(document.getElementById('markerSec').value)||0; var ms=parseInt(document.getElementById('markerMs').value)||0; timeUs = (min*60+sec)*1000000 + ms*1000; }
    markers.push({name:name, timeUs:timeUs});
    markers.sort(function(a,b){return a.timeUs-b.timeUs;});
    saveMarkersToStorage();
    updateMarkerCount();
    closeMarkerDialog();
}

function prevMarker() {
    if(!markers.length) return;
    var cur = (audioContext.currentTime - sourceStartTime)*1000000;
    var prev = markers.filter(function(m){return m.timeUs < cur-500000;}).pop() || markers[markers.length-1];
    if(prev) playFromPosition(prev.timeUs/1000000);
}
function nextMarker() {
    if(!markers.length) return;
    var cur = (audioContext.currentTime - sourceStartTime)*1000000;
    var next = markers.find(function(m){return m.timeUs > cur+500000;}) || markers[0];
    if(next) playFromPosition(next.timeUs/1000000);
}

// ═══════════════════════════════════════════════
// EFEITOS
// ═══════════════════════════════════════════════
var reverbNode=null, delayNode=null, delayFeedbackNode=null;
var eqLowNode=null, eqMidNode=null, eqHighNode=null;
var reverbEnabled=false, delayEnabled=false, eqEnabled=false, fxMasterOn=true;

function toggleFxMaster(){ fxMasterOn=!fxMasterOn; var b=document.getElementById('fxMasterBtn'); b.textContent=fxMasterOn?'ON':'OFF'; b.className='toggle '+(fxMasterOn?'on':''); }

function toggleReverb(){
    reverbEnabled=!reverbEnabled;
    var b=document.getElementById('reverbBtn'); b.textContent=reverbEnabled?'ON':'OFF'; b.className='toggle '+(reverbEnabled?'on':'');
    document.getElementById('reverbBody').style.display=reverbEnabled?'block':'none';
    if(reverbEnabled) createReverb(); else { try{reverbNode.disconnect();}catch(e){} reverbNode=null; micGainNode.disconnect(); micGainNode.connect(monGainNode); }
}
function createReverb(){
    if(!audioContext||reverbNode) return;
    reverbNode=audioContext.createConvolver();
    var sr=audioContext.sampleRate, len=sr*2;
    var impulse=audioContext.createBuffer(2,len,sr);
    for(var ch=0;ch<2;ch++){ var d=impulse.getChannelData(ch); for(var i=0;i<len;i++){ var t=i/sr; d[i]=(Math.random()*2-1)*Math.exp(-t*2)*0.5; } }
    reverbNode.buffer=impulse;
    var dry=audioContext.createGain(); dry.gain.value=0.75;
    var wet=audioContext.createGain(); wet.gain.value=0.25;
    micGainNode.disconnect(); micGainNode.connect(dry); micGainNode.connect(reverbNode);
    reverbNode.connect(wet); dry.connect(monGainNode); wet.connect(monGainNode);
}
function updateReverb(){
    var m=document.getElementById('reverbMix').value/100;
    document.getElementById('reverbMixVal').textContent=Math.round(m*100)+'%';
    document.getElementById('reverbDecayVal').textContent=(0.5+document.getElementById('reverbDecay').value/100*2.5).toFixed(1)+'s';
    if(reverbNode){ try{reverbNode.disconnect();}catch(e){} reverbNode=null; createReverb(); }
}

function toggleDelay(){
    delayEnabled=!delayEnabled;
    var b=document.getElementById('delayBtn'); b.textContent=delayEnabled?'ON':'OFF'; b.className='toggle '+(delayEnabled?'on':'');
    document.getElementById('delayBody').style.display=delayEnabled?'block':'none';
    if(delayEnabled) createDelay(); else { try{delayNode.disconnect();delayFeedbackNode.disconnect();}catch(e){} delayNode=null;delayFeedbackNode=null; micGainNode.disconnect(); micGainNode.connect(monGainNode); }
}
function createDelay(){
    if(!audioContext||delayNode) return;
    delayNode=audioContext.createDelay(2); delayNode.delayTime.value=0.25;
    delayFeedbackNode=audioContext.createGain(); delayFeedbackNode.gain.value=0.4;
    var wet=audioContext.createGain(); wet.gain.value=0.2;
    micGainNode.disconnect(); micGainNode.connect(wet); micGainNode.connect(monGainNode);
    wet.connect(delayNode); delayNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode); delayFeedbackNode.connect(monGainNode);
}
function updateDelay(){
    if(!delayNode) return;
    delayNode.delayTime.value=document.getElementById('delayTime').value/100;
    delayFeedbackNode.gain.value=document.getElementById('delayFeedback').value/100*0.8;
    document.getElementById('delayMixVal').textContent=document.getElementById('delayMix').value+'%';
    document.getElementById('delayTimeVal').textContent=Math.round(document.getElementById('delayTime').value*10)+'ms';
    document.getElementById('delayFeedbackVal').textContent=document.getElementById('delayFeedback').value+'%';
}

function toggleEq(){
    eqEnabled=!eqEnabled;
    var b=document.getElementById('eqBtn'); b.textContent=eqEnabled?'ON':'OFF'; b.className='toggle '+(eqEnabled?'on':'');
    document.getElementById('eqBody').style.display=eqEnabled?'block':'none';
    if(eqEnabled) createEq(); else { try{eqLowNode.disconnect();eqMidNode.disconnect();eqHighNode.disconnect();}catch(e){} eqLowNode=null;eqMidNode=null;eqHighNode=null; micGainNode.disconnect(); micGainNode.connect(monGainNode); }
}
function createEq(){
    if(!audioContext||eqLowNode) return;
    eqLowNode=audioContext.createBiquadFilter(); eqLowNode.type='lowshelf'; eqLowNode.frequency.value=250; eqLowNode.gain.value=0;
    eqMidNode=audioContext.createBiquadFilter(); eqMidNode.type='peaking'; eqMidNode.frequency.value=1000; eqMidNode.Q.value=1; eqMidNode.gain.value=0;
    eqHighNode=audioContext.createBiquadFilter(); eqHighNode.type='highshelf'; eqHighNode.frequency.value=4000; eqHighNode.gain.value=0;
    micGainNode.disconnect(); micGainNode.connect(eqLowNode); eqLowNode.connect(eqMidNode); eqMidNode.connect(eqHighNode); eqHighNode.connect(monGainNode);
}
function updateEq(){
    if(!eqLowNode) return;
    var l=parseInt(document.getElementById('eqLow').value), m=parseInt(document.getElementById('eqMid').value), h=parseInt(document.getElementById('eqHigh').value);
    document.getElementById('eqLowVal').textContent=(l>=0?'+':'')+l+' dB';
    document.getElementById('eqMidVal').textContent=(m>=0?'+':'')+m+' dB';
    document.getElementById('eqHighVal').textContent=(h>=0?'+':'')+h+' dB';
    eqLowNode.gain.value=l; eqMidNode.gain.value=m; eqHighNode.gain.value=h;
}

// ═══════════════════════════════════════════════
// AUTOTUNE
// ═══════════════════════════════════════════════
var atKey='C', atMode='MAIOR', atSpeed=14, atAmount=0.65, atEnabled=false;
var keys=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function buildKeyGrid(){
    var grid=document.getElementById('keyGrid');
    if(!grid) return;
    grid.innerHTML='';
    keys.forEach(function(k){
        var btn=document.createElement('button');
        btn.textContent=k; btn.className='key-btn'+(k===atKey?' active':'');
        btn.onclick=function(){ atKey=k; buildKeyGrid(); };
        grid.appendChild(btn);
    });
}
function setMode(m){
    atMode=m;
    document.getElementById('modeMajor').className='toggle'+(m==='MAIOR'?' on':'');
    document.getElementById('modeMinor').className='toggle'+(m==='MENOR'?' on':'');
    document.getElementById('modeChrom').className='toggle'+(m==='CROM'?' on':'');
}
function toggleAutotuneMaster(){
    atEnabled=!atEnabled;
    var b=document.getElementById('autotuneMasterBtn'); b.textContent=atEnabled?'ON':'OFF'; b.className='toggle '+(atEnabled?'on':'');
}
function updateAutotuneParams(){
    atSpeed=parseInt(document.getElementById('atSpeed').value);
    atAmount=document.getElementById('atAmount').value/100;
    document.getElementById('atSpeedVal').textContent=atSpeed+'ms';
    document.getElementById('atAmountVal').textContent=Math.round(atAmount*100)+'%';
}

// ═══════════════════════════════════════════════
// AFINADOR
// ═══════════════════════════════════════════════
var tunerActive=false;
var tunerStrings = [
    {num:'6', name:'E2', freq:82.41, note:'E'},
    {num:'5', name:'A2', freq:110.00, note:'A'},
    {num:'4', name:'D3', freq:146.83, note:'D'},
    {num:'3', name:'G3', freq:196.00, note:'G'},
    {num:'2', name:'B3', freq:246.94, note:'B'},
    {num:'1', name:'E4', freq:329.63, note:'E'}
];
var tunerSelectedString=-1;

function buildTunerUI(){
    var container=document.getElementById('tunerStrings');
    if(!container) return;
    container.innerHTML='';
    tunerStrings.forEach(function(s,i){
        var btn=document.createElement('button');
        btn.innerHTML='<span class="str-num">'+s.num+'</span><span class="str-name">'+s.name+'</span>';
        btn.onclick=function(){ tunerSelectedString=(tunerSelectedString===i)?-1:i; buildTunerUI(); };
        if(tunerSelectedString===i) btn.classList.add('active');
        container.appendChild(btn);
    });
}

function toggleTuner(){
    tunerActive=!tunerActive;
    var b=document.getElementById('tunerToggleBtn');
    b.textContent=tunerActive?'🎸 AFINADOR ON':'🎸 AFINADOR OFF';
    b.className='toggle '+(tunerActive?'on':'');
    if(!tunerActive){ document.getElementById('tunerNote').textContent='--'; document.getElementById('tunerFreq').textContent='0.0 Hz'; document.getElementById('tunerCents').textContent='0 ¢'; }
}

function updateTunerPitch(){
    if(!tunerActive||!analyserMic) return;
    var buf=new Float32Array(analyserMic.fftSize);
    analyserMic.getFloatTimeDomainData(buf);
    var freq=detectPitch(buf,audioContext.sampleRate);
    if(freq>60&&freq<500){
        document.getElementById('tunerFreq').textContent=freq.toFixed(1)+' Hz';
        var midi=69+12*Math.log2(freq/440);
        var noteIdx=Math.round(midi)%12;
        var noteNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        var noteName=noteNames[((noteIdx%12)+12)%12];
        var cents=Math.round((midi-Math.round(midi))*100);
        document.getElementById('tunerNote').textContent=noteName;
        document.getElementById('tunerNote').style.color=Math.abs(cents)<5?'var(--green)':Math.abs(cents)<15?'#FFD600':'var(--warning)';
        document.getElementById('tunerCents').textContent=(cents>=0?'+':'')+cents+' ¢';
    }
}

function detectPitch(buf,sr){
    var zc=0; for(var i=1;i<buf.length;i++) if(buf[i-1]*buf[i]<0) zc++;
    var zcFreq=zc*sr/(2*buf.length);
    if(zcFreq<60||zcFreq>500) return 0;
    var centerLag=Math.round(sr/zcFreq);
    var minLag=Math.max(16,centerLag-150), maxLag=Math.min(buf.length-1,centerLag+150);
    if(minLag>=maxLag) return 0;
    var bestCorr=-1,bestLag=minLag;
    for(var lag=minLag;lag<maxLag;lag++){ var corr=0; for(var i=0;i<buf.length-lag;i++) corr+=buf[i]*buf[i+lag]; if(corr>bestCorr){bestCorr=corr;bestLag=lag;} }
    if(bestLag>0&&bestCorr>0.01) return sr/bestLag;
    return 0;
}

// ═══════════════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════════════
function switchTab(tab) {
    document.getElementById('screenMixer').classList.remove('active');
    document.getElementById('screenEffects').classList.remove('active');
    document.getElementById('screenAutotune').classList.remove('active');
    document.getElementById('screenTuner').classList.remove('active');
    if(tab==='mixer') document.getElementById('screenMixer').classList.add('active');
    else if(tab==='effects') document.getElementById('screenEffects').classList.add('active');
    else if(tab==='autotune') document.getElementById('screenAutotune').classList.add('active');
    else if(tab==='tuner') document.getElementById('screenTuner').classList.add('active');
    var btns=document.querySelectorAll('.nav-bar button');
    btns.forEach(function(b,i){
        b.classList.remove('active');
        if((tab==='mixer'&&i===0)||(tab==='effects'&&i===1)||(tab==='autotune'&&i===2)||(tab==='tuner'&&i===3)) b.classList.add('active');
    });
}

// ═══════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('startBtn').addEventListener('click', initAudio);
    document.getElementById('micGain').addEventListener('input', function(e){ setMicGain(e.target.value/100); });
    document.getElementById('playGain').addEventListener('input', function(e){ setPlayGain(e.target.value/100); });
    document.getElementById('masterFader').addEventListener('input', function(e){ setMasterGain(e.target.value/100); });
    document.getElementById('voiceFader').addEventListener('input', function(e){ setMicGain(e.target.value/100); });
    document.getElementById('playFader').addEventListener('input', function(e){ setPlayGain(e.target.value/100); });
    document.getElementById('monGain').addEventListener('input', function(e){ setMonGain(e.target.value/100); });
    document.getElementById('seekBar').addEventListener('input', function(e){ if(audioBuffer) playFromPosition((e.target.value/1000)*audioBuffer.duration); });
    setTimeout(function(){ initAudio().catch(function(){ showError('Toque no botao para iniciar'); }); }, 800);
});
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }
