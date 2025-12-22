export class GeminiClient {
    constructor(apiKey, model = "gemini-2.5-flash-native-audio-preview-12-2025") {
        this.apiKey = apiKey;
        this.model = model;
        this.ws = null;
        this.onMessage = null;
    }

    connect(onMessage, customRole = '', voiceName = 'Puck') {
        this.onMessage = onMessage;
        this.customRole = customRole;
        this.voiceName = voiceName;
        const endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

        this.ws = new WebSocket(endpoint);

        return new Promise((resolve, reject) => {
            this.ws.onopen = () => {
                this.sendSetup();
                resolve();
            };
            this.ws.onerror = (error) => reject(error);
            this.ws.onmessage = this.handleMessage.bind(this);
        });
    }

    async reconnect() {
        this.close();
        // Slight delay to ensure socket cleanup? Usually not needed for new instance.
        // But let's create a new promise for the new connection.
        // We reuse the saved onMessage, customRole, and voiceName.
        return this.connect(this.onMessage, this.customRole, this.voiceName);
    }

    sendSetup() {
        // Use custom role if provided, otherwise use default
        const systemInstruction = this.customRole ?
            `${this.customRole}

Important guidelines:
- Automatically detect and respond in the same language the user speaks
- Keep responses concise and natural
- Remember context from the conversation to maintain continuity`
            :
            `You are a friendly, warm, and supportive AI companion. Your role is to be the user's close friend who they can talk to anytime.

Key traits:
- Be empathetic, understanding, and a good listener
- Show genuine interest in what the user shares
- Automatically detect and respond in the same language the user speaks
- Use very casual, informal speech like you're talking to a close friend
- In Korean, always use 반말 (banmal/informal speech), never 존댓말 (formal speech)
- In English, use casual contractions and friendly slang
- In other languages, use the most informal, friendly register available
- Be supportive and encouraging, but also honest when needed
- Ask thoughtful follow-up questions to keep the conversation flowing
- Share your thoughts and perspectives casually, like chatting with a buddy
- Remember context from the conversation to maintain continuity
- Be cheerful and positive, but adapt your tone to match the user's mood
- Keep responses concise and natural, like texting a close friend
- Don't be overly polite or formal - be relaxed and comfortable

Your goal is to provide meaningful companionship and make the user feel heard and valued, like they're talking to their best friend.`;

        this.send({
            setup: {
                model: `models/${this.model}`,
                "system_instruction":
                {
                    "parts": [
                        {
                            "text": systemInstruction
                        }
                    ]
                },
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: { prebuilt_voice_config: { voice_name: this.voiceName } }
                    }
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {}
            }
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    sendAudioChunk(base64) {
        this.send({
            realtime_input: { media_chunks: [{ data: base64, mime_type: "audio/pcm" }] }
        });
    }

    async handleMessage(event) {
        let text = event.data;
        if (event.data instanceof Blob) {
            text = await event.data.text();
        }

        try {
            const msg = JSON.parse(text);
            if (this.onMessage) {
                this.onMessage(msg);
            }
        } catch (e) {
            console.error("Error parsing message:", e);
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
