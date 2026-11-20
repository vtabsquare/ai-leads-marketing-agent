// ==============================================================================
// SERVER-ONLY: Hugging Face FLUX.1-schnell Provider (Text-Free Visuals Only)
// Strictly avoided when the creative requires on-image typography.
// ==============================================================================

import type { EnvMap, ImageAspectRatio, ImageProvider } from './types.ts';

const FLUX_CALL_URL = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer';
const DEFAULT_TIMEOUT_MS = 35_000;

export function getFluxDimensions(aspectRatio: ImageAspectRatio): { width: number; height: number } {
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

export const fluxProvider: ImageProvider = {
  name: 'flux',
  supportsText: false,

  isConfigured(_env?: EnvMap): boolean {
    return true;
  },

  async generateImage(
    input: { prompt: string; aspectRatio: ImageAspectRatio; timeoutMs?: number },
    _env?: EnvMap
  ): Promise<Buffer> {
    const { width, height } = getFluxDimensions(input.aspectRatio);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const callRes = await fetch(FLUX_CALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [input.prompt, 0, true, width, height, 4],
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!callRes.ok) {
      const errText = await callRes.text().catch(() => '');
      throw new Error(`FLUX enqueue failed (${callRes.status}): ${errText}`);
    }

    const callJson: any = await callRes.json().catch(() => ({}));
    const eventId = callJson?.event_id;
    if (!eventId) {
      throw new Error(`FLUX did not return event_id: ${JSON.stringify(callJson)}`);
    }

    const streamRes = await fetch(`${FLUX_CALL_URL}/${eventId}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!streamRes.ok) {
      throw new Error(`FLUX stream failed (${streamRes.status})`);
    }

    const sseText = await streamRes.text();
    if (sseText.includes('event: error')) {
      throw new Error(`FLUX Space returned error event: ${sseText.slice(0, 300)}`);
    }

    // Extract completed JSON data array from SSE stream
    const completeMatch = sseText.match(/event:\s*complete\s*\r?\ndata:\s*(\[[\s\S]*?\])(?:\r?\n|$)/);
    if (!completeMatch) {
      throw new Error(`FLUX stream ended without complete payload: ${sseText.slice(0, 300)}`);
    }

    const payload = JSON.parse(completeMatch[1]);
    const fileUrl = payload?.[0]?.url;
    if (!fileUrl) {
      throw new Error(`FLUX payload missing image url: ${completeMatch[1]}`);
    }

    const imgRes = await fetch(fileUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) {
      throw new Error(`Failed to download FLUX output (${imgRes.status})`);
    }
    return Buffer.from(await imgRes.arrayBuffer());
  },
};
