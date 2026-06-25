// audio-processor.js - AudioWorklet para processamento de áudio
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = (event) => {
            if (event.data.type === 'setAutotune') {
                this.autotuneEnabled = event.data.enabled;
                this.autotuneSpeed = event.data.speed || 14;
                this.autotuneAmount = event.data.amount || 0.65;
            }
            if (event.data.type === 'setFx') {
                this.fxEnabled = event.data.enabled;
            }
        };
        this.autotuneEnabled = false;
        this.fxEnabled = true;
        this.autotuneSpeed = 14;
        this.autotuneAmount = 0.65;
        
        // Buffer para processamento do AutoTune (simulação)
        this.buffer = new Float32Array(1024);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        if (!input || !output || input.length === 0) return true;
        
        const inputChannel = input[0];
        const outputChannel = output[0];
        
        if (!inputChannel || !outputChannel) return true;
        
        const size = inputChannel.length;
        
        for (let i = 0; i < size; i++) {
            let sample = inputChannel[i];
            
            // Aplica efeitos se habilitados
            if (this.fxEnabled) {
                // Simula Reverb (delay simples)
                if (this.bufferIndex < this.buffer.length) {
                    this.buffer[this.bufferIndex] = sample * 0.3;
                    this.bufferIndex++;
                } else {
                    this.bufferIndex = 0;
                }
                
                // Adiciona reverb ao sinal
                const reverb = this.buffer[(this.bufferIndex + i) % this.buffer.length] || 0;
                sample = sample * 0.7 + reverb * 0.3;
            }
            
            // Aplica AutoTune se habilitado (simulação)
            if (this.autotuneEnabled) {
                // Aqui você chamaria sua função C++ via WASM
                // Por enquanto, simulação de pitch shift leve
                sample = sample * 0.98; // Simples pitch shift
            }
            
            outputChannel[i] = sample;
        }
        
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
