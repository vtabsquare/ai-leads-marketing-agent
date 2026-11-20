// ==============================================================================
// SERVER-ONLY: Cloudflare Workers AI Provider (@cf/black-forest-labs/flux-1-schnell)
// Uses CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from .env.
// Generates 1024x1024 text-free backdrops (steps: 4) and decodes base64 output.
// ==============================================================================

import type { EnvMap, ImageAspectRatio, ImageProvider } from './types.ts';

const CLOUDFLARE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const DEFAULT_TIMEOUT_MS = 35_000;

function getCloudflareCredentials(env?: EnvMap): { accountId: string; apiToken: string } {
  const accountId = (
    env?.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    ''
  ).trim();
  const apiToken = (
    env?.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    ''
  ).trim();
  return { accountId, apiToken };
}

export function getCloudflareDimensions(_aspectRatio: ImageAspectRatio): {
  width: number;
  height: number;
} {
  // @cf/black-forest-labs/flux-1-schnell outputs 1024x1024; compositor crops/blurs to target aspect ratio
  return { width: 1024, height: 1024 };
}

export const cloudflareProvider: ImageProvider = {
  name: 'cloudflare',
  supportsText: false,

  isConfigured(env?: EnvMap): boolean {
    const { accountId, apiToken } = getCloudflareCredentials(env);
    return Boolean(accountId && apiToken);
  },

  async generateImage(
    input: { prompt: string; aspectRatio: ImageAspectRatio; seed?: number; timeoutMs?: number },
    env?: EnvMap
  ): Promise<Buffer> {
    const { accountId, apiToken } = getCloudflareCredentials(env);
    if (!accountId || !apiToken) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not configured in .env');
    }

    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt.slice(0, 2048),
        steps: 4,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const reason =
        res.status === 429 || /quota|limit|exceeded/i.test(errText)
          ? `Cloudflare provider unavailable (quota/429): ${errText.slice(0, 200)}`
          : `Cloudflare Workers AI failed (${res.status}): ${errText.slice(0, 200)}`;
      console.warn(`[cloudflare] ${reason}`);
      throw new Error(reason);
    }

    const data: any = await res.json().catch(() => null);
    if (!data || data.success === false || !data.result?.image) {
      const msg = `Cloudflare provider unavailable (invalid response): ${JSON.stringify(data?.errors || data).slice(0, 220)}`;
      console.warn(`[cloudflare] ${msg}`);
      throw new Error(msg);
    }

    const base64Image = String(data.result.image).replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Image, 'base64');
  },
};
