export class AudioManager {
    constructor(playbackSpeed = 1.5) {
        this.ctx = null;
        this.node = null;
        this.source = null;
        this.stream = null;
        this.stream = null;
        this.nextPlayTime = 0;
        this.scheduledSources = [];
        this.playbackSpeed = playbackSpeed;
    }

    setPlaybackSpeed(speed) {
        this.playbackSpeed = speed;
    }

    stop() {
        if (this.ctx) {
            this.scheduledSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {
                    // ignore if already stopped
                }
            });
        }
        this.scheduledSources = [];
        this.nextPlayTime = 0;

        // Reset time to current context time to avoid large gaps if we resume
        if (this.ctx) {
            this.nextPlayTime = this.ctx.currentTime;
        }
    }

    async initialize(onAudioChunk) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

        const workletCode = `
            class AudioProcessor extends AudioWorkletProcessor {
                process(inputs) {
                    const input = inputs[0][0];
                    if (input) {
                        const pcm16 = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) {
                            pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
                        }
                        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `;

        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.ctx.audioWorklet.addModule(url);

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        this.source = this.ctx.createMediaStreamSource(this.stream);
        this.node = new AudioWorkletNode(this.ctx, 'audio-processor');

        this.node.port.onmessage = (e) => {
            const base64 = btoa(String.fromCharCode(...new Uint8Array(e.data)));
            onAudioChunk(base64);
        };

        this.source.connect(this.node);
    }

    play(base64Data) {
        if (!this.ctx) return;

        const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        const int16Data = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) float32Data[i] = int16Data[i] / 32768.0;

        const buffer = this.ctx.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = this.playbackSpeed; // 재생 속도 설정
        source.connect(this.ctx.destination);

        const startTime = Math.max(this.ctx.currentTime, this.nextPlayTime);
        source.start(startTime);
        // 속도에 따라 실제 재생 시간 조정
        this.nextPlayTime = startTime + (buffer.duration / this.playbackSpeed);

        this.scheduledSources.push(source);
        source.onended = () => {
            this.scheduledSources = this.scheduledSources.filter(s => s !== source);
        };
    }

    close() {
        this.stream?.getTracks().forEach(t => t.stop());
        this.ctx?.close();
        this.node?.port.close();

        this.ctx = null;
        this.node = null;
        this.source = null;
        this.stream = null;
        this.nextPlayTime = 0;
    }
}
