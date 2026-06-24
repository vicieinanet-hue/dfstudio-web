class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isRunning = false;
        this.sampleRate = 48000;
        this.micGain = 0.65; this.playGain = 0.40; this.masterGain = 0.50;
        this.isMicMuted = true; this.isPlayMuted = true; this.isMasterMuted = true;
        this.isPlayMono = false;
        this.voicePan = 0; this.playPan = 0; this.masterPan = 0;
        this.audioBuffer = null; this.sourceNode = null;
        this.isPlaying = false; this.playbackPosition = 0;
        this.markers = [];
    }

    async init() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate, latencyHint: 'interactive' });
            this.sampleRate = this.audioCtx.sampleRate;
            this.setupAudioNodes();
            await this.requestMicrophone();
            console.log('✅ AudioEngine iniciado. SampleRate:', this.sampleRate);
            return true;
        } catch (e) { console.error('❌ Erro:', e); return false; }
    }

    setupAudioNodes() {
        const ctx = this.audioCtx;
        this.micGainNode = ctx.createGain(); this.micGainNode.gain.value = 0;
        this.playGainNode = ctx.createGain(); this.playGainNode.gain.value = 0;
        this.masterGainNode = ctx.createGain(); this.masterGainNode.gain.value = 0;
        this.micGainNode.connect(this.masterGainNode);
        this.playGainNode.connect(this.masterGainNode);
        this.masterGainNode.connect(ctx.destination);
    }

    async requestMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            this.inputNode = this.audioCtx.createMediaStreamSource(stream);
            this.inputNode.connect(this.micGainNode);
            console.log('✅ Microfone conectado');
        } catch (e) { console.error('❌ Microfone:', e); }
    }

    togglePlay() {
        if (this.isPlaying) { this.sourceNode?.stop(); this.isPlaying = false; }
        else if (this.audioBuffer) { this.playFromPosition(this.playbackPosition); }
    }

    playFromPosition(pos = 0) {
        if (!this.audioBuffer) return;
        this.sourceNode?.stop();
        this.sourceNode = this.audioCtx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.playGainNode);
        this.sourceNode.start(0, pos);
        this.isPlaying = true; this.playbackPosition = pos;
    }

    async loadAudioFile(file) {
        const buf = await file.arrayBuffer();
        this.audioBuffer = await this.audioCtx.decodeAudioData(buf);
        console.log('✅ Áudio:', file.name, this.audioBuffer.duration + 's');
    }

    setMicGain(v) { this.micGain = v; this.micGainNode.gain.value = this.isMicMuted ? 0 : v * 4; }
    setPlayGain(v) { this.playGain = v; this.playGainNode.gain.value = this.isPlayMuted ? 0 : v; }
    setMasterGain(v) { this.masterGain = v; this.masterGainNode.gain.value = this.isMasterMuted ? 0 : v; }

    toggleMute(ch) {
        if (ch === 'voice') { this.isMicMuted = !this.isMicMuted; this.micGainNode.gain.value = this.isMicMuted ? 0 : this.micGain * 4; }
        else if (ch === 'play') { this.isPlayMuted = !this.isPlayMuted; this.playGainNode.gain.value = this.isPlayMuted ? 0 : this.playGain; }
        else if (ch === 'master') { this.isMasterMuted = !this.isMasterMuted; this.masterGainNode.gain.value = this.isMasterMuted ? 0 : this.masterGain; }
    }

    togglePlayMono() { this.isPlayMono = !this.isPlayMono; }
    getCurrentTime() { return this.audioCtx ? this.audioCtx.currentTime : 0; }
    getDuration() { return this.audioBuffer ? this.audioBuffer.duration : 0; }
    destroy() { this.audioCtx?.close(); this.isRunning = false; }
}

const engine = new AudioEngine();