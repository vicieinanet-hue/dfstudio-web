// ================================================================
// DF STUDIO PRO - AUDIO WORKLET (LATÊNCIA ULTRA-BAIXA)
// ================================================================

class DfAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.sampleRate = 48000;

        // Ganhos
        this.micGain = 1.0;
        this.playGain = 0;
        this.masterGain = 0.5;
        this.monGain = 0.5;
        this.micMute = false;
        this.playMute = true;
        this.masterMute = false;
        this.monitorEnabled = true;
        this.playMono = false;
        this.micPan = 0;
        this.playPan = 0;
        this.masterPan = 0;

        this.fxEnabled = true;

        // Efeitos
        this.reverbEnabled = false;
        this.reverbMix = 0.25;
        this.delayEnabled = false;
        this.delayMix = 0.20;
        this.delayTimeMs = 250;
        this.delayFb = 0.4;
        this.chorusEnabled = false;
        this.chorusMix = 0.3;
        this.chorusRate = 0.5;
        this.eqEnabled = false;
        this.eqLow = 0;
        this.eqMid = 0;
        this.eqHigh = 0;
        this.compEnabled = false;
        this.compRatio = 4;
        this.compThresh = -20;
        this.gateEnabled = false;
        this.gateThresh = -45;

        // AutoTune
        this.atEnabled = false;
        this.atKey = 'C';
        this.atMode = 'MAIOR';
        this.atSpeed = 14;
        this.atAmount = 0.65;
        this.atFormant = 0;
        this.atDetune = 0;
        this.autoKeyEnabled = true;

        // Buffers
        this.revBuf = new Float32Array(2048);
        this.revPtr = 0;
        this.delayBuf = new Float32Array(48000);
        this.delayPtr = 0;
        this.chorusBuf = new Float32Array(512);
        this.chorusWritePtr = 0;
        this.chorusPhase = 0;
        this.gateEnv = 0;
        this.compGain = 1;
        this.lpLow = 0;
        this.lpMid = 0;
        this.lpHig = 0;

        // AutoTune buffers (menores para menos latência)
        this.shiftBuf = new Float32Array(512);
        this.shiftPos = 0;
        this.shiftRead = 0;
        this.smoothShift = 1;

        // Pitch detection
        this.pitchBuf = new Float32Array(1024);
        this.pitchPos = 0;
        this.detectedPitch = 0;
        this.detectedNote = '--';
        this.pitchCounter = 0;

        this.tunerActive = false;
        this.tunerBuf = new Float32Array(2048);
        this.tunerPos = 0;

        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const msg = event.data;
        switch (msg.type) {
            case 'setFxMaster':
                this.fxEnabled = msg.value;
                break;
            case 'setEffects':
                const d = msg.data;
                this.reverbEnabled = d.reverb;
                this.reverbMix = d.reverbMix;
                this.delayEnabled = d.delay;
                this.delayMix = d.delayMix;
                this.delayTimeMs = d.delayTime;
                this.delayFb = d.delayFb;
                this.chorusEnabled = d.chorus;
                this.chorusMix = d.chorusMix;
                this.chorusRate = d.chorusRate;
                this.eqEnabled = d.eq;
                this.eqLow = d.eqLow;
                this.eqMid = d.eqMid;
                this.eqHigh = d.eqHigh;
                this.compEnabled = d.comp;
                this.compRatio = d.compRatio;
                this.compThresh = d.compThresh;
                this.gateEnabled = d.gate;
                this.gateThresh = d.gateThresh;
                break;
            case 'setAutotune':
                const at = msg.data;
                this.atEnabled = at.enabled;
                this.atKey = at.key || 'C';
                this.atMode = at.mode || 'MAIOR';
                this.atSpeed = at.speed || 14;
                this.atAmount = at.amount || 0.65;
                this.atFormant = at.formant || 0;
                this.atDetune = at.detune || 0;
                this.autoKeyEnabled = at.autoKey !== undefined ? at.autoKey : true;
                break;
            case 'setPlayMono':
                this.playMono = msg.value;
                break;
            case 'setMonitor':
                this.monitorEnabled = msg.value;
                break;
            case 'setPan':
                const ch = msg.channel;
                const val = msg.value;
                if (ch === 'voice') this.micPan = val;
                else if (ch === 'play') this.playPan = val;
                else if (ch === 'master') this.masterPan = val;
                break;
            case 'setBufferSize':
                break;
            case 'startTuner':
                this.tunerActive = true;
                this.tunerPos = 0;
                this.tunerBuf.fill(0);
                break;
            case 'stopTuner':
                this.tunerActive = false;
                break;
        }
    }

    detectPitch(buffer, size) {
        let energy = 0;
        for (let i = 0; i < size; i++) energy += buffer[i] * buffer[i];
        if (energy < 0.001) return 0;

        const rms = Math.sqrt(energy / size);
        const minLag = 30;
        const maxLag = 600;
        let bestCorr = -1;
        let bestLag = minLag;

        for (let lag = minLag; lag < maxLag; lag++) {
            let corr = 0;
            let norm1 = 0, norm2 = 0;
            for (let i = 0; i < size - lag; i++) {
                corr += buffer[i] * buffer[i + lag];
                norm1 += buffer[i] * buffer[i];
                norm2 += buffer[i + lag] * buffer[i + lag];
            }
            if (norm1 > 0 && norm2 > 0) {
                corr /= Math.sqrt(norm1 * norm2);
                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestLag = lag;
                }
            }
        }

        if (bestLag > 0 && bestCorr > 0.5) {
            const freq = this.sampleRate / bestLag;
            if (freq > 60 && freq < 1200) return freq;
        }
        return 0;
    }

    freqToNote(freq) {
        if (freq < 60 || freq > 1200) return '--';
        const midi = 69 + 12 * Math.log2(freq / 440);
        const note = Math.round(midi) % 12;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return notes[((note % 12) + 12) % 12];
    }

    // ===== PROCESS PRINCIPAL OTIMIZADO =====
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !output || input.length === 0) return true;

        const inCh = input[0];
        const outL = output[0];
        const outR = output[1] || output[0];

        if (!inCh || !outL) return true;

        const size = inCh.length;
        
        // Cache de variáveis para acesso rápido
        const fxEnabled = this.fxEnabled;
        const micGain = this.micGain;
        const micMute = this.micMute;
        const monGain = this.monGain;
        const monitorEnabled = this.monitorEnabled;
        const masterGain = this.masterGain;
        const masterMute = this.masterMute;
        const micPan = this.micPan;
        const masterPan = this.masterPan;
        
        const reverbEnabled = this.reverbEnabled;
        const reverbMix = this.reverbMix;
        const delayEnabled = this.delayEnabled;
        const delayMix = this.delayMix;
        const delayTimeMs = this.delayTimeMs;
        const delayFb = this.delayFb;
        const chorusEnabled = this.chorusEnabled;
        const chorusMix = this.chorusMix;
        const chorusRate = this.chorusRate;
        const eqEnabled = this.eqEnabled;
        const eqLow = this.eqLow;
        const eqMid = this.eqMid;
        const eqHigh = this.eqHigh;
        const compEnabled = this.compEnabled;
        const compRatio = this.compRatio;
        const compThresh = this.compThresh;
        const gateEnabled = this.gateEnabled;
        const gateThresh = this.gateThresh;
        const atEnabled = this.atEnabled;
        
        const sampleRate = this.sampleRate;
        const delaySamples = Math.floor(delayTimeMs * sampleRate / 1000);
        const delayBufSize = 48000;
        const revBufSize = 2048;
        const chorusBufSize = 512;
        const maxChDelay = Math.min(Math.floor(sampleRate / 60), chorusBufSize - 2);
        
        let revPtr = this.revPtr;
        let delayPtr = this.delayPtr;
        let chorusWritePtr = this.chorusWritePtr;
        let chorusPhase = this.chorusPhase;
        let gateEnv = this.gateEnv;
        let compGain = this.compGain;
        let lpLow = this.lpLow;
        let lpMid = this.lpMid;
        let lpHig = this.lpHig;
        let smoothShift = this.smoothShift || 1;
        let shiftPos = this.shiftPos || 0;
        let shiftRead = this.shiftRead || 0;
        
        const revBuf = this.revBuf;
        const delayBuf = this.delayBuf;
        const chorusBuf = this.chorusBuf;
        const shiftBuf = this.shiftBuf;

        // Loop principal otimizado
        for (let i = 0; i < size; i++) {
            let sample = inCh[i] || 0;

            let voice = sample * micGain * (micMute ? 0 : 1);

            if (fxEnabled) {
                // Noise Gate
                if (gateEnabled) {
                    const thresh = Math.pow(10, gateThresh / 20);
                    const level = Math.abs(voice);
                    gateEnv = level > thresh ? gateEnv * 0.9 + 0.1 : gateEnv * 0.999;
                    voice *= Math.min(1, gateEnv * 3);
                }

                // Compressor
                if (compEnabled) {
                    const thresh = Math.pow(10, compThresh / 20);
                    const level = Math.abs(voice);
                    let targetGain = 1;
                    if (level > thresh) {
                        targetGain = Math.pow(thresh / level, 1 / compRatio);
                    }
                    const coeff = 0.01;
                    compGain = compGain * coeff + targetGain * (1 - coeff);
                    voice *= compGain;
                }

                // EQ
                if (eqEnabled) {
                    const lowGain = Math.pow(10, eqLow / 20);
                    const midGain = Math.pow(10, eqMid / 20);
                    const highGain = Math.pow(10, eqHigh / 20);
                    
                    lpLow = 0.05 * voice + 0.95 * lpLow;
                    const low = lpLow;
                    lpMid = 0.05 * voice + 0.95 * lpMid;
                    const mid = lpMid - low;
                    lpHig = 0.05 * voice + 0.95 * lpHig;
                    const high = voice - lpHig;
                    
                    voice = low * lowGain + mid * midGain + high * highGain;
                }

                // Chorus
                if (chorusEnabled) {
                    chorusBuf[chorusWritePtr] = voice;
                    chorusWritePtr = (chorusWritePtr + 1) % chorusBufSize;
                    chorusPhase += chorusRate * 6.283 / sampleRate;
                    if (chorusPhase > 6.283) chorusPhase -= 6.283;
                    const modDelay = (Math.sin(chorusPhase) * 0.5 + 0.5) * maxChDelay;
                    const dInt = Math.floor(modDelay);
                    const frac = modDelay - dInt;
                    let rp = (chorusWritePtr - dInt - 1 + chorusBufSize) % chorusBufSize;
                    let rp2 = (rp - 1 + chorusBufSize) % chorusBufSize;
                    const delayed = chorusBuf[rp] * (1 - frac) + chorusBuf[rp2] * frac;
                    voice = voice * (1 - chorusMix) + delayed * chorusMix;
                }

                // Delay
                if (delayEnabled && delaySamples > 0 && delaySamples < delayBufSize) {
                    const dPtr = (delayPtr - delaySamples + delayBufSize) % delayBufSize;
                    const ds = delayBuf[dPtr];
                    delayBuf[delayPtr] = voice + ds * delayFb * 0.5;
                    delayPtr = (delayPtr + 1) % delayBufSize;
                    voice = voice * (1 - delayMix) + ds * delayMix;
                }

                // Reverb
                if (reverbEnabled) {
                    const rv = revBuf[revPtr];
                    revBuf[revPtr] = voice + rv * 0.4;
                    revPtr = (revPtr + 1) % revBufSize;
                    voice = voice * (1 - reverbMix) + rv * reverbMix;
                }

                // AutoTune
                if (atEnabled) {
                    // Pitch shift com buffer de 512 amostras (~10ms)
                    shiftBuf[shiftPos] = voice;
                    shiftPos = (shiftPos + 1) % 512;
                    
                    // Detecção de pitch simplificada
                    this.pitchBuf[this.pitchPos] = voice;
                    this.pitchPos = (this.pitchPos + 1) % 1024;
                    this.pitchCounter++;
                    if (this.pitchCounter >= 256) {
                        this.pitchCounter = 0;
                        const pitch = this.detectPitch(this.pitchBuf, 1024);
                        if (pitch > 0) {
                            this.detectedPitch = pitch;
                            this.detectedNote = this.freqToNote(pitch);
                            this.port.postMessage({
                                type: 'pitchDetected',
                                frequency: pitch,
                                note: this.detectedNote
                            });
                        }
                    }

                    // Aplicar pitch shift
                    let targetShift = 1.0;
                    if (this.detectedPitch > 60 && this.detectedPitch < 1200) {
                        const noteMap = {
                            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4,
                            'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
                        };
                        const targetNote = noteMap[this.atKey] || 0;
                        const mode = this.atMode;
                        
                        const midi = 69 + 12 * Math.log2(this.detectedPitch / 440);
                        let targetMidi = Math.round(midi);
                        
                        const scale = mode === 'MAIOR' ? [0,2,4,5,7,9,11] :
                                      mode === 'MENOR' ? [0,2,3,5,7,8,10] :
                                      [0,1,2,3,4,5,6,7,8,9,10,11];
                        
                        let bestDist = 999;
                        let bestNote = targetMidi;
                        for (let oct = -2; oct <= 2; oct++) {
                            for (const s of scale) {
                                const candidate = targetNote + oct * 12 + s;
                                const dist = Math.abs(candidate - targetMidi);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    bestNote = candidate;
                                }
                            }
                        }
                        
                        const targetFreq = 440 * Math.pow(2, (bestNote - 69) / 12);
                        targetShift = targetFreq / this.detectedPitch;
                    }
                    
                    const amount = Math.min(1, Math.max(0, this.atAmount || 0.65));
                    const speed = Math.max(1, this.atSpeed || 14);
                    const coeffShift = 1 - Math.exp(-1 / (speed * 0.001 * sampleRate));
                    smoothShift += (targetShift - smoothShift) * coeffShift;
                    
                    shiftRead += smoothShift;
                    while (shiftRead >= 512) shiftRead -= 512;
                    while (shiftRead < 0) shiftRead += 512;
                    
                    const idx0 = Math.floor(shiftRead);
                    const frac = shiftRead - idx0;
                    const idx1 = (idx0 + 1) % 512;
                    const shifted = shiftBuf[idx0] * (1 - frac) + shiftBuf[idx1] * frac;
                    
                    voice = voice * (1 - amount * 0.7) + shifted * amount * 0.7;
                }
            }

            // PAN
            const voiceL = voice * (1 - micPan) * 0.707;
            const voiceR = voice * (1 + micPan) * 0.707;
            
            let playL = 0, playR = 0;

            const mon = monitorEnabled ? voice * monGain : 0;

            let mixL = (mon + playL) * masterGain * (masterMute ? 0 : 1);
            let mixR = (mon + playR) * masterGain * (masterMute ? 0 : 1);

            mixL *= (1 - masterPan) * 0.707;
            mixR *= (1 + masterPan) * 0.707;

            mixL = Math.tanh(mixL * 0.92);
            mixR = Math.tanh(mixR * 0.92);

            outL[i] = mixL || 0;
            if (outR) outR[i] = mixR || 0;
        }

        this.revPtr = revPtr;
        this.delayPtr = delayPtr;
        this.chorusWritePtr = chorusWritePtr;
        this.chorusPhase = chorusPhase;
        this.gateEnv = gateEnv;
        this.compGain = compGain;
        this.lpLow = lpLow;
        this.lpMid = lpMid;
        this.lpHig = lpHig;
        this.smoothShift = smoothShift;
        this.shiftPos = shiftPos;
        this.shiftRead = shiftRead;

        return true;
    }
}

registerProcessor('audio-processor', DfAudioProcessor);
