// OpenClaw Gateway response types (OpenAI-compatible)

export interface OpenClawChatResponse {
  id: string;
  object: string;
  created: number;
  choices: OpenClawChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenClawChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

export interface OpenClawStreamChunk {
  id: string;
  object: string;
  created: number;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}
