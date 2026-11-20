// ==============================================================================
// SMOKE TEST: Image Provider Endpoints (Cloudflare, Hugging Face, PiAPI) & Orchestrator
// Usage: node scripts/smoke-test-image-providers.ts
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { generateImageWithFallback, AllProvidersFailedError } from '../src/lib/imageProviders/index.ts';

function loadDotEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

const repoRoot = process.cwd();
const fileEnv = loadDotEnv(path.join(repoRoot, '.env'));
const env: Record<string, string | undefined> = { ...fileEnv, ...process.env };

const TEST_BACKDROP_PROMPT =
  'Minimal dark architectural interior wall with soft indirect grazing light and smooth tonal gradient, deep forest green and subtle warm highlight, zero bokeh dots, zero faces, zero screens, zero text';

async function smokeTestCloudflare() {
  console.log('\n=== 1. RAW SMOKE TEST: Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell) ===');
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (env.CLOUDFLARE_API_TOKEN || '').trim();
  console.log(
    `Credentials configured: accountId=${accountId ? `yes (${accountId.length} chars)` : 'no'}, apiToken=${apiToken ? `yes (${apiToken.length} chars)` : 'no'}`
  );

  if (!accountId || !apiToken) {
    console.log('Skipping raw Cloudflare call (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing in .env).');
    return;
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: TEST_BACKDROP_PROMPT,
          steps: 4,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    const data: any = await res.json().catch(() => null);
    console.log('HTTP status:', res.status, 'success:', data?.success);
    if (res.ok && data?.result?.image) {
      const buf = Buffer.from(String(data.result.image), 'base64');
      console.log(`Decoded image buffer: ${buf.length} bytes`);
    } else {
      console.log('Error response:', JSON.stringify(data?.errors || data, null, 2));
    }
  } catch (err: any) {
    console.error('Cloudflare network/request error:', err?.message || err);
  }
}

async function smokeTestHuggingFace() {
  console.log('\n=== 2. RAW SMOKE TEST: Hugging Face Inference API (black-forest-labs/FLUX.1-schnell) ===');
  const token = (env.HF_TOKEN || env.HUGGINGFACE_API_KEY || '').trim();
  console.log(`Token configured: ${token ? `yes (${token.length} chars)` : 'no (not in .env)'}`);

  if (!token) {
    console.log('Skipping raw Hugging Face call (HF_TOKEN missing in .env).');
    return;
  }

  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'image/png',
        },
        body: JSON.stringify({
          inputs: TEST_BACKDROP_PROMPT,
          parameters: { width: 1024, height: 1024, num_inference_steps: 4 },
        }),
        signal: AbortSignal.timeout(35_000),
      }
    );
    console.log('HTTP status:', res.status, 'content-type:', res.headers.get('content-type'));
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`Image buffer: ${buf.length} bytes`);
    } else {
      console.log('Error response:', (await res.text().catch(() => '')).slice(0, 300));
    }
  } catch (err: any) {
    console.error('Hugging Face network/request error:', err?.message || err);
  }
}

async function smokeTestOrchestratorBackdrop() {
  console.log('\n=== 3. ORCHESTRATOR TEST (requiresText=false: Cloudflare -> HF FLUX.1-schnell -> PiAPI -> FLUX Space) ===');
  try {
    const result = await generateImageWithFallback(
      {
        prompt: TEST_BACKDROP_PROMPT,
        textFreePrompt: TEST_BACKDROP_PROMPT,
        aspectRatio: '4:5',
        requiresText: false,
      },
      env
    );
    console.log('Orchestrator succeeded:', {
      provider: result.provider,
      attemptCount: result.attemptCount,
      bytes: result.buffer.length,
      generatedWidth: result.generatedWidth,
      generatedHeight: result.generatedHeight,
    });
  } catch (err: any) {
    if (err instanceof AllProvidersFailedError) {
      console.log('AllProvidersFailedError (server will use palette gradient fallback):');
      console.log(JSON.stringify({ allProvidersFailed: err.allProvidersFailed, failures: err.failures }, null, 2));
    } else {
      console.error('Unexpected orchestrator error:', err);
    }
  }
}

await smokeTestCloudflare();
await smokeTestHuggingFace();
await smokeTestOrchestratorBackdrop();
