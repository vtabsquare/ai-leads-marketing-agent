export type CampaignVisualType =
  | 'launch_event'
  | 'product_feature'
  | 'careers'
  | 'event'
  | 'announcement'
  | 'stat_highlight'
  | 'testimonial'
  | 'service'
  | 'other';

export interface CreativePalette {
  id: string;
  name: string;
  tone: 'dark' | 'light' | 'gradient' | 'warm' | 'high-contrast';
  panelBg: string;
  panelText: string;
  panelSubtext: string;
  accentHex: string;
  ctaTextColor: string;
  backdropTint: string;
  previewHexes: string[];
}

export type LayoutTemplateId =
  | 'product-infographic-showcase'
  | 'full-bleed'
  | 'type-poster'
  | 'split-arch'
  | 'card-stack'
  | 'diagonal-split'
  | 'centered-chips'
  | 'event-ticket'
  | 'stat-highlight'
  | 'mockup-showcase'
  | 'quote-card';

export interface LayoutTemplate {
  id: LayoutTemplateId;
  name: string;
  description: string;
  eligibleTypes: CampaignVisualType[];
  usesProductMockup: boolean;
  backdropGuidance: string;
}

export interface CreativeHistoryEntry {
  id?: string;
  workspace_id: string;
  campaign_id?: string;
  platform?: string;
  style: string; // stores templateId
  dominant_palette: string;
  main_subject: string;
  created_at?: string;
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'product-infographic-showcase',
    name: '3D Infographic Feature Showcase',
    description:
      'High-impact tech poster featuring a centered 3D floating glass dashboard hero flanked by 4 feature icons, header banner, and glowing CTA.',
    eligibleTypes: ['launch_event', 'product_feature', 'announcement'],
    usesProductMockup: true,
    backdropGuidance:
      'Futuristic dark glass isometric device displaying vibrant glowing blue, cyan, and lime data graphs and donut charts, sleek cyber dark environment, lens flare, crisp 3D render.',
  },
  {
    id: 'full-bleed',
    name: 'Full-Bleed Hero + Text Scrim',
    description:
      'Saturated full-bleed AI photography with directional gradient only behind the headline and bottom strip.',
    eligibleTypes: ['launch_event', 'careers', 'event', 'announcement', 'service', 'other'],
    usesProductMockup: false,
    backdropGuidance:
      'Richly lit editorial scene with clear visual subject in the upper two-thirds and clean darker ground near bottom, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'type-poster',
    name: 'Bold Editorial Type Poster',
    description:
      'High-impact typographic poster with oversized headline, crisp brand accent rule, and clean bottom strip.',
    eligibleTypes: ['announcement', 'careers', 'event', 'stat_highlight', 'other'],
    usesProductMockup: false,
    backdropGuidance:
      'Subtle tactile architectural surface in soft focus with clean tonal contrast, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'split-arch',
    name: 'Split Panel + Arch Hero Photo',
    description:
      'Asymmetric split pairing an oversized headline and chips/strip with a vivid AI scene cropped into an architectural arch.',
    eligibleTypes: ['careers', 'event', 'announcement', 'service', 'testimonial', 'other'],
    usesProductMockup: false,
    backdropGuidance:
      'Vivid architectural or collaborative workspace scene framed cleanly in portrait/square composition, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'card-stack',
    name: 'Layered Editorial Card Stack',
    description:
      'Vivid AI hero image framed in a layered card alongside a crisp high-contrast headline and action strip.',
    eligibleTypes: ['launch_event', 'product_feature', 'careers', 'announcement', 'service'],
    usesProductMockup: false,
    backdropGuidance:
      'Crisp editorial environment photography with rich depth and natural lighting, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'diagonal-split',
    name: 'Diagonal Split Hero',
    description:
      'Dynamic diagonal clip dividing vivid full-saturation AI photography from bold brand typography.',
    eligibleTypes: ['launch_event', 'product_feature', 'careers', 'event', 'announcement'],
    usesProductMockup: false,
    backdropGuidance:
      'Dramatic wide-angle architectural or studio scene with strong directional light and rich color, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'centered-chips',
    name: 'Centered Hero + Floating Chips',
    description:
      'Centered bold headline, large rounded AI hero photo, and floating role/capability chips.',
    eligibleTypes: ['careers', 'product_feature', 'announcement', 'service', 'other'],
    usesProductMockup: false,
    backdropGuidance:
      'Bright modern collaborative studio or product environment shot from wide angle, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'event-ticket',
    name: 'Event Ticket Strip + Venue Hero',
    description:
      'Vivid venue/stage atmosphere photo paired with a structured ticket-style date, venue, and city hero strip.',
    eligibleTypes: ['event', 'launch_event'],
    usesProductMockup: false,
    backdropGuidance:
      'Dramatic modern conference stage or keynote hall with warm architectural lighting and empty stage depth, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'stat-highlight',
    name: 'Hero Stat Metric + Backdrop',
    description:
      'One oversized metric or headline phrase as the focal hero over a vivid saturated AI backdrop.',
    eligibleTypes: ['stat_highlight', 'product_feature', 'announcement'],
    usesProductMockup: false,
    backdropGuidance:
      'Clean moody studio or architectural abstract light environment with rich depth, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'mockup-showcase',
    name: '3D Product Mockup Showcase',
    description:
      'Large 3D-perspective browser frame displaying the real product UI alongside a bold headline and info strip.',
    eligibleTypes: ['launch_event', 'product_feature'],
    usesProductMockup: true,
    backdropGuidance:
      'Modern architectural studio or launch stage backdrop with subtle depth and clean lighting, zero close-up faces, zero hands, zero text.',
  },
  {
    id: 'quote-card',
    name: 'Editorial Quote Card',
    description:
      'Bold quote typography and attribution paired with a circular/rounded workspace or abstract portrait-free image.',
    eligibleTypes: ['testimonial', 'announcement'],
    usesProductMockup: false,
    backdropGuidance:
      'Warm minimalist executive workspace or architectural lounge in natural daylight, zero close-up faces, zero hands, zero text.',
  },
];

export const CREATIVE_PALETTES: CreativePalette[] = [
  {
    id: 'dark-forest-lime',
    name: 'Deep Forest & Lime',
    tone: 'dark',
    panelBg: '#121E17',
    panelText: '#FFFFFF',
    panelSubtext: '#D0DFD5',
    accentHex: '#C9F36A',
    ctaTextColor: '#121E17',
    backdropTint: '#0C1510',
    previewHexes: ['#121E17', '#FFFFFF', '#C9F36A'],
  },
  {
    id: 'midnight-slate-ice',
    name: 'Midnight Slate & Sky',
    tone: 'dark',
    panelBg: '#0F172A',
    panelText: '#F8FAFC',
    panelSubtext: '#CBD5E1',
    accentHex: '#38BDF8',
    ctaTextColor: '#0F172A',
    backdropTint: '#090F1E',
    previewHexes: ['#0F172A', '#F8FAFC', '#38BDF8'],
  },
  {
    id: 'light-ivory-emerald',
    name: 'Warm Ivory & Emerald',
    tone: 'light',
    panelBg: '#F6F3EB',
    panelText: '#142019',
    panelSubtext: '#394D40',
    accentHex: '#1E7E48',
    ctaTextColor: '#FFFFFF',
    backdropTint: '#ECE6D8',
    previewHexes: ['#F6F3EB', '#142019', '#1E7E48'],
  },
  {
    id: 'noir-plum-gold',
    name: 'Noir Plum & Lime',
    tone: 'dark',
    panelBg: '#17111C',
    panelText: '#FAF7FD',
    panelSubtext: '#D4CBE0',
    accentHex: '#C9F36A',
    ctaTextColor: '#17111C',
    backdropTint: '#100B14',
    previewHexes: ['#17111C', '#FAF7FD', '#C9F36A'],
  },
  {
    id: 'warm-sand-terracotta',
    name: 'Warm Sand & Terracotta',
    tone: 'warm',
    panelBg: '#F4EDE2',
    panelText: '#261D17',
    panelSubtext: '#57473C',
    accentHex: '#D1542C',
    ctaTextColor: '#FFFFFF',
    backdropTint: '#E8DEC8',
    previewHexes: ['#F4EDE2', '#261D17', '#D1542C'],
  },
  {
    id: 'carbon-cobalt',
    name: 'Carbon & Cobalt',
    tone: 'high-contrast',
    panelBg: '#101216',
    panelText: '#FFFFFF',
    panelSubtext: '#C8CED9',
    accentHex: '#4F8CFF',
    ctaTextColor: '#FFFFFF',
    backdropTint: '#0A0C10',
    previewHexes: ['#101216', '#FFFFFF', '#4F8CFF'],
  },
];

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickDistinctTemplates(
  history: CreativeHistoryEntry[],
  count = 3,
  campaignType: CampaignVisualType = 'other'
): LayoutTemplate[] {
  // For product launches, feature highlights, and announcements, prioritize our premier 3D Infographic Showcase
  if (campaignType === 'launch_event' || campaignType === 'product_feature') {
    const showcase = LAYOUT_TEMPLATES.find((t) => t.id === 'product-infographic-showcase');
    if (showcase) {
      const others = LAYOUT_TEMPLATES.filter(
        (t) => t.id !== 'product-infographic-showcase' && t.eligibleTypes.includes(campaignType)
      );
      return [showcase, ...others.slice(0, count - 1)];
    }
  }

  const recentThreeIds = new Set(history.slice(0, 3).map((h) => h.style));

  // Strictly filter to templates eligible for this campaignType
  const typeMatched = LAYOUT_TEMPLATES.filter((t) =>
    t.eligibleTypes.includes(campaignType)
  );
  const pool = typeMatched.length >= count ? typeMatched : LAYOUT_TEMPLATES;

  const fresh = shuffleArray(pool.filter((t) => !recentThreeIds.has(t.id)));
  if (fresh.length >= count) {
    return fresh.slice(0, count);
  }
  const remainder = shuffleArray(pool.filter((t) => recentThreeIds.has(t.id)));
  return [...fresh, ...remainder].slice(0, count);
}

export function pickPalettesAvoidingRecent(
  history: CreativeHistoryEntry[],
  count = 3
): CreativePalette[] {
  const recentTwoIds = new Set(history.slice(0, 2).map((h) => h.dominant_palette));
  const eligible = shuffleArray(CREATIVE_PALETTES.filter((p) => !recentTwoIds.has(p.id)));
  if (eligible.length >= count) {
    return eligible.slice(0, count);
  }
  const fallback = shuffleArray(CREATIVE_PALETTES.filter((p) => recentTwoIds.has(p.id)));
  return [...eligible, ...fallback].slice(0, count);
}

export function getTemplateById(id: string): LayoutTemplate {
  const legacyMap: Record<string, LayoutTemplateId> = {
    'split-layout': 'split-arch',
    'split-panel': 'split-arch',
    'photo-backdrop': 'full-bleed',
    'hero-mockup': 'mockup-showcase',
    'event-announcement': 'event-ticket',
    'feature-highlight': 'diagonal-split',
  };
  const normalized = legacyMap[id] || id;
  return LAYOUT_TEMPLATES.find((t) => t.id === normalized) || LAYOUT_TEMPLATES[0];
}

export function getPaletteById(id: string): CreativePalette {
  return CREATIVE_PALETTES.find((p) => p.id === id) || CREATIVE_PALETTES[0];
}
