import type {
  AIProvider,
  ChatParams,
  ProviderResponse,
  ToolCall,
  Message,
  ToolDefinition,
} from './types';

export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-pro';

const MODEL_CONFIG: Record<GeminiModel, { displayName: string; costPer1k: { input: number; output: number } }> = {
  'gemini-2.0-flash': {
    displayName: 'Gemini 2.0 Flash',
    costPer1k: { input: 0.0001, output: 0.0004 },
  },
  'gemini-2.5-flash': {
    displayName: 'Gemini 2.5 Flash',
    costPer1k: { input: 0.00015, output: 0.0006 },
  },
  'gemini-2.5-pro': {
    displayName: 'Gemini 2.5 Pro',
    costPer1k: { input: 0.00125, output: 0.01 },
  },
};

export const GEMINI_MODELS = Object.entries(MODEL_CONFIG).map(([id, config]) => ({
  id: id as GeminiModel,
  displayName: config.displayName,
}));

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: string } } };

type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: GeminiModel;

  constructor(apiKey: string, model: GeminiModel = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  getModelId(): string {
    return this.model;
  }

  getProviderName(): string {
    return 'Gemini';
  }

  getCostPer1kTokens(): { input: number; output: number } {
    return MODEL_CONFIG[this.model].costPer1k;
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      system_instruction: {
        parts: [{ text: params.system }],
      },
      contents: this.convertMessages(params.messages),
      tools: params.tools.length > 0
        ? [{ function_declarations: this.convertTools(params.tools) }]
        : undefined,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  private convertMessages(messages: Message[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.toolName ?? '',
              response: { result: msg.content },
            },
          }],
        });
      }
    }

    return contents;
  }

  private convertTools(tools: ToolDefinition[]): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  private parseResponse(data: unknown): ProviderResponse {
    const d = data as {
      candidates?: Array<{
        content?: { parts?: GeminiPart[] };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const parts = d.candidates?.[0]?.content?.parts ?? [];
    const usage = {
      inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0,
    };

    const toolCalls: ToolCall[] = [];
    const textParts: string[] = [];

    for (const part of parts) {
      if ('functionCall' in part) {
        toolCalls.push({
          id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      } else if ('text' in part) {
        textParts.push(part.text);
      }
    }

    return {
      text: textParts.length > 0 ? textParts.join('') : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
