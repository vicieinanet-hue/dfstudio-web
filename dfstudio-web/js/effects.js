let fxEnabled = true;
let autotuneEnabled = false;
let reverbEnabled = false;
let delayEnabled = false;

function toggleFx() {
    fxEnabled = !fxEnabled;
    document.getElementById('fxBtn').classList.toggle('active', fxEnabled);
}

function toggleAutotune() {
    autotuneEnabled = !autotuneEnabled;
    document.getElementById('atBtn').classList.toggle('active', autotuneEnabled);
}

function togglePlayMono() {
    engine.togglePlayMono();
    document.getElementById('playMonoBtn').classList.toggle('active', engine.isPlayMono);
}

function toggleMonitor() {
    const btn = document.getElementById('monitorBtn');
    btn.classList.toggle('active');
}