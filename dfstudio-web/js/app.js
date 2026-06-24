// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Inicialização
async function initApp() {
    try {
        document.getElementById('splashLoader').style.display = 'block';
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('errorMsg').textContent = '';
        
        const ok = await engine.init();
        
        if (ok) {
            document.getElementById('splash').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            engine.isRunning = true;
            engine.toggleMute('master');
            setInterval(updateUI, 50);
            console.log('✅ App iniciado com sucesso!');
        } else {
            throw new Error('Falha ao iniciar motor de áudio');
        }
    } catch (err) {
        console.error('❌ Erro:', err.message);
        document.getElementById('splashLoader').style.display = 'none';
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('errorMsg').textContent = 'Toque no botão para iniciar e permita o microfone';
    }
}

function startApp() {
    initApp();
}

function updateUI() {
    if (!engine || !engine.isRunning) return;
    
    try {
        document.getElementById('latency').textContent = Math.round(engine.audioCtx.baseLatency * 1000) + 'ms';
        
        if (engine.isPlaying && engine.audioBuffer) {
            const ct = engine.audioCtx.currentTime - (engine.sourceStartTime || 0);
            document.getElementById('currentTime').textContent = formatTime(ct);
            document.getElementById('seekBar').value = (ct / engine.audioBuffer.duration) * 1000 || 0;
        }
    } catch(e) {}
}

// Event Listeners
document.getElementById('micGain').addEventListener('input', e => engine.setMicGain(e.target.value / 100));
document.getElementById('playGain').addEventListener('input', e => engine.setPlayGain(e.target.value / 100));
document.getElementById('masterFader').addEventListener('input', e => engine.setMasterGain(e.target.value / 100));
document.getElementById('voiceFader').addEventListener('input', e => engine.setMicGain(e.target.value / 100));

document.getElementById('seekBar').addEventListener('input', e => {
    if (engine.audioBuffer) {
        const pos = (e.target.value / 1000) * engine.audioBuffer.duration;
        engine.playFromPosition(pos);
    }
});

// Inicia automaticamente (com fallback para botão)
window.addEventListener('load', () => {
    setTimeout(() => {
        initApp().catch(() => {
            document.getElementById('splashLoader').style.display = 'none';
            document.getElementById('startBtn').style.display = 'block';
            document.getElementById('errorMsg').textContent = 'Toque no botão para iniciar e permita o microfone';
        });
    }, 800);
});
