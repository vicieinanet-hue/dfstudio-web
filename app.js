// ================================================================
// DF STUDIO PRO - AUDIO WORKLET
// Processamento de áudio em tempo real com baixa latência
// ================================================================

class DfAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // ===== ESTADO =====
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

        // FX Master
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

        // Estado do processador
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

        // Pitch detection (simplificada)
        this.pitchBuf = new Float32Array(2048);
        this.pitchPos = 0;
        this.detectedPitch = 0;
        this.detectedNote = '--';
        this.pitchCounter = 0;

        // Tuner
        this.tunerActive = false;
        this.tunerBuf = new Float32Array(4096);
        this.tunerPos = 0;

        // Receiver de mensagens
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
                // Ajustar buffers se necessário
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

    // ===== DETECÇÃO DE PITCH =====
    detectPitch(buffer, size) {
        let energy = 0;
        for (let i = 0; i < size; i++) energy += buffer[i] * buffer[i];
        if (energy < 0.001) return 0;

        // Autocorrelação
        const rms = Math.sqrt(energy / size);
        const minLag = 40;
        const maxLag = 800;
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

    // ===== AUTO-TUNE (SIMPLIFICADO) =====
    processAutotune(input) {
        if (!this.atEnabled) return input;

        // Pitch detection simplificada
        this.pitchBuf[this.pitchPos] = input;
        this.pitchPos = (this.pitchPos + 1) % 2048;

        this.pitchCounter++;
        if (this.pitchCounter >= 512) {
            this.pitchCounter = 0;
            const pitch = this.detectPitch(this.pitchBuf, 2048);
            if (pitch > 0) {
                this.detectedPitch = pitch;
                this.detectedNote = this.freqToNote(pitch);
                // Enviar para UI
                this.port.postMessage({
                    type: 'pitchDetected',
                    frequency: pitch,
                    note: this.detectedNote
                });
            }
        }

        if (this.detectedPitch < 60 || this.detectedPitch > 1200) return input;

        // Mapear para nota alvo
        const noteMap = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4,
            'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        const targetNote = noteMap[this.atKey] || 0;
        const mode = this.atMode;

        const midi = 69 + 12 * Math.log2(this.detectedPitch / 440);
        let targetMidi = Math.round(midi);

        // Ajustar para a escala
        const scale = mode === 'MAIOR' ? [0,2,4,5,7,9,11] :
                      mode === 'MENOR' ? [0,2,3,5,7,8,10] :
                      [0,1,2,3,4,5,6,7,8,9,10,11]; // CROM

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
        const shift = targetFreq / this.detectedPitch;

        const amount = Math.min(1, Math.max(0, this.atAmount));
        const speed = Math.max(1, this.atSpeed);

        // Aplicar shift suavemente (sem buffer para baixa latência)
        // Usamos um filtro de primeira ordem para suavizar
        const coeff = 1 - Math.exp(-1 / (speed * 0.001 * this.sampleRate));
        this.smoothShift = this.smoothShift || 1;
        this.smoothShift += (shift - this.smoothShift) * coeff;

        // Aplicar formante e detune
        let finalShift = this.smoothShift;
        if (this.atFormant !== 0) {
            finalShift *= Math.pow(2, this.atFormant / 12);
        }
        if (this.atDetune !== 0) {
            finalShift *= Math.pow(2, this.atDetune / 1200);
        }

        // Limitar para evitar artefatos
        finalShift = Math.max(0.5, Math.min(2, finalShift));

        // Shift simples (sem delay) - apenas multiplicação
        // Para um shift mais realista, precisaríamos de um buffer, mas isso adiciona latência
        // Usamos um compromisso: shift com interpolação linear em buffer pequeno
        if (Math.abs(finalShift - 1) < 0.005) return input;

        // Buffer circular para pitch shift
        this.shiftBuf = this.shiftBuf || new Float32Array(1024);
        this.shiftPos = this.shiftPos || 0;
        this.shiftRead = this.shiftRead || 0;

        this.shiftBuf[this.shiftPos] = input;
        this.shiftPos = (this.shiftPos + 1) % 1024;

        this.shiftRead += finalShift;
        while (this.shiftRead >= 1024) this.shiftRead -= 1024;
        while (this.shiftRead < 0) this.shiftRead += 1024;

        const idx0 = Math.floor(this.shiftRead);
        const frac = this.shiftRead - idx0;
        const idx1 = (idx0 + 1) % 1024;
        const shifted = this.shiftBuf[idx0] * (1 - frac) + this.shiftBuf[idx1] * frac;

        // Mix
        return input * (1 - amount * 0.7) + shifted * amount * 0.7;
    }

    // ===== EF EITOS =====
    processReverb(input) {
        if (!this.reverbEnabled) return input;
        const rv = this.revBuf[this.revPtr];
        this.revBuf[this.revPtr] = input + rv * 0.4;
        this.revPtr = (this.revPtr + 1) % 2048;
        return input * (1 - this.reverbMix) + rv * this.reverbMix;
    }

    processDelay(input) {
        if (!this.delayEnabled) return input;
        const delaySamples = Math.floor(this.delayTimeMs * this.sampleRate / 1000);
        const dPtr = (this.delayPtr - delaySamples + 48000) % 48000;
        const ds = this.delayBuf[dPtr];
        this.delayBuf[this.delayPtr] = input + ds * this.delayFb * 0.5;
        this.delayPtr = (this.delayPtr + 1) % 48000;
        return input * (1 - this.delayMix) + ds * this.delayMix;
    }

    processChorus(input) {
        if (!this.chorusEnabled) return input;
        this.chorusBuf[this.chorusWritePtr] = input;
        this.chorusWritePtr = (this.chorusWritePtr + 1) % 512;
        this.chorusPhase += this.chorusRate * 6.283 / this.sampleRate;
        if (this.chorusPhase > 6.283) this.chorusPhase -= 6.283;
        const maxDelay = 256;
        const modDelay = (Math.sin(this.chorusPhase) * 0.5 + 0.5) * maxDelay;
        const dInt = Math.floor(modDelay);
        const frac = modDelay - dInt;
        const rp = (this.chorusWritePtr - dInt - 1 + 512) % 512;
        const rp2 = (rp - 1 + 512) % 512;
        const delayed = this.chorusBuf[rp] * (1 - frac) + this.chorusBuf[rp2] * frac;
        return input * (1 - this.chorusMix) + delayed * this.chorusMix;
    }

    processEQ(input) {
        if (!this.eqEnabled) return input;
        // Filtros de primeira ordem
        const lowGain = Math.pow(10, this.eqLow / 20);
        const midGain = Math.pow(10, this.eqMid / 20);
        const highGain = Math.pow(10, this.eqHigh / 20);

        // Low-pass (simples)
        this.lpLow = 0.05 * input + 0.95 * this.lpLow;
        const low = this.lpLow;

        // Mid (band-pass simplificado)
        this.lpMid = 0.05 * input + 0.95 * this.lpMid;
        const mid = this.lpMid - low;

        // High
        this.lpHig = 0.05 * input + 0.95 * this.lpHig;
        const high = input - this.lpHig;

        return low * lowGain + mid * midGain + high * highGain;
    }

    processCompressor(input) {
        if (!this.compEnabled) return input;
        const thresh = Math.pow(10, this.compThresh / 20);
        const ratio = this.compRatio;
        const level = Math.abs(input);
        let targetGain = 1;
        if (level > thresh) {
            targetGain = Math.pow(thresh / level, 1 / ratio);
        }
        // Attack/release simples
        const coeff = 0.01;
        this.compGain = this.compGain * coeff + targetGain * (1 - coeff);
        return input * this.compGain;
    }

    processGate(input) {
        if (!this.gateEnabled) return input;
        const thresh = Math.pow(10, this.gateThresh / 20);
        const level = Math.abs(input);
        this.gateEnv = level > thresh ? this.gateEnv * 0.9 + 0.1 : this.gateEnv * 0.999;
        return input * Math.min(1, this.gateEnv * 3);
    }

    // ===== PROCESS PRINCIPAL =====
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !output || input.length === 0) return true;

        const inCh = input[0];
        const outL = output[0];
        const outR = output[1] || output[0];

        if (!inCh || !outL) return true;

        const size = inCh.length;

        for (let i = 0; i < size; i++) {
            let sample = inCh[i] || 0;

            // Ganho do microfone
            let voice = sample * this.micGain * (this.micMute ? 0 : 1);

            // FX Chain
            if (this.fxEnabled) {
                voice = this.processGate(voice);
                voice = this.processCompressor(voice);
                voice = this.processEQ(voice);
                voice = this.processChorus(voice);
                voice = this.processDelay(voice);
                voice = this.processReverb(voice);
                voice = this.processAutotune(voice);
            }

            // PAN
            const micPan = this.micPan;
            const voiceL = voice * (1 - micPan) * 0.707;
            const voiceR = voice * (1 + micPan) * 0.707;

            // PLAYBACK (simulado - será substituído por áudio externo)
            // Na prática, o playback vem do pushExternalAudio
            let playL = 0, playR = 0;
            // TODO: receber áudio do playback

            // Play PAN
            const playPan = this.playPan;
            playL *= (1 - playPan) * 0.707 * this.playGain * (this.playMute ? 0 : 1);
            playR *= (1 + playPan) * 0.707 * this.playGain * (this.playMute ? 0 : 1);

            if (this.playMono) {
                const mono = (playL + playR) * 0.5;
                playL = mono;
                playR = mono;
            }

            // Monitor
            const mon = this.monitorEnabled ? voice * this.monGain : 0;

            // Mix
            let mixL = (mon + playL) * this.masterGain * (this.masterMute ? 0 : 1);
            let mixR = (mon + playR) * this.masterGain * (this.masterMute ? 0 : 1);

            // Master PAN
            const masterPan = this.masterPan;
            mixL *= (1 - masterPan) * 0.707;
            mixR *= (1 + masterPan) * 0.707;

            // Clipping suave
            mixL = Math.tanh(mixL * 0.92);
            mixR = Math.tanh(mixR * 0.92);

            outL[i] = mixL || 0;
            if (outR) outR[i] = mixR || 0;
        }

        return true;
    }
}

registerProcessor('audio-processor', DfAudioProcessor);
