/**
 * Groq Cloud High-Speed Inference Service.
 * Provides instant (<1.2s) inference for natural language understanding
 * and conversational recommendations using Qwen / GPT-OSS on Groq.
 */

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY as string) || '';
const SUPPORTED_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

export class GroqService {
  private apiKey: string;
  private endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  private primaryModel: string;

  constructor(apiKey?: string, model: string = 'qwen/qwen3.8-27b') {
    this.apiKey = apiKey || (import.meta.env.VITE_GROQ_API_KEY as string) || DEFAULT_GROQ_API_KEY;
    this.primaryModel = model;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('gsk_'));
  }

  public async chatCompletion(
    messages: GroqChatMessage[],
    temperature: number = 0.3,
    maxTokens: number = 600
  ): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const modelsToTry = [this.primaryModel, ...SUPPORTED_MODELS.filter(m => m !== this.primaryModel)];

    for (const modelName of modelsToTry) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`Groq model ${modelName} returned status ${res.status}:`, errText);
          continue; // Try next fallback model
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return content;
        }
      } catch (err) {
        console.warn(`Groq request failed with model ${modelName}:`, err);
      }
    }

    return null;
  }
}

export const groqService = new GroqService();
