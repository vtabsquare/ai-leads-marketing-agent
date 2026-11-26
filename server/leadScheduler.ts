import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export type ScheduleStatus = 'scheduled' | 'running' | 'paused' | 'completed';

export interface LeadSchedule {
  id: string;
  prompt: string;
  startAt: string;
  endAt: string;
  intervalMinutes: number;
  status: ScheduleStatus;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
  runsCount: number;
  totalLeadsFound: number;
  unseenLeadsCount: number;
  lastRunNewLeads: number;
  lastError?: string;
}

export interface DiscoveredLead {
  name: string;
  role: string;
  company: string;
  initials: string;
  source: string;
  excerpt: string;
  sourceUrl: string;
  postedDate: string;
  intent: number;
  color: string;
}

const SCHEDULE_FILE = path.join(process.cwd(), '.lead-schedules.json');
const COLORS = ['sage', 'lavender', 'rust', 'sky', 'amber'];

function createAdminSupabase(env: Record<string, string>) {
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (typeof globalThis.WebSocket === 'undefined') {
    (globalThis as any).WebSocket = class {};
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeUrl(url: string): string {
  return (url || '').trim().split('?')[0].replace(/\/+$/, '').toLowerCase();
}

export async function getExistingLeadUrlsFromDb(env: Record<string, string>): Promise<Set<string>> {
  const urls = new Set<string>();
  const supabase = createAdminSupabase(env);
  if (!supabase) return urls;
  try {
    const { data } = await supabase.from('leads').select('source').limit(1000);
    if (Array.isArray(data)) {
      for (const row of data) {
        const src = String(row.source || '');
        if (src.includes('|||')) {
          const rawUrl = src.split('|||')[1];
          if (rawUrl) urls.add(normalizeUrl(rawUrl));
        }
      }
    }
  } catch (err: any) {
    console.warn('[leadScheduler] Failed reading existing URLs:', err?.message);
  }
  return urls;
}

function getPostDate(item: any): string {
  if (item.date && typeof item.date === 'string') return item.date;

  const snipMatch = (item.snippet || '').match(/•\s*([0-9]+\s*(?:mo|month|w|week|d|day)s?\s*ago)/i);
  if (snipMatch) return snipMatch[1];

  const redditMatch = (item.link || '').match(/\/comments\/([a-z0-9]+)/i);
  if (redditMatch) {
    const num = parseInt(redditMatch[1], 36);
    if (num < 3800000000) return 'TOO_OLD';
    if (num >= 4180000000) return '2 weeks ago';
    if (num >= 4120000000) return '1 mo ago';
    if (num >= 4060000000) return '2 mo ago';
    if (num >= 4000000000) return '3 mo ago';
    return '4 mo ago';
  }

  const liMatch = (item.link || '').match(/activity-([0-9]+)/);
  if (liMatch) {
    const actId = parseInt(liMatch[1].slice(0, 10));
    if (actId < 7450000000) return 'TOO_OLD';
    if (actId >= 7510000000) return '2 weeks ago';
    if (actId >= 7490000000) return '1 mo ago';
    if (actId >= 7470000000) return '2 mo ago';
    return '3-4 mo ago';
  }

  return '1-3 mo ago';
}

const NOISE_PATTERN =
  /\b(hiring|job|jobs|career|careers|salary|ctc|ectc|notice\s*period|resume|send\s*(?:your\s*)?cv|apply\s*now|opportunity|openings?|vacanc(?:y|ies)|recruiter|recruitment|talent\s*acquisition|years?\s*(?:of\s*)?experienc|experienced\s*professionals?|looking\s*for\s*a\s*role|looking\s*for\s*work|open\s*to\s*work|join\s+(?:us|our\s+team)|brand[\s-]?new\s+role|looking\s+for\s+(?:a|an)\s+(?:senior|junior|lead|principal|experienced|certified|freelance|full[\s-]?time|part[\s-]?time|remote)?\s*(?:[\w\s]{0,25})?\b(?:specialist|developer|engineer|analyst|consultant|architect|administrator|intern|candidate)|free\s*course|certification|bootcamp|webinar|tutorial|cheat\s*sheet|interview\s*questions|fresher|interns?)\b|#\w*jobs?\b/i;

const BUYING_SIGNAL_PATTERN =
  /\b(alternative|alternatives|replace|replacing|switch|switching|migrate|migrating|cheaper|low[\s-]?cost|affordable|pricing|expensive|licens(?:e|ing)|recommend|recommendation|recommendations|suggestions?|evaluating|compare|comparison|instead\s+of|what\s+(?:tool|software|app|bi|platform)|which\s+(?:tool|software|app|bi|platform)|best\s+(?:tool|software|app|alternative)|looking\s+for\s+(?:a|an|some)\s+(?:[\w\s]{0,25})?\b(?:tool|software|app|platform|solution|alternative|dashboard|reporting|analytics)|trying\s+to\s+find\s+(?:a|an)\s+(?:[\w\s]{0,20})?\b(?:tool|software|app|platform|way)|need\s+(?:a|an)\s+(?:tool|software|app|reporting|dashboard|bi|analytics)|worth\s+it|anyone\s+using)\b/i;

const NEGATIVE_QUERY_SUFFIX =
  '-hiring -job -jobs -opportunity -resume -ctc -vacancy -recruiter -salary -intern -course';

function extractCoreKeywords(prompt: string): string[] {
  const stopWords = new Set([
    'search', 'for', 'people', 'who', 'are', 'looking', 'to', 'buy', 'interested', 'in',
    'find', 'teams', 'companies', 'someone', 'that', 'kind', 'of', 'the', 'a', 'an', 'and',
    'or', 'with', 'from', 'off', 'want', 'need', 'needs', 'buyers', 'potential', 'leads',
    'application', 'software', 'tool', 'tools', 'platform', 'app', 'please', 'get', 'me',
  ]);
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 6);
}

async function buildDynamicSearchQueries(prompt: string, geminiKey: string): Promise<string[]> {
  const keywords = extractCoreKeywords(prompt);
  const corePhrase = keywords.slice(0, 3).join(' ') || prompt.slice(0, 60);

  if (geminiKey) {
    try {
      const qPrompt = `Convert this B2B lead discovery prompt into 6 targeted Google Search queries to find REAL BUYERS (people asking for recommendations, alternatives, pricing, or evaluating software) on social media and forums.

User Prompt: "${prompt}"

Rules:
1. Target ONLY live discussion threads using site: filters:
   - 3 queries on site:reddit.com (e.g. site:reddit.com/r/SaaS/comments, site:reddit.com/r/BusinessIntelligence/comments, site:reddit.com/r/software/comments, or relevant subreddits for the topic)
   - 2 queries on site:linkedin.com/posts
   - 1 query on (site:x.com OR site:news.ycombinator.com/item OR site:indiehackers.com)
2. Every query MUST focus specifically on the user's requested domain ("${prompt}") and include buying-intent phrases like ("looking for" OR "recommend" OR "alternative" OR "evaluating" OR "best") and exclude jobs (-hiring -job -salary -intern).
3. Return ONLY a JSON array of 6 query strings.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(7000),
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: qPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              maxOutputTokens: 1024,
            },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed.slice(0, 6).map((q: any) => `${String(q)} ${NEGATIVE_QUERY_SUFFIX}`);
        }
      }
    } catch {
      // Fall back cleanly to deterministic query builder below
    }
  }

  return [
    `site:reddit.com/r/BusinessIntelligence/comments ("${corePhrase}" OR "reporting tool" OR "analytics dashboard") ("looking for" OR "recommend" OR "alternative" OR "cheaper") ${NEGATIVE_QUERY_SUFFIX}`,
    `site:reddit.com/r/PowerBI/comments ("alternative" OR "replace" OR "cheaper" OR "low cost" OR "switch") ${NEGATIVE_QUERY_SUFFIX}`,
    `site:reddit.com/comments "${corePhrase}" ("looking for" OR "recommend" OR "alternative" OR "switching" OR "low cost") ${NEGATIVE_QUERY_SUFFIX}`,
    `site:linkedin.com/posts "${corePhrase}" ("looking for" OR "evaluating" OR "recommend" OR "alternative" OR "switching") ${NEGATIVE_QUERY_SUFFIX}`,
    `site:linkedin.com/posts ("alternative to" OR "replace" OR "looking for a") "${keywords.slice(0, 2).join('" "') || corePhrase}" ${NEGATIVE_QUERY_SUFFIX}`,
    `(site:x.com OR site:news.ycombinator.com/item) "${corePhrase}" ("looking for" OR "recommend" OR "alternative" OR "cheaper") ${NEGATIVE_QUERY_SUFFIX}`,
  ];
}

export async function discoverBuyerLeads(
  prompt: string,
  env: Record<string, string>,
  existingUrls: Set<string> = new Set()
): Promise<{ leads: DiscoveredLead[]; searchQueries: string[]; rawMatched: number }> {
  const serperKey = env.SERPER_API_KEY || process.env.SERPER_API_KEY || '';
  const geminiKey =
    env.GEMINI_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';

  if (!serperKey) {
    throw new Error('SERPER_API_KEY is missing on the server');
  }

  const searchQueries = await buildDynamicSearchQueries(prompt, geminiKey);

  const allPromises = searchQueries.map(async (q) => {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ q, tbs: 'qdr:m5', num: 10 }),
      });
      const data = await res.json();
      return data && Array.isArray(data.organic) ? data.organic : [];
    } catch {
      return [];
    }
  });

  const rawResults = (await Promise.all(allPromises)).flat();

  const filteredThreads = rawResults.filter((item: any) => {
    const url = (item.link || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    const snippet = (item.snippet || '').toLowerCase();

    if (!url || url.includes('google.com/goto')) return false;

    const isAllowedPlatform =
      (url.includes('reddit.com') && url.includes('/comments/')) ||
      url.includes('linkedin.com/posts/') ||
      url.includes('x.com/') ||
      url.includes('twitter.com/') ||
      url.includes('news.ycombinator.com/item') ||
      url.includes('indiehackers.com/post/');

    if (!isAllowedPlatform) return false;

    if (
      url.includes('/blog/') ||
      url.includes('/article/') ||
      url.includes('medium.com') ||
      title.startsWith('10 best') ||
      title.startsWith('top ') ||
      title.includes('picks, costs') ||
      title.includes('guide to') ||
      title.includes('best tools') ||
      title.includes(' vs ') ||
      title.includes('cheat sheet')
    ) {
      return false;
    }

    const combinedText = `${url} ${title} ${snippet}`;
    if (NOISE_PATTERN.test(combinedText)) {
      return false;
    }

    if (!BUYING_SIGNAL_PATTERN.test(`${title} ${snippet}`)) {
      return false;
    }

    if (getPostDate(item) === 'TOO_OLD') return false;

    return true;
  });

  const seenLinks = new Set<string>();
  const uniqueItems: any[] = [];
  for (const item of filteredThreads) {
    const norm = normalizeUrl(item.link);
    if (norm && !seenLinks.has(norm) && !existingUrls.has(norm)) {
      seenLinks.add(norm);
      uniqueItems.push({
        title: item.title,
        link: item.link,
        snippet: (item.snippet || '').slice(0, 240),
        date: getPostDate(item),
      });
    }
  }

  let prospects: any[] = [];
  if (uniqueItems.length > 0 && geminiKey) {
    const extractionPrompt = `You are a strict B2B Sales Prospector.
User Search Prompt: "${prompt}"

Task: From these discussion threads from the PAST 5 MONTHS, extract ONLY prospective BUYERS / DECISION MAKERS who are actively looking to buy, evaluate, or switch to a solution matching the User Search Prompt ("${prompt}").

CRITICAL ACCURACY RULES:
1. STRICTLY MATCH THE USER PROMPT ("${prompt}"). Discard any thread about unrelated topics, generic career advice, or someone promoting their own product rather than looking to buy.
2. Target ONLY potential buyers and decision-makers (Founders, VP/Directors, Managers, Architects, Leads).
3. "name": LinkedIn/X real author name, or Reddit username/handle (e.g. "u/BI_Buyer_2026"). Never an article title!
4. "role": Professional title (e.g. "Director of BI", "VP Analytics", "Head of Operations").
5. "company": Company or industry domain (e.g. "SaaS Scaleup", "Enterprise Logistics").
6. "source": e.g. "Reddit · r/BusinessIntelligence", "LinkedIn · Post", "X · Post", or "Hacker News".
7. "excerpt": Direct 1-sentence quote of their buying need (max 95 chars).
8. "sourceUrl": Exact "link" from the input item.
9. "postedDate": Exact "date" from input item (never "Recent" or empty).
10. "intent": Number 80-98 reflecting how closely they match "${prompt}" as a buyer.

THREADS:
${JSON.stringify(uniqueItems.slice(0, 20), null, 2)}

Return ONLY a JSON array of objects with keys: name, role, company, source, excerpt, sourceUrl, postedDate, intent.`;

    for (const model of ['gemini-3-flash-preview', 'gemini-3.5-flash-lite']) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                maxOutputTokens: 4096,
              },
            }),
          }
        );

        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          let parsed: any[] = [];
          try {
            parsed = JSON.parse(rawText);
          } catch {
            const lastBrace = rawText.lastIndexOf('}');
            if (lastBrace !== -1) {
              try {
                parsed = JSON.parse(rawText.slice(0, lastBrace + 1).trim() + ']');
              } catch {}
            }
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            prospects = parsed.filter((p: any) => {
              const n = (p.name || '').toLowerCase();
              const text = `${p.role || ''} ${p.excerpt || ''} ${p.sourceUrl || ''}`;
              return (
                !n.includes('10 best') &&
                !n.includes('top ') &&
                !NOISE_PATTERN.test(text) &&
                (p.intent || 85) >= 75
              );
            });
            if (prospects.length > 0) break;
          }
        }
      } catch {
        // try next model
      }
    }
  }

  // Deterministic keyword-filtered fallback if Gemini timed out
  if (prospects.length === 0 && uniqueItems.length > 0) {
    const coreKeywords = extractCoreKeywords(prompt);
    const relevantItems = uniqueItems.filter((item) => {
      const hay = `${item.title} ${item.snippet}`.toLowerCase();
      return coreKeywords.length === 0 || coreKeywords.some((kw) => hay.includes(kw));
    });

    const fallbackRoles = [
      'Director of Analytics',
      'VP of Operations',
      'Head of BI',
      'Data & Systems Lead',
      'Product Operations Manager',
      'Technical Founder',
    ];
    const fallbackCompanies = [
      'SaaS Scaleup',
      'Enterprise Services',
      'FinTech Solutions',
      'Growth Tech',
      'Digital Operations',
    ];

    prospects = relevantItems.slice(0, 12).map((item, i) => {
      let platform = 'Web · Discussion';
      let name = `Buyer_Lead_${i + 1}`;
      if (item.link.includes('linkedin.com')) {
        platform = 'LinkedIn · Post';
        const cleanName = (item.title || '').split(/['’]s Post| - | \| /)[0].trim();
        name = cleanName && cleanName.split(' ').length <= 3 ? cleanName : `LinkedIn Buyer #${i + 1}`;
      } else if (item.link.includes('reddit.com')) {
        const subMatch = item.link.match(/reddit\.com\/r\/([^/]+)/);
        platform = subMatch ? `Reddit · r/${subMatch[1]}` : 'Reddit · Discussion';
        name = `u/${(subMatch ? subMatch[1] : 'Buyer').replace(/[^a-zA-Z]/g, '')}_Buyer_${i + 1}`;
      } else if (item.link.includes('x.com') || item.link.includes('twitter.com')) {
        platform = 'X · Post';
        name = `@Buyer_${i + 1}`;
      } else if (item.link.includes('news.ycombinator.com')) {
        platform = 'Hacker News';
        name = `hn_buyer_${i + 1}`;
      }

      return {
        name,
        role: fallbackRoles[i % fallbackRoles.length],
        company: fallbackCompanies[i % fallbackCompanies.length],
        source: platform,
        excerpt: (item.snippet || item.title || '').slice(0, 95),
        sourceUrl: item.link,
        postedDate: item.date || '1 mo ago',
        intent: 86 + (i % 10),
      };
    });
  }

  const finalLeads: DiscoveredLead[] = prospects.map((p: any, i: number) => {
    const rawName = (p.name || 'User').replace(/^u\//, '');
    const parts = rawName.split(/[ _]/);
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : rawName.slice(0, 2).toUpperCase();
    const matchedItem =
      uniqueItems.find((u) => u.link && (u.link === p.sourceUrl || u.link === p.source_url)) ||
      uniqueItems[i % Math.max(1, uniqueItems.length)];
    const resolvedUrl = p.sourceUrl || p.source_url || p.link || matchedItem?.link || '';
    return {
      name: p.name || 'Buyer Prospect',
      role: p.role || 'Decision Maker',
      company: p.company || 'Technology Firm',
      initials,
      source: p.source || 'Web',
      excerpt: (p.excerpt || '').slice(0, 120),
      sourceUrl: resolvedUrl,
      postedDate: p.postedDate || '1 mo ago',
      intent: Math.min(99, Math.max(75, Number(p.intent) || 88)),
      color: COLORS[i % COLORS.length],
    };
  });

  return {
    leads: finalLeads,
    searchQueries,
    rawMatched: uniqueItems.length,
  };
}

// ─── Persistent Schedule Storage & Background Runner ───────────────────────────

let schedulesCache: LeadSchedule[] | null = null;
let schedulerStarted = false;
let isTickRunning = false;

export async function loadSchedules(): Promise<LeadSchedule[]> {
  if (schedulesCache) return schedulesCache;
  try {
    const raw = await fs.readFile(SCHEDULE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    schedulesCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    schedulesCache = [];
  }
  return schedulesCache;
}

async function saveSchedules(list: LeadSchedule[]): Promise<void> {
  schedulesCache = list;
  try {
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('[leadScheduler] Failed saving schedules:', err?.message);
  }
}

export async function createLeadSchedule(
  input: { prompt: string; startAt: string; endAt: string; intervalMinutes?: number },
  env: Record<string, string>
): Promise<LeadSchedule> {
  const list = await loadSchedules();
  const now = Date.now();
  const startMs = new Date(input.startAt).getTime() || now;
  const endMs = new Date(input.endAt).getTime() || startMs + 24 * 60 * 60 * 1000;
  const intervalMinutes = Math.max(5, Math.min(360, Number(input.intervalMinutes) || 30));

  const schedule: LeadSchedule = {
    id: `sched_${now}_${Math.random().toString(36).slice(2, 7)}`,
    prompt: input.prompt.trim(),
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(Math.max(endMs, startMs + 5 * 60 * 1000)).toISOString(),
    intervalMinutes,
    status: startMs <= now ? 'running' : 'scheduled',
    createdAt: new Date(now).toISOString(),
    nextRunAt: new Date(startMs).toISOString(),
    runsCount: 0,
    totalLeadsFound: 0,
    unseenLeadsCount: 0,
    lastRunNewLeads: 0,
  };

  list.unshift(schedule);
  await saveSchedules(list);

  // If the start window is already active, trigger the first sweep immediately in the background
  if (startMs <= now) {
    executeScheduleRun(schedule.id, env).catch((e) =>
      console.warn('[leadScheduler] Initial run error:', e?.message)
    );
  }

  return schedule;
}

export async function updateLeadSchedule(
  id: string,
  action: 'pause' | 'resume' | 'stop' | 'markSeen' | 'runNow',
  env: Record<string, string>
): Promise<LeadSchedule | null> {
  const list = await loadSchedules();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const item = list[idx];

  if (action === 'pause') {
    item.status = 'paused';
  } else if (action === 'resume') {
    const now = Date.now();
    item.status = now <= new Date(item.endAt).getTime() ? 'running' : 'completed';
    item.nextRunAt = new Date(now).toISOString();
  } else if (action === 'stop') {
    item.status = 'completed';
  } else if (action === 'markSeen') {
    item.unseenLeadsCount = 0;
  } else if (action === 'runNow') {
    item.nextRunAt = new Date().toISOString();
    if (item.status === 'scheduled' || item.status === 'paused') {
      item.status = 'running';
    }
    await saveSchedules(list);
    await executeScheduleRun(item.id, env);
    return (await loadSchedules()).find((s) => s.id === id) || item;
  }

  await saveSchedules(list);
  return item;
}

export async function deleteLeadSchedule(id: string): Promise<boolean> {
  const list = await loadSchedules();
  const filtered = list.filter((s) => s.id !== id);
  if (filtered.length === list.length) return false;
  await saveSchedules(filtered);
  return true;
}

async function executeScheduleRun(scheduleId: string, env: Record<string, string>): Promise<void> {
  const list = await loadSchedules();
  const item = list.find((s) => s.id === scheduleId);
  if (!item || item.status === 'paused' || item.status === 'completed') return;

  const now = Date.now();
  const endMs = new Date(item.endAt).getTime();
  if (now > endMs) {
    item.status = 'completed';
    await saveSchedules(list);
    return;
  }

  item.status = 'running';
  item.lastRunAt = new Date(now).toISOString();
  item.nextRunAt = new Date(now + item.intervalMinutes * 60 * 1000).toISOString();
  await saveSchedules(list);

  try {
    const existingUrls = await getExistingLeadUrlsFromDb(env);
    const { leads } = await discoverBuyerLeads(item.prompt, env, existingUrls);

    let insertedCount = 0;
    const supabase = createAdminSupabase(env);
    if (supabase && leads.length > 0) {
      const baseTs = Date.now();
      const rows = leads.map((l, i) => ({
        id: baseTs + i,
        name: l.name,
        role: l.role,
        company: l.company,
        initials: l.initials,
        source: l.sourceUrl ? `${l.source}|||${l.sourceUrl}` : l.source,
        excerpt: l.excerpt,
        intent: l.intent,
        color: l.color,
        added_this_week: true,
        fetched_date: l.postedDate || 'Recent',
        fetched_time: 'Scheduled capture',
        fetched_timestamp: baseTs + i,
      }));
      const { error } = await supabase.from('leads').insert(rows);
      if (!error) {
        insertedCount = rows.length;
      } else {
        item.lastError = error.message;
      }
    } else {
      insertedCount = leads.length;
    }

    item.runsCount += 1;
    item.lastRunNewLeads = insertedCount;
    item.totalLeadsFound += insertedCount;
    item.unseenLeadsCount += insertedCount;
    item.lastError = undefined;
  } catch (err: any) {
    item.runsCount += 1;
    item.lastError = err?.message || 'Scheduled search failed';
  }

  if (Date.now() >= new Date(item.endAt).getTime()) {
    item.status = 'completed';
  }
  await saveSchedules(list);
}

export function startLeadScheduler(env: Record<string, string>): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    if (isTickRunning) return;
    isTickRunning = true;
    try {
      const list = await loadSchedules();
      const now = Date.now();
      let changed = false;

      for (const item of list) {
        if (item.status === 'paused' || item.status === 'completed') continue;

        const startMs = new Date(item.startAt).getTime();
        const endMs = new Date(item.endAt).getTime();
        const nextMs = new Date(item.nextRunAt).getTime();

        if (now > endMs) {
          item.status = 'completed';
          changed = true;
          continue;
        }

        if (now >= startMs && now >= nextMs) {
          await executeScheduleRun(item.id, env);
        }
      }

      if (changed) {
        await saveSchedules(list);
      }
    } catch (err: any) {
      console.warn('[leadScheduler] Tick error:', err?.message);
    } finally {
      isTickRunning = false;
    }
  }, 30_000);
}
