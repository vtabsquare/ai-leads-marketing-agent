// ==============================================================================
// SERVER-ONLY IMAGE PROVIDER TYPES & INTERFACE
// Must ONLY be imported from server middleware (vite.config.ts) or Node scripts.
// ==============================================================================

export type ImageAspectRatio = '4:5' | '1.91:1' | '1:1';

export type ImageProviderName = 'cloudflare' | 'huggingface' | 'piapi' | 'flux';

export type EnvMap = Record<string, string | undefined>;

export interface GenerateImageInput {
  /** Primary creative prompt (for text-capable providers like Qwen-Image) */
  prompt: string;
  /** Target platform aspect ratio; providers generate at nearest native ratio */
  aspectRatio: ImageAspectRatio;
  /** Optional sanitized prompt with zero text directives (used only when requiresText is false) */
  textFreePrompt?: string;
  /**
   * When true, FLUX.1-schnell fallback is strictly skipped because typography
   * inside the image is required and FLUX produces garbled text.
   */
  requiresText?: boolean;
  /** Optional deterministic/varied seed for multi-candidate generation */
  seed?: number;
  /** Per-provider attempt timeout / polling deadline override (ms) */
  timeoutMs?: number;
}

export interface ImageProvider {
  readonly name: ImageProviderName;
  /** Whether this provider reliably renders designed text inside the image */
  readonly supportsText: boolean;
  isConfigured(env?: EnvMap): boolean;
  generateImage(input: { prompt: string; aspectRatio: ImageAspectRatio; seed?: number; timeoutMs?: number }, env?: EnvMap): Promise<Buffer>;
}

export interface ProviderAttemptError {
  provider: ImageProviderName;
  attempt: number;
  message: string;
}

export interface OrchestratedImageResult {
  buffer: Buffer;
  provider: ImageProviderName;
  attemptCount: number;
  generatedWidth: number;
  generatedHeight: number;
}

export class AllProvidersFailedError extends Error {
  public readonly allProvidersFailed = true;
  public readonly failures: ProviderAttemptError[];

  constructor(message: string, failures: ProviderAttemptError[]) {
    super(message);
    this.name = 'AllProvidersFailedError';
    this.failures = failures;
  }
}

export function isRateLimitOrTransient(status: number, message = ''): boolean {
  if (status === 429 || status >= 500 || status === 408) return true;
  const lower = message.toLowerCase();
  return lower.includes('timeout') || lower.includes('aborted') || lower.includes('rate');
}
