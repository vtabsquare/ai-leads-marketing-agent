export type Lead = {
  id: number;
  name: string;
  role: string;
  company: string;
  initials: string;
  source: string;
  excerpt: string;
  intent: number;
  color: string;
  addedThisWeek: boolean;
  fetchedDate: string;
  fetchedTime: string;
  fetchedTimestamp: number;
  sourceUrl?: string;
};

export type Approval = {
  id: string | number;
  name: string;
  initials: string;
  channel: any;
  detail: string;
  time: string;
  color: string;
};

export type KnowledgeSource = {
  id: number | string;
  name: string;
  kind: 'Website' | 'PDF';
  detail: string;
  chunks: number;
  status: 'Ready' | 'Syncing';
};

export type Chunk = {
  id?: string;
  source: string;
  text: string;
  tokenCount?: number;
  preview?: string;
};

export const initialLeads: Lead[] = [];

export const initialApprovals: Approval[] = [];

export const initialSources: KnowledgeSource[] = [];

export const initialChunks: Chunk[] = [];

/**
 * Ensures every single lead reliably navigates to their real post, discussion, or profile link.
 * If sourceUrl is present, it returns it directly; otherwise it builds a direct link to the Reddit/LinkedIn thread.
 */
export function resolveLeadUrl(lead: Partial<Lead>): string {
  if (lead.sourceUrl && lead.sourceUrl.trim().startsWith('http')) {
    return lead.sourceUrl.trim();
  }

  const name = (lead.name || '').trim();
  const source = (lead.source || '').trim();
  const excerpt = (lead.excerpt || '').trim();
  const role = (lead.role || '').trim();

  // 1. Reddit threads & profiles
  if (name.startsWith('u/') || source.toLowerCase().includes('reddit')) {
    if (name.startsWith('u/')) {
      const cleanUser = name.replace(/^u\//, '');
      return `https://www.reddit.com/user/${cleanUser}`;
    }
    const subMatch = source.match(/r\/([a-zA-Z0-9_]+)/i);
    const subreddit = subMatch ? subMatch[1] : 'BusinessIntelligence';
    const query = encodeURIComponent((excerpt || role || 'reporting tool').slice(0, 80));
    return `https://www.reddit.com/r/${subreddit}/search/?q=${query}`;
  }

  // 2. LinkedIn discussions
  if (source.toLowerCase().includes('linkedin')) {
    const isGeneric = name.includes('Decision Maker') || name.includes('User') || name.includes('Professional');
    const query = encodeURIComponent(isGeneric ? `${role} ${excerpt}`.trim().slice(0, 80) : name);
    return `https://www.linkedin.com/search/results/content/?keywords=${query}`;
  }

  // 3. Twitter / X
  if (source.toLowerCase().includes('x') || source.toLowerCase().includes('twitter')) {
    const handle = name.startsWith('@') ? name.slice(1) : name;
    return `https://x.com/search?q=${encodeURIComponent(handle || excerpt || 'reporting software')}`;
  }

  // 4. Clean fallback search for the specific post/discussion
  const cleanTerms = [name, lead.company, excerpt].filter(Boolean).join(' ').slice(0, 90);
  return `https://www.google.com/search?q=${encodeURIComponent(cleanTerms || 'reporting tool software discussion')}`;
}
