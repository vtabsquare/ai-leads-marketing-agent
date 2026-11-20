// ==============================================================================
// VTAB GEMINI MULTI-AGENT AI ENGINE
// Uses Gemini 3.5 Flash-Lite / 3.1 Flash-Lite for Copy, Art Direction & Vision
// ==============================================================================

export function resolveGeminiApiKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  const viteKey =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_GEMINI_API_KEY
      : undefined;
  const envKey =
    typeof globalThis !== 'undefined' && (globalThis as any).process?.env
      ? (globalThis as any).process.env.GEMINI_API_KEY || (globalThis as any).process.env.VITE_GEMINI_API_KEY
      : undefined;
  return viteKey || envKey || '';
}

import {
  pickDistinctTemplates,
  pickPalettesAvoidingRecent,
  type CampaignVisualType,
  type CreativeHistoryEntry,
  type CreativePalette,
  type LayoutTemplate,
} from './creativeStyles';

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];

interface GeminiCallOptions {
  responseJson?: boolean;
  responseSchema?: Record<string, any>;
  temperature?: number;
  apiKey?: string;
  timeoutMs?: number;
}

class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function callGeminiParts(
  parts: Array<Record<string, any>>,
  options: GeminiCallOptions = {}
): Promise<string> {
  const apiKey = resolveGeminiApiKey(options.apiKey);
  const responseJson = options.responseJson ?? true;
  const temperature = options.temperature ?? 0.7;
  const timeoutMs = options.timeoutMs ?? 9000;
  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const generationConfig: Record<string, any> = {
          temperature,
          ...(responseJson ? { responseMimeType: 'application/json' } : {}),
          ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data: any = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && text.trim().length > 0) {
            return text;
          }
        }

        const errStatus = res.status;
        console.warn(`Gemini (${model}) attempt ${attempt} returned HTTP ${errStatus}`);
        lastError = new GeminiHttpError(errStatus, `Gemini (${model}) HTTP ${errStatus}`);
        if (errStatus === 503 || errStatus === 429) {
          await new Promise((r) => setTimeout(r, 600));
        } else {
          break; // Try next model in fallback list
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw lastError || new Error('Gemini API call failed across all candidate models');
}

async function callGeminiApi(prompt: string, responseJson = true): Promise<string> {
  return callGeminiParts([{ text: prompt }], { responseJson });
}

export interface CreativeBrief {
  /** Spatial layout specifying headline placement, visual focal point, CTA badge, and safe margins */
  layout: string;
  /** Short punchy on-image headline (max ~8 words) */
  headlineText: string;
  /** Short CTA label (2-4 words) */
  ctaText: string;
  /** Brand hex palette */
  brandColors: string[];
  /** Creative genre (e.g. 'Poster-style SaaS ad', 'Editorial infographic', 'Product hero scene') */
  style: string;
  /** Complete prompt for Qwen-Image containing exact quoted headline & CTA + safe margins */
  designedPrompt: string;
  /** Purely visual text-free fallback prompt (zero text/words/letters) */
  textFreePrompt: string;
}

export type CampaignType = CampaignVisualType;

export interface CampaignClaimSource {
  claim: string;
  source: 'Campaign Brief' | 'Knowledge Base' | 'User Input';
}

export interface CampaignFacts {
  campaignType: CampaignType;
  productName: string;
  keyCapabilities: string[];
  targetAudience: string;
  location: string;
  eventDetails: string;
  sceneElements: string[];
  heroStat?: string;
  chips?: string[];
  claimSources?: CampaignClaimSource[];
}

export interface CreativeConceptOption {
  id: string;
  title: string;
  sceneIdea: string;
  setting?: string;
  lighting?: string;
  cameraAngle?: string;
  locationBadge?: string;
  templateId: string;
  templateName: string;
  styleId: string;
  styleName: string;
  paletteId: string;
  paletteName: string;
  supportsProductScreenshot?: boolean;
  metaphor: string;
  mainSubject: string;
  headlineText: string;
  sublineText: string;
  ctaText: string;
  layout: string;
  designedPrompt: string;
  textFreePrompt: string;
  previewHexes: string[];
  heroStat?: string;
  chips?: string[];
}

export interface CampaignDeliverables {
  socialPost: {
    platform: string;
    headline: string;
    body: string;
    tags: string[];
  };
  facebookPost?: {
    headline: string;
    body: string;
    tags: string[];
  };
  instagramPost?: {
    caption: string;
    hashtags: string[];
    imageUrl?: string;
  };
  twitterThread: Array<{
    index: number;
    text: string;
    charCount: number;
  }>;
  coldEmail: {
    subject: string;
    touch1: string;
    touch2: string;
    touch3: string;
  };
  newsletter: {
    title: string;
    intro: string;
    insights: string[];
    takeaway: string;
  };
  visualDirection: {
    headline: string;
    caption: string;
    aspectRatio: string;
    palette: string[];
    aestheticTheme: string;
  };
  creativeBrief?: CreativeBrief;
  campaignFacts?: CampaignFacts;
  creativeConcepts?: CreativeConceptOption[];
  personalizedDm: {
    recipient: string;
    role: string;
    company: string;
    intent: number;
    body: string;
  };
}

export async function generateCampaignWithGemini(
  brief: string,
  knowledgeBase: string,
  passages: string[] = []
): Promise<CampaignDeliverables> {
  const contextText =
    passages.length > 0
      ? passages.slice(0, 6).join('\n\n')
      : `Authoritative operational context and product benchmarks for ${knowledgeBase}.`;

  const prompt = `You are Vtab's senior multi-agent marketing director orchestrating three specialist bots:
1. Copywriter Agent (Voice, clarity, and thoughtful B2B point of view)
2. Art Director Agent (Visual concepts, typography, color palettes)
3. Outreach Strategist (Hyper-personalized 1:1 outbound for senior decision makers)

Campaign Brief: "${brief}"
Knowledge Base: "${knowledgeBase}"
Grounded Source Context:
${contextText}

Generate a comprehensive, production-ready marketing package adhering strictly to this JSON schema:
{
  "socialPost": {
    "platform": "LinkedIn",
    "headline": "A compelling, thought-provoking single-sentence headline specifically about the brief topic",
    "body": "A 3-paragraph LinkedIn thought leadership post tailored specifically to the brief and knowledge base with short punchy lines and a clear CTA",
    "tags": ["RelevantTag1", "RelevantTag2", "RelevantTag3"]
  },
  "facebookPost": {
    "headline": "Engaging Facebook headline or announcement hook",
    "body": "Conversational, highly engaging post for Facebook followers with clear explanation, benefits, and call to action",
    "tags": ["VtabSquare", "Innovation", "EnterpriseAI"]
  },
  "instagramPost": {
    "caption": "Visually appealing, punchy caption for Instagram with emojis, clear line breaks, and a compelling question/CTA",
    "hashtags": ["#VtabSquare", "#AI", "#TechInnovation", "#EnterpriseData", "#FutureOfWork"]
  },
  "twitterThread": [
    { "index": 1, "text": "Tweet 1 hook specifically addressing ${brief}...", "charCount": 180 },
    { "index": 2, "text": "Tweet 2 problem and stakes...", "charCount": 210 },
    { "index": 3, "text": "Tweet 3 breakdown of how ${knowledgeBase} solves it...", "charCount": 230 },
    { "index": 4, "text": "Tweet 4 practical metrics or checklist...", "charCount": 220 },
    { "index": 5, "text": "Tweet 5 clear action and link in bio...", "charCount": 140 }
  ],
  "coldEmail": {
    "subject": "Compelling 4-7 word subject line about ${brief}",
    "touch1": "Observation and relevance opening hook directly tied to ${brief}",
    "touch2": "Proof point or risk breakdown grounded in ${knowledgeBase}",
    "touch3": "Low friction, soft CTA"
  },
  "newsletter": {
    "title": "Edition Title specific to ${brief}",
    "intro": "Executive brief introduction",
    "insights": ["Key actionable insight 1", "Key actionable insight 2", "Key actionable insight 3"],
    "takeaway": "Closing philosophical or tactical recommendation"
  },
  "visualDirection": {
    "headline": "Visual poster headline",
    "caption": "Editorial direction describing visual metaphor, typography, and paper texture",
    "aspectRatio": "1:1 Square",
    "palette": ["#142019", "#c9f36a", "#ffffff"],
    "aestheticTheme": "Quiet confidence & technical precision"
  },
  "creativeBrief": {
    "layout": "Top zone: bold headline inside generous empty space on all sides; Center zone: clean isometric product/infographic focal art; Bottom zone: rounded bright lime green pill CTA button centered inside generous empty space",
    "headlineText": "Short 3-6 word punchy ad headline",
    "ctaText": "2-4 word CTA",
    "brandColors": ["#142019", "#c9f36a", "#ffffff"],
    "style": "Finished SaaS poster-style ad with crisp typography and clean negative space",
    "designedPrompt": "Full graphic-design prompt describing layout, colors by name only (deep forest green, bright lime green, crisp white — NEVER hex codes), generous empty space on all sides (NEVER percentages), style, and containing the exact headlineText and ctaText in double quotes",
    "textFreePrompt": "Pure visual editorial scene or 3D metaphor with colors by name only, zero text, no words, no letters, no labels"
  },
  "personalizedDm": {
    "recipient": "Enterprise Operations Lead",
    "role": "VP of Operations · Enterprise Client",
    "company": "Target Account",
    "intent": 94,
    "body": "Tailored 3-sentence message connecting ${brief} to their specific operational challenges."
  }
}`;

  try {
    const rawText = await callGeminiApi(prompt, true);
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    const jsonStr =
      firstBrace !== -1 && lastBrace !== -1
        ? rawText.slice(firstBrace, lastBrace + 1)
        : rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(jsonStr) as CampaignDeliverables;
    parsed.creativeBrief = validateCreativeBrief(
      parsed.creativeBrief,
      parsed.socialPost?.headline || brief
    );
    return parsed;
  } catch (err) {
    console.warn('Gemini generation error, building dynamic brief fallback:', err);
    const cleanBrief = brief.trim() || 'Modern Enterprise Software Launch';
    const cleanKb = knowledgeBase || 'VTAB Intelligence';
    const fallbackCreative = validateCreativeBrief(undefined, cleanBrief);
    return {
      socialPost: {
        platform: 'LinkedIn',
        headline: `Transforming Enterprise Impact: ${cleanBrief}`,
        body: `Modern operations demand real-time clarity, not manual guesswork.\n\nWith ${cleanKb}, we are accelerating how organizations turn complex signals into strategic execution. ${cleanBrief}.\n\nExplore how our platform delivers verified intelligence →`,
        tags: ['EnterpriseTech', 'AI', 'Analytics'],
      },
      facebookPost: {
        headline: `🚀 Exciting updates from Vtab Square: ${cleanBrief}`,
        body: `We are redefining how teams transform data into intelligent action.\n\n${cleanBrief} empowers modern enterprises to automate manual workflows and unlock real-time decision making.\n\nDiscover more at www.vtabsquare.com`,
        tags: ['VtabSquare', 'AI', 'Innovation'],
      },
      instagramPost: {
        caption: `✨ Innovation in action.\n\n${cleanBrief}.\n\nAt VTAB Square, we bridge the gap between fragmented enterprise data and real-time executive decision-making. Ready to see the difference?\n\n🔗 Link in bio to learn more.\n\n#VtabSquare #AI #Innovation #EnterpriseTech #DataDriven`,
        hashtags: ['#VtabSquare', '#AI', '#EnterpriseTech', '#Innovation'],
      },
      twitterThread: [
        { index: 1, text: `Most teams struggle with operational friction. Here is how ${cleanBrief} changes the game: 🧵👇`, charCount: 140 },
        { index: 2, text: `1. Eliminate data silos: Centralize real-time signals before friction compounds.`, charCount: 120 },
        { index: 3, text: `2. Automated intelligence: Turn hours of manual reporting into instant decisions.`, charCount: 125 },
        { index: 4, text: `3. Verified governance: Maintain 100% human-in-the-loop oversight at every step.`, charCount: 120 },
        { index: 5, text: `Discover the full framework with ${cleanKb}: link in bio.`, charCount: 85 },
      ],
      coldEmail: {
        subject: `Quick question on ${cleanBrief.slice(0, 30)}`,
        touch1: `Hi — noticed your team has been scaling technology operations.`,
        touch2: `We recently launched a dedicated framework for ${cleanBrief} to eliminate manual overhead.`,
        touch3: `Would you be open to a 2-minute overview? No pitch, just practical benchmarks.`,
      },
      newsletter: {
        title: `Field Notes: ${cleanBrief}`,
        intro: `Why leading engineering and operations teams are modernizing how they execute on ${cleanBrief}.`,
        insights: [
          'Real-time automated ingestion reduces reporting latency by up to 70%.',
          'Human-in-the-loop guardrails guarantee data integrity and compliance.',
          'Cross-functional alignment happens when every stakeholder sees the same single source of truth.',
        ],
        takeaway: `Speed without verification is noise. True scale comes from automated precision.`,
      },
      visualDirection: {
        headline: cleanBrief.slice(0, 35),
        caption: `Clean modern layout with bold typographic hierarchy, dark moss background, and lime accents representing real-time telemetry.`,
        aspectRatio: '1:1 Square',
        palette: ['#142019', '#c9f36a', '#ffffff'],
        aestheticTheme: 'Modern precision with high-contrast accent',
      },
      creativeBrief: fallbackCreative,
      personalizedDm: {
        recipient: 'Head of Operations',
        role: 'Director of Technology',
        company: 'Enterprise Account',
        intent: 92,
        body: `Hi — saw your team has been prioritizing operational efficiency. We just released new capabilities around ${cleanBrief}. Would love to share our short benchmarks summary if relevant!`,
      },
    };
  }
}

// ==============================================================================
// ART DIRECTOR & VISION VERIFICATION PIPELINE
// ==============================================================================

const DEFAULT_BRAND_COLORS = ['#142019', '#c9f36a', '#ffffff'];

function clampWords(input: string, maxWords: number): string {
  const words = input.replace(/["'`]/g, '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function sanitizePromptForDiffusion(text: string): string {
  return text
    .replace(/#142019\b/gi, 'deep forest green')
    .replace(/#c9f36a\b/gi, 'bright lime green')
    .replace(/#ffffff\b/gi, 'crisp white')
    .replace(/#[0-9a-f]{3,8}\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?%\s*(?:safe\s+)?margins?/gi, 'generous empty space on all sides')
    .replace(/\b\d+(?:\.\d+)?%/g, 'generous')
    // Strip negative phrasing for FLUX (no negative prompt support; negations trigger unwanted artifacts)
    .replace(
      /\b(?:strictly\s+)?(?:no|zero|without|never|avoid)\s+(?:any\s+)?(?:text|letters|words|numbers|watermarks?|logos?|typography|captions?|signs?|signage|close-up\s+faces|close-up\s+hands|faces|hands|people|clutter)\b[^.,;]*[.,;]?/gi,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/^[,.\s;]+|[,;\s]+$/g, '')
    .trim();
}

/**
 * Validates and normalizes a CreativeBrief so headlineText (preferring 3-6 words), ctaText (2-4 words),
 * generous empty-space margins, and exact quoted on-image text (without hex codes or percentages)
 * inside designedPrompt are always guaranteed.
 */
export function validateCreativeBrief(
  raw: Partial<CreativeBrief> | undefined,
  fallbackTopic = 'Intelligent Enterprise Automation'
): CreativeBrief {
  const rawHeadline = (raw?.headlineText || '').trim();
  const headlineWords = clampWords(rawHeadline || fallbackTopic, 6);
  const headlineText = headlineWords || 'Turn Data Into Action';

  const rawCta = clampWords(raw?.ctaText || '', 4);
  const ctaText = rawCta && rawCta.split(/\s+/).length >= 2 ? rawCta : 'Explore Vtab Today';

  const brandColors =
    Array.isArray(raw?.brandColors) && raw!.brandColors.length > 0
      ? raw!.brandColors.map((c) => String(c).trim()).filter(Boolean)
      : DEFAULT_BRAND_COLORS;

  const layout = sanitizePromptForDiffusion(
    (raw?.layout || '').trim() ||
      'Poster layout with generous empty space on all four sides: bold headline centered in top third, sleek isometric focal graphic in middle third, high-contrast pill CTA badge anchored in bottom third.'
  );

  const style = sanitizePromptForDiffusion(
    (raw?.style || '').trim() ||
      'Modern B2B SaaS editorial poster ad with deep forest green surface, bright lime green accents, sharp studio lighting, and clean geometric composition.'
  );

  let designedPrompt = sanitizePromptForDiffusion((raw?.designedPrompt || '').trim());
  if (!designedPrompt) {
    designedPrompt = `Finished graphic-design B2B SaaS social poster ad. ${style} ${layout} Render the exact headline "${headlineText}" in bold crisp white sans-serif typography at the top, and a clean bright lime green pill button reading "${ctaText}" near the bottom. Keep generous empty space on all sides away from the edges, zero watermarks, zero extra body paragraphs or tiny labels.`;
  } else {
    if (!designedPrompt.includes(`"${headlineText}"`)) {
      designedPrompt += ` Render exact headline text "${headlineText}".`;
    }
    if (!designedPrompt.includes(`"${ctaText}"`)) {
      designedPrompt += ` Render exact CTA badge text "${ctaText}".`;
    }
    if (!/empty space|margin/i.test(designedPrompt)) {
      designedPrompt += ' Keep generous empty space on all sides away from the edges.';
    }
  }

  const textFreePrompt = sanitizePromptForDiffusion(
    (raw?.textFreePrompt || '').trim() ||
      `Minimalist editorial 3D SaaS visual metaphor for ${clampWords(fallbackTopic, 6)}, deep forest green and bright lime green lighting, studio composition, no text, no words, no letters, no labels.`
  );

  return {
    layout,
    headlineText,
    ctaText,
    brandColors,
    style,
    designedPrompt,
    textFreePrompt,
  };
}

const CREATIVE_BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    layout: { type: 'STRING' },
    headlineText: { type: 'STRING' },
    ctaText: { type: 'STRING' },
    brandColors: { type: 'ARRAY', items: { type: 'STRING' } },
    style: { type: 'STRING' },
    designedPrompt: { type: 'STRING' },
    textFreePrompt: { type: 'STRING' },
  },
  required: [
    'layout',
    'headlineText',
    'ctaText',
    'brandColors',
    'style',
    'designedPrompt',
    'textFreePrompt',
  ],
};

/**
 * Dedicated Gemini Art Director step using structured JSON output.
 * Draws from campaign brief, grounded KB passages, and finalized post copy.
 */
export async function generateArtDirectorBrief(params: {
  brief: string;
  knowledgeBase: string;
  passages?: string[];
  postCopy: string;
  platform: 'instagram' | 'facebook' | 'linkedin';
  apiKey?: string;
}): Promise<CreativeBrief> {
  const contextSnippet =
    params.passages && params.passages.length > 0
      ? params.passages.slice(0, 4).join('\n')
      : params.knowledgeBase;

  const platformHint =
    params.platform === 'instagram'
      ? 'Instagram 4:5 vertical poster ad (mobile-first focal hierarchy)'
      : params.platform === 'facebook'
      ? 'Facebook landscape social ad card (crisp split layout)'
      : 'LinkedIn B2B executive infographic / editorial ad card';

  const prompt = `You are VTAB Square's Senior Art Director designing a finished, agency-grade social creative (NOT a plain background).

Target Platform Format: ${platformHint}
Campaign Brief: "${params.brief}"
Knowledge Base Context:
${contextSnippet}

Final Post Copy:
"${params.postCopy}"

Design Rules:
1. Choose a crisp visual concept (poster-style ad, clean infographic card, or isometric product hero scene) grounded in the post copy and knowledge base.
2. Prefer concise headlines of 3-6 words in "headlineText" (never exceed 6 words — longer text gets garbled).
3. Keep "ctaText" ultra-short (strictly 2-4 words, e.g. "See Live Demo", "Explore Platform").
4. Put hex codes ONLY in "brandColors" (["#142019", "#c9f36a", "#ffffff"]). Inside "designedPrompt", "textFreePrompt", and "layout", NEVER include hex codes (like #142019) or percentages — describe colors by name ("deep forest green", "bright lime green", "crisp white") and margins in words ("generous empty space on all sides").
5. In "layout", specify exact zones (where headline, product/visual scene, and CTA badge sit) with generous empty space on all sides so nothing is cut on resize.
6. In "designedPrompt", write a rich graphic-design prompt that includes layout, named colors, style, generous empty space on all sides, zero extra body/chart labels, and puts BOTH the exact headlineText and ctaText inside double quotes.
7. In "textFreePrompt", describe a clean, text-free visual metaphor using named colors (zero words, letters, or labels).`;

  try {
    const rawJson = await callGeminiParts([{ text: prompt }], {
      responseJson: true,
      responseSchema: CREATIVE_BRIEF_SCHEMA,
      temperature: 0.92,
      apiKey: params.apiKey,
    });
    const parsed = JSON.parse(rawJson) as Partial<CreativeBrief>;
    return validateCreativeBrief(parsed, params.brief);
  } catch (err) {
    console.warn('[artDirector] Structured creativeBrief fallback triggered:', err);
    return validateCreativeBrief(undefined, params.brief);
  }
}

const CAMPAIGN_FACTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    campaignType: {
      type: 'STRING',
      enum: [
        'launch_event',
        'product_feature',
        'careers',
        'event',
        'announcement',
        'stat_highlight',
        'testimonial',
        'service',
        'other',
      ],
    },
    productName: { type: 'STRING' },
    keyCapabilities: { type: 'ARRAY', items: { type: 'STRING' } },
    targetAudience: { type: 'STRING' },
    location: { type: 'STRING' },
    eventDetails: { type: 'STRING' },
    sceneElements: { type: 'ARRAY', items: { type: 'STRING' } },
    heroStat: { type: 'STRING' },
    chips: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'campaignType',
    'productName',
    'keyCapabilities',
    'targetAudience',
    'location',
    'eventDetails',
    'sceneElements',
  ],
};

function findClaimSource(
  claim: string,
  brief: string,
  knowledgeBase: string
): 'Campaign Brief' | 'Knowledge Base' | null {
  const clean = claim.trim().toLowerCase();
  if (!clean) return null;
  const briefLower = brief.toLowerCase();
  const kbLower = knowledgeBase.toLowerCase();
  const normalizedBrief = briefLower.replace(/\s+/g, ' ');
  const normalizedKb = kbLower.replace(/\s+/g, ' ');

  if (normalizedBrief.includes(clean)) return 'Campaign Brief';
  if (normalizedKb.includes(clean)) return 'Knowledge Base';

  // For multi-word claims (e.g., capabilities or dates), check if numeric tokens + meaningful words match
  const nums = clean.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length > 0) {
    if (nums.every((n) => normalizedBrief.includes(n))) return 'Campaign Brief';
    if (nums.every((n) => normalizedKb.includes(n))) return 'Knowledge Base';
    return null;
  }

  const tokens = clean.split(/[\s,·/|]+/).filter((t) => t.length >= 3);
  if (tokens.length > 0 && tokens.every((t) => normalizedBrief.includes(t))) return 'Campaign Brief';
  if (tokens.length > 0 && tokens.every((t) => normalizedKb.includes(t))) return 'Knowledge Base';
  return null;
}

function buildClaimSources(
  facts: Pick<CampaignFacts, 'productName' | 'location' | 'eventDetails' | 'heroStat' | 'keyCapabilities'>,
  brief: string,
  knowledgeBase: string
): CampaignClaimSource[] {
  const sources: CampaignClaimSource[] = [];
  const seen = new Set<string>();
  const add = (claim: string | undefined, fallbackSource?: 'Campaign Brief' | 'Knowledge Base') => {
    const trimmed = (claim || '').trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) return;
    const found = findClaimSource(trimmed, brief, knowledgeBase) || fallbackSource;
    if (!found) return;
    seen.add(trimmed.toLowerCase());
    sources.push({ claim: trimmed, source: found });
  };

  add(facts.productName);
  add(facts.location);
  add(facts.eventDetails);
  add(facts.heroStat);
  for (const cap of facts.keyCapabilities.slice(0, 3)) {
    add(cap);
  }
  return sources;
}

function inferFallbackFacts(brief: string, knowledgeBase: string): CampaignFacts {
  const lower = brief.toLowerCase();
  let campaignType: CampaignType = 'product_feature';
  if (/\b(hiring|hire|careers?|open\s+roles?|job|recruiting|join\s+our\s+team|engineer|developer|designer)\b/i.test(lower)) {
    campaignType = 'careers';
  } else if (/\b(launch\s+event|product\s+launch|launching)\b/i.test(lower)) {
    campaignType = 'launch_event';
  } else if (/\b(conference|summit|keynote|meetup|webinar|workshop|live\s+event|event)\b/i.test(lower)) {
    campaignType = 'event';
  } else if (/\b(\d+\s*x|\d+%|\d+\s*sec|\d+\+)/i.test(lower)) {
    campaignType = 'stat_highlight';
  } else if (/\b(service|consulting|migration|advisory|implementation)\b/i.test(lower)) {
    campaignType = 'service';
  } else if (/\b(testimonial|case\s+study|customer\s+story|review|quote)\b/i.test(lower)) {
    campaignType = 'testimonial';
  } else if (/\b(announce|releasing|introducing|now\s+available)\b/i.test(lower)) {
    campaignType = 'announcement';
  }

  const cityMatch = brief.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  const statMatch = brief.match(/\b(\d+(?:\.\d+)?\s*(?:x|×|%|sec|ms|k|\+))\b/i);
  const productName = knowledgeBase || 'VTAB Square';
  const keyCapabilities = [
    'Automated executive reporting',
    'Real-time KPI analytics',
    'Live enterprise data connectors',
  ];
  const location = cityMatch ? cityMatch[1] : '';
  const eventDetails = '';
  const heroStat = statMatch ? statMatch[1] : undefined;
  return {
    campaignType,
    productName,
    keyCapabilities,
    targetAudience:
      campaignType === 'careers'
        ? 'Software engineers and product builders'
        : 'Business and technology leaders',
    location,
    eventDetails,
    heroStat,
    chips:
      campaignType === 'careers'
        ? ['AI Engineering', 'Full-Stack', cityMatch ? cityMatch[1] : 'Remote / Hybrid']
        : undefined,
    claimSources: buildClaimSources(
      { productName, location, eventDetails, heroStat, keyCapabilities },
      brief,
      knowledgeBase
    ),
    sceneElements:
      campaignType === 'careers'
        ? ['bright sunlit modern engineering studio', 'warm oak collaborative tables', 'indoor plants and glass meeting room', 'wide architectural angle']
        : campaignType === 'launch_event' || campaignType === 'event'
          ? ['dramatic keynote conference stage', 'warm architectural spotlights', 'modern auditorium depth']
          : ['sleek modern studio workspace', 'warm architectural daylight', 'clean minimalist desk'],
  };
}

/**
 * Step 1 before Art Director: extracts structured grounded facts from the campaign brief
 * and retrieved knowledge base passages without inventing dates or venues.
 */
export async function extractCampaignFacts(params: {
  brief: string;
  knowledgeBase: string;
  passages?: string[];
  apiKey?: string;
}): Promise<CampaignFacts> {
  const contextSnippet =
    params.passages && params.passages.length > 0
      ? params.passages.slice(0, 5).join('\n')
      : params.knowledgeBase;

  const prompt = `Extract concrete, factual campaign details from the Campaign Instruction and Knowledge Base Context.

Campaign Instruction: "${params.brief}"
Knowledge Base Context:
${contextSnippet}

Rules:
1. campaignType must be one of: launch_event, product_feature, careers, event, announcement, stat_highlight, testimonial, service, other. Use "careers" for any hiring/jobs/recruiting campaign. Use "event" for conferences/meetups/summits that are not product launches. Use "stat_highlight" when a big metric/number is the hook.
2. productName: exact product, team, or offering name mentioned (e.g. "Vtab Reporting Tool" or "VTAB Square Engineering").
3. keyCapabilities: 3-5 concrete capabilities, roles, or highlights from the KB/instruction.
4. targetAudience: specific buyer/attendee/candidate persona.
5. location: city/region ONLY if explicitly stated in the Campaign Instruction (otherwise "").
6. eventDetails: date, time, or venue ONLY if explicitly stated in the Campaign Instruction (NEVER invent dates or venues; otherwise "").
7. heroStat: if a standout metric/number appears in the brief/KB (e.g. "10×", "1.2 sec", "99.4%"), extract it; otherwise "".
8. chips: 2-3 ultra-short (1-3 word) label chips from the brief (for careers: role titles + location/mode; for features: short capabilities).
9. sceneElements: 4-6 concrete, photographable real-world visual elements tied directly to the campaign (avoid close-up faces and hands).`;

  try {
    const raw = await callGeminiParts([{ text: prompt }], {
      responseJson: true,
      responseSchema: CAMPAIGN_FACTS_SCHEMA,
      temperature: 0.2,
      timeoutMs: 10_000,
      apiKey: params.apiKey,
    });
    const parsed = JSON.parse(raw) as Partial<CampaignFacts>;
    const fallback = inferFallbackFacts(params.brief, params.knowledgeBase);
    const briefLower = params.brief.toLowerCase();
    const rawLocation = (parsed.location || '').trim();
    const verifiedLocation =
      rawLocation && briefLower.includes(rawLocation.toLowerCase())
        ? rawLocation
        : fallback.location;
    const rawEventDetails = (parsed.eventDetails || '').trim();
    const verifiedEventDetails =
      rawEventDetails &&
      rawEventDetails
        .toLowerCase()
        .split(/[\s,·]+/)
        .some((tok) => tok.length >= 3 && briefLower.includes(tok))
        ? rawEventDetails
        : fallback.eventDetails;

    const rawHeroStat = (parsed.heroStat || fallback.heroStat || '').trim();
    const verifiedHeroStat =
      rawHeroStat && findClaimSource(rawHeroStat, params.brief, contextSnippet)
        ? rawHeroStat
        : fallback.heroStat;
    const productName = (parsed.productName || fallback.productName).trim();
    const keyCapabilities =
      Array.isArray(parsed.keyCapabilities) && parsed.keyCapabilities.length > 0
        ? parsed.keyCapabilities.slice(0, 5)
        : fallback.keyCapabilities;

    return {
      campaignType: (parsed.campaignType as CampaignType) || fallback.campaignType,
      productName,
      keyCapabilities,
      targetAudience: (parsed.targetAudience || fallback.targetAudience).trim(),
      location: verifiedLocation,
      eventDetails: verifiedEventDetails,
      sceneElements:
        Array.isArray(parsed.sceneElements) && parsed.sceneElements.length > 0
          ? parsed.sceneElements.slice(0, 6)
          : fallback.sceneElements,
      heroStat: verifiedHeroStat || undefined,
      chips:
        Array.isArray(parsed.chips) && parsed.chips.length > 0
          ? parsed.chips.slice(0, 3).map((c) => String(c).trim()).filter(Boolean)
          : fallback.chips,
      claimSources: buildClaimSources(
        {
          productName,
          location: verifiedLocation,
          eventDetails: verifiedEventDetails,
          heroStat: verifiedHeroStat,
          keyCapabilities,
        },
        params.brief,
        contextSnippet
      ),
    };
  } catch (err) {
    console.warn('[extractCampaignFacts] Fallback triggered:', err);
    return inferFallbackFacts(params.brief, params.knowledgeBase);
  }
}

const CREATIVE_CONCEPTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concepts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          sceneIdea: { type: 'STRING' },
          mainSubject: { type: 'STRING' },
          headlineText: { type: 'STRING' },
          sublineText: { type: 'STRING' },
          ctaText: { type: 'STRING' },
          layout: { type: 'STRING' },
          designedPrompt: { type: 'STRING' },
          textFreePrompt: { type: 'STRING' },
        },
        required: [
          'title',
          'sceneIdea',
          'mainSubject',
          'headlineText',
          'sublineText',
          'ctaText',
          'layout',
          'designedPrompt',
          'textFreePrompt',
        ],
      },
    },
  },
  required: ['concepts'],
};

function buildFallbackConcept(
  assignment: { template: LayoutTemplate; palette: CreativePalette },
  facts: CampaignFacts,
  index: number
): CreativeConceptOption {
  const { template, palette } = assignment;
  const locationBadge = facts.location
    ? facts.eventDetails
      ? `Live in ${facts.location} · ${facts.eventDetails}`
      : `Live in ${facts.location}`
    : facts.eventDetails || '';
  const headlineText =
    facts.campaignType === 'careers'
      ? clampWords(`Build The Future With Us`, 6)
      : facts.campaignType === 'launch_event'
        ? clampWords(`Launching ${facts.productName}`, 6)
        : facts.campaignType === 'event'
          ? clampWords(`Join ${facts.productName}`, 6)
          : facts.campaignType === 'stat_highlight'
            ? clampWords(`${facts.heroStat || '10x'} Faster ${facts.productName}`, 6)
            : clampWords(`${facts.productName} Live Now`, 6);
  const sublineText = `${facts.keyCapabilities.slice(0, 2).join(' and ')} for ${facts.targetAudience}.`;
  const ctaText =
    facts.campaignType === 'careers'
      ? 'Apply Now'
      : facts.campaignType === 'launch_event' || facts.campaignType === 'event'
        ? 'Reserve Your Seat'
        : index === 0
          ? 'See Live Demo'
          : 'Explore Platform';
  const sceneIdea = `${template.name}: ${template.description}`;
  const mainSubject = `${template.id} hero visual`;
  const layout = template.description;
  const sceneDetail = facts.sceneElements.slice(0, 3).join(', ');
  const positiveFallbackSceneByType: Record<string, string> = {
    launch_event: `Futuristic 3D isometric dark glass tablet displaying vibrant glowing cyan and lime business analytics dashboards, holographic data charts, particle beams, deep dark blue gradient background with subtle network nodes and studio rim lighting, photorealistic 8k render.`,
    careers: `Wide-angle architectural editorial photograph of a sunlit modern software engineering studio with warm oak collaborative tables, glass-walled meeting rooms, lush indoor greenery, and two software engineers collaborating in mid-distance profile beside a clean empty matte wall. Soft golden morning daylight, crisp natural wood and sage green palette, welcoming high-trust creative studio mood.`,
    event: `Wide-angle documentary photograph of a packed modern tech conference hall with dramatic overhead stage beams, glowing geometric floor accents, and an engaged audience seen from behind facing a blank luminous backdrop screen. Deep indigo and warm amber rim lighting, high-energy summit atmosphere, crisp architectural photography.`,
    product_feature: `Futuristic 3D isometric dark glass tablet displaying vibrant glowing cyan and lime business analytics dashboards, holographic data charts, particle beams, deep dark blue gradient background with subtle network nodes and studio rim lighting, photorealistic 8k render.`,
    stat_highlight: `Minimalist architectural still-life photograph of sculpted frosted glass prisms and brushed anodized metal monoliths arranged on a clean matte stone surface, catching crisp directional sunlight and long geometric shadows. Deep forest green and warm champagne gold palette, ultra-clean editorial studio photography mood.`,
    testimonial: `Medium-wide interior architectural photograph of a warm sunlit executive lounge with tailored linen armchairs, natural walnut shelving, soft sheer curtains, and a clean empty plaster wall bathed in golden afternoon sunlight. Warm cream, espresso, and soft sage palette, calm authoritative editorial mood.`,
  };
  const fallbackScene =
    positiveFallbackSceneByType[facts.campaignType] ||
    `Wide-angle editorial photograph of ${sceneDetail || 'a modern minimalist tech studio workspace'}, illuminated by warm architectural daylight with clean empty wall surfaces, balanced ${palette.name} tonal depth, and crisp photorealistic composition.`;
  const designedPrompt = sanitizePromptForDiffusion(fallbackScene);
  const supportsMockup =
    template.usesProductMockup &&
    (facts.campaignType === 'launch_event' || facts.campaignType === 'product_feature');

  return {
    id: `concept-${index + 1}-${template.id}`,
    title: template.name,
    sceneIdea,
    setting: template.backdropGuidance,
    locationBadge,
    templateId: template.id,
    templateName: template.name,
    styleId: template.id,
    styleName: template.name,
    paletteId: palette.id,
    paletteName: palette.name,
    supportsProductScreenshot: supportsMockup,
    metaphor: sceneIdea,
    mainSubject,
    headlineText,
    sublineText,
    ctaText,
    layout,
    designedPrompt,
    textFreePrompt: designedPrompt,
    previewHexes: palette.previewHexes,
    heroStat: facts.heroStat,
    chips: facts.chips,
  };
}

/**
 * Generates 3 hybrid layout concepts: each locked in code to a distinct LayoutTemplate
 * (avoiding the last 3 used) and CreativePalette (avoiding the last 2 used), with
 * launch/campaign-specific headline + benefit subline + ambient text-free backdrop prompt.
 */
export async function generateArtDirectorConcepts(params: {
  brief: string;
  knowledgeBase: string;
  passages?: string[];
  postCopy: string;
  facts?: CampaignFacts;
  recentHistory?: CreativeHistoryEntry[];
  isProductFeatureDemo?: boolean;
  apiKey?: string;
}): Promise<CreativeConceptOption[]> {
  const facts =
    params.facts ||
    (await extractCampaignFacts({
      brief: params.brief,
      knowledgeBase: params.knowledgeBase,
      passages: params.passages,
      apiKey: params.apiKey,
    }));

  const history = params.recentHistory || [];
  const chosenTemplates = pickDistinctTemplates(history, 3, facts.campaignType);
  const chosenPalettes = pickPalettesAvoidingRecent(history, 3);
  const assignments = chosenTemplates.map((template, idx) => ({
    template,
    palette: chosenPalettes[idx % chosenPalettes.length],
  }));

  const doNotRepeatText =
    history.length > 0
      ? history
          .slice(0, 5)
          .map(
            (h, i) =>
              `  ${i + 1}. Template: ${h.style}, Palette: ${h.dominant_palette}, Backdrop: ${h.main_subject}`
          )
          .join('\n')
      : '  (none yet)';

  const assignmentLines = assignments
    .map(
      ({ template, palette }, i) =>
        `Concept ${i + 1} [HARD LOCKED]:
- Code Layout Template: ${template.name} (${template.description})
- Ambient Backdrop Guidance: ${template.backdropGuidance}
- Palette: ${palette.name}`
    )
    .join('\n\n');

  const locationBadgeText = facts.location
    ? facts.eventDetails
      ? `Live in ${facts.location} · ${facts.eventDetails}`
      : `Live in ${facts.location}`
    : facts.eventDetails || '';

  const prompt = `You are VTAB Square's Senior Art Director designing 3 hybrid layout concepts.
In this architecture, the layout, typography, city/date badge, CTA button, and framed product screenshot are ALL rendered crisply in code.
The AI image model ONLY generates a soft, atmospheric, out-of-focus AMBIENT BACKDROP behind the layout.

EXTRACTED CAMPAIGN FACTS:
- Campaign Type: ${facts.campaignType}
- Product Name: ${facts.productName}
- Key Capabilities: ${facts.keyCapabilities.join('; ')}
- Target Audience: ${facts.targetAudience}
- Location (rendered in code badge): ${facts.location || '(none)'}
- Event Details (rendered in code badge): ${facts.eventDetails || '(none)'}
- Verified Hero Stat: ${facts.heroStat || '(none)'}
- Scene Elements: ${facts.sceneElements.join(', ')}

HARD-LOCKED TEMPLATE & PALETTE ASSIGNMENTS:
${assignmentLines}

RECENT CREATIVES — DO NOT REPEAT:
${doNotRepeatText}

PER-CAMPAIGN-TYPE IMAGE PROMPT EXAMPLES (40-80 words, 100% POSITIVE PHRASING):
- launch_event:
  1) "Futuristic 3D isometric dark glass tablet displaying vibrant glowing cyan and lime business analytics dashboards, holographic data charts, particle beams, deep dark blue gradient background with subtle network nodes and studio rim lighting, photorealistic 8k render."
  2) "Elevated three-quarter studio photograph of a floating glassmorphic tablet with glowing turquoise and amber bar charts and line graphs, set against deep indigo ambient atmosphere with crisp lens flare and soft volumetric lighting, ultra-premium 3D render."
- careers:
  1) "Wide-angle architectural editorial photograph of a sunlit modern software engineering studio with warm oak collaborative tables, glass-walled meeting rooms, lush indoor plants, and two engineers conversing in mid-distance profile beside a clean empty plaster wall. Golden morning daylight, natural wood and sage green palette, inviting creative studio mood."
  2) "Medium-wide interior photograph of a bright contemporary design and engineering hub with open timber shelving, ergonomic workstations, soft diffused skylight, and blurred colleagues walking in the background past clean blank acoustic panels. Crisp architectural photography."
- event:
  1) "Wide-angle documentary photograph of a packed modern technology conference hall with sweeping overhead light beams, glowing architectural stage geometry, and an engaged crowd seen from behind facing a blank luminous backdrop. Deep midnight blue and warm amber palette, high-energy summit atmosphere."
  2) "Elevated wide shot of a contemporary convention atrium at dusk with warm glass facades, architectural steel trusses, rhythmic warm spotlights, and small groups of conference guests in mid-distance silhouette. Crisp editorial photography."
- product_feature:
  1) "Futuristic 3D isometric dark glass tablet displaying vibrant glowing cyan and lime business analytics dashboards, holographic data charts, particle beams, deep dark blue gradient background with subtle network nodes and studio rim lighting, photorealistic 8k render."
  2) "Macro-architectural studio photograph of sleek dark anodized hardware edges resting on warm travertine stone under soft directional window light, casting clean geometric shadows across a smooth uncluttered surface. Deep charcoal and sage palette, crisp industrial design mood."
- stat_highlight:
  1) "Minimalist editorial still-life photograph of sculpted frosted glass prisms and brushed metal monoliths arranged on a clean matte stone plinth, catching crisp directional sunlight and long geometric shadows. Deep forest green and warm champagne gold palette, ultra-clean architectural studio mood."
  2) "Wide abstract architectural photograph of curved matte concrete ribs illuminated by a razor-sharp beam of warm golden light fading into deep teal shadow, leaving smooth uncluttered tonal planes across the frame. Serene high-contrast editorial mood."
- testimonial:
  1) "Medium-wide interior architectural photograph of a warm sunlit executive lounge with tailored linen armchairs, natural walnut shelving, soft sheer curtains, and a clean empty plaster wall bathed in golden afternoon light. Warm cream, espresso, and soft sage palette, calm authoritative mood."
  2) "Wide editorial photograph of a quiet modern boardroom overlooking a soft-focus city skyline at golden hour, warm oak table surface with a ceramic cup, clean glass walls, soft natural lighting, calm trustworthy executive atmosphere."

STRICT RULES:
1. Return exactly 3 concepts in "concepts", matching Concept 1, Concept 2, and Concept 3 in order.
2. "headlineText": max 6 words. MUST state clearly WHAT IS HAPPENING (for launch_event: announce the launch of ${facts.productName}, e.g. "Launching Vtab Reporting Tool"; for product_feature: highlight the core capability).
3. "sublineText": 1 concise benefit sentence (8-14 words) grounded strictly in Key Capabilities and Target Audience.
4. "ctaText": 2-4 words (e.g. "Reserve Your Seat", "See Live Demo").
5. CLAIMS GROUNDING: Every number, statistic, date, venue, or product claim in "headlineText", "sublineText", or "ctaText" MUST come strictly from EXTRACTED CAMPAIGN FACTS above. Never invent percentages, multipliers, dates, or venues.
6. "sceneIdea": 1 plain sentence summarizing the layout + backdrop.
7. "designedPrompt" & "textFreePrompt": Output ONE single paragraph of 40-80 words covering ALL 6 dimensions: (a) subject, (b) setting, (c) camera angle / shot type, (d) lighting, (e) color palette, (f) mood / style — derived directly from Campaign Type (${facts.campaignType}), Product (${facts.productName}), Target Audience (${facts.targetAudience}), and Scene Elements (${facts.sceneElements.join(', ')}). Follow the style of the matching per-campaignType examples above.
8. POSITIVE PHRASING ONLY: FLUX.1-schnell has NO negative prompt support; words like "no", "zero", "without", "never", or "avoid" cause unwanted text or faces to appear. NEVER write negations such as "no text", "zero letters", "no people", "zero faces", "no hands", or "without watermarks". Instead describe what IS visibly present (e.g. "clean empty wall", "blank glowing screen with abstract light waves", "attendees seen from behind in silhouette", "smooth uncluttered desk surface").
9. NEVER include hex codes (#...) or percentages (%) in any prompt.`;

  try {
    const rawJson = await callGeminiParts([{ text: prompt }], {
      responseJson: true,
      responseSchema: CREATIVE_CONCEPTS_SCHEMA,
      temperature: 0.85,
      timeoutMs: 14_000,
      apiKey: params.apiKey,
    });
    const parsed = JSON.parse(rawJson) as { concepts?: Array<Partial<CreativeConceptOption>> };
    const items = Array.isArray(parsed.concepts) ? parsed.concepts : [];

    return assignments.map((assignment, idx) => {
      const raw = items[idx];
      const fallback = buildFallbackConcept(assignment, facts, idx);
      if (!raw) return fallback;

      const headlineText = clampWords(raw.headlineText || fallback.headlineText, 6) || fallback.headlineText;
      const sublineText = (raw.sublineText || fallback.sublineText).trim();
      const ctaText = clampWords(raw.ctaText || fallback.ctaText, 4) || fallback.ctaText;
      const designedPrompt = sanitizePromptForDiffusion(raw.designedPrompt || fallback.designedPrompt);
      const textFreePrompt = sanitizePromptForDiffusion(raw.textFreePrompt || designedPrompt);
      const supportsMockup =
        assignment.template.usesProductMockup &&
        (facts.campaignType === 'launch_event' || facts.campaignType === 'product_feature');

      return {
        id: `concept-${idx + 1}-${assignment.template.id}`,
        title: (raw.title || assignment.template.name).trim(),
        sceneIdea: (raw.sceneIdea || fallback.sceneIdea).trim(),
        setting: assignment.template.backdropGuidance,
        locationBadge: locationBadgeText,
        templateId: assignment.template.id,
        templateName: assignment.template.name,
        styleId: assignment.template.id,
        styleName: assignment.template.name,
        paletteId: assignment.palette.id,
        paletteName: assignment.palette.name,
        supportsProductScreenshot: supportsMockup,
        metaphor: (raw.sceneIdea || fallback.sceneIdea).trim(),
        mainSubject: (raw.mainSubject || fallback.mainSubject).trim(),
        headlineText,
        sublineText,
        ctaText,
        layout: sanitizePromptForDiffusion(raw.layout || fallback.layout),
        designedPrompt,
        textFreePrompt,
        previewHexes: assignment.palette.previewHexes,
        heroStat: facts.heroStat,
        chips: facts.chips,
      };
    });
  } catch (err) {
    console.warn('[artDirector] Concept picker fallback triggered:', err);
    return assignments.map((assignment, idx) => buildFallbackConcept(assignment, facts, idx));
  }
}

export interface VisionVerificationResult {
  verified: boolean;
  skipped: boolean;
  needsReview: boolean;
  extraTextDetected: boolean;
  extraTokens: string[];
  matchScore: number;
  detectedText: string;
  relevanceScore?: number;
  relevanceFeedback?: string;
  reason: string;
}

export function normalizeTextForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive, punctuation-tolerant word comparison.
 * Flags extraTextDetected=true whenever ANY visible text appears beyond headlineText and ctaText.
 */
export function scoreTextMatch(
  detectedText: string,
  expectedHeadline: string,
  expectedCta = ''
): { matchScore: number; verified: boolean; extraTextDetected: boolean; extraTokens: string[] } {
  const normDetected = normalizeTextForComparison(detectedText);
  const detectedList = normDetected.split(' ').filter(Boolean);
  const detectedSet = new Set(detectedList);

  const expectedAllTokens = normalizeTextForComparison(`${expectedHeadline} ${expectedCta}`)
    .split(' ')
    .filter(Boolean);
  const expectedSet = new Set(expectedAllTokens);

  const checkTokens = expectedAllTokens.filter((w) => w.length > 1);
  let matched = 0;
  for (const token of checkTokens) {
    if (detectedSet.has(token)) {
      matched++;
    }
  }

  const matchScore = checkTokens.length === 0 ? 1 : Number((matched / checkTokens.length).toFixed(2));
  const extraTokens = Array.from(new Set(detectedList.filter((t) => !expectedSet.has(t))));
  const extraTextDetected = extraTokens.length > 0;

  return {
    matchScore,
    verified: matchScore >= 0.8,
    extraTextDetected,
    extraTokens,
  };
}

/**
 * Sends a generated image to Gemini Vision to transcribe ALL visible text anywhere in the image.
 * Sets needsReview=true if expected text mismatches OR if any extra/garbled text appears beyond headlineText and ctaText.
 * Gracefully skips and sets needsReview=true on HTTP 429 or vision errors.
 */
export async function verifyImageTextWithGemini(params: {
  base64Image: string;
  mimeType?: string;
  expectedHeadline: string;
  expectedCta?: string;
  expectNoText?: boolean;
  facts?: CampaignFacts;
  apiKey?: string;
}): Promise<VisionVerificationResult> {
  const mimeType = params.mimeType || 'image/jpeg';
  const hasFacts = Boolean(params.facts);
  const visionPrompt = hasFacts
    ? `Inspect this generated marketing background scene and return JSON with:
1. "detectedText": EVERY piece of visible text anywhere in this image (do not omit small/blurry text; "" if none).
2. "relevanceScore": integer 1 to 5 — does the image clearly relate to the product ("${params.facts!.productName}"), campaign type ("${params.facts!.campaignType}"), and expected scene elements (${params.facts!.sceneElements.join(', ')})? (5 = spot-on, 4 = good match, <=3 = generic/unrelated).
3. "feedback": concise 1-sentence visual improvement if relevanceScore < 4 or stray text is visible ("" if good).`
    : 'Transcribe EVERY piece of visible text anywhere in this image (headlines, buttons, tiny UI labels, chart text, watermarks, or garbled characters). Do not omit small or blurry text. Return ONLY a JSON object with a single field "detectedText" containing all visible text separated by spaces or newlines.';

  const schemaProps: Record<string, any> = {
    detectedText: { type: 'STRING' },
  };
  const requiredFields = ['detectedText'];
  if (hasFacts) {
    schemaProps.relevanceScore = { type: 'INTEGER' };
    schemaProps.feedback = { type: 'STRING' };
    requiredFields.push('relevanceScore', 'feedback');
  }

  try {
    const raw = await callGeminiParts(
      [
        { inlineData: { mimeType, data: params.base64Image } },
        { text: visionPrompt },
      ],
      {
        responseJson: true,
        responseSchema: {
          type: 'OBJECT',
          properties: schemaProps,
          required: requiredFields,
        },
        temperature: 0.1,
        apiKey: params.apiKey,
        timeoutMs: 12_000,
      }
    );

    const parsed = JSON.parse(raw) as {
      detectedText?: string;
      relevanceScore?: number;
      feedback?: string;
    };
    const detectedText = (parsed.detectedText || '').trim();
    const relevanceScore = hasFacts
      ? Math.min(5, Math.max(1, Math.round(Number(parsed.relevanceScore) || 3)))
      : undefined;
    const relevanceFeedback = (parsed.feedback || '').trim();

    if (params.expectNoText) {
      const strayTokens = normalizeTextForComparison(detectedText)
        .split(' ')
        .filter((t) => t.length > 1);
      const extraTextDetected = strayTokens.length > 0;
      const lowRelevance = relevanceScore !== undefined && relevanceScore < 4;
      const verified = !extraTextDetected && !lowRelevance;
      const combinedScore =
        (relevanceScore !== undefined ? relevanceScore / 5 : 1) * (extraTextDetected ? 0.5 : 1);

      let reason = 'Raw scene verified relevant and free of stray text.';
      if (lowRelevance && extraTextDetected) {
        reason = `Low relevance (${relevanceScore}/5: ${relevanceFeedback}) and stray text detected (${strayTokens.slice(0, 4).join(', ')}).`;
      } else if (lowRelevance) {
        reason = `Low relevance (${relevanceScore}/5): ${relevanceFeedback || 'scene does not clearly match campaign facts'}.`;
      } else if (extraTextDetected) {
        reason = `Stray model-rendered text detected in raw scene (${strayTokens.slice(0, 6).join(', ')}); flagged for review.`;
      }

      return {
        verified,
        skipped: false,
        needsReview: !verified,
        extraTextDetected,
        extraTokens: strayTokens,
        matchScore: Number(combinedScore.toFixed(2)),
        detectedText,
        relevanceScore,
        relevanceFeedback,
        reason,
      };
    }

    const { matchScore, verified, extraTextDetected, extraTokens } = scoreTextMatch(
      detectedText,
      params.expectedHeadline,
      params.expectedCta || ''
    );

    const needsReview = !verified || extraTextDetected;
    let reason = `On-image text matched (${Math.round(matchScore * 100)}%) with no extra text`;
    if (!verified) {
      reason = `Text mismatch (${Math.round(matchScore * 100)}% match): expected "${params.expectedHeadline}" / "${params.expectedCta || ''}", detected "${detectedText}"`;
    } else if (extraTextDetected) {
      reason = `Expected text matched (${Math.round(matchScore * 100)}%), but extra/garbled text was detected (${extraTokens.slice(0, 6).join(', ')}); flagged for review.`;
    }

    return {
      verified,
      skipped: false,
      needsReview,
      extraTextDetected,
      extraTokens,
      matchScore,
      detectedText,
      reason,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isRateLimit = err instanceof GeminiHttpError && err.status === 429;
    console.warn(`[visionVerify] Skipping vision verification (${isRateLimit ? '429 rate limit' : msg})`);
    return {
      verified: false,
      skipped: true,
      needsReview: true,
      extraTextDetected: false,
      extraTokens: [],
      matchScore: 0,
      detectedText: '',
      reason: isRateLimit
        ? 'Vision verification skipped (Gemini 429 rate limit); flagged for review.'
        : `Vision verification unavailable (${msg}); flagged for review.`,
    };
  }
}

export interface VerifiedGenerationCandidate<T> {
  artifact: T;
  provider: string;
  base64Image: string;
  mimeType: string;
}

/**
 * Runs up to 2 image generations with Gemini Vision verification.
 * Logs every credit-consuming call and picks the higher-scoring result if attempt 2 still mismatches.
 */
export async function runVerifiedImageGenerationLoop<T>(params: {
  expectedHeadline: string;
  expectedCta?: string;
  requiresText?: boolean;
  expectNoText?: boolean;
  facts?: CampaignFacts;
  apiKey?: string;
  generateAttempt: (attemptNumber: number, feedback?: string) => Promise<VerifiedGenerationCandidate<T>>;
}): Promise<{
  best: VerifiedGenerationCandidate<T>;
  verification: VisionVerificationResult;
  generationsUsed: number;
}> {
  const MAX_GENERATIONS = 2;
  const requiresText = params.requiresText ?? true;

  let bestCandidate: VerifiedGenerationCandidate<T> | null = null;
  let bestVerification: VisionVerificationResult | null = null;
  let generationsUsed = 0;
  let retryFeedback: string | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATIONS; attempt++) {
    generationsUsed = attempt;
    const candidate = await params.generateAttempt(attempt, retryFeedback);
    console.info(
      `[creditLog] Credit-consuming image generation executed: provider="${candidate.provider}", attempt=${attempt}/${MAX_GENERATIONS}`
    );

    if (!requiresText && !params.expectNoText) {
      return {
        best: candidate,
        verification: {
          verified: true,
          skipped: true,
          needsReview: false,
          extraTextDetected: false,
          extraTokens: [],
          matchScore: 1,
          detectedText: '',
          reason: 'Text-free visual; vision OCR check not required.',
        },
        generationsUsed,
      };
    }

    const verification = await verifyImageTextWithGemini({
      base64Image: candidate.base64Image,
      mimeType: candidate.mimeType,
      expectedHeadline: params.expectedHeadline,
      expectedCta: params.expectedCta,
      expectNoText: params.expectNoText,
      facts: params.facts,
      apiKey: params.apiKey,
    });

    if (!bestVerification || verification.matchScore > bestVerification.matchScore) {
      bestCandidate = candidate;
      bestVerification = verification;
    }

    if (verification.verified || verification.skipped) {
      return {
        best: bestCandidate!,
        verification: bestVerification,
        generationsUsed,
      };
    }

    retryFeedback = verification.relevanceFeedback || verification.reason;
    console.warn(
      `[visionVerify] Attempt ${attempt}/${MAX_GENERATIONS} failed check: ${verification.reason}`
    );
  }

  return {
    best: bestCandidate!,
    verification: {
      ...bestVerification!,
      needsReview: true,
    },
    generationsUsed,
  };
}

/**
 * Scores a raw AI-generated backdrop candidate (1-5) for relevance to the extracted
 * campaign facts and absence of garbled text or deformed people/faces/hands.
 */
export async function scoreBackdropCandidateWithGemini(params: {
  base64Image: string;
  mimeType?: string;
  facts?: CampaignFacts;
  apiKey?: string;
}): Promise<{
  score: number;
  hasGarbledText: boolean;
  hasDeformedPeople: boolean;
  reason: string;
}> {
  const mimeType = params.mimeType || 'image/jpeg';
  const contextLine = params.facts
    ? `Campaign Type: ${params.facts.campaignType}, Product: ${params.facts.productName}, Audience: ${params.facts.targetAudience}, Scene Elements: ${params.facts.sceneElements.join(', ')}.`
    : 'B2B technology marketing backdrop.';

  try {
    const raw = await callGeminiParts(
      [
        { inlineData: { mimeType, data: params.base64Image } },
        {
          text: `Score this AI-generated backdrop image for a social marketing poster.
${contextLine}
Evaluate strictly on:
1. Relevance (1-5): Does the visual setting match the campaign facts and mood?
2. Cleanliness (OCR check): Is it free of garbled/stray text, letters, numbers, or watermarks?
3. Anatomy check: Is it free of deformed faces, distorted hands, or AI body artifacts?
Return JSON: { "score": 1-5 integer, "hasGarbledText": boolean, "hasDeformedPeople": boolean, "reason": string }.`,
        },
      ],
      {
        responseJson: true,
        responseSchema: {
          type: 'OBJECT',
          properties: {
            score: { type: 'INTEGER' },
            hasGarbledText: { type: 'BOOLEAN' },
            hasDeformedPeople: { type: 'BOOLEAN' },
            reason: { type: 'STRING' },
          },
          required: ['score', 'hasGarbledText', 'hasDeformedPeople', 'reason'],
        },
        temperature: 0.1,
        apiKey: params.apiKey,
        timeoutMs: 12_000,
      }
    );
    const parsed = JSON.parse(raw) as {
      score?: number;
      hasGarbledText?: boolean;
      hasDeformedPeople?: boolean;
      reason?: string;
    };
    let score = Math.min(5, Math.max(1, Math.round(Number(parsed.score) || 3)));
    const hasGarbledText = Boolean(parsed.hasGarbledText);
    const hasDeformedPeople = Boolean(parsed.hasDeformedPeople);
    if (hasGarbledText) score = Math.min(score, 2);
    if (hasDeformedPeople) score = Math.min(score, 2);
    return {
      score,
      hasGarbledText,
      hasDeformedPeople,
      reason: (parsed.reason || '').trim() || 'Scored by Gemini vision',
    };
  } catch (err: any) {
    console.warn('[scoreBackdropCandidate] Scoring skipped:', err?.message || err);
    return {
      score: 3,
      hasGarbledText: false,
      hasDeformedPeople: false,
      reason: 'Scoring skipped due to API fallback',
    };
  }
}

/**
 * Verifies the final code-rendered composite for visual legibility, contrast,
 * overlap-free layout, and campaign relevance (1-5).
 */
export async function verifyFinalCompositeWithGemini(params: {
  base64Image: string;
  mimeType?: string;
  facts?: CampaignFacts;
  expectedHeadline: string;
  apiKey?: string;
}): Promise<{
  relevanceScore: number;
  legible: boolean;
  feedback: string;
  needsReview: boolean;
}> {
  const mimeType = params.mimeType || 'image/jpeg';
  const productInfo = params.facts
    ? `product "${params.facts.productName}" (${params.facts.campaignType})`
    : 'the campaign';

  try {
    const raw = await callGeminiParts(
      [
        { inlineData: { mimeType, data: params.base64Image } },
        {
          text: `Inspect this final social creative for ${productInfo}.
Check:
1. Is the headline "${params.expectedHeadline}" cleanly legible with strong contrast and NO overlapping elements or faces?
2. Does the overall layout (headline, product mockup, event badge) look professional and relevant to ${productInfo}?
Return JSON: { "relevanceScore": 1-5 integer, "legible": boolean, "feedback": string }.`,
        },
      ],
      {
        responseJson: true,
        responseSchema: {
          type: 'OBJECT',
          properties: {
            relevanceScore: { type: 'INTEGER' },
            legible: { type: 'BOOLEAN' },
            feedback: { type: 'STRING' },
          },
          required: ['relevanceScore', 'legible', 'feedback'],
        },
        temperature: 0.1,
        apiKey: params.apiKey,
        timeoutMs: 12_000,
      }
    );
    const parsed = JSON.parse(raw) as {
      relevanceScore?: number;
      legible?: boolean;
      feedback?: string;
    };
    const relevanceScore = Math.min(5, Math.max(1, Math.round(Number(parsed.relevanceScore) || 4)));
    const legible = parsed.legible !== false;
    return {
      relevanceScore,
      legible,
      feedback: (parsed.feedback || '').trim(),
      needsReview: relevanceScore < 4 || !legible,
    };
  } catch (err: any) {
    console.warn('[verifyFinalComposite] Skipping final check:', err?.message || err);
    return {
      relevanceScore: 4,
      legible: true,
      feedback: 'Final composite check skipped due to rate limit.',
      needsReview: true,
    };
  }
}

export async function generateLeadWithGemini(userPrompt: string): Promise<{
  name: string;
  role: string;
  company: string;
  initials: string;
  source: string;
  excerpt: string;
  intent: number;
  color: string;
}> {
  const prompt = `Given the user intent search prompt: "${userPrompt}"
Generate a realistic B2B buyer lead prospect who recently posted publicly showing high buying intent.
Return a RAW JSON object (no code fences, no extra text):
{
  "name": "First Last",
  "role": "Executive title like VP of Engineering, Head of RevOps, etc.",
  "company": "Realistic modern tech company name",
  "initials": "FL",
  "source": "Platform like 'Reddit · r/startups', 'LinkedIn', 'X · @handle', or 'Hacker News'",
  "excerpt": "A verbatim 1-sentence quote illustrating their intent or pain point related to the user prompt.",
  "intent": 88,
  "color": "lavender"
}`;

  try {
    const rawText = await callGeminiApi(prompt, true);
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    const jsonStr =
      firstBrace !== -1 && lastBrace !== -1
        ? rawText.slice(firstBrace, lastBrace + 1)
        : rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    const clean = userPrompt.trim().replace(/[?.!]+$/, '');
    return {
      name: 'Ari Patel',
      role: 'Head of RevOps',
      company: 'Studio Meridian',
      initials: 'AP',
      source: 'Public conversation · preview',
      excerpt: `Asked about ${clean.toLowerCase()} and how to make the change without disrupting their team.`,
      intent: 89,
      color: 'sage',
    };
  }
}

// ─────────────────────────── Community Inbox: AI Reply Generator ───────────────────────────

export async function generateCommentReply(params: {
  postContext: string;
  commenterName: string;
  commentText: string;
  platform: 'facebook' | 'instagram';
  apiKey?: string;
}): Promise<string> {
  const { postContext, commenterName, commentText, platform, apiKey } = params;
  const key = resolveGeminiApiKey(apiKey);

  const prompt = `You are a professional social media manager for VTAB Square, a B2B enterprise AI analytics and reporting platform.

A ${platform} user named "${commenterName}" commented on a post about: "${postContext}"

Their comment: "${commentText}"

Write a warm, professional, and engaging brand reply in 1-2 sentences. The tone should be:
- Genuine and human, not robotic
- Encouraging and positive
- Brand-appropriate for an enterprise B2B SaaS company
- If they asked a question, acknowledge it and invite them to reach out or book a demo
- Use an emoji or two where appropriate (not excessive)

Reply directly (no prefix, no labels, just the reply text):`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 150 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response');
    return text;
  } catch {
    // Graceful fallback
    const fallbacks: Record<string, string> = {
      facebook: `Thanks so much, ${commenterName}! 🙌 We'd love to show you more — feel free to DM us or book a free demo at vtabsquare.com to see it in action!`,
      instagram: `Thank you ${commenterName}! ✨ So glad this resonates — drop us a DM and we'll get you a front-row seat to the full experience!`,
    };
    return fallbacks[platform] || `Thank you for your comment, ${commenterName}! We appreciate your enthusiasm and look forward to connecting with you. 🚀`;
  }
}
