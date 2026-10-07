/**
 * Groq Cloud High-Speed Inference Service.
 * Provides instant (<1.2s) inference for natural language understanding
 * and conversational recommendations using Qwen / GPT-OSS on Groq.
 */

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class GroqService {
  private apiKey: string;
  private endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  private model: string;

  constructor(apiKey?: string, model: string = 'qwen/qwen3.8-27b') {
    this.apiKey = apiKey || (import.meta.env.VITE_GROQ_API_KEY as string) || '';
    this.model = model;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('gsk_'));
  }

  public async chatCompletion(
    messages: GroqChatMessage[],
    temperature: number = 0.2,
    maxTokens: number = 500
  ): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!res.ok) {
        console.warn('Groq API returned error status:', res.status, await res.text());
        return null;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      console.warn('Groq chat completion fetch failed:', err);
      return null;
    }
  }
}

export const groqService = new GroqService();
