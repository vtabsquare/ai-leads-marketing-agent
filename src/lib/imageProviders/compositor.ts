import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium, type Browser } from 'playwright-core';
import { getPaletteById, getTemplateById, type CampaignVisualType } from '../creativeStyles';

export interface HybridRenderInput {
  backdropBuffer: Buffer;
  screenshotBuffer?: Buffer | null;
  logoBuffer?: Buffer | null;
  width: number;
  height: number;
  templateId: string;
  paletteId: string;
  campaignType?: CampaignVisualType;
  headline: string;
  subline?: string;
  ctaText?: string;
  eventRowText?: string;
  chips?: string[];
  heroStat?: string;
  capabilities?: string[];
  outputFormat?: 'jpeg' | 'png';
}

let cachedFontCss: string | null = null;
let sharedBrowserPromise: Promise<Browser> | null = null;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const lumA = relativeLuminance(a.r, a.g, a.b);
  const lumB = relativeLuminance(b.r, b.g, b.b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function ensureAccessibleTextColor(bgHex: string, preferredTextHex: string): string {
  if (getContrastRatio(bgHex, preferredTextHex) >= 4.5) {
    return preferredTextHex;
  }
  const whiteContrast = getContrastRatio(bgHex, '#FFFFFF');
  const darkContrast = getContrastRatio(bgHex, '#111814');
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#111814';
}

export async function extractDominantDarkHex(imageBuffer: Buffer, fallbackHex: string): Promise<string> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(12, 12, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const pixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 3) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }
    // Darken the mean image color to create a rich, image-harmonized dark ground
    const r = (rSum / pixels) * 0.28;
    const g = (gSum / pixels) * 0.28;
    const b = (bSum / pixels) * 0.28;
    return rgbToHex(r, g, b);
  } catch {
    return fallbackHex;
  }
}

export async function computeBackdropOverlayOpacity(
  backdropBuffer: Buffer,
  textHex = '#FFFFFF'
): Promise<number> {
  try {
    const stats = await sharp(backdropBuffer).stats();
    const r = stats.channels[0]?.mean ?? 40;
    const g = stats.channels[1]?.mean ?? 45;
    const b = stats.channels[2]?.mean ?? 42;
    let opacity = 0.66;
    const textRgb = hexToRgb(textHex);
    const textLum = relativeLuminance(textRgb.r, textRgb.g, textRgb.b);

    while (opacity < 0.90) {
      const darkR = r * (1 - opacity) + 10 * opacity;
      const darkG = g * (1 - opacity) + 14 * opacity;
      const darkB = b * (1 - opacity) + 12 * opacity;
      const bgLum = relativeLuminance(darkR, darkG, darkB);
      const ratio =
        (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05);
      if (ratio >= 4.5) break;
      opacity += 0.05;
    }
    return Number(opacity.toFixed(2));
  } catch {
    return 0.76;
  }
}

export async function prepareBlurredBackdrop(
  inputBuffer: Buffer,
  width: number,
  height: number,
  blurSigma = 0
): Promise<Buffer> {
  const pipeline = sharp(inputBuffer).resize(width, height, {
    fit: 'cover',
    position: 'center',
  });
  if (blurSigma > 0.2) {
    return pipeline.blur(blurSigma).png().toBuffer();
  }
  return pipeline.png().toBuffer();
}

function loadLocalFontFacesCss(): string {
  if (cachedFontCss !== null) return cachedFontCss;

  const root = process.cwd();
  const fontDefs = [
    {
      family: 'Plus Jakarta Sans',
      weight: 700,
      file: path.join(
        root,
        'node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2'
      ),
    },
    {
      family: 'Plus Jakarta Sans',
      weight: 800,
      file: path.join(
        root,
        'node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2'
      ),
    },
    {
      family: 'Inter',
      weight: 500,
      file: path.join(root, 'node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2'),
    },
    {
      family: 'Inter',
      weight: 600,
      file: path.join(root, 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2'),
    },
    {
      family: 'Inter',
      weight: 700,
      file: path.join(root, 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2'),
    },
  ];

  const rules: string[] = [];
  for (const def of fontDefs) {
    if (fs.existsSync(def.file)) {
      const b64 = fs.readFileSync(def.file).toString('base64');
      rules.push(`@font-face {
  font-family: '${def.family}';
  font-style: normal;
  font-weight: ${def.weight};
  font-display: block;
  src: url('data:font/woff2;base64,${b64}') format('woff2');
}`);
    }
  }

  cachedFontCss = rules.join('\n');
  return cachedFontCss;
}

function resolveBrowserExecutable(): string {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => Boolean(p && p.trim()));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'No Chromium/Edge/Chrome executable found for HTML/CSS template rendering. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.'
  );
}

async function getBrowser(): Promise<Browser> {
  if (sharedBrowserPromise) {
    const existing = await sharedBrowserPromise;
    if (existing.isConnected()) return existing;
    sharedBrowserPromise = null;
  }
  const executablePath = resolveBrowserExecutable();
  sharedBrowserPromise = chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return sharedBrowserPromise;
}

function formatHeadlineWithAccent(headline: string): string {
  const words = headline
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  if (words.length === 0) return 'VTAB <span class="accent">Reporting</span>';

  const priorityKeywords = new Set([
    'ai',
    'vtab',
    'reporting',
    'analytics',
    'launch',
    'launching',
    'hiring',
    'engineers',
    'coimbatore',
    'faster',
    'instant',
    '10x',
  ]);
  let accentIdx = words.findIndex((w) =>
    priorityKeywords.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  if (accentIdx === -1) {
    accentIdx = words.length - 1;
  }

  return words
    .map((word, idx) =>
      idx === accentIdx
        ? `<span class="accent">${escapeHtml(word)}</span>`
        : escapeHtml(word)
    )
    .join(' ');
}

function buildMetaOrChipsHtml(eventRowText?: string, chips?: string[]): string {
  const chipList = (chips || []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  const raw = (eventRowText || '').trim();
  const parts = raw
    ? raw
        .split(/[·|]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const calendarSvg = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const pinSvg = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const datePattern =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun|\d{1,2}(:\d{2})?\s*(am|pm)|\d{4})\b/i;

  const metaHtml = parts
    .map((part) => {
      const icon = datePattern.test(part) ? calendarSvg : pinSvg;
      return `<span class="meta-item">${icon}<span>${escapeHtml(part)}</span></span>`;
    })
    .join('');

  const chipsHtml = chipList
    .map((chip) => `<span class="chip-pill">${escapeHtml(chip)}</span>`)
    .join('');

  return [metaHtml, chipsHtml].filter(Boolean).join('');
}

function buildPlaceholderScreenshotDataUri(accentHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
    <rect width="960" height="600" fill="#F8FAF8"/>
    <rect width="200" height="600" fill="#142019"/>
    <rect x="24" y="34" width="120" height="22" rx="6" fill="${accentHex}"/>
    <rect x="24" y="88" width="152" height="32" rx="8" fill="#23372B"/>
    <rect x="24" y="136" width="132" height="18" rx="6" fill="#1E2F25"/>
    <rect x="24" y="170" width="144" height="18" rx="6" fill="#1E2F25"/>
    <rect x="236" y="40" width="220" height="110" rx="14" fill="#FFFFFF" stroke="#DCE5DC" stroke-width="2"/>
    <rect x="476" y="40" width="220" height="110" rx="14" fill="#FFFFFF" stroke="#DCE5DC" stroke-width="2"/>
    <rect x="716" y="40" width="208" height="110" rx="14" fill="#FFFFFF" stroke="#DCE5DC" stroke-width="2"/>
    <rect x="236" y="178" width="688" height="382" rx="16" fill="#FFFFFF" stroke="#DCE5DC" stroke-width="2"/>
    <path d="M 284 480 L 380 420 L 476 445 L 572 340 L 668 365 L 764 260 L 876 230" fill="none" stroke="#1E9E5A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="876" cy="230" r="10" fill="${accentHex}" stroke="#142019" stroke-width="3"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function renderTemplateOnce(
  input: HybridRenderInput,
  templateId: string,
  headlineSizePx: number
): Promise<{ pngBuffer: Buffer; overlapErrors: string[] }> {
  const template = getTemplateById(templateId);
  const palette = getPaletteById(input.paletteId);
  const isLandscape = input.width > input.height;

  const templatePath = path.join(process.cwd(), 'src', 'templates', `${template.id}.html`);
  const rawHtml = fs.readFileSync(templatePath, 'utf8');

  const dominantDark = await extractDominantDarkHex(input.backdropBuffer, palette.backdropTint);
  const panelBg = palette.tone === 'dark' ? dominantDark : palette.panelBg;
  const safeTextColor = ensureAccessibleTextColor(panelBg, palette.panelText);
  const overlayOpacity = await computeBackdropOverlayOpacity(input.backdropBuffer, '#FFFFFF');
  const marginX = Math.round(input.width * 0.065);
  const marginY = Math.round(input.height * (isLandscape ? 0.07 : 0.055));

  // Secondary text at least 3% of canvas height
  const metaFontSize = Math.max(19, Math.round(input.height * (isLandscape ? 0.032 : 0.02)));
  const metaLargeSize = Math.max(22, Math.round(input.height * (isLandscape ? 0.036 : 0.024)));
  const statSize = Math.round(input.height * (isLandscape ? 0.22 : 0.14));
  const headlineLargeSize = Math.round(headlineSizePx * 1.24);

  const backdropDataUri = `data:image/png;base64,${input.backdropBuffer.toString('base64')}`;
  const screenshotDataUri = input.screenshotBuffer
    ? `data:image/png;base64,${input.screenshotBuffer.toString('base64')}`
    : buildPlaceholderScreenshotDataUri(palette.accentHex);

  const logoHtml = input.logoBuffer
    ? `<img src="data:image/png;base64,${input.logoBuffer.toString('base64')}" alt="Brand Logo" />`
    : 'V';

  const ctaHtml = input.ctaText
    ? `<div class="cta-pill">${escapeHtml(input.ctaText)}</div>`
    : '';

  const ctaTextRaw = escapeHtml(input.ctaText || 'Get Started Now');
  const heroOrScreenshotDataUri = input.screenshotBuffer
    ? `data:image/png;base64,${input.screenshotBuffer.toString('base64')}`
    : backdropDataUri;

  // Dynamically populate 4 feature callouts and value statement from campaign capabilities/facts
  const caps = Array.isArray(input.capabilities) && input.capabilities.length > 0
    ? input.capabilities
    : [
        'Visualize Instantly · Dynamic KPI graphs on the fly',
        'Collaborate Seamlessly · Instant sharing across leadership teams',
        'Customize Your View · Tailor metrics to your exact workflow',
        'Uncover Insights · Deep conversational queries into raw data',
      ];

  const parseCap = (raw: string, fallbackTitle: string, fallbackDesc: string) => {
    const parts = raw.split(/[:·\-]/);
    if (parts.length >= 2) {
      return { title: parts[0].trim(), desc: parts.slice(1).join(' ').trim() };
    }
    return { title: raw.trim() || fallbackTitle, desc: fallbackDesc };
  };

  const f1 = parseCap(caps[0] || '', 'Visualize Instantly', 'Dynamic KPI graphs on the fly');
  const f2 = parseCap(caps[1] || '', 'Collaborate Seamlessly', 'Instant sharing across leadership teams');
  const f3 = parseCap(caps[2] || '', 'Customize Your View', 'Tailor metrics to your exact workflow');
  const f4 = parseCap(caps[3] || '', 'Uncover Insights', 'Deep conversational queries into raw data');

  const valueStatement = escapeHtml(
    input.subline ||
      (input.campaignType === 'careers'
        ? 'Build the Next Generation of AI Enterprise Software'
        : input.campaignType === 'event'
        ? 'Connect With Visionaries Shaping The Future of Enterprise Intelligence'
        : 'Revolutionize Your Reporting. Streamline Data. Empower Decisions.')
  );

  const html = rawHtml
    .replace(/\{\{FONT_FACES\}\}/g, loadLocalFontFacesCss())
    .replace(/\{\{WIDTH\}\}/g, String(input.width))
    .replace(/\{\{HEIGHT\}\}/g, String(input.height))
    .replace(/\{\{MARGIN_X\}\}/g, String(marginX))
    .replace(/\{\{MARGIN_Y\}\}/g, String(marginY))
    .replace(/\{\{ORIENTATION\}\}/g, isLandscape ? 'landscape' : 'portrait')
    .replace(/\{\{THEME_CLASS\}\}/g, palette.tone === 'light' || palette.tone === 'warm' ? 'light-theme' : 'dark-theme')
    .replace(/\{\{PANEL_BG\}\}/g, panelBg)
    .replace(/\{\{DOMINANT_DARK\}\}/g, dominantDark)
    .replace(/\{\{BACKDROP_TINT\}\}/g, palette.backdropTint)
    .replace(/\{\{TEXT_COLOR\}\}/g, safeTextColor)
    .replace(/\{\{SUBTEXT_COLOR\}\}/g, palette.panelSubtext)
    .replace(/\{\{ACCENT_HEX\}\}/g, palette.accentHex)
    .replace(/\{\{CTA_TEXT_COLOR\}\}/g, palette.ctaTextColor)
    .replace(/\{\{OVERLAY_OPACITY\}\}/g, String(overlayOpacity))
    .replace(/\{\{HEADLINE_SIZE\}\}/g, String(headlineSizePx))
    .replace(/\{\{HEADLINE_LARGE_SIZE\}\}/g, String(headlineLargeSize))
    .replace(/\{\{STAT_SIZE\}\}/g, String(statSize))
    .replace(/\{\{META_FONT_SIZE\}\}/g, String(metaFontSize))
    .replace(/\{\{META_LARGE_SIZE\}\}/g, String(metaLargeSize))
    .replace(/\{\{HERO_STAT\}\}/g, escapeHtml(input.heroStat || '10×'))
    .replace(/\{\{LOGO_HTML\}\}/g, logoHtml)
    .replace(/\{\{HEADLINE_HTML\}\}/g, formatHeadlineWithAccent(input.headline))
    .replace(/\{\{META_OR_CHIPS_HTML\}\}/g, buildMetaOrChipsHtml(input.eventRowText, input.chips))
    .replace(/\{\{CTA_HTML\}\}/g, ctaHtml)
    .replace(/\{\{CTA_TEXT_RAW\}\}/g, ctaTextRaw)
    .replace(/\{\{FEATURE_1_TITLE\}\}/g, escapeHtml(f1.title))
    .replace(/\{\{FEATURE_1_DESC\}\}/g, escapeHtml(f1.desc))
    .replace(/\{\{FEATURE_2_TITLE\}\}/g, escapeHtml(f2.title))
    .replace(/\{\{FEATURE_2_DESC\}\}/g, escapeHtml(f2.desc))
    .replace(/\{\{FEATURE_3_TITLE\}\}/g, escapeHtml(f3.title))
    .replace(/\{\{FEATURE_3_DESC\}\}/g, escapeHtml(f3.desc))
    .replace(/\{\{FEATURE_4_TITLE\}\}/g, escapeHtml(f4.title))
    .replace(/\{\{FEATURE_4_DESC\}\}/g, escapeHtml(f4.desc))
    .replace(/\{\{VALUE_STATEMENT\}\}/g, valueStatement)
    .replace(
      /\{\{HERO_OR_SCREENSHOT_HTML\}\}/g,
      `<img src="${heroOrScreenshotDataUri}" alt="Hero Visual" />`
    )
    .replace(
      /\{\{HERO_IMG_HTML\}\}/g,
      `<img class="hero-photo" src="${backdropDataUri}" alt="" />`
    )
    .replace(
      /\{\{SCREENSHOT_HTML\}\}/g,
      `<img src="${screenshotDataUri}" alt="Product UI" />`
    );

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      const doc = (globalThis as any).document;
      if (doc?.fonts?.ready) {
        await doc.fonts.ready;
      }
    });

    const overlapErrors = await page.evaluate(
      ({ canvasW, canvasH }: { canvasW: number; canvasH: number }) => {
        const doc = (globalThis as any).document;
        const errors: string[] = [];
        const zones = Array.from(doc.querySelectorAll('[data-zone]') as any[]).map((el: any) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.getAttribute('data-zone') || 'unknown',
            left: r.left as number,
            top: r.top as number,
            right: r.right as number,
            bottom: r.bottom as number,
            scrollW: el.scrollWidth as number,
            clientW: el.clientWidth as number,
            scrollH: el.scrollHeight as number,
            clientH: el.clientHeight as number,
          };
        });

        for (const z of zones) {
          if (z.left < -1 || z.top < -1 || z.right > canvasW + 1 || z.bottom > canvasH + 1) {
            errors.push(`Zone "${z.name}" extends outside canvas (${Math.round(z.right)}x${Math.round(z.bottom)})`);
          }
          // Display fonts with tight line-height (~1.02) naturally have ~15% glyph metric overhang
          if (z.name === 'headline' && (z.scrollH > z.clientH + 18 || z.scrollW > z.clientW + 12)) {
            errors.push(`Headline text overflows its container (${z.scrollW}x${z.scrollH} > ${z.clientW}x${z.clientH})`);
          }
        }

        for (let i = 0; i < zones.length; i++) {
          for (let j = i + 1; j < zones.length; j++) {
            const a = zones[i];
            const b = zones[j];
            const intersects =
              a.left < b.right - 2 &&
              a.right > b.left + 2 &&
              a.top < b.bottom - 2 &&
              a.bottom > b.top + 2;
            if (intersects) {
              errors.push(`Zone "${a.name}" overlaps "${b.name}"`);
            }
          }
        }
        return errors;
      },
      { canvasW: input.width, canvasH: input.height }
    );

    const pngBuffer = await page.screenshot({ type: 'png' });
    return { pngBuffer: Buffer.from(pngBuffer), overlapErrors };
  } finally {
    await context.close();
  }
}

export async function renderHybridCreative(
  input: HybridRenderInput
): Promise<Buffer> {
  const isLandscape = input.width > input.height;
  const baseHeadlinePx = Math.round(input.height * (isLandscape ? 0.092 : 0.074));
  let requestedTemplate = getTemplateById(input.templateId).id;

  // Enforce: product mockup template is ONLY allowed for launch_event / product_feature
  if (
    requestedTemplate === 'mockup-showcase' &&
    input.campaignType &&
    input.campaignType !== 'launch_event' &&
    input.campaignType !== 'product_feature'
  ) {
    requestedTemplate = 'full-bleed';
  }

  const attempts: Array<{ templateId: string; headlinePx: number }> = [
    { templateId: requestedTemplate, headlinePx: baseHeadlinePx },
    { templateId: requestedTemplate, headlinePx: Math.round(baseHeadlinePx * 0.85) },
    { templateId: 'full-bleed', headlinePx: Math.round(baseHeadlinePx * 0.85) },
  ];

  let bestPng: Buffer | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const { pngBuffer, overlapErrors } = await renderTemplateOnce(
      input,
      attempt.templateId,
      attempt.headlinePx
    );
    bestPng = pngBuffer;
    if (overlapErrors.length === 0) {
      if (i > 0) {
        console.warn(
          `[compositor] Fallback render succeeded with template=${attempt.templateId} headlinePx=${attempt.headlinePx}`
        );
      }
      break;
    }
    console.warn(
      `[compositor] Layout check failed on ${attempt.templateId} (${attempt.headlinePx}px):`,
      overlapErrors
    );
  }

  if (input.outputFormat === 'png') {
    return bestPng!;
  }
  return sharp(bestPng!)
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();
}
