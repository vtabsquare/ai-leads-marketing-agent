// ==============================================================================
// SERVER-ONLY IMAGE PROVIDER ORCHESTRATOR
// Priority: 1) Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
//           2) Hugging Face Inference API (black-forest-labs/FLUX.1-schnell)
//           3) PiAPI (Qwen-Image)
//           4) Public FLUX.1-schnell Space (unauthenticated fallback)
// ==============================================================================

import { cloudflareProvider, getCloudflareDimensions } from './cloudflare.ts';
import { huggingFaceProvider, getHuggingFaceDimensions } from './huggingface.ts';
import { piApiProvider, getPiApiDimensions } from './piapi.ts';
import { fluxProvider, getFluxDimensions } from './flux.ts';
import {
  AllProvidersFailedError,
  type EnvMap,
  type GenerateImageInput,
  type ImageProvider,
  type OrchestratedImageResult,
  type ProviderAttemptError,
} from './types.ts';

export * from './types.ts';
export { cloudflareProvider, huggingFaceProvider, piApiProvider, fluxProvider };

const MAX_ATTEMPTS_PER_PROVIDER = 2;

function getProvidersForRequest(requiresText: boolean): ImageProvider[] {
  const ordered: ImageProvider[] = [
    cloudflareProvider,
    huggingFaceProvider,
    piApiProvider,
    fluxProvider,
  ];
  if (requiresText) {
    // Strictly disallow non-text providers when typography inside the image is required
    return ordered.filter((p) => p.supportsText);
  }
  return ordered;
}

function getExpectedDimensions(provider: ImageProvider['name'], aspectRatio: GenerateImageInput['aspectRatio']) {
  if (provider === 'cloudflare') return getCloudflareDimensions(aspectRatio);
  if (provider === 'huggingface') return getHuggingFaceDimensions(aspectRatio);
  if (provider === 'piapi') return getPiApiDimensions(aspectRatio);
  return getFluxDimensions(aspectRatio);
}

function isNonRetryableAuthError(msg: string): boolean {
  return /\b(401|402|403|429|invalid token|unauthorized|not configured|insufficient credits|quota|provider unavailable)\b/i.test(msg);
}

/**
 * Generates an image buffer across configured providers in priority order,
 * logging provider + attempt count and throwing AllProvidersFailedError if none succeed.
 */
export async function generateImageWithFallback(
  input: GenerateImageInput,
  env: EnvMap = process.env
): Promise<OrchestratedImageResult> {
  const requiresText = input.requiresText ?? true;
  const candidates = getProvidersForRequest(requiresText);
  const failures: ProviderAttemptError[] = [];
  let totalAttempts = 0;

  for (const provider of candidates) {
    if (!provider.isConfigured(env)) {
      const msg = `${provider.name} skipped (API key/token not configured in .env)`;
      console.warn(`[imageProviders] ${msg}`);
      failures.push({ provider: provider.name, attempt: 0, message: msg });
      continue;
    }

    const promptToUse =
      provider.supportsText ? input.prompt : input.textFreePrompt || input.prompt;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      totalAttempts++;
      console.info(
        `[imageProviders] Attempt ${attempt}/${MAX_ATTEMPTS_PER_PROVIDER} using provider="${provider.name}" (aspectRatio=${input.aspectRatio}, requiresText=${requiresText}, totalAttempt=${totalAttempts})`
      );

      try {
        const buffer = await provider.generateImage(
          {
            prompt: promptToUse,
            aspectRatio: input.aspectRatio,
            seed: input.seed,
            timeoutMs: input.timeoutMs,
          },
          env
        );

        if (!buffer || buffer.length === 0) {
          throw new Error(`${provider.name} returned an empty image buffer`);
        }

        const dims = getExpectedDimensions(provider.name, input.aspectRatio);
        console.info(
          `[imageProviders] Success via provider="${provider.name}" after ${attempt} attempt(s) (${buffer.length} bytes)`
        );

        return {
          buffer,
          provider: provider.name,
          attemptCount: totalAttempts,
          generatedWidth: dims.width,
          generatedHeight: dims.height,
        };
      } catch (err: any) {
        const message = err?.message || String(err);
        console.warn(
          `[imageProviders] Provider="${provider.name}" attempt ${attempt} failed: ${message}`
        );
        failures.push({ provider: provider.name, attempt, message });

        if (isNonRetryableAuthError(message)) {
          break; // Don't waste another attempt on invalid/missing auth
        }

        if (attempt < MAX_ATTEMPTS_PER_PROVIDER) {
          await new Promise((r) => setTimeout(r, 900));
        }
      }
    }
  }

  const summary = failures.map((f) => `${f.provider}#${f.attempt}: ${f.message}`).join(' | ');
  throw new AllProvidersFailedError(
    `All eligible image providers failed (requiresText=${requiresText}): ${summary}`,
    failures
  );
}
