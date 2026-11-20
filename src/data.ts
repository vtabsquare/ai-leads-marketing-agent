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
