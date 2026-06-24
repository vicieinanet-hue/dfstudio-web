function addMarker() {
    document.getElementById('markerDialog').style.display = 'flex';
    document.getElementById('markerName').value = '';
    document.getElementById('useCurrentTime').checked = true;
    document.getElementById('manualTime').style.display = 'none';
}

function closeMarkerDialog() {
    document.getElementById('markerDialog').style.display = 'none';
}

function toggleManualTime() {
    const useCurrent = document.getElementById('useCurrentTime').checked;
    document.getElementById('manualTime').style.display = useCurrent ? 'none' : 'block';
}

function saveMarker() {
    const name = document.getElementById('markerName').value || 'Marcador';
    let timeUs;
    
    if (document.getElementById('useCurrentTime').checked) {
        timeUs = engine.getCurrentTime() * 1000000;
    } else {
        const min = parseInt(document.getElementById('markerMin').value) || 0;
        const sec = parseInt(document.getElementById('markerSec').value) || 0;
        const ms = parseInt(document.getElementById('markerMs').value) || 0;
        timeUs = (min * 60 + sec) * 1000000 + ms * 1000;
    }
    
    engine.markers.push({ name, timeUs });
    updateMarkerDisplay();
    closeMarkerDialog();
}

function prevMarker() {
    if (!engine.markers.length) return;
    const cur = engine.getCurrentTime() * 1000000;
    const sorted = [...engine.markers].sort((a, b) => a.timeUs - b.timeUs);
    const prev = sorted.filter(m => m.timeUs < cur - 500000).pop() || sorted[sorted.length - 1];
    if (prev) engine.playFromPosition(prev.timeUs / 1000000);
}

function nextMarker() {
    if (!engine.markers.length) return;
    const cur = engine.getCurrentTime() * 1000000;
    const sorted = [...engine.markers].sort((a, b) => a.timeUs - b.timeUs);
    const next = sorted.find(m => m.timeUs > cur + 500000) || sorted[0];
    if (next) engine.playFromPosition(next.timeUs / 1000000);
}

function updateMarkerDisplay() {
    document.getElementById('markerCount').textContent = engine.markers.length;
}