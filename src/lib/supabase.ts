import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DbLead {
  id: number;
  name: string;
  role: string;
  company: string;
  initials: string;
  source: string;
  excerpt: string;
  intent: number;
  color: string;
  added_this_week: boolean;
  fetched_date: string;
  fetched_time: string;
  fetched_timestamp: number;
  created_at?: string;
}

export interface DbApproval {
  id: string;
  type: string;
  title: string;
  recipient: string;
  detail: string;
  badge: string;
  badge_type: 'lime' | 'amber' | 'neutral';
  status: 'Pending review' | 'Approved' | 'Rejected';
  created_at?: string;
}

export interface DbKnowledgeSource {
  id: string;
  name: string;
  kind: 'Website' | 'PDF';
  detail: string;
  chunks: number;
  status: 'Ready' | 'Syncing';
  created_at?: string;
}

export interface DbKnowledgeChunk {
  id?: number;
  source_id: string;
  source_name: string;
  text: string;
  token_count: number;
  created_at?: string;
}

export interface DbCampaign {
  id: string;
  brief: string;
  knowledge_base: string;
  status: string;
  created_at?: string;
  social_copy?: string;
  twitter_thread?: any;
  cold_email?: any;
  newsletter?: any;
  visual_direction?: any;
  dm_copy?: string;
  agent_logs?: any;
}

// ---------------------------------------------------------------------------
// Supabase Data Access Functions with Graceful Cache Fallback
// ---------------------------------------------------------------------------

export async function fetchSupabaseLeads(): Promise<DbLead[] | null> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('fetched_timestamp', { ascending: false });

    if (error || !data || data.length === 0) {
      return null;
    }
    return data as DbLead[];
  } catch (err) {
    console.warn('Supabase fetchLeads error:', err);
    return null;
  }
}

export async function insertSupabaseLead(lead: Omit<DbLead, 'created_at'>): Promise<DbLead | null> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .insert([lead])
      .select()
      .single();

    if (error) {
      console.warn('Supabase insertLead notice:', error.message);
      return null;
    }
    return data as DbLead;
  } catch (err) {
    console.warn('Supabase insertLead error:', err);
    return null;
  }
}

export async function fetchSupabaseApprovals(): Promise<DbApproval[] | null> {
  try {
    const { data, error } = await supabase
      .from('approvals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return null;
    }
    return data as DbApproval[];
  } catch (err) {
    console.warn('Supabase fetchApprovals error:', err);
    return null;
  }
}

export async function insertSupabaseApproval(approval: DbApproval): Promise<DbApproval | null> {
  try {
    const { data, error } = await supabase
      .from('approvals')
      .insert([approval])
      .select()
      .single();

    if (error) {
      console.warn('Supabase insertApproval notice:', error.message);
      return null;
    }
    return data as DbApproval;
  } catch (err) {
    console.warn('Supabase insertApproval error:', err);
    return null;
  }
}

export async function updateSupabaseApprovalStatus(id: string, status: 'Approved' | 'Rejected'): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('approvals')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.warn('Supabase updateApprovalStatus notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateApprovalStatus error:', err);
    return false;
  }
}

export async function insertSupabaseCampaign(campaign: DbCampaign): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('campaigns')
      .insert([campaign]);

    if (error) {
      console.warn('Supabase insertCampaign notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase insertCampaign error:', err);
    return false;
  }
}

export async function fetchSupabaseSources(): Promise<DbKnowledgeSource[] | null> {
  try {
    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return null;
    }
    return data as DbKnowledgeSource[];
  } catch (err) {
    console.warn('Supabase fetchSources error:', err);
    return null;
  }
}

export async function insertSupabaseSource(source: DbKnowledgeSource): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('knowledge_sources')
      .upsert([source]);

    if (error) {
      console.warn('Supabase insertSource notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase insertSource error:', err);
    return false;
  }
}

export async function fetchSupabaseChunks(): Promise<DbKnowledgeChunk[] | null> {
  try {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) {
      return null;
    }
    return data as DbKnowledgeChunk[];
  } catch (err) {
    console.warn('Supabase fetchChunks error:', err);
    return null;
  }
}

export async function insertSupabaseChunks(chunks: DbKnowledgeChunk[]): Promise<boolean> {
  if (chunks.length === 0) return true;
  try {
    const { error } = await supabase
      .from('knowledge_chunks')
      .insert(chunks);

    if (error) {
      console.warn('Supabase insertChunks notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase insertChunks error:', err);
    return false;
  }
}

export async function fetchSupabaseWorkflows(): Promise<any[] | null> {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase fetchWorkflows error:', err);
    return null;
  }
}

export async function insertSupabaseWorkflow(wf: any): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('workflows')
      .upsert([wf]);

    if (error) {
      console.warn('Supabase insertWorkflow notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase insertWorkflow error:', err);
    return false;
  }
}
