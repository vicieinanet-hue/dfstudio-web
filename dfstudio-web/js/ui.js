function prevTrack() { engine.playFromPosition(0); }
function nextTrack() { engine.playFromPosition(0); }

function togglePlay() {
    engine.togglePlay();
    document.getElementById('playBtn').textContent = engine.isPlaying ? '⏸️' : '▶️';
}

function stopTrack() {
    engine.sourceNode?.stop();
    engine.isPlaying = false;
    engine.playbackPosition = 0;
    document.getElementById('playBtn').textContent = '▶️';
}

function toggleMute(ch) {
    engine.toggleMute(ch);
    const btns = document.querySelectorAll(`.channel .btn-mute`);
    if (ch === 'voice') btns[0]?.classList.toggle('active', engine.isMicMuted);
    if (ch === 'play') btns[1]?.classList.toggle('active', engine.isPlayMuted);
    if (ch === 'master') btns[2]?.classList.toggle('active', engine.isMasterMuted);
}

function toggleSolo(ch) {
    const btns = document.querySelectorAll(`.channel .btn-solo`);
    if (ch === 'voice') btns[0]?.classList.toggle('active');
    if (ch === 'play') btns[1]?.classList.toggle('active');
}

function setPan(ch, val) {
    const btns = document.querySelectorAll(`.${ch}-channel .btn-pan`);
    btns.forEach(b => b.classList.remove('active'));
    if (val === -1) btns[0].classList.add('active');
    else if (val === 0) btns[1].classList.add('active');
    else btns[2].classList.add('active');
}

function openTuner() { alert('Afinador - Em desenvolvimento'); }

function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        await engine.loadAudioFile(file);
        document.getElementById('trackName').textContent = file.name.replace(/\.[^/.]+$/, '');
        document.getElementById('durationTime').textContent = formatTime(engine.getDuration());
    }
}

function formatTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}