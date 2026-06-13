export type Message = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ProviderResponse = {
  text?: string;
  toolCalls?: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type ChatParams = {
  messages: Message[];
  tools: ToolDefinition[];
  system: string;
};

export interface AIProvider {
  chat(params: ChatParams): Promise<ProviderResponse>;
  getModelId(): string;
  getProviderName(): string;
  getCostPer1kTokens(): { input: number; output: number };
}
