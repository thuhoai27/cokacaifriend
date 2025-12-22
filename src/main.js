import { AudioManager } from './audio-manager.js';
import { GeminiClient } from './gemini-client.js';
import { calculateAndLogCost } from './cost-calculator.js';
import { HistoryDB } from './history-db.js';


class App {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.transcriptDiv = document.getElementById('transcript');

        // Settings modal elements
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.closeModalBtn = document.getElementById('closeModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.toggleKeyBtn = document.getElementById('toggleKeyVisibility');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.playbackSpeedRange = document.getElementById('playbackSpeedRange');
        this.speedValue = document.getElementById('speedValue');
        this.aiRoleInput = document.getElementById('aiRoleInput');
        this.saveBtn = document.getElementById('saveBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.apiKeyStatus = document.getElementById('apiKeyStatus');

        this.apiKey = localStorage.getItem('gemini_api_key');
        this.voiceName = localStorage.getItem('voice_name') || 'Puck';
        this.aiRole = localStorage.getItem('ai_role') || '';
        this.playbackSpeed = parseFloat(localStorage.getItem('playback_speed')) || 1;

        this.audioManager = null;
        this.client = null;
        this.historyDB = new HistoryDB();

        this.inputText = "";
        this.outputText = "";
        this.audioData = "";

        this.currentUserLine = null;
        this.currentModelLine = null;

        this.bindEvents();

        // Show settings modal if no API key exists
        if (!this.apiKey) {
            this.openSettingsModal();
            this.showStatus('warning', 'API Key를 입력해주세요.');
        }
    }

    bindEvents() {
        this.startBtn.onclick = this.start.bind(this);
        this.stopBtn.onclick = this.stop.bind(this);
        this.settingsBtn.onclick = this.openSettingsModal.bind(this);
        this.closeModalBtn.onclick = this.closeSettingsModal.bind(this);
        this.cancelBtn.onclick = this.closeSettingsModal.bind(this);
        this.saveBtn.onclick = this.saveApiKey.bind(this);
        this.toggleKeyBtn.onclick = this.toggleKeyVisibility.bind(this);

        // Enter key support for API Key input
        this.apiKeyInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveApiKey();
            }
        };

        // Playback speed controls
        this.playbackSpeedRange.oninput = (e) => {
            const speed = parseFloat(e.target.value);
            this.speedValue.textContent = speed.toFixed(1);
        };

        // Speed preset buttons
        const presetBtns = document.querySelectorAll('.preset-btn');
        presetBtns.forEach(btn => {
            btn.onclick = () => {
                const speed = parseFloat(btn.getAttribute('data-speed'));
                this.playbackSpeedRange.value = speed;
                this.speedValue.textContent = speed.toFixed(1);
            };
        });

        // Example role buttons
        const exampleBtns = document.querySelectorAll('.example-btn');
        exampleBtns.forEach(btn => {
            btn.onclick = () => {
                this.aiRoleInput.value = btn.getAttribute('data-role');
            };
        });

        // Close modal when clicking outside
        this.settingsModal.onclick = (e) => {
            if (e.target === this.settingsModal) {
                this.closeSettingsModal();
            }
        };

        // Update settings button visual state
        this.updateSettingsButtonState();
    }

    openSettingsModal() {
        // Load current API key (masked)
        if (this.apiKey) {
            this.apiKeyInput.value = this.apiKey;
        }
        // Load current voice
        this.voiceSelect.value = this.voiceName;

        // Load current playback speed
        this.playbackSpeedRange.value = this.playbackSpeed;
        this.speedValue.textContent = this.playbackSpeed.toFixed(1);

        // Load current AI role
        this.aiRoleInput.value = this.aiRole;

        this.settingsModal.classList.add('active');
        this.apiKeyStatus.className = 'status-message';
    }

    closeSettingsModal() {
        this.settingsModal.classList.remove('active');
        this.apiKeyInput.value = '';
        this.apiKeyInput.type = 'password';
        this.apiKeyStatus.className = 'status-message';
    }

    toggleKeyVisibility() {
        if (this.apiKeyInput.type === 'password') {
            this.apiKeyInput.type = 'text';
        } else {
            this.apiKeyInput.type = 'password';
        }
    }

    saveApiKey() {
        const newKey = this.apiKeyInput.value.trim();
        const newVoice = this.voiceSelect.value;
        const newRole = this.aiRoleInput.value.trim();
        const newSpeed = parseFloat(this.playbackSpeedRange.value);

        if (!newKey) {
            this.showStatus('error', 'API Key를 입력해주세요.');
            return;
        }

        // Basic validation - check minimum length
        if (newKey.length < 20) {
            this.showStatus('error', 'API Key가 너무 짧습니다. 올바른 키를 입력해주세요.');
            return;
        }

        // Save the API key
        this.apiKey = newKey;
        localStorage.setItem('gemini_api_key', newKey);

        // Save the voice
        this.voiceName = newVoice;
        localStorage.setItem('voice_name', newVoice);

        // Save the AI role
        this.aiRole = newRole;
        localStorage.setItem('ai_role', newRole);

        // Save the playback speed
        this.playbackSpeed = newSpeed;
        localStorage.setItem('playback_speed', newSpeed.toString());

        // Update audio manager speed if active
        if (this.audioManager) {
            this.audioManager.setPlaybackSpeed(newSpeed);
        }

        // Update settings button state
        this.updateSettingsButtonState();

        // Close modal immediately
        this.closeSettingsModal();
    }

    showStatus(type, message) {
        this.apiKeyStatus.className = `status-message ${type}`;
        this.apiKeyStatus.textContent = message;
    }

    updateSettingsButtonState() {
        if (!this.apiKey) {
            this.settingsBtn.classList.add('needs-attention');
        } else {
            this.settingsBtn.classList.remove('needs-attention');
        }
    }

    async start() {
        // Check if API key exists
        if (!this.apiKey) {
            this.openSettingsModal();
            this.showStatus('error', 'API Key를 먼저 입력해주세요.');
            return;
        }

        this.startBtn.disabled = true;
        this.startBtn.style.display = 'none';
        this.stopBtn.disabled = false;
        this.stopBtn.style.display = 'flex';

        try {
            this.client = new GeminiClient(this.apiKey);
            this.audioManager = new AudioManager(this.playbackSpeed);

            await this.client.connect(this.handleServerMessage.bind(this), this.aiRole, this.voiceName);

            await this.audioManager.initialize((base64Chunk) => {
                this.client.sendAudioChunk(base64Chunk);
            });

        } catch (error) {
            console.error("Failed to start:", error);

            // Show user-friendly error message
            const errorMsg = error.message || error.toString();
            if (errorMsg.includes('WebSocket') || errorMsg.includes('401') || errorMsg.includes('403')) {
                alert('연결 실패: API Key가 올바르지 않거나 네트워크 오류가 발생했습니다.\n\n설정에서 API Key를 확인해주세요.');
            } else if (errorMsg.includes('microphone') || errorMsg.includes('NotAllowedError')) {
                alert('마이크 권한이 필요합니다.\n\n브라우저 설정에서 마이크 접근을 허용해주세요.');
            } else {
                alert('오류가 발생했습니다:\n' + errorMsg);
            }

            this.stopBtn.click();
        }
    }

    stop() {
        this.client?.close();
        this.audioManager?.close();

        this.client = null;
        this.audioManager = null;

        this.startBtn.disabled = false;
        this.startBtn.style.display = 'flex';
        this.stopBtn.disabled = true;
        this.stopBtn.style.display = 'none';

        const header = document.querySelector('.app-header');
        if (header) {
            header.classList.remove('listen-active');
            header.querySelector('h1').innerText = "코깎AI친구";
        }

        this.resetState();
    }

    resetState() {
        this.inputText = "";
        this.outputText = "";
        this.audioData = "";

        this.currentUserLine = null;
        this.currentModelLine = null;
    }

    handleServerMessage(msg) {
        if (msg?.setupComplete) {
            this.scrollToBottom();

            const header = document.querySelector('.app-header');
            if (header) {
                header.classList.add('listen-active');
                header.querySelector('h1').innerText = "듣고 있어요...";
            }
        }

        this.handleInputTranscription(msg);
        this.handleModelTurn(msg);
        this.handleOutputTranscription(msg);
        this.handleGenerationComplete(msg);
        this.handleAudioData(msg);

        if (msg.serverContent?.turnComplete) {
            const data = calculateAndLogCost(msg.usageMetadata);

            // Find last user message
            const userMsgs = this.transcriptDiv.querySelectorAll('.user-msg');
            const lastUserMsg = userMsgs[userMsgs.length - 1];
            if (lastUserMsg) {
                // Cost display removed
            }

            // Find last model message
            const modelMsgs = this.transcriptDiv.querySelectorAll('.model-msg');
            const lastModelMsg = modelMsgs[modelMsgs.length - 1];
            if (lastModelMsg) {
                // Cost display removed
            }

            // Save to DB
            this.historyDB.addRecord({
                inputTokens: data.input.tokens,
                inputCost: data.input.cost,
                outputTokens: data.output.tokens,
                outputCost: data.output.cost,
                totalCost: data.total.cost
            }).then(() => {
                console.log("Cost record saved to DB:", data.total.cost);
            }).catch(err => console.error("Failed to save cost record:", err));

            this.scrollToBottom();
        }
    }

    handleInterruption() {
        console.log("Interruption detected! Stopping audio and clearing output.");

        // Stop audio
        this.audioManager?.stop();

        // Reconnect to clear server state and prevent ghost data
        this.client?.reconnect().then(() => {
            console.log("Reconnected to server.");
        });

        // Remove current model output from UI if it exists
        if (this.currentModelLine) {
            this.currentModelLine.remove();
            this.currentModelLine = null;
        }

        // Clear output state
        this.outputText = "";
        this.audioData = "";

        // We do NOT clear inputText because that's the new user input coming in.
    }

    handleInputTranscription(msg) {
        if (msg.serverContent?.inputTranscription) {
            const text = msg.serverContent.inputTranscription.text || '';

            // Interruption logic: If we get input while output is accumulating or audio playing
            // If we have output text or a model line, we assume interruption.
            if (this.currentModelLine || this.outputText || this.audioManager?.scheduledSources?.length > 0) {
                this.handleInterruption();
            }

            this.inputText += text;
            this.updateTranscript(text, true);
        }
    }

    handleModelTurn(msg) {
        if (msg.serverContent?.modelTurn && this.inputText) {
            console.log(this.inputText);

            this.inputText = "";
            this.currentUserLine = null;
        }
    }

    handleOutputTranscription(msg) {
        if (msg.serverContent?.outputTranscription) {
            const text = msg.serverContent.outputTranscription.text || '';
            this.outputText += text;
            this.updateTranscript(text, false);
        }
    }

    handleGenerationComplete(msg) {
        if (msg.serverContent?.generationComplete) {
            console.log(this.outputText);

            this.outputText = "";
            this.currentModelLine = null;
        }
    }

    handleAudioData(msg) {
        if (msg.serverContent?.modelTurn) {
            msg.serverContent.modelTurn.parts.forEach(p => {
                if (p.inlineData?.mimeType.startsWith("audio/pcm")) {
                    const data = p.inlineData.data;
                    this.audioData += data;
                    this.audioManager?.play(data);
                }
            });
        }
    }

    updateTranscript(text, isUser) {
        if (!this.transcriptDiv) return;

        let currentLine = isUser ? this.currentUserLine : this.currentModelLine;

        if (!currentLine) {
            currentLine = document.createElement('p');
            currentLine.classList.add(isUser ? 'user-msg' : 'model-msg');
            this.transcriptDiv.appendChild(currentLine);
            this.scrollToBottom();

            if (isUser) this.currentUserLine = currentLine;
            else this.currentModelLine = currentLine;
        }

        currentLine.innerText += text;
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.transcriptDiv) {
            const container = this.transcriptDiv.parentElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }
}

new App();
