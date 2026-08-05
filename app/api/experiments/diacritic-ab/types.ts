export type CaseCategory = 'live' | 'synthetic' | 'ambiguous' | 'control';
export type ExperimentArm = 'google-auto' | 'google-vi' | 'llm-end-to-end' | 'restore-google';
export type RestorationStatus = 'resolved' | 'ambiguous';

export interface DiacriticCase {
  id: string;
  asciiInput: string;
  canonicalVietnamese?: string;
  acceptableEnglish?: string[];
  category: CaseCategory;
  reviewerNote?: string;
}

export interface ArmOutput {
  id: string;
  status: RestorationStatus;
  restoredVi?: string;
  english?: string;
  alternatives: string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export interface ArmResult {
  arm: ExperimentArm;
  outputs: ArmOutput[];
  usage?: TokenUsage;
  googleSourceCharacters?: number;
}

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpTransport {
  send(request: HttpRequest): Promise<HttpResponse>;
}
