if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
}

async function initApp() {
    document.getElementById('splash').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const ok = await engine.init();
    if (ok) {
        engine.isRunning = true;
        engine.toggleMute('master');
        setInterval(updateUI, 50);
    }
}

function updateUI() {
    if (!engine.isRunning) return;
    document.getElementById('latency').textContent = Math.round(engine.audioCtx.baseLatency * 1000) + 'ms';
    
    if (engine.isPlaying) {
        document.getElementById('currentTime').textContent = formatTime(engine.getCurrentTime());
        document.getElementById('seekBar').value = (engine.getCurrentTime() / engine.getDuration()) * 1000 || 0;
    }
}

document.getElementById('micGain').addEventListener('input', e => engine.setMicGain(e.target.value / 100));
document.getElementById('playGain').addEventListener('input', e => engine.setPlayGain(e.target.value / 100));
document.getElementById('masterFader').addEventListener('input', e => engine.setMasterGain(e.target.value / 100));
document.getElementById('voiceFader').addEventListener('input', e => engine.setMicGain(e.target.value / 100));
document.getElementById('seekBar').addEventListener('input', e => {
    if (engine.audioBuffer) engine.playFromPosition((e.target.value / 1000) * engine.getDuration());
});

window.addEventListener('load', () => setTimeout(initApp, 1500));