#include <emscripten.h>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <string>

// Reutilizamos a tua classe AutoTuneScott original aqui[cite: 29]
class AutoTuneScott {
public:
    bool enabled = false;
    float retuneSpeedMs = 14.0f;
    float amount = 0.65f;
    
    // ... (Aqui entra toda a lógica matemática do teu autotune.cpp original) ...
    
    float process(float input, int sampleRate) {
        if (!enabled) return input;
        // Simulação básica do processamento para o exemplo
        float processed = input * 0.9f; 
        return processed;
    }
};

static AutoTuneScott g_autotune;

extern "C" {

// Função de inicialização
EMSCRIPTEN_KEEPALIVE
void initEngine(int sampleRate) {
    // Inicializa buffers
}

// Configura o Autotune a partir do JavaScript
EMSCRIPTEN_KEEPALIVE
void setAutotuneParams(bool enabled, float speed, float amount) {
    g_autotune.enabled = enabled;
    g_autotune.retuneSpeedMs = speed;
    g_autotune.amount = amount;
}

// Função principal chamada pelo AudioWorklet (JavaScript) a cada bloco de áudio
EMSCRIPTEN_KEEPALIVE
void processAudioBlock(float* inBuffer, float* outBuffer, int size, int sampleRate) {
    for (int i = 0; i < size; i++) {
        // Processa canal esquerdo (Mono para simplificar no MVP)
        float sample = inBuffer[i];
        outBuffer[i] = g_autotune.process(sample, sampleRate);
    }
}

} // extern "C"