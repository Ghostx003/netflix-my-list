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

  public getApiKey(): string {
    return this.apiKey;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public getModel(): string {
    return this.primaryModel;
  }

  public setModel(model: string): void {
    this.primaryModel = model;
  }

  public async testQwen(prompt: string, modelName: string = 'qwen/qwen3.8-27b'): Promise<{
    success: boolean;
    reply?: string;
    latencyMs: number;
    model: string;
    tokens?: number;
    error?: string;
  }> {
    const start = performance.now();
    if (!this.isAvailable()) {
      return {
        success: false,
        latencyMs: 0,
        model: modelName,
        error: 'Groq API Key is missing or invalid (must start with gsk_)',
      };
    }

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are Qwen 28B, the ultimate AI film & television curator for Netflix India. Respond directly and accurately in your typical enthusiastic, insightful cinephile manner.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 600,
        }),
      });

      const elapsed = Math.round(performance.now() - start);

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          latencyMs: elapsed,
          model: modelName,
          error: `HTTP ${res.status}: ${errText}`,
        };
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      const tokens = data.usage?.total_tokens;

      return {
        success: true,
        reply: content || 'No response generated.',
        latencyMs: elapsed,
        model: data.model || modelName,
        tokens,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Math.round(performance.now() - start),
        model: modelName,
        error: err.message || 'Unknown network error',
      };
    }
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
