// ==============================================================================
// SERVER-ONLY: Hugging Face Inference API Provider (HF_TOKEN)
// Uses black-forest-labs/FLUX.1-schnell (Apache-2.0) via router.huggingface.co
// ==============================================================================

import type { EnvMap, ImageAspectRatio, ImageProvider } from './types.ts';

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_TIMEOUT_MS = 45_000;

function getHfToken(env?: EnvMap): string {
  return (
    env?.HF_TOKEN ||
    env?.HUGGINGFACE_API_KEY ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    ''
  ).trim();
}

export function getHuggingFaceDimensions(aspectRatio: ImageAspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '4:5':
      return { width: 1024, height: 1280 };
    case '1.91:1':
      return { width: 1344, height: 704 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

export const huggingFaceProvider: ImageProvider = {
  name: 'huggingface',
  supportsText: false,

  isConfigured(env?: EnvMap): boolean {
    return Boolean(getHfToken(env));
  },

  async generateImage(
    input: { prompt: string; aspectRatio: ImageAspectRatio; timeoutMs?: number },
    env?: EnvMap
  ): Promise<Buffer> {
    const token = getHfToken(env);
    if (!token) {
      throw new Error('HF_TOKEN is not configured in .env');
    }

    const { width, height } = getHuggingFaceDimensions(input.aspectRatio);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'image/png',
      },
      body: JSON.stringify({
        inputs: input.prompt,
        parameters: {
          width,
          height,
          num_inference_steps: 4,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const reason = `HuggingFace (${HF_MODEL}) failed (${res.status}): ${errText.slice(0, 240)}`;
      console.warn(`[huggingface] ${reason}`);
      throw new Error(reason);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      const textBody = await res.text().catch(() => '');
      throw new Error(
        `HuggingFace (${HF_MODEL}) returned non-image response (${contentType}): ${textBody.slice(0, 200)}`
      );
    }

    return Buffer.from(await res.arrayBuffer());
  },
};
