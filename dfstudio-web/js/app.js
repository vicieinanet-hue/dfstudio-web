if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }

function showError(msg){
    document.getElementById('splashLoader').style.display='none';
    document.getElementById('errorMsg').textContent=msg;
    document.getElementById('startBtn').style.display='block';
}

async function startApp(){
    try{
        document.getElementById('splashLoader').style.display='block';
        document.getElementById('startBtn').style.display='none';
        document.getElementById('errorMsg').textContent='Iniciando...';
        if(typeof engine==='undefined') throw new Error('Engine nao carregado');
        var ok = await engine.init();
        if(ok){
            document.getElementById('splash').style.display='none';
            document.getElementById('app').style.display='flex';
            engine.isRunning=true;
            engine.toggleMute('master');
            engine.setMasterGain(0.5);
            setInterval(updateUI, 100);
        } else { throw new Error('Falha ao iniciar audio'); }
    } catch(err){ showError('Erro: '+err.message+'. Toque para tentar.'); }
}

function updateUI(){
    if(!engine||!engine.isRunning) return;
    try{
        document.getElementById('latency').textContent = Math.round(engine.audioCtx.baseLatency*1000)+'ms';
        var vu = engine.getVu();
        var fills = document.querySelectorAll('.vu-fill');
        for(var i=0;i<fills.length;i++){ fills[i].style.height = (vu*100)+'%'; }
        if(engine.isPlaying && engine.audioBuffer){
            var ct = engine.audioCtx.currentTime - engine.sourceStartTime;
            document.getElementById('currentTime').textContent = formatTime(ct);
            document.getElementById('seekBar').value = (ct/engine.audioBuffer.duration)*1000||0;
        }
    } catch(e){}
}

function formatTime(s){ var m=Math.floor(s/60), sec=Math.floor(s%60); return m.toString().padStart(2,'0')+':'+sec.toString().padStart(2,'0'); }

// Eventos
document.getElementById('startBtn').addEventListener('click', startApp);
document.getElementById('micGain').addEventListener('input', function(e){ engine.setMicGain(e.target.value/100); });
document.getElementById('playGain').addEventListener('input', function(e){ engine.setPlayGain(e.target.value/100); });
document.getElementById('masterFader').addEventListener('input', function(e){ engine.setMasterGain(e.target.value/100); });
document.getElementById('voiceFader').addEventListener('input', function(e){ engine.setMicGain(e.target.value/100); });
document.getElementById('seekBar').addEventListener('input', function(e){ if(engine.audioBuffer) engine.playFromPosition((e.target.value/1000)*engine.audioBuffer.duration); });

function togglePlay(){ engine.togglePlay(); document.getElementById('playBtn').textContent = engine.isPlaying?'⏸️':'▶️'; }
function stopTrack(){ try{engine.sourceNode.stop();}catch(e){} engine.isPlaying=false; engine.playbackPosition=0; document.getElementById('playBtn').textContent='▶️'; }
function toggleMute(ch){ engine.toggleMute(ch); }
function toggleSolo(ch){}
function toggleFx(){ document.getElementById('fxBtn').classList.toggle('active'); }
function toggleAutotune(){ document.getElementById('atBtn').classList.toggle('active'); }
function togglePlayMono(){ engine.togglePlayMono(); document.getElementById('playMonoBtn').classList.toggle('active'); }
function toggleMonitor(){ document.getElementById('monitorBtn').classList.toggle('active'); }
function setPan(ch,v){ var btns=document.querySelectorAll('.'+ch+'-channel .btn-pan'); btns.forEach(function(b){b.classList.remove('active');}); if(v===-1)btns[0].classList.add('active'); else if(v===0)btns[1].classList.add('active'); else btns[2].classList.add('active'); }

function showMarkerDialog(){ document.getElementById('markerDialog').style.display='flex'; }
function closeMarkerDialog(){ document.getElementById('markerDialog').style.display='none'; }
function toggleManualTime(){ document.getElementById('manualTime').style.display = document.getElementById('useCurrentTime').checked?'none':'block'; }

function saveMarker(){
    var name = document.getElementById('markerName').value || 'Marcador';
    var timeUs;
    if(document.getElementById('useCurrentTime').checked){ timeUs = engine.getCurrentTime()*1000000; }
    else { var min=parseInt(document.getElementById('markerMin').value)||0; var sec=parseInt(document.getElementById('markerSec').value)||0; var ms=parseInt(document.getElementById('markerMs').value)||0; timeUs = (min*60+sec)*1000000 + ms*1000; }
    engine.markers.push({name:name, timeUs:timeUs});
    document.getElementById('markerCount').textContent = engine.markers.length;
    closeMarkerDialog();
}

function prevMarker(){
    if(!engine.markers.length) return;
    var cur = engine.getCurrentTime()*1000000;
    var sorted = engine.markers.slice().sort(function(a,b){return a.timeUs-b.timeUs;});
    var prev = sorted.filter(function(m){return m.timeUs < cur-500000;}).pop() || sorted[sorted.length-1];
    if(prev) engine.playFromPosition(prev.timeUs/1000000);
}

function nextMarker(){
    if(!engine.markers.length) return;
    var cur = engine.getCurrentTime()*1000000;
    var sorted = engine.markers.slice().sort(function(a,b){return a.timeUs-b.timeUs;});
    var next = sorted.find(function(m){return m.timeUs > cur+500000;}) || sorted[0];
    if(next) engine.playFromPosition(next.timeUs/1000000);
}

async function handleFileUpload(event){
    var file = event.target.files[0];
    if(file){
        var ok = await engine.loadAudioFile(file);
        if(ok){ document.getElementById('trackName').textContent = file.name.replace(/\.[^/.]+$/,''); document.getElementById('durationTime').textContent = formatTime(engine.getDuration()); }
    }
}

window.addEventListener('load', function(){ setTimeout(function(){ startApp().catch(function(){ showError('Toque no botao para iniciar e permita o microfone'); }); }, 1000); });
console.log('app.js OK');
