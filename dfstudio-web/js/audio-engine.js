var engine = {
    audioCtx: null, isRunning: false, sampleRate: 48000,
    micGain: 0.65, playGain: 0.40, masterGain: 0.50,
    isMicMuted: true, isPlayMuted: true, isMasterMuted: true,
    isPlayMono: false,
    audioBuffer: null, sourceNode: null, isPlaying: false,
    playbackPosition: 0, markers: [], sourceStartTime: 0,
    micGainNode: null, playGainNode: null, masterGainNode: null,
    vuData: new Uint8Array(128),

    init: async function() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate, latencyHint: 'interactive' });
            this.sampleRate = this.audioCtx.sampleRate;
            this.micGainNode = this.audioCtx.createGain(); this.micGainNode.gain.value = 0;
            this.playGainNode = this.audioCtx.createGain(); this.playGainNode.gain.value = 0;
            this.masterGainNode = this.audioCtx.createGain(); this.masterGainNode.gain.value = 0;
            this.analyser = this.audioCtx.createAnalyser(); this.analyser.fftSize = 256;
            this.micGainNode.connect(this.analyser); this.analyser.connect(this.masterGainNode);
            this.playGainNode.connect(this.masterGainNode);
            this.masterGainNode.connect(this.audioCtx.destination);
            try {
                var stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
                var inputNode = this.audioCtx.createMediaStreamSource(stream);
                inputNode.connect(this.micGainNode);
            } catch(micErr) { console.warn('Microfone indisponivel'); }
            console.log('AudioEngine OK sr=' + this.sampleRate);
            return true;
        } catch(e) { console.error('AudioEngine:', e.message); return false; }
    },

    setMicGain: function(v) { this.micGain = v; if(this.micGainNode) this.micGainNode.gain.value = this.isMicMuted ? 0 : v * 4; },
    setPlayGain: function(v) { this.playGain = v; if(this.playGainNode) this.playGainNode.gain.value = this.isPlayMuted ? 0 : v; },
    setMasterGain: function(v) { this.masterGain = v; if(this.masterGainNode) this.masterGainNode.gain.value = this.isMasterMuted ? 0 : v; },

    toggleMute: function(ch) {
        if(ch==='voice'){ this.isMicMuted=!this.isMicMuted; this.setMicGain(this.micGain); }
        else if(ch==='play'){ this.isPlayMuted=!this.isPlayMuted; this.setPlayGain(this.playGain); }
        else if(ch==='master'){ this.isMasterMuted=!this.isMasterMuted; this.setMasterGain(this.masterGain); }
    },

    togglePlayMono: function(){ this.isPlayMono = !this.isPlayMono; },
    getVu: function(){ if(this.analyser){ this.analyser.getByteTimeDomainData(this.vuData); var s=0; for(var i=0;i<this.vuData.length;i++) s+=Math.abs(this.vuData[i]-128); return s/this.vuData.length/128; } return 0; },

    togglePlay: function(){
        if(this.isPlaying){ try{this.sourceNode.stop();}catch(e){} this.isPlaying=false; }
        else if(this.audioBuffer){ this.playFromPosition(this.playbackPosition); }
    },

    playFromPosition: function(pos){
        if(!this.audioBuffer||!this.audioCtx) return;
        try{this.sourceNode.stop();}catch(e){}
        this.sourceNode = this.audioCtx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.playGainNode);
        this.sourceNode.start(0, pos||0);
        this.isPlaying = true; this.playbackPosition = pos||0;
        this.sourceStartTime = this.audioCtx.currentTime - (pos||0);
    },

    loadAudioFile: async function(file){
        try{ var b=await file.arrayBuffer(); this.audioBuffer=await this.audioCtx.decodeAudioData(b); return true; }
        catch(e){ console.error('Audio:',e); return false; }
    },

    getCurrentTime: function(){ return this.audioCtx?this.audioCtx.currentTime:0; },
    getDuration: function(){ return this.audioBuffer?this.audioBuffer.duration:0; },
    destroy: function(){ try{this.audioCtx.close();}catch(e){} this.isRunning=false; }
};
console.log('audio-engine.js OK');
