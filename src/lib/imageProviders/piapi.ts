// ==============================================================================
// SERVER-ONLY: PiAPI Unified Task Provider (Qubico/qwen-image-2.1)
// Docs: https://api.piapi.ai/api/v1/task
// ==============================================================================

import type { EnvMap, ImageAspectRatio, ImageProvider } from './types.ts';

const PIAPI_TASK_URL = 'https://api.piapi.ai/api/v1/task';
const DEFAULT_POLL_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * Nearest supported Qwen-Image presets staying safely under PiAPI's 1,763,584 px ceiling.
 */
export function getPiApiDimensions(aspectRatio: ImageAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '4:5':
      return { width: 960, height: 1280 }; // 3:4 nearest to Instagram 4:5
    case '1.91:1':
      return { width: 1344, height: 768 }; // Landscape nearest to FB/LinkedIn 1.91:1
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

function getApiKey(env: EnvMap = process.env): string {
  return (env.PIAPI_API_KEY || '').trim();
}

export const piApiProvider: ImageProvider = {
  name: 'piapi',
  supportsText: true,

  isConfigured(env: EnvMap = process.env): boolean {
    return getApiKey(env).length > 0;
  },

  async generateImage(
    input: { prompt: string; aspectRatio: ImageAspectRatio; timeoutMs?: number },
    env: EnvMap = process.env
  ): Promise<Buffer> {
    const apiKey = getApiKey(env);
    if (!apiKey) {
      throw new Error('PIAPI_API_KEY is not configured in .env');
    }

    const { width, height } = getPiApiDimensions(input.aspectRatio);
    const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS);

    const submitRes = await fetch(PIAPI_TASK_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qubico/qwen-image-2.1',
        task_type: 'txt2img',
        input: {
          prompt: input.prompt,
          width,
          height,
          steps: 8,
          seed: -1,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const submitData: any = await submitRes.json().catch(() => ({}));
    if (!submitRes.ok || (submitData?.code && submitData.code >= 400)) {
      const msg = submitData?.message || submitData?.error?.message || `HTTP ${submitRes.status}`;
      throw new Error(`PiAPI submit failed (${submitRes.status}): ${msg}`);
    }

    const taskId = submitData?.data?.task_id || submitData?.task_id;
    if (!taskId) {
      throw new Error(`PiAPI returned unexpected response without task_id: ${JSON.stringify(submitData)}`);
    }

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${PIAPI_TASK_URL}/${taskId}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
        signal: AbortSignal.timeout(10_000),
      });

      const pollData: any = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) {
        const msg = pollData?.message || `HTTP ${pollRes.status}`;
        throw new Error(`PiAPI poll failed (${pollRes.status}): ${msg}`);
      }

      const task = pollData?.data || pollData;
      const status = String(task?.status || '').toLowerCase();

      if (status === 'completed' || status === 'success') {
        const outputUrl =
          task?.output?.image_url ||
          task?.output?.image_urls?.[0] ||
          task?.output?.images?.[0]?.url;

        if (outputUrl) {
          const imgRes = await fetch(outputUrl, { signal: AbortSignal.timeout(15_000) });
          if (!imgRes.ok) {
            throw new Error(`Failed to download PiAPI image (${imgRes.status})`);
          }
          return Buffer.from(await imgRes.arrayBuffer());
        }

        const b64 = task?.output?.image_base64 || task?.output?.b64_json;
        if (b64) {
          return Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        }

        throw new Error(`PiAPI task ${taskId} completed without output image URL: ${JSON.stringify(task)}`);
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`PiAPI task ${taskId} failed: ${task?.error?.message || JSON.stringify(task)}`);
      }
    }

    throw new Error(`PiAPI polling timed out after ${input.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS}ms (task ${taskId})`);
  },
};
