import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Facebook,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Instagram,
  Inbox,
  LayoutDashboard,
  Link2,
  Linkedin,
  LoaderCircle,
  Mail,
  Megaphone,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  initialApprovals,
  initialChunks,
  initialLeads,
  initialSources,
  type Approval,
  type Chunk,
  type KnowledgeSource,
  type Lead,
  resolveLeadUrl,
} from './data';
import {
  initialWorkflows,
  defaultCampaignNodes,
  defaultCampaignEdges,
  type CampaignWorkflow,
} from './workflowsData';
import { WorkflowsPage } from './WorkflowsPage';
import { LeadDetailDrawer } from './components/LeadDetailDrawer';
import { OutreachComposeModal } from './components/OutreachComposeModal';
import { ChunkDetailDrawer } from './components/ChunkDetailDrawer';
import { CommunityInbox, type PublishedPost, SAMPLE_PUBLISHED_POSTS } from './components/CommunityInbox';
import {
  extractCampaignFacts,
  generateArtDirectorConcepts,
  generateCampaignWithGemini,
  generateLeadWithGemini,
  type CampaignDeliverables,
  type CampaignFacts,
  type CreativeConceptOption,
} from './lib/gemini';
import type { CreativeHistoryEntry } from './lib/creativeStyles';
import {
  fetchSupabaseLeads,
  insertSupabaseLead,
  fetchSupabaseApprovals,
  insertSupabaseApproval,
  updateSupabaseApprovalStatus,
  fetchSupabaseSources,
  insertSupabaseSource,
  fetchSupabaseChunks,
  insertSupabaseChunks,
  fetchSupabaseWorkflows,
  insertSupabaseWorkflow,
  type DbApproval,
} from './lib/supabase';
import {
  extractTextFromFile,
  extractTextFromUrl,
  chunkTextContent,
} from './lib/documentProcessor';
import {
  getStoredSocialTokens,
  saveSocialTokens,
  publishToFacebook,
  publishToInstagram,
  publishToReddit,
  publishToX,
  fetchMetaStatus,
  type SocialTokens,
  type MetaAccountStatus,
} from './lib/socialPublisher';

type PageId = 'overview' | 'leadbot' | 'sources' | 'marketing' | 'workflows' | 'settings';
type ToastMessage = { title: string; detail?: string };

const navigation: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leadbot', label: 'Lead Bot', icon: Target },
  { id: 'sources', label: 'Sources', icon: BookOpen },
  { id: 'marketing', label: 'Marketing Bot', icon: Megaphone },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
];

function SignalMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`signal-mark${small ? ' signal-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M8 27.5 16.5 19M13.5 31 29 15.5M8 18.5l5.5-5.5M24 31l8-8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="30.5" cy="9.5" r="2.5" fill="currentColor" />
      </svg>
    </span>
  );
}

const loadLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveLocal = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or blocked
  }
};

function App() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [approvals, setApprovals] = useState<Approval[]>(initialApprovals);
  const [leads, setLeads] = useState<Lead[]>(() => loadLocal('vtab_leads', initialLeads));
  const [sources, setSources] = useState<KnowledgeSource[]>(() => loadLocal('vtab_sources', initialSources));
  const [chunks, setChunks] = useState<Chunk[]>(() => loadLocal('vtab_chunks', initialChunks));
  const [workflows, setWorkflows] = useState<CampaignWorkflow[]>(() => loadLocal('vtab_workflows', initialWorkflows));
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>(() => loadLocal('vtab_published_posts', SAMPLE_PUBLISHED_POSTS));
  const [marketingTab, setMarketingTab] = useState<'campaigns' | 'community-inbox'>('campaigns');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [sourceModal, setSourceModal] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    saveLocal('vtab_sources', sources);
  }, [sources]);

  useEffect(() => {
    saveLocal('vtab_chunks', chunks);
  }, [chunks]);

  useEffect(() => {
    saveLocal('vtab_leads', leads);
  }, [leads]);

  useEffect(() => {
    saveLocal('vtab_workflows', workflows);
  }, [workflows]);

  useEffect(() => {
    saveLocal('vtab_published_posts', publishedPosts);
  }, [publishedPosts]);

  useEffect(() => {
    // 1. Load live leads from Supabase if table exists
    fetchSupabaseLeads().then((dbLeads) => {
      if (dbLeads && dbLeads.length > 0) {
        const mapped: Lead[] = dbLeads.map((dl) => {
          let sourceText = dl.source || 'Web';
          let parsedUrl = '';
          if (sourceText.includes('|||')) {
            const parts = sourceText.split('|||');
            sourceText = parts[0];
            parsedUrl = parts[1];
          }
          const rawUrl = parsedUrl || dl.source_url || (dl as any).sourceUrl || '';
          const resolvedUrl = rawUrl || resolveLeadUrl({
            name: dl.name,
            source: sourceText,
            sourceUrl: rawUrl,
            excerpt: dl.excerpt,
            company: dl.company,
            role: dl.role,
          });
          return {
            id: dl.id,
            name: dl.name,
            role: dl.role,
            company: dl.company,
            initials: dl.initials,
            source: sourceText,
            excerpt: dl.excerpt,
            intent: dl.intent,
            color: (dl.color as any) || 'sage',
            addedThisWeek: dl.added_this_week,
            fetchedDate: dl.fetched_date,
            fetchedTime: dl.fetched_time,
            fetchedTimestamp: Number(dl.fetched_timestamp),
            sourceUrl: resolvedUrl,
          };
        });
        setLeads(mapped);
      }
    });

    // 2. Load live approvals from Supabase
    fetchSupabaseApprovals().then((dbApprovals) => {
      if (dbApprovals && dbApprovals.length > 0) {
        const mapped: Approval[] = dbApprovals
          .filter((a) => a.status === 'Pending review')
          .map((a) => ({
            id: a.id,
            name: a.recipient,
            initials: a.recipient.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'VT',
            color: 'lime',
            channel: (a.type.includes('LinkedIn') ? 'LinkedIn' : a.type.includes('Email') ? 'Email' : 'Direct Note') as any,
            detail: a.detail,
            time: 'Just now',
          }));
        if (mapped.length > 0) {
          setApprovals(mapped);
        }
      }
    });

    // 3. Load live sources from Supabase
    fetchSupabaseSources().then((dbSources) => {
      if (dbSources && dbSources.length > 0) {
        setSources(
          dbSources.map((s) => ({
            id: s.id as any,
            name: s.name,
            kind: s.kind,
            detail: s.detail,
            chunks: s.chunks,
            status: s.status,
          }))
        );
      }
    });

    // 4. Load live chunks from Supabase
    fetchSupabaseChunks().then((dbChunks) => {
      if (dbChunks && dbChunks.length > 0) {
        setChunks(
          dbChunks.map((c) => ({
            source: c.source_name,
            text: c.text,
          }))
        );
      }
    });

    // 5. Load live workflows from Supabase
    fetchSupabaseWorkflows().then((dbWorkflows) => {
      if (dbWorkflows && dbWorkflows.length > 0) {
        setWorkflows(
          dbWorkflows.map((w) => ({
            id: w.id,
            title: w.title,
            brief: w.brief,
            knowledgeBase: w.knowledge_base,
            status: w.status,
            createdAt: w.created_at,
            duration: w.duration,
            itemsProduced: w.items_produced,
            triggerType: w.trigger_type,
            tags: w.tags || [],
            nodes: w.nodes || [],
            edges: w.edges || [],
            outputs: w.outputs || {},
          }))
        );
      }
    });
  }, []);

  const addApprovalItem = (approval: {
    type: string;
    title: string;
    recipient: string;
    detail: string;
    badge?: string;
  }) => {
    const newApproval: Approval = {
      id: `appr-${Date.now()}`,
      name: approval.recipient,
      initials: approval.recipient.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'VT',
      color: 'lime',
      channel: (approval.type.includes('LinkedIn') ? 'LinkedIn' : approval.type.includes('Email') ? 'Email' : 'Direct Note') as any,
      detail: approval.detail,
      time: 'Just now',
    };
    setApprovals((prev) => [newApproval, ...prev]);

    // Persist to Supabase
    insertSupabaseApproval({
      id: String(newApproval.id),
      type: approval.type,
      title: approval.title,
      recipient: approval.recipient,
      detail: approval.detail,
      badge: approval.badge || 'Needs approval',
      badge_type: 'lime',
      status: 'Pending review',
    });
  };

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setSourceModal(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navigate = (page: PageId) => {
    setActivePage(page);
    setCommandOpen(false);
    setMobileNavOpen(false);
  };

  const approve = (item: Approval) => {
    setApprovals((current) => current.filter((approval) => approval.id !== item.id));
    updateSupabaseApprovalStatus(String(item.id), 'Approved');
    setToast({ title: 'Outreach approved', detail: `${item.channel} draft for ${item.name} is approved and logged.` });
  };

  const dismiss = (item: Approval) => {
    setApprovals((current) => current.filter((approval) => approval.id !== item.id));
    updateSupabaseApprovalStatus(String(item.id), 'Rejected');
    setToast({ title: 'Draft dismissed', detail: `The ${item.channel.toLowerCase()} draft for ${item.name} was removed.` });
  };

  const handleWebsiteSource = async (url: string) => {
    let hostname = url;
    try {
      hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* keep the typed URL */
    }
    const sourceId = `src-${Date.now()}`;
    const tempSource: KnowledgeSource = {
      id: sourceId as any,
      name: hostname,
      kind: 'Website',
      detail: 'Scanning and extracting passages…',
      chunks: 0,
      status: 'Syncing',
    };
    setSources((current) => [tempSource, ...current]);
    setSourceModal(false);
    setToast({
      title: 'Website scan started',
      detail: `Fetching content from ${hostname}…`,
    });

    try {
      const extracted = await extractTextFromUrl(url);
      const generatedChunks = chunkTextContent(extracted.text, sourceId, hostname, 140);

      const readySource: KnowledgeSource = {
        id: sourceId as any,
        name: hostname,
        kind: 'Website',
        detail: `${generatedChunks.length} passages · ${extracted.tokenCount} tokens`,
        chunks: generatedChunks.length,
        status: 'Ready',
      };

      setSources((current) =>
        current.map((item) => (item.id === (sourceId as any) ? readySource : item))
      );
      setChunks((current) => [
        ...generatedChunks.map((c) => ({ source: hostname, text: c.text })),
        ...current,
      ]);

      // Save to Supabase
      insertSupabaseSource({
        id: sourceId,
        name: hostname,
        kind: 'Website',
        detail: readySource.detail,
        chunks: readySource.chunks,
        status: 'Ready',
      });

      insertSupabaseChunks(
        generatedChunks.map((c) => ({
          source_id: sourceId,
          source_name: hostname,
          text: c.text,
          token_count: c.tokenCount,
        }))
      );

      setToast({
        title: 'Website indexed',
        detail: `Added ${generatedChunks.length} searchable passages from ${hostname}.`,
      });
    } catch (err) {
      console.warn('Website parsing error:', err);
      setToast({
        title: 'Website scan finished',
        detail: `Source registered.`,
      });
    }
  };

  const handlePdfSource = async (file: File) => {
    const sourceId = `pdf-${Date.now()}`;
    const tempSource: KnowledgeSource = {
      id: sourceId as any,
      name: file.name,
      kind: 'PDF',
      detail: 'Reading document & extracting text…',
      chunks: 0,
      status: 'Syncing',
    };
    setSources((current) => [tempSource, ...current]);
    setSourceModal(false);
    setToast({
      title: 'PDF processing started',
      detail: `Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`,
    });

    try {
      const extracted = await extractTextFromFile(file);
      const generatedChunks = chunkTextContent(extracted.text, sourceId, file.name, 140);

      const readySource: KnowledgeSource = {
        id: sourceId as any,
        name: file.name,
        kind: 'PDF',
        detail: `${generatedChunks.length} chunks · ${extracted.tokenCount} tokens`,
        chunks: generatedChunks.length,
        status: 'Ready',
      };

      setSources((current) =>
        current.map((item) => (item.id === (sourceId as any) ? readySource : item))
      );
      setChunks((current) => [
        ...generatedChunks.map((c) => ({ source: file.name, text: c.text })),
        ...current,
      ]);

      // Save to Supabase
      insertSupabaseSource({
        id: sourceId,
        name: file.name,
        kind: 'PDF',
        detail: readySource.detail,
        chunks: readySource.chunks,
        status: 'Ready',
      });

      insertSupabaseChunks(
        generatedChunks.map((c) => ({
          source_id: sourceId,
          source_name: file.name,
          text: c.text,
          token_count: c.tokenCount,
        }))
      );

      setToast({
        title: 'PDF indexed',
        detail: `Extracted ${generatedChunks.length} semantic chunks from ${file.name}.`,
      });
    } catch (err) {
      console.warn('PDF parsing error:', err);
      setToast({
        title: 'Document added',
        detail: 'PDF registered in knowledge base.',
      });
    }
  };

  const title = navigation.find((item) => item.id === activePage)?.label ?? 'Overview';

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileNavOpen ? ' sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <SignalMark />
          <div className="brand-wordmark">Vtab<span>.</span></div>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-monogram" style={{ background: '#c9f36a', color: '#142019', fontWeight: 800 }}>V</div>
          <div className="workspace-copy"><span className="overline">DEMO WORKSPACE</span><strong>VTAB Pilot Workspace</strong></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                <button className={`nav-item${activePage === item.id ? ' active' : ''}`} onClick={() => navigate(item.id)}>
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.id === 'overview' && approvals.length > 0 && <span className="nav-count">{approvals.length}</span>}
                  {item.id === 'leadbot' && <span className="live-mini" />}
                </button>
                {item.id === 'marketing' && activePage === 'marketing' && (
                  <div style={{ paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginBottom: 4 }}>
                    <button
                      onClick={() => setMarketingTab('campaigns')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: marketingTab === 'campaigns' ? 'rgba(201,243,106,0.12)' : 'transparent', border: 'none', color: marketingTab === 'campaigns' ? '#c9f36a' : 'rgba(255,255,255,0.45)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: marketingTab === 'campaigns' ? 700 : 500, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    >
                      <Megaphone size={13} /> Campaigns
                    </button>
                    <button
                      onClick={() => setMarketingTab('community-inbox')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: marketingTab === 'community-inbox' ? 'rgba(201,243,106,0.12)' : 'transparent', border: 'none', color: marketingTab === 'community-inbox' ? '#c9f36a' : 'rgba(255,255,255,0.45)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: marketingTab === 'community-inbox' ? 700 : 500, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    >
                      <Inbox size={13} /> Community Inbox
                      {publishedPosts.length > 0 && (
                        <span style={{ marginLeft: 'auto', background: '#c9f36a', color: '#142019', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>
                          {publishedPosts.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-bot-card">
            <div className="bot-orb"><Sparkles size={16} /></div>
            <div className="sidebar-bot-copy">
              <strong>Vtab is learning</strong>
              <span>
                {sources.filter((s) => s.status === 'Ready').length} sources · {sources.reduce((sum, s) => sum + s.chunks, 0)} chunks
              </span>
            </div>
            <span className="status-dot" />
          </div>
          <button className={`nav-item${activePage === 'settings' ? ' active' : ''}`} onClick={() => navigate('settings')}>
            <Settings2 size={17} strokeWidth={1.8} /><span>Settings</span>
          </button>
          <div className="profile-row">
            <div className="profile-avatar" style={{ background: '#c9f36a', color: '#142019', fontWeight: 700 }}>VP</div>
            <div className="profile-copy">
              <strong>vtabpilotuser</strong>
              <span>Pilot demo account</span>
            </div>
            <MoreHorizontal size={18} className="profile-more" />
          </div>
          <div className="sidebar-footnote"><span className="green-pulse" /> Live interactive demo</div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen((current) => !current)}><Menu size={19} /></button>
            <span className="breadcrumb-muted">VTAB Pilot Workspace</span><ChevronRight size={14} className="breadcrumb-chevron" /><span className="breadcrumb-current">{title}</span>
          </div>
          <div className="topbar-actions">
            <div className="command-wrap">
              <button className="global-search" onClick={() => setCommandOpen((current) => !current)} aria-expanded={commandOpen}>
                <Search size={15} /><span>Search anything</span><kbd><Command size={10} /> K</kbd>
              </button>
              {commandOpen && <div className="command-menu"><div className="command-menu-title">JUMP TO</div>{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => navigate(item.id)}><Icon size={15} /><span>{item.label}</span><ArrowRight size={14} className="command-arrow" /></button>; })}<div className="command-hint">Press <kbd>esc</kbd> to close</div></div>}
            </div>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast({ title: 'You’re all caught up', detail: 'We’ll flag high-intent activity as it arrives.' })}>
              <BellIcon />
              <span className="notification-dot" />
            </button>
            <div className="topbar-avatar">DM</div>
          </div>
        </header>

        <main className="page-content" key={activePage}>
          {activePage === 'overview' && <OverviewPage approvals={approvals} leads={leads} sources={sources} onApprove={approve} onDismiss={dismiss} onNavigate={navigate} />}
          {activePage === 'leadbot' && <LeadBotPage leads={leads} setLeads={setLeads} onToast={setToast} onAddApproval={addApprovalItem} />}
          {activePage === 'sources' && <SourcesPage sources={sources} chunks={chunks} onAdd={() => setSourceModal(true)} onSettings={() => navigate('settings')} />}
          {activePage === 'marketing' && (
            marketingTab === 'community-inbox' ? (
              <div className="page-section" style={{ padding: '32px 40px' }}>
                <CommunityInbox publishedPosts={publishedPosts} />
              </div>
            ) : (
            <MarketingPage
              sources={sources}
              chunks={chunks}
              leads={leads}
              onToast={setToast}
              onNavigate={navigate}
              onSaveWorkflow={(wf) => {
                setWorkflows((prev) => [wf, ...prev.filter((i) => i.id !== wf.id)]);
                insertSupabaseWorkflow({
                  id: wf.id,
                  title: wf.title,
                  brief: wf.brief,
                  knowledge_base: wf.knowledgeBase,
                  status: wf.status,
                  created_at: wf.createdAt,
                  duration: wf.duration,
                  items_produced: wf.itemsProduced,
                  trigger_type: wf.triggerType,
                  tags: wf.tags,
                  nodes: wf.nodes,
                  edges: wf.edges,
                  outputs: wf.outputs,
                });
              }}
              onAddApproval={addApprovalItem}
              onPostPublished={(post) => {
                setPublishedPosts((prev) => {
                  const existing = prev.findIndex((p) => p.campaignId === post.campaignId);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = {
                      ...updated[existing],
                      platforms: { ...updated[existing].platforms, ...post.platforms },
                    };
                    return updated;
                  }
                  return [post, ...prev];
                });
              }}
            />
            )
          )}
          {activePage === 'workflows' && <WorkflowsPage workflows={workflows} onNavigate={navigate} onToast={setToast} onCreateCampaign={() => navigate('marketing')} />}
          {activePage === 'settings' && <SettingsPage onToast={setToast} />}
        </main>
      </div>

      {sourceModal && <AddSourceModal onClose={() => setSourceModal(false)} onWebsite={handleWebsiteSource} onPdf={handlePdfSource} />}
      {toast && <div className="toast" role="status"><div className="toast-check"><Check size={15} /></div><div><strong>{toast.title}</strong>{toast.detail && <span>{toast.detail}</span>}</div><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  );
}

function BellIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-heading-actions">{children}</div>}</div>;
}

function PrimaryButton({ children, onClick, icon: Icon, type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; icon?: LucideIcon; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} className="primary-button" onClick={onClick} disabled={disabled}>{Icon && <Icon size={15} strokeWidth={2} />}{children}</button>;
}

function OverviewPage({
  approvals,
  leads,
  sources,
  onApprove,
  onDismiss,
  onNavigate,
}: {
  approvals: Approval[];
  leads: Lead[];
  sources: KnowledgeSource[];
  onApprove: (item: Approval) => void;
  onDismiss: (item: Approval) => void;
  onNavigate: (page: PageId) => void;
}) {
  const avgIntent = leads.length > 0 ? Math.round(leads.reduce((sum, l) => sum + l.intent, 0) / leads.length) : 0;
  const totalChunks = sources.reduce((sum, s) => sum + s.chunks, 0);
  const readySources = sources.filter((s) => s.status === 'Ready').length;

  return (
    <>
      <PageHeader eyebrow="LIVE WORKSPACE OVERVIEW" title="Revenue, in motion." description="A clear view of the conversations turning into customers.">
        <button className="secondary-button" onClick={() => onNavigate('leadbot')}><Target size={15} />Find prospects</button>
        <PrimaryButton icon={Plus} onClick={() => onNavigate('marketing')}>Create campaign</PrimaryButton>
      </PageHeader>

      <section className="metric-grid" aria-label="Pipeline metrics">
        <MetricCard label="Qualified pipeline" value={leads.length > 0 ? `$${(leads.length * 24.5).toFixed(1)}k` : '$0'} delta={leads.length > 0 ? `${leads.length} leads` : '0 leads'} caption="pipeline value" icon={TrendingUp} variant="primary" trend={[22, 31, 26, 39, 34, 47, 43, 58, 53, 71]} />
        <MetricCard label="New prospects" value={String(leads.length)} delta={leads.length > 0 ? 'Live synced' : 'None yet'} caption="in workspace" icon={Users} trend={[20, 26, 22, 33, 28, 40, 36, 49, 46, 61]} />
        <MetricCard label="Average intent" value={leads.length > 0 ? `${avgIntent}<span class='unit'>/100</span>` : '—'} delta={leads.length > 0 ? 'Verified score' : 'Awaiting data'} caption="across active leads" icon={Target} trend={[27, 31, 27, 39, 36, 44, 40, 54, 52, 65]} />
        <MetricCard label="Pending approvals" value={String(approvals.length)} delta={approvals.length > 0 ? 'Action required' : 'Clear'} caption="outreach drafts" icon={MessageCircle} trend={[18, 24, 21, 32, 28, 38, 36, 46, 43, 59]} />
      </section>

      <section className="insights-grid">
        <GrowthChart />
        <AgentMonitor onNavigate={() => onNavigate('marketing')} />
      </section>

      <section className="lower-grid">
        <ApprovalQueue approvals={approvals} onApprove={onApprove} onDismiss={onDismiss} onSeeAll={() => onNavigate('leadbot')} />
        <div className="signal-card source-health-card">
          <div className="card-heading"><div><div className="eyebrow">KNOWLEDGE BASE</div><h2>Grounded in your work.</h2></div><button className="plain-icon-button" onClick={() => onNavigate('sources')} aria-label="Open sources"><ArrowRight size={16} /></button></div>
          <div className="source-health-main">
            <div className="source-ring"><span>{totalChunks}</span><small>chunks</small></div>
            <div className="source-health-copy">
              <strong>{readySources} {readySources === 1 ? 'source is' : 'sources are'} ready</strong>
              <span>{readySources > 0 ? 'Vtab can draw from your latest product and security content.' : 'No sources uploaded yet. Add website links or PDF docs to ground generation.'}</span>
            </div>
          </div>
          <div className="health-footer"><span><span className="status-dot" /> Citations enabled</span><button onClick={() => onNavigate('sources')}>Manage sources <ArrowRight size={13} /></button></div>
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value, delta, caption, icon: Icon, trend, variant }: { label: string; value: string; delta: string; caption: string; icon: LucideIcon; trend: number[]; variant?: string }) {
  const points = trend.map((value, index) => `${(index / (trend.length - 1)) * 100},${30 - value * 0.3}`).join(' ');
  return (
    <div className={`metric-card${variant ? ` metric-${variant}` : ''}`}>
      <div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={16} strokeWidth={1.8} /></div></div>
      <div className="metric-value" dangerouslySetInnerHTML={{ __html: value }} />
      <div className="metric-bottom"><span className="metric-delta"><ArrowUpRight size={13} />{delta}</span><span className="metric-caption">{caption}</span></div>
      <svg className="metric-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

function GrowthChart() {
  const [range, setRange] = useState<'30D' | '90D' | '12M'>('30D');
  const [hovered, setHovered] = useState<number | null>(null);
  const datasets = {
    '30D': { values: [32, 44, 39, 65, 56, 82, 73, 112], labels: ['Oct 07', 'Oct 11', 'Oct 15', 'Oct 19', 'Oct 23', 'Oct 27', 'Oct 31', 'Nov 05'] },
    '90D': { values: [28, 52, 46, 74, 68, 104, 96, 142], labels: ['Aug 08', 'Aug 20', 'Sep 01', 'Sep 13', 'Sep 25', 'Oct 07', 'Oct 20', 'Nov 05'] },
    '12M': { values: [18, 34, 42, 53, 47, 74, 86, 126], labels: ['Dec', 'Jan', 'Mar', 'Apr', 'Jun', 'Jul', 'Sep', 'Nov'] },
  };
  const data = datasets[range];
  const plot = data.values.map((value, index) => ({ x: 34 + index * (630 / (data.values.length - 1)), y: 202 - value * 1.25, value, label: data.labels[index] }));
  const line = plot.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${plot[plot.length - 1].x} 218 L ${plot[0].x} 218 Z`;
  return (
    <div className="signal-card growth-card">
      <div className="card-heading"><div><div className="eyebrow">PIPELINE MOMENTUM</div><h2>Lead growth</h2><div className="chart-summary"><strong>+28.4%</strong><span>qualified leads over the last 30 days</span></div></div><div className="range-switcher">{(['30D', '90D', '12M'] as const).map((value) => <button key={value} className={range === value ? 'selected' : ''} onClick={() => { setRange(value); setHovered(null); }}>{value}</button>)}</div></div>
      <div className="chart-container" onMouseLeave={() => setHovered(null)}>
        {hovered !== null && <div className="chart-tooltip" style={{ left: `${5 + (hovered / (plot.length - 1)) * 84}%`, top: `${Math.max(2, 33 + (plot[hovered].y / 3.9))}%` }}><strong>{plot[hovered].value + 380}</strong><span>{plot[hovered].label}</span></div>}
        <svg className="growth-svg" viewBox="0 0 700 260" preserveAspectRatio="none" role="img" aria-label={`Lead growth over ${range}`}>
          <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#C9F36A" stopOpacity=".34" /><stop offset="100%" stopColor="#C9F36A" stopOpacity="0" /></linearGradient></defs>
          {[55, 105, 155, 205].map((y) => <line key={y} x1="26" x2="682" y1={y} y2={y} className="chart-gridline" />)}
          <path d={area} fill="url(#chartFill)" className="chart-area" />
          <path d={line} fill="none" className="chart-line" />
          {plot.map((point, index) => <g key={`${range}-${index}`} onMouseEnter={() => setHovered(index)}><circle cx={point.x} cy={point.y} r="15" fill="transparent" /><circle cx={point.x} cy={point.y} r={hovered === index ? '5.5' : index === plot.length - 1 ? '4.4' : '3'} className={`chart-point${hovered === index ? ' point-hovered' : ''}`} /></g>)}
          <line x1={plot[plot.length - 1].x} x2={plot[plot.length - 1].x} y1={plot[plot.length - 1].y + 8} y2="218" className="chart-guide" />
          {data.labels.filter((_, index) => index % 2 === 0 || index === data.labels.length - 1).map((label, index, list) => <text key={label} x={32 + index * (640 / Math.max(1, list.length - 1))} y="246" className="chart-label">{label}</text>)}
        </svg>
      </div>
      <div className="chart-legend"><span><i className="legend-dot" />Qualified leads</span><span className="chart-footer-note">Updated 9 minutes ago</span></div>
    </div>
  );
}

function AgentMonitor({ onNavigate }: { onNavigate: () => void }) {
  const agents = [
    { name: 'Lead discovery', detail: 'Reviewing public conversations', status: 'Running', icon: Target, tone: 'green', progress: 68 },
    { name: 'Knowledge sync', detail: '3 sources · 87 chunks indexed', status: 'Ready', icon: BookOpen, tone: 'blue', progress: 100 },
    { name: 'Campaign writer', detail: 'Waiting for your next brief', status: 'Idle', icon: Megaphone, tone: 'amber', progress: 0 },
  ];
  return (
    <div className="signal-card agent-card">
      <div className="card-heading"><div><div className="eyebrow">AUTOMATIONS</div><h2>Agent activity</h2></div><button className="plain-icon-button" onClick={onNavigate} aria-label="Open marketing bot"><ArrowRight size={16} /></button></div>
      <div className="agent-list">{agents.map((agent) => { const Icon = agent.icon; return <div className="agent-row" key={agent.name}><div className={`agent-icon agent-icon-${agent.tone}`}><Icon size={16} /></div><div className="agent-info"><div className="agent-name-line"><strong>{agent.name}</strong><span className={`agent-state state-${agent.tone}`}><i />{agent.status}</span></div><span>{agent.detail}</span>{agent.progress > 0 && <div className="agent-progress"><i style={{ width: `${agent.progress}%` }} /></div>}</div></div>; })}</div>
      <button className="agent-manage-link" onClick={onNavigate}>Manage automations <ArrowRight size={14} /></button>
    </div>
  );
}

function ApprovalQueue({ approvals, onApprove, onDismiss, onSeeAll }: { approvals: Approval[]; onApprove: (item: Approval) => void; onDismiss: (item: Approval) => void; onSeeAll: () => void }) {
  return (
    <div className="signal-card approval-card">
      <div className="card-heading"><div><div className="eyebrow">YOUR REVIEW</div><h2>Waiting for approval <span className="count-pill">{approvals.length}</span></h2></div><button className="text-link" onClick={onSeeAll}>View leads <ArrowRight size={13} /></button></div>
      {approvals.length === 0 ? <div className="empty-approvals"><div className="empty-icon"><CheckCircle2 size={19} /></div><strong>Nothing waiting on you.</strong><span>Your next ready-to-send draft will appear here.</span></div> : <div className="approval-list">{approvals.map((item) => <div className="approval-row" key={item.id}><div className={`avatar avatar-${item.color}`}>{item.initials}</div><div className="approval-person"><strong>{item.name}</strong><span>{item.detail}</span></div><div className="approval-channel">{item.channel === 'LinkedIn' ? <Linkedin size={14} /> : item.channel === 'Email' ? <Mail size={14} /> : <MessageCircle size={14} />}<span>{item.channel}</span></div><div className="approval-time"><Clock3 size={12} />{item.time}</div><div className="approval-actions"><button className="approve-button" onClick={() => onApprove(item)}><Check size={13} />Approve</button><button className="dismiss-button" aria-label={`Dismiss draft for ${item.name}`} onClick={() => onDismiss(item)}><X size={14} /></button></div></div>)}</div>}
    </div>
  );
}

function LeadBotPage({
  leads,
  setLeads,
  onToast,
  onAddApproval,
}: {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  onToast: (toast: ToastMessage) => void;
  onAddApproval: (item: any) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<'All leads' | 'Today (Nov 5)' | 'High intent' | 'New this week'>('All leads');
  const [sortKey, setSortKey] = useState<'date-desc' | 'date-asc' | 'intent-desc'>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [inspectingLead, setInspectingLead] = useState<Lead | null>(null);
  const [composingLead, setComposingLead] = useState<Lead | null>(null);

  const visibleLeads = useMemo(() => {
    let result = [...leads];
    if (filter === 'Today (Nov 5)') {
      result = result.filter((lead) => lead.fetchedDate.includes('Nov 5') || lead.fetchedDate === 'Today');
    } else if (filter === 'High intent') {
      result = result.filter((lead) => lead.intent >= 85);
    } else if (filter === 'New this week') {
      result = result.filter((lead) => lead.addedThisWeek);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.name.toLowerCase().includes(q) ||
          lead.company.toLowerCase().includes(q) ||
          lead.role.toLowerCase().includes(q) ||
          lead.excerpt.toLowerCase().includes(q) ||
          lead.source.toLowerCase().includes(q)
      );
    }

    if (sortKey === 'date-desc') {
      result.sort((a, b) => b.fetchedTimestamp - a.fetchedTimestamp);
    } else if (sortKey === 'date-asc') {
      result.sort((a, b) => a.fetchedTimestamp - b.fetchedTimestamp);
    } else if (sortKey === 'intent-desc') {
      result.sort((a, b) => b.intent - a.intent);
    }
    return result;
  }, [filter, sortKey, searchQuery, leads]);

  const toggleSelectAll = () => {
    if (selectedLeadIds.size === visibleLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(visibleLeads.map((l) => l.id)));
    }
  };

  const toggleSelectLead = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportToCsv = (leadsToExport: Lead[]) => {
    if (leadsToExport.length === 0) return;
    const headers = ['ID', 'Name', 'Role', 'Company', 'Source', 'Intent', 'Excerpt', 'Date Fetched'];
    const rows = leadsToExport.map((l) => [
      l.id,
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.role.replace(/"/g, '""')}"`,
      `"${l.company.replace(/"/g, '""')}"`,
      `"${l.source.replace(/"/g, '""')}"`,
      l.intent,
      `"${l.excerpt.replace(/"/g, '""')}"`,
      `"${l.fetchedDate} ${l.fetchedTime}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vtab_leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast({ title: 'Leads exported to CSV', detail: `Downloaded ${leadsToExport.length} prospects.` });
  };

  const runSearch = async () => {
    if (!prompt.trim()) {
      onToast({ title: 'Add a search brief first', detail: 'Describe the need or buying signal you want to find.' });
      return;
    }
    setSearching(true);
    try {
      // Call server-side real web search via Gemini Google Search grounding
      const res = await fetch('/api/search-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const rawLeads: any[] = data.leads || [];

      if (rawLeads.length === 0) {
        onToast({
          title: 'No prospects found',
          detail: 'No real matches found for this signal. Try a more specific phrase.',
        });
        return;
      }

      const now = Date.now();
      const newLeads: Lead[] = rawLeads.map((p: any, i: number) => {
        const lead: Lead = {
          id: now + i,
          name: p.name || 'Unknown',
          role: p.role || 'Professional',
          company: p.company || 'Independent',
          initials: p.initials || (p.name || 'U').slice(0, 2).toUpperCase(),
          source: p.source || 'Web',
          excerpt: p.excerpt || '',
          intent: Math.min(99, Math.max(60, p.intent || 80)),
          color: p.color || 'sage',
          sourceUrl: p.sourceUrl,
          addedThisWeek: true,
          fetchedDate: p.postedDate || 'Recent',
          fetchedTime: p.postedTime || 'Public signal',
          fetchedTimestamp: now + i,
        };
        return lead;
      });

      setLeads((current) => [...newLeads, ...current]);

      // Persist each lead to Supabase
      newLeads.forEach((newLead) => {
        const sourceWithUrl = newLead.sourceUrl
          ? `${newLead.source}|||${newLead.sourceUrl}`
          : newLead.source;
        insertSupabaseLead({
          id: newLead.id,
          name: newLead.name,
          role: newLead.role,
          company: newLead.company,
          initials: newLead.initials,
          source: sourceWithUrl,
          excerpt: newLead.excerpt,
          intent: newLead.intent,
          color: newLead.color,
          added_this_week: true,
          fetched_date: newLead.fetchedDate,
          fetched_time: newLead.fetchedTime,
          fetched_timestamp: newLead.fetchedTimestamp,
        });
      });

      const queries = data.searchQueries?.join(', ') || '';
      onToast({
        title: `${newLeads.length} real prospect${newLeads.length > 1 ? 's' : ''} discovered`,
        detail: queries ? `Searched: ${queries.slice(0, 80)}` : `Found via Google Search grounding.`,
      });
    } catch (err) {
      console.warn('Discovery error:', err);
      onToast({ title: 'Search failed', detail: 'Could not reach the discovery endpoint. Check server.' });
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="PROSPECTING / LEAD BOT" title="Find the right people." description="Start with a signal. Get back to the people already looking for a better way.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportToCsv(visibleLeads)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
          >
            <Download size={13} /> Export all ({visibleLeads.length})
          </button>
          <div className="running-badge"><span className="green-pulse" />Discovery is on</div>
        </div>
      </PageHeader>
      <section className="lead-prompt-card">
        <div className="lead-prompt-top"><div className="prompt-mark"><Target size={18} /></div><div><strong>What should Vtab look for?</strong><span>Describe a problem, intent or moment that points to a good fit.</span></div><div className="preview-label"><span />AI SIGNAL SEARCH</div></div>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Find teams looking for an analytics dashboard tool or an alternative to Power BI…" rows={3} aria-label="Describe the prospect search" />
        <div className="prompt-footer"><div className="prompt-suggestions"><span>TRY</span>{['Analytics dashboard tool', 'Alternative to Power BI', 'Looking for reporting software'].map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}</div><PrimaryButton onClick={runSearch} icon={searching ? LoaderCircle : Search} disabled={searching}>{searching ? 'Searching the web…' : 'Find prospects'}</PrimaryButton></div>
      </section>
      <div className="search-disclosure"><ShieldCheck size={15} /><span>Matches are based on public signals. Review context before reaching out.</span><button onClick={() => onToast({ title: 'AI Discovery active', detail: 'Prospect discovery queries live web conversations and models verified buying urgency.' })}>How discovery works <ArrowRight size={12} /></button></div>
      
      <section className="lead-results-section">
        <div className="section-headline">
          <div><div className="eyebrow">YOUR PROSPECTS <span className="count-inline">{visibleLeads.length}</span></div><h2>People with a reason to talk.</h2></div>
          <div className="list-toolbar">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, color: '#7a877d' }} />
              <input
                type="text"
                placeholder="Search prospects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px',
                  borderRadius: 6,
                  border: '1px solid #dbe2d8',
                  fontSize: '12.5px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  width: '180px',
                  background: '#ffffff',
                }}
              />
            </div>
            <button className="filter-button" onClick={() => setFilter((value) => value === 'All leads' ? 'Today (Nov 5)' : value === 'Today (Nov 5)' ? 'High intent' : value === 'High intent' ? 'New this week' : 'All leads')}>
              <SlidersHorizontal size={13} />
              <span>{filter}</span>
              <ChevronDown size={12} />
            </button>
            <button className="filter-button" onClick={() => setSortKey((value) => value === 'date-desc' ? 'date-asc' : value === 'date-asc' ? 'intent-desc' : 'date-desc')} title="Change sort order">
              <ArrowUpDown size={13} />
              <span>{sortKey === 'date-desc' ? 'Date: Newest first' : sortKey === 'date-asc' ? 'Date: Oldest first' : 'Intent: Highest first'}</span>
              <ChevronDown size={12} />
            </button>
            <button className="plain-icon-button" aria-label="More lead list options" onClick={() => onToast({ title: 'Leads synced', detail: 'Fetched signals refreshed across active accounts.' })}><MoreHorizontal size={18} /></button>
          </div>
        </div>

        {/* Floating Bulk Actions Bar */}
        {selectedLeadIds.size > 0 && (
          <div
            style={{
              background: '#142019',
              color: '#ffffff',
              padding: '10px 18px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              animation: 'fade-in 0.2s ease',
            }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
              {selectedLeadIds.size} {selectedLeadIds.size === 1 ? 'prospect' : 'prospects'} selected
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => exportToCsv(visibleLeads.filter((l) => selectedLeadIds.has(l.id)))}
                style={{
                  background: '#c9f36a',
                  color: '#142019',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Download size={13} /> Export Selected as CSV
              </button>
              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                style={{
                  background: 'transparent',
                  color: '#9baea0',
                  border: 'none',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Deselect all
              </button>
            </div>
          </div>
        )}

        <div className="lead-list">
          <div className="lead-table-header" style={{ display: 'grid', gridTemplateColumns: '36px 42px minmax(140px, 1.2fr) minmax(200px, 2fr) 110px 80px 150px' }}>
            <span style={{ display: 'grid', placeItems: 'center' }}>
              <input
                type="checkbox"
                checked={selectedLeadIds.size > 0 && selectedLeadIds.size === visibleLeads.length}
                onChange={toggleSelectAll}
                aria-label="Select all leads"
                style={{ cursor: 'pointer' }}
              />
            </span>
            <span />
            <span>Prospect & Role</span>
            <span>Signal & Context</span>
            <span>Date Posted</span>
            <span style={{ textAlign: 'center' }}>Intent</span>
            <span>Outreach</span>
          </div>
          {visibleLeads.map((lead, index) => {
            const postUrl = resolveLeadUrl(lead);
            return (
              <div
                className="lead-row"
                key={lead.id}
                onClick={() => setInspectingLead(lead)}
                style={{
                  animationDelay: `${index * 45}ms`,
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '36px 42px minmax(140px, 1.2fr) minmax(200px, 2fr) 110px 80px 150px',
                }}
              >
                <div style={{ display: 'grid', placeItems: 'center' }} onClick={(e) => toggleSelectLead(lead.id, e)}>
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.has(lead.id)}
                    onChange={() => {}}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                <div className={`avatar avatar-${lead.color}`}>{lead.initials}</div>
                <div className="lead-primary">
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open original post or profile in new tab"
                    style={{
                      color: '#142019',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      width: 'fit-content',
                    }}
                  >
                    <strong style={{ textDecoration: 'underline', textDecorationColor: '#b8ccb5', textUnderlineOffset: '2px' }}>
                      {lead.name}
                    </strong>
                    <ExternalLink size={11} style={{ color: '#4a6b30', flexShrink: 0 }} />
                  </a>
                  <span>{lead.role} <i>at</i> {lead.company}</span>
                </div>
                <div className="lead-signal">
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open live discussion in new tab"
                    style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                  >
                    <span className="signal-source" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ textDecoration: 'underline', textDecorationColor: '#88a878', textUnderlineOffset: '2px', fontWeight: 600 }}>
                        {lead.source}
                      </span>
                      <ExternalLink size={10} style={{ color: '#4a6b30' }} />
                    </span>
                    <span className="lead-quote" style={{ display: 'block' }}>"{lead.excerpt}"</span>
                  </a>
                </div>
                <div className="lead-fetched-col">
                  <span className="lead-fetched-pill">
                    <Calendar size={10} />
                    {lead.fetchedDate}
                  </span>
                  <span className="lead-fetched-time">{lead.fetchedTime}</span>
                </div>
                <div className={`intent-score${lead.intent >= 88 ? ' intent-high' : ''}`}>
                  <div className="intent-number">{lead.intent}<small>/100</small></div>
                  <div className="intent-track"><i style={{ width: `${lead.intent}%` }} /></div>
                  <span>intent</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    className="lead-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      setComposingLead(lead);
                    }}
                  >
                    Draft outreach <ArrowRight size={13} />
                  </button>
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="lead-open-btn"
                    title="Open original post in new tab"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#f2f6ef',
                      border: '1px solid #d4ded0',
                      color: '#2b4719',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      flexShrink: 0,
                    }}
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            );
          })}
          {leads.length === 0 ? (
            <div style={{ padding: '64px 20px', textAlign: 'center', color: '#7a877d' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(201, 243, 106, 0.12)', color: '#c9f36a', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                <Target size={24} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#142019', margin: '0 0 6px' }}>No prospects discovered yet</h3>
              <p style={{ fontSize: '13.5px', color: '#7a877d', margin: '0 auto 18px', maxWidth: '440px', lineHeight: 1.5 }}>
                Enter an intent prompt above and click <strong>Find prospects</strong>. The bot searches the live web via Google Search, finds real people publicly expressing this need, and surfaces them here.
              </p>
            </div>
          ) : visibleLeads.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#7a877d', fontSize: '13px' }}>
              No prospects match your search criteria. <button className="text-link" onClick={() => { setFilter('All leads'); setSearchQuery(''); }}>Reset filters</button>
            </div>
          ) : null}
        </div>
        <div className="list-footnote"><span>Showing {visibleLeads.length} of {leads.length} prospects · Sorted by {sortKey === 'date-desc' ? 'most recent date fetched' : sortKey === 'date-asc' ? 'oldest date fetched' : 'highest intent score'}</span><span>Intent score combines urgency, fit and buying language.</span></div>
      </section>

      {/* Prospect Dossier Drawer */}
      <LeadDetailDrawer
        lead={inspectingLead}
        onClose={() => setInspectingLead(null)}
        onComposeOutreach={(lead) => setComposingLead(lead)}
      />

      {/* Outreach Compose Modal */}
      <OutreachComposeModal
        lead={composingLead}
        onClose={() => setComposingLead(null)}
        onSendForApproval={(lead, message, channel) => {
          onAddApproval({
            type: channel === 'linkedin' ? 'LinkedIn InMail' : 'Direct Email',
            title: `${lead.name} · ${channel === 'linkedin' ? 'LinkedIn InMail' : 'Work Email'}`,
            recipient: lead.name,
            detail: message.slice(0, 100) + '…',
            badge: `${lead.intent} Intent`,
          });
          onToast({
            title: `Outreach queued for ${lead.name}`,
            detail: 'Added to your Overview approval queue for review.',
          });
        }}
      />
    </>
  );
}

function SourcesPage({
  sources,
  chunks,
  onAdd,
  onSettings,
}: {
  sources: KnowledgeSource[];
  chunks: Chunk[];
  onAdd: () => void;
  onSettings: () => void;
}) {
  const [query, setQuery] = useState('');
  const [inspectingChunk, setInspectingChunk] = useState<Chunk | null>(null);
  const filteredChunks = chunks.filter((chunk) =>
    `${chunk.source} ${chunk.text}`.toLowerCase().includes(query.toLowerCase())
  );
  const readyCount = sources.filter((source) => source.status === 'Ready').length;
  const chunkCount = sources.reduce((sum, source) => sum + source.chunks, 0);
  return (
    <>
      <PageHeader eyebrow="KNOWLEDGE / SOURCES" title="Teach Vtab your world." description="A better answer starts with the facts only your team knows.">
        <PrimaryButton icon={Plus} onClick={onAdd}>Add a source</PrimaryButton>
      </PageHeader>
      <div className="knowledge-overview signal-card">
        <div className="knowledge-intro"><div className="knowledge-orb"><BookOpen size={19} /></div><div><div className="eyebrow">WORKSPACE KNOWLEDGE BASE</div><h2>Product knowledge, in context.</h2><p>Vtab retrieves the right detail from your connected sources before it writes, so every answer stays grounded.</p></div></div>
        <div className="knowledge-stats"><div><strong>{readyCount}<small> / {sources.length}</small></strong><span>sources ready</span></div><div><strong>{chunkCount}</strong><span>searchable chunks</span></div><div className="index-status"><span className="green-pulse" /><div><strong>Index healthy</strong><span>Synced moments ago</span></div></div></div>
      </div>
      <section className="sources-section">
        <div className="section-headline"><div><div className="eyebrow">CONNECTED SOURCES</div><h2>What Vtab knows.</h2></div><button className="text-link" onClick={onAdd}><Plus size={14} /> Add source</button></div>
        <div className="source-list">
          {sources.map((source) => (
            <div className="source-row" key={source.id}>
              <div className={`source-type-icon ${source.kind === 'Website' ? 'source-type-web' : 'source-type-file'}`}>
                {source.kind === 'Website' ? <Globe size={18} /> : <FileText size={18} />}
              </div>
              <div className="source-info">
                <strong>{source.name}</strong>
                <span>{source.kind} <i>·</i> {source.detail}</span>
              </div>
              <div className="source-chunks">
                <Database size={14} />
                <strong>{source.chunks}</strong>
                <span>chunks</span>
              </div>
              <div className={`source-status${source.status === 'Syncing' ? ' status-syncing' : ''}`}>
                <i />{source.status === 'Ready' ? 'Ready' : 'Processing'}
              </div>
              <button className="plain-icon-button" aria-label={`More options for ${source.name}`}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))}
          {sources.length === 0 && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#7a877d', fontSize: '13px' }}>
              No sources connected yet. Click <strong>Add a source</strong> above to ingest a Website URL or PDF document.
            </div>
          )}
        </div>
      </section>
      <section className="chunks-section signal-card">
        <div className="chunks-head"><div><div className="eyebrow">RETRIEVAL PREVIEW</div><h2>Searchable knowledge</h2><p>Click any passage to inspect vector embeddings and test query similarity.</p></div><label className="chunk-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chunks" /></label></div>
        <div className="chunk-list">
          {filteredChunks.map((chunk, index) => (
            <div
              className="chunk-row"
              key={chunk.source + index}
              onClick={() => setInspectingChunk(chunk)}
              style={{ cursor: 'pointer' }}
            >
              <div className="chunk-index">{String(index + 1).padStart(2, '0')}</div>
              <div>
                <div className="chunk-source">{chunk.source}</div>
                <p>{chunk.text}</p>
              </div>
              <button className="chunk-open" aria-label="Open chunk details">
                <ArrowUpRight size={14} />
              </button>
            </div>
          ))}
          {filteredChunks.length === 0 && (
            <div className="empty-chunks" style={{ padding: '32px 16px', textAlign: 'center', color: '#7a877d', fontSize: '13px' }}>
              {chunks.length === 0
                ? 'No knowledge passages indexed yet. Upload a PDF or add a website URL above.'
                : `No passages match “${query}”. Try a different phrase.`}
            </div>
          )}
        </div>
        <div className="chunk-foot"><span><ShieldCheck size={14} /> Answers stay grounded in your approved sources.</span><button onClick={onSettings}>Manage retrieval settings <ArrowRight size={13} /></button></div>
      </section>

      {/* Chunk Passage Inspector Drawer */}
      <ChunkDetailDrawer
        chunk={inspectingChunk}
        onClose={() => setInspectingChunk(null)}
      />
    </>
  );
}

function AddSourceModal({
  onClose,
  onWebsite,
  onPdf,
}: {
  onClose: () => void;
  onWebsite: (url: string) => void;
  onPdf: (file: File) => void;
}) {
  const [tab, setTab] = useState<'website' | 'pdf'>('website');
  const [url, setUrl] = useState('');
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-modal-title">
        <div className="modal-top"><div className="modal-icon"><BookOpen size={19} /></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
        <div className="eyebrow">KNOWLEDGE BASE</div><h2 id="source-modal-title">Add a source.</h2><p>Give Signal a clear, current place to learn from.</p>
        <div className="modal-tabs"><button className={tab === 'website' ? 'active' : ''} onClick={() => setTab('website')}><Globe size={14} />Website</button><button className={tab === 'pdf' ? 'active' : ''} onClick={() => setTab('pdf')}><FileText size={14} />PDF document</button></div>
        {tab === 'website' ? (
          <form onSubmit={(event) => { event.preventDefault(); onWebsite(url); }}>
            <label className="field-label" htmlFor="source-url">WEBSITE URL</label>
            <div className="url-field">
              <Globe size={15} />
              <input id="source-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourcompany.com/docs" autoFocus />
            </div>
            <div className="modal-note">We’ll index public pages and break them into searchable passages.</div>
            <PrimaryButton type="submit" icon={ArrowRight}>Scan website</PrimaryButton>
          </form>
        ) : (
          <div className="pdf-upload">
            <label className="upload-dropzone">
              <input
                type="file"
                accept="application/pdf,.pdf,.txt,.md"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onPdf(file);
                }}
              />
              <span className="upload-symbol"><Upload size={18} /></span>
              <strong>Choose a PDF or text file to upload</strong>
              <span>PDF, TXT, MD · select a file from this device</span>
            </label>
            <div className="modal-note">Text is extracted and organized into semantic searchable chunks.</div>
          </div>
        )}
        <div className="modal-safety"><ShieldCheck size={14} />Only add information your team has permission to use.</div>
      </div>
    </div>
  );
}

type SocialImagePlatform = 'facebook' | 'instagram' | 'linkedin';

interface PlatformImageState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  imageUrl?: string;
  prompt: string;
  selectedConceptId?: string;
  templateId?: string;
  styleId?: string;
  styleName?: string;
  paletteId?: string;
  paletteName?: string;
  mainSubject?: string;
  expectedHeadline?: string;
  subline?: string;
  expectedCta?: string;
  locationBadge?: string;
  textFreePrompt?: string;
  providerUsed?: string;
  verified?: boolean;
  detectedText?: string;
  relevanceScore?: number;
  relevanceFeedback?: string;
  needsReview?: boolean;
  error?: string;
  allProvidersFailed?: boolean;
}

const createInitialPlatformImages = (): Record<SocialImagePlatform, PlatformImageState> => ({
  facebook: { status: 'idle', prompt: '' },
  instagram: { status: 'idle', prompt: '' },
  linkedin: { status: 'idle', prompt: '' },
});

interface ProductAssetItem {
  name: string;
  path: string;
  url: string;
}

function PlatformImageStudio({
  platform,
  state,
  concepts = [],
  campaignFacts,
  customEventDetails = '',
  onCustomEventDetailsChange,
  screenshots = [],
  selectedScreenshotUrl = '',
  onSelectScreenshot,
  onUploadAsset,
  showCtaButton = true,
  onToggleCtaButton,
  aiDisclosure,
  onToggleAiDisclosure,
  onSelectConcept,
  onSurpriseMe,
  onPromptChange,
  onRegenerate,
}: {
  platform: SocialImagePlatform;
  state: PlatformImageState;
  concepts?: CreativeConceptOption[];
  campaignFacts?: CampaignFacts;
  customEventDetails?: string;
  onCustomEventDetailsChange?: (val: string) => void;
  screenshots?: ProductAssetItem[];
  selectedScreenshotUrl?: string;
  onSelectScreenshot?: (url: string) => void;
  onUploadAsset?: (kind: 'screenshot' | 'logo', file: File) => void;
  showCtaButton?: boolean;
  onToggleCtaButton?: (next: boolean) => void;
  aiDisclosure: boolean;
  onToggleAiDisclosure: (next: boolean) => void;
  onSelectConcept: (concept: CreativeConceptOption) => void;
  onSurpriseMe: () => void;
  onPromptChange: (nextPrompt: string) => void;
  onRegenerate: () => void;
}) {
  const aspectHint = platform === 'instagram' ? '4:5 (1080×1350)' : '1.91:1 (1200×630)';
  const isLoading = state.status === 'loading';

  return (
    <div
      style={{
        margin: '14px 0',
        borderRadius: 10,
        border: '1px solid #d4ded1',
        background: '#f8faf7',
        padding: '14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12.5px', fontWeight: 700, color: '#142019' }}>
          <ImageIcon size={14} color="#2d6a4f" />
          <span>AI Creative ({aspectHint})</span>
          {state.providerUsed && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                background: '#e5ede3',
                color: '#23422e',
                textTransform: 'uppercase',
              }}
            >
              {state.providerUsed}
            </span>
          )}
          {state.status === 'ready' && state.verified && !state.needsReview && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                background: '#dcfce7',
                color: '#166534',
              }}
            >
              {state.relevanceScore ? `Relevant (${state.relevanceScore}/5)` : 'Verified'}
            </span>
          )}
          {state.status === 'ready' && state.needsReview && (
            <span
              title={state.relevanceFeedback || (state.detectedText ? `Detected text: ${state.detectedText}` : 'Flagged for manual review')}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                background: '#fef3c7',
                color: '#92400e',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <AlertTriangle size={11} />
              Needs review{state.relevanceScore ? ` (${state.relevanceScore}/5)` : ''}
            </span>
          )}
        </div>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '12px',
            color: '#3c5243',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={aiDisclosure}
            onChange={(e) => onToggleAiDisclosure(e.target.checked)}
          />
          AI-generated label
        </label>
      </div>

      {/* Single Premier Direction / Art Director Direction */}
      {concepts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {(() => {
            const primary = concepts[0];
            return (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1.5px solid #2d6a4f',
                  background: 'linear-gradient(180deg, #f0f7f2 0%, #ffffff 100%)',
                  boxShadow: '0 2px 8px rgba(45, 106, 79, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#2d6a4f',
                      }}
                    >
                      {primary.styleName}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#2d6a4f',
                        color: '#ffffff',
                      }}
                    >
                      Premier Poster
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {primary.previewHexes.map((hex) => (
                      <span
                        key={hex}
                        title={primary.paletteName}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: hex,
                          border: '1px solid rgba(0,0,0,0.18)',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#142019', lineHeight: 1.35 }}>
                  {primary.sceneIdea || primary.metaphor}
                </div>
                <div style={{ fontSize: '12px', color: '#3c5043', lineHeight: 1.35 }}>
                  Headline: &ldquo;{primary.headlineText}&rdquo;
                  {primary.locationBadge ? ` · ${primary.locationBadge}` : ''}
                </div>
                <div style={{ fontSize: '11px', color: '#64786a', marginTop: 2 }}>
                  Palette: {primary.paletteName} · Call-To-Action: {primary.ctaText}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {campaignFacts?.campaignType === 'launch_event' && !campaignFacts.eventDetails && onCustomEventDetailsChange && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #f59e0b',
            background: '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            fontSize: '12px',
            color: '#78350f',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            No date or venue found in your brief. Add real event details to display on the creative (never auto-invented):
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 280px' }}>
            <input
              type="text"
              value={customEventDetails}
              onChange={(e) => onCustomEventDetailsChange(e.target.value)}
              placeholder="e.g. Nov 28 · 10:00 AM · Taj Vivanta, Coimbatore"
              style={{
                flex: 1,
                minWidth: 200,
                fontSize: '12px',
                padding: '6px 9px',
                borderRadius: 6,
                border: '1px solid #d97706',
                background: '#fff',
                color: '#142019',
              }}
            />
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isLoading}
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#b45309',
                color: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {(campaignFacts?.campaignType === 'launch_event' || campaignFacts?.campaignType === 'product_feature') &&
        screenshots.length === 0 && (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px dashed #9cc09b',
              background: '#f2f7f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: '12px',
              color: '#23422e',
            }}
          >
            <span>
              Tip: Upload a real <strong>{campaignFacts.productName}</strong> product screenshot to composite it inside a device frame for this {campaignFacts.campaignType.replace('_', ' ')}.
            </span>
            {onUploadAsset && (
              <label
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#fff',
                  background: '#2d6a4f',
                  padding: '5px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Upload Screenshot
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadAsset('screenshot', file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        )}

      {isLoading && (
        <div
          style={{
            height: 220,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #142019 0%, #1e3528 100%)',
            color: '#c9f36a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <LoaderCircle size={24} className="active-agent-spinner" />
          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
            Generating & verifying {platform} creative...
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <div
          style={{
            borderRadius: 8,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            padding: '14px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991b1b', fontSize: '12.5px' }}>
            <AlertTriangle size={16} />
            <span>
              {state.allProvidersFailed
                ? 'All image providers failed. Please retry.'
                : state.error || 'Image generation failed.'}
            </span>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={onRegenerate}
            style={{ padding: '6px 12px', fontSize: '12px', background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && state.imageUrl && (
        <div
          style={{
            position: 'relative',
            margin: '0 auto 12px',
            width: '100%',
            maxWidth: platform === 'instagram' ? 380 : 600,
            aspectRatio: platform === 'instagram' ? '4 / 5' : '1.91 / 1',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #d4ded1',
            background: '#f1f5f0',
          }}
        >
          <img
            src={state.imageUrl}
            alt={`Generated ${platform} creative`}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          {aiDisclosure && (
            <span
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                background: 'rgba(20, 32, 25, 0.82)',
                color: '#f8faf7',
                fontSize: '10.5px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              AI-generated
            </span>
          )}
        </div>
      )}

      {state.status === 'ready' && state.providerUsed === 'gradient-fallback' && (
        <div style={{ fontSize: '11.5px', color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
          AI backdrop unavailable, using template.
        </div>
      )}

      {state.status === 'ready' && state.needsReview && state.detectedText && (
        <div style={{ fontSize: '11.5px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
          OCR detected: &ldquo;{state.detectedText}&rdquo; — review before publishing or regenerate.
        </div>
      )}

      {((campaignFacts?.claimSources && campaignFacts.claimSources.length > 0) || customEventDetails?.trim()) && (
        <div style={{ fontSize: '11px', color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Verified Claim Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {campaignFacts?.claimSources?.map((item, idx) => (
              <span
                key={`${item.claim}-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                }}
              >
                <span>{item.claim}</span>
                <span style={{ fontWeight: 600, color: '#15803d' }}>({item.source})</span>
              </span>
            ))}
            {customEventDetails?.trim() && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                }}
              >
                <span>{customEventDetails.trim()}</span>
                <span style={{ fontWeight: 600, color: '#1d4ed8' }}>(User Input)</span>
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '8px 10px',
            borderRadius: 6,
            background: '#ffffff',
            border: '1px solid #e1e8df',
          }}
        >
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#23422e' }}>
            Product Composite:
          </span>
          <select
            value={selectedScreenshotUrl}
            onChange={(e) => onSelectScreenshot && onSelectScreenshot(e.target.value)}
            style={{
              fontSize: '11.5px',
              padding: '4px 8px',
              borderRadius: 5,
              border: '1px solid #d4ded1',
              background: '#f8faf7',
              color: '#142019',
              maxWidth: 210,
            }}
          >
            <option value="">None (scene only)</option>
            {screenshots.map((s) => (
              <option key={s.path} value={s.url}>
                {s.name}
              </option>
            ))}
          </select>
          {onUploadAsset && (
            <>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#2d6a4f',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 5,
                  border: '1px solid #c7d9c4',
                  background: '#f3f8f2',
                }}
              >
                + Screenshot
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadAsset('screenshot', file);
                    e.target.value = '';
                  }}
                />
              </label>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#2d6a4f',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 5,
                  border: '1px solid #c7d9c4',
                  background: '#f3f8f2',
                }}
              >
                + Brand Logo
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadAsset('logo', file);
                    e.target.value = '';
                  }}
                />
              </label>
            </>
          )}
          {onToggleCtaButton && (
            <label
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '11.5px',
                color: '#3c5243',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showCtaButton}
                onChange={(e) => onToggleCtaButton(e.target.checked)}
              />
              Draw CTA pill
            </label>
          )}
        </div>

        <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#3c5243' }}>
          Scene Art-Direction Prompt (text-free; headline & logo rendered in code)
        </label>
        <textarea
          rows={3}
          value={state.prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe layout, headline in quotes, CTA pill, brand colors by name..."
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #d4ded1',
            fontFamily: 'inherit',
            fontSize: '12.5px',
            lineHeight: 1.4,
            background: '#fff',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="secondary-button"
            disabled={isLoading || !state.prompt.trim()}
            onClick={onRegenerate}
            style={{ fontSize: '12px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {isLoading ? (
              <>
                <LoaderCircle size={13} className="active-agent-spinner" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                {state.imageUrl ? 'Regenerate image' : 'Generate image'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketingPage({
  sources = [],
  chunks = [],
  leads = [],
  onToast,
  onNavigate,
  onSaveWorkflow,
  onAddApproval,
  onPostPublished,
}: {
  sources?: KnowledgeSource[];
  chunks?: Chunk[];
  leads?: Lead[];
  onToast: (toast: ToastMessage) => void;
  onNavigate?: (page: PageId) => void;
  onSaveWorkflow?: (workflow: CampaignWorkflow) => void;
  onAddApproval?: (item: any) => void;
  onPostPublished?: (post: PublishedPost) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState(() => (sources.length > 0 ? sources[0].name : ''));

  useEffect(() => {
    if (!knowledgeBase && sources.length > 0) {
      setKnowledgeBase(sources[0].name);
    }
  }, [sources, knowledgeBase]);

  const [channel, setChannel] = useState<'facebook' | 'instagram' | 'social' | 'twitter' | 'email' | 'newsletter' | 'visual' | 'dm'>('facebook');
  const [generation, setGeneration] = useState<'idle' | 'working' | 'ready'>('idle');
  const [agentStage, setAgentStage] = useState(-1);
  const [typedCopy, setTypedCopy] = useState('');
  const [copied, setCopied] = useState(false);
  const [deliverables, setDeliverables] = useState<CampaignDeliverables | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCopy, setEditedCopy] = useState('');
  const [publishingPlatform, setPublishingPlatform] = useState<string | null>(null);
  const [publishedUrls, setPublishedUrls] = useState<Record<string, string>>({});
  const [platformImages, setPlatformImages] = useState<Record<SocialImagePlatform, PlatformImageState>>(
    createInitialPlatformImages
  );
  const [aiDisclosure, setAiDisclosure] = useState<Record<SocialImagePlatform, boolean>>({
    facebook: false,
    instagram: false,
    linkedin: false,
  });
  const [activeCampaignId, setActiveCampaignId] = useState<string>('draft');
  const [productScreenshots, setProductScreenshots] = useState<ProductAssetItem[]>([]);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>('');
  const [selectedScreenshotUrl, setSelectedScreenshotUrl] = useState<string>('');
  const [showCtaButton, setShowCtaButton] = useState<boolean>(true);
  const [customEventDetails, setCustomEventDetails] = useState<string>('');

  const loadProductAssets = async () => {
    try {
      const res = await fetch('/api/product-assets');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.screenshots)) setProductScreenshots(data.screenshots);
      if (Array.isArray(data.logos) && data.logos.length > 0) setBrandLogoUrl(data.logos[0].url);
    } catch {
      // Ignore asset fetch errors
    }
  };

  useEffect(() => {
    void loadProductAssets();
  }, []);

  const handleUploadProductAsset = async (kind: 'screenshot' | 'logo', file: File) => {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/product-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          fileName: file.name,
          base64Data,
          mimeType: file.type || 'image/png',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }
      if (kind === 'logo') {
        setBrandLogoUrl(data.url);
      } else {
        setProductScreenshots((prev) => [{ name: data.name, path: data.path, url: data.url }, ...prev]);
        setSelectedScreenshotUrl(data.url);
      }
      onToast({
        title: kind === 'logo' ? 'Brand logo uploaded' : 'Product screenshot uploaded',
        detail: `${file.name} saved to Supabase product-assets.`,
      });
    } catch (err: any) {
      onToast({ title: 'Upload failed', detail: err?.message || 'Could not upload asset' });
    }
  };

  const generatePlatformImage = async (
    targetPlatform: SocialImagePlatform,
    concept?: CreativeConceptOption
  ) => {
    const current = platformImages[targetPlatform];
    const promptToUse = (concept?.designedPrompt ?? current.prompt ?? '').trim();
    const expectedHeadline = concept?.headlineText ?? current.expectedHeadline ?? '';
    const subline = concept?.sublineText ?? current.subline ?? '';
    const expectedCta = concept?.ctaText ?? current.expectedCta ?? '';
    const locationBadge = concept?.locationBadge ?? current.locationBadge ?? '';
    const trimmedCustom = customEventDetails.trim();
    const realLocation = deliverables?.campaignFacts?.location?.trim() || '';
    const eventRowText = trimmedCustom
      ? realLocation && !trimmedCustom.toLowerCase().includes(realLocation.toLowerCase())
        ? `${trimmedCustom} · ${realLocation}`
        : trimmedCustom
      : locationBadge || realLocation;
    const textFreePrompt = concept?.textFreePrompt ?? current.textFreePrompt;
    const templateId = concept?.templateId ?? current.templateId ?? concept?.styleId ?? current.styleId;
    const styleId = concept?.styleId ?? current.styleId;
    const styleName = concept?.styleName ?? current.styleName;
    const paletteId = concept?.paletteId ?? current.paletteId;
    const paletteName = concept?.paletteName ?? current.paletteName;
    const mainSubject = concept?.mainSubject ?? current.mainSubject;
    const selectedConceptId = concept?.id ?? current.selectedConceptId;
    const cType = deliverables?.campaignFacts?.campaignType;
    const allowsMockup = cType === 'launch_event' || cType === 'product_feature';
    const screenshotToComposite = allowsMockup
      ? selectedScreenshotUrl ||
        (concept?.supportsProductScreenshot && productScreenshots.length > 0
          ? productScreenshots[0].url
          : '')
      : '';

    if (!promptToUse) return;

    setPlatformImages((prev) => ({
      ...prev,
      [targetPlatform]: {
        ...prev[targetPlatform],
        prompt: promptToUse,
        selectedConceptId,
        templateId,
        styleId,
        styleName,
        paletteId,
        paletteName,
        mainSubject,
        expectedHeadline,
        subline,
        expectedCta,
        locationBadge,
        textFreePrompt,
        status: 'loading',
        error: undefined,
        allProvidersFailed: false,
      },
    }));

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'northstar-labs',
          prompt: promptToUse,
          textFreePrompt,
          platform: targetPlatform,
          campaignId: activeCampaignId,
          expectedHeadline,
          subline,
          expectedCta,
          locationBadge,
          eventRowText,
          chips: concept?.chips || deliverables?.campaignFacts?.chips,
          heroStat: concept?.heroStat || deliverables?.campaignFacts?.heroStat,
          facts: deliverables?.campaignFacts,
          templateId,
          style: styleId,
          palette: paletteId,
          mainSubject,
          productScreenshotUrl: screenshotToComposite,
          logoUrl: brandLogoUrl,
          showCtaButton,
          requiresText: false,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.imageUrl) {
        setPlatformImages((prev) => ({
          ...prev,
          [targetPlatform]: {
            ...prev[targetPlatform],
            prompt: promptToUse,
            status: 'error',
            error: data.error || 'Image generation failed',
            allProvidersFailed: Boolean(data.allProvidersFailed),
          },
        }));
        return;
      }

      setPlatformImages((prev) => ({
        ...prev,
        [targetPlatform]: {
          ...prev[targetPlatform],
          prompt: promptToUse,
          status: 'ready',
          imageUrl: data.imageUrl,
          providerUsed: data.providerUsed,
          verified: data.verified,
          detectedText: data.detectedText,
          relevanceScore: data.relevanceScore,
          relevanceFeedback: data.relevanceFeedback,
          needsReview: data.needsReview,
          error: undefined,
          allProvidersFailed: false,
        },
      }));
    } catch (err: any) {
      setPlatformImages((prev) => ({
        ...prev,
        [targetPlatform]: {
          ...prev[targetPlatform],
          prompt: promptToUse,
          status: 'error',
          error: err?.message || 'Network error while generating image',
          allProvidersFailed: false,
        },
      }));
    }
  };

  const handleSelectConcept = (targetPlatform: SocialImagePlatform, concept: CreativeConceptOption) => {
    void generatePlatformImage(targetPlatform, concept);
  };

  const handleSurpriseMe = (targetPlatform: SocialImagePlatform) => {
    const concepts = deliverables?.creativeConcepts || [];
    if (concepts.length === 0) return;
    const randomConcept = concepts[Math.floor(Math.random() * concepts.length)];
    void generatePlatformImage(targetPlatform, randomConcept);
  };

  const targetWord = brief ? brief.slice(0, 30) : 'enterprise solutions';
  const fallbackSocialCopy = `Accelerating business transformation with ${knowledgeBase || 'modern AI engineering'}.\n\n${brief || 'Empowering teams with custom software, cloud migrations, and real-time intelligence.'}\n\nExplore our solutions →`;
  const fallbackDmCopy = `Hi — saw your recent note about scaling enterprise workflows. We’ve put together practical benchmarks on ${knowledgeBase || 'data modernization'}. Would you like a brief preview?`;

  const currentSocialCopy = deliverables?.socialPost?.body || fallbackSocialCopy;
  const currentDmCopy = deliverables?.personalizedDm?.body || fallbackDmCopy;

  const [selectedDmLeadId, setSelectedDmLeadId] = useState<number | null>(null);
  const [showOnlyMatchingLeads, setShowOnlyMatchingLeads] = useState<boolean>(true);

  // Compute matching leads based on the campaign brief
  const matchingLeads = useMemo(() => {
    if (!leads || leads.length === 0) return [];
    if (!brief.trim()) return leads;

    const stopWords = new Set([
      'create', 'a', 'post', 'to', 'sell', 'vtab', 'for', 'the', 'in', 'and', 'with', 'of',
      'we', 'our', 'an', 'is', 'it', 'on', 'at', 'by', 'this', 'that', 'from', 'as', 'are',
      'be', 'will', 'your', 'you', 'about', 'can', 'new', 'app', 'out', 'them', 'their'
    ]);
    const words = brief.toLowerCase().match(/[a-z0-9_-]+/g) || [];
    const keywords = words.filter((w) => w.length > 2 && !stopWords.has(w));

    if (keywords.length === 0) return leads;

    const scored = leads.map((lead) => {
      const text = `${lead.name} ${lead.role} ${lead.company} ${lead.source} ${lead.excerpt}`.toLowerCase();
      let score = 0;
      const matchedWords: string[] = [];
      for (const kw of keywords) {
        if (text.includes(kw)) {
          const isCore = ['reporting', 'analytics', 'dashboard', 'bi', 'migration', 'database', 'queries', 'reports', 'software', 'tool', 'sales', 'crm'].includes(kw);
          score += isCore ? 25 : 10;
          matchedWords.push(kw);
        }
      }
      return { lead, score, matchedWords };
    });

    const matchedOnly = scored.filter((s) => s.score > 0);
    if (matchedOnly.length > 0) {
      matchedOnly.sort((a, b) => b.score - a.score);
      return matchedOnly.map((s) => s.lead);
    }

    return leads.slice(0, 5);
  }, [leads, brief]);

  const displayedDmLeads = showOnlyMatchingLeads ? matchingLeads : leads;
  const activeDmLead = displayedDmLeads.find((l) => l.id === selectedDmLeadId) || displayedDmLeads[0] || null;

  const getTailoredDmText = (lead: Lead | null): string => {
    if (!lead) return deliverables?.personalizedDm?.body || currentDmCopy;
    const firstName = lead.name.split(' ')[0] || 'there';
    const signal = (lead.excerpt || '').replace(/^[“"']+|[”"']+$/g, '').trim();
    const cleanBrief = brief
      ? brief.replace(/^(create a post to sell|create a campaign for|post about|sell|find|we want to)\s*/gi, '').trim()
      : 'modern reporting & analytics workflows';

    if (signal) {
      const truncatedSignal = signal.length > 95 ? signal.slice(0, 95) + '…' : signal;
      return `Hi ${firstName},\n\nI noticed your recent post mentioning: "${truncatedSignal}".\n\nWe built VTAB Square specifically for ${lead.role || 'modern teams'} — an AI reporting platform that replaces manual dashboard builds with instant natural language queries across your data sources.\n\nWould you be open to a 5-minute walkthrough to see how it addresses this for your team?`;
    }

    return `Hi ${firstName},\n\nI saw your work as ${lead.role} at ${lead.company}. We recently released an AI reporting platform for ${cleanBrief || knowledgeBase || 'modern data workflows'} to help teams eliminate reporting bottlenecks.\n\nWould you be open to a brief preview of how we could help ${lead.company}?`;
  };

  const formatFacebookDraftText = () => {
    const headline = (
      deliverables?.facebookPost?.headline ||
      deliverables?.socialPost?.headline ||
      ''
    ).trim();
    const body = (
      isEditing && channel === 'facebook'
        ? editedCopy
        : deliverables?.facebookPost?.body || deliverables?.socialPost?.body || currentSocialCopy
    ).trim();
    const rawTags =
      deliverables?.facebookPost?.tags ||
      deliverables?.socialPost?.tags ||
      ['VtabSquare', 'AI', 'Innovation'];
    const tagsLine = rawTags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
    return [headline, body, tagsLine].filter(Boolean).join('\n\n');
  };

  const handlePublishToFacebook = async () => {
    if (platformImages.facebook.status === 'error') {
      onToast({
        title: 'Image failed to generate',
        detail: 'Retry generating the Facebook creative or clear the error before publishing.',
      });
      return;
    }
    const baseText = formatFacebookDraftText();
    const text = aiDisclosure.facebook ? `${baseText}\n\n[Image: AI-generated]` : baseText;
    const imageUrl = platformImages.facebook.imageUrl;
    setPublishingPlatform('facebook');
    try {
      const res = await publishToFacebook(text, imageUrl);
      if (res.success && res.url) {
        setPublishedUrls((prev) => ({ ...prev, facebook: res.url! }));
        onToast({
          title: 'Published to Facebook Page!',
          detail: `Successfully posted to Vtab Square Page (Post ID: ${res.postId})`,
        });
        if (onPostPublished) {
          onPostPublished({
            campaignId: activeCampaignId,
            title: deliverables?.socialPost?.headline || brief || 'Campaign',
            brief: brief,
            imageUrl: platformImages.facebook.imageUrl || undefined,
            publishedAt: new Date().toISOString(),
            platforms: {
              facebook: { postId: res.postId || '', url: res.url! },
            },
          });
        }
      } else {
        onToast({
          title: 'Facebook publishing failed',
          detail: res.error || 'Could not publish to Facebook',
        });
      }
    } catch (err: any) {
      onToast({
        title: 'Facebook publishing failed',
        detail: err.message || 'Error occurred while publishing',
      });
    } finally {
      setPublishingPlatform(null);
    }
  };

  const handlePublishToInstagram = async () => {
    const igImageUrl = platformImages.instagram.imageUrl;
    if (!igImageUrl) {
      onToast({
        title: 'Instagram image required',
        detail: 'Please generate or retry the Instagram creative image before publishing.',
      });
      return;
    }
    const baseCaption = isEditing && channel === 'instagram'
      ? editedCopy
      : (deliverables?.instagramPost?.caption ||
         `${deliverables?.socialPost?.headline || ''}\n\n${deliverables?.socialPost?.body || currentSocialCopy}\n\n#VtabSquare #AI #Innovation`);
    const caption = aiDisclosure.instagram ? `${baseCaption}\n\n[Image: AI-generated]` : baseCaption;
    setPublishingPlatform('instagram');
    try {
      const res = await publishToInstagram(caption, igImageUrl);
      if (res.success && res.url) {
        setPublishedUrls((prev) => ({ ...prev, instagram: res.url! }));
        onToast({
          title: 'Published to Instagram!',
          detail: `Successfully posted to @vtabsquare (Post ID: ${res.postId})`,
        });
        if (onPostPublished) {
          onPostPublished({
            campaignId: activeCampaignId,
            title: deliverables?.socialPost?.headline || brief || 'Campaign',
            brief: brief,
            imageUrl: platformImages.instagram.imageUrl || undefined,
            publishedAt: new Date().toISOString(),
            platforms: {
              instagram: { postId: res.postId || '', url: res.url! },
            },
          });
        }
      } else {
        onToast({
          title: 'Instagram publishing failed',
          detail: res.error || 'Could not publish to Instagram',
        });
      }
    } catch (err: any) {
      onToast({
        title: 'Instagram publishing failed',
        detail: err.message || 'Error occurred while publishing',
      });
    } finally {
      setPublishingPlatform(null);
    }
  };

  const primaryKb = sources.length > 0 ? sources[0].name : 'Active Knowledge Base';
  const campaignPresets = [
    {
      title: 'AI Software & Automation Launch',
      brief: 'Announce our autonomous AI software agents and custom enterprise workflow automation capabilities',
      knowledge: primaryKb,
      desc: 'Position our custom intelligent applications for enterprise teams looking to automate manual reporting and operations.',
      tag: 'AI Product Launch',
      icon: BookOpen,
    },
    {
      title: 'Cloud & Databricks Migration',
      brief: 'Position zero-downtime database migration to Databricks lakehouse architectures for data-heavy enterprises',
      knowledge: primaryKb,
      desc: 'Thought leadership addressing data debt, schema validation, and scalable cloud analytics modernization.',
      tag: 'Enterprise Data',
      icon: Target,
    },
    {
      title: 'Power BI & Executive Intelligence',
      brief: 'Showcase executive analytics, real-time KPI dashboards, and enterprise data engineering consulting',
      knowledge: primaryKb,
      desc: 'Build buyer confidence with verified business intelligence benchmarks and automated reporting pipelines.',
      tag: 'Analytics & BI',
      icon: ShieldCheck,
    },
  ];

  const agentStages = [
    { label: 'Grounding', heading: 'Grounding your brief.', agent: 'Knowledge base', activity: 'Matching your brief to useful passages in the selected sources.', doneLabel: 'Source context passed to the copywriter.', icon: BookOpen, tone: 'knowledge' },
    { label: 'Writing', heading: 'The copywriter is drafting.', agent: 'Copywriter', activity: 'Finding a clear through-line in your brief and source context.', doneLabel: 'The story is on its way to the art director.', icon: MessageCircle, tone: 'copy' },
    { label: 'Designing', heading: 'The art director is shaping it.', agent: 'Art director', activity: 'Turning the story into a distinct visual direction.', doneLabel: 'Creative direction passed to outreach.', icon: Sparkles, tone: 'design' },
    { label: 'Personalizing', heading: 'Outreach is making it personal.', agent: 'Outreach strategist', activity: 'Adapting the message to the lead’s public context.', doneLabel: 'Personal note added to your review.', icon: Send, tone: 'outreach' },
  ];
  const agentHandoffs = [
    { from: knowledgeBase || 'Knowledge base', to: 'Copywriter', detail: 'Real source passages connected to the brief.', icon: BookOpen, tone: 'knowledge' },
    { from: 'Copywriter', to: 'Art director', detail: 'Story angle shared: clarity before change.', icon: MessageCircle, tone: 'copy' },
    { from: 'Art director', to: 'Outreach strategist', detail: 'Visual direction attached: quiet confidence.', icon: Sparkles, tone: 'design' },
    { from: 'Outreach strategist', to: 'Review queue', detail: 'Personalized outreach note is ready for approval.', icon: Send, tone: 'outreach' },
  ];
  const collaborators = [
    { name: 'Copywriter', detail: 'Voice, clarity & a strong point of view', icon: MessageCircle, tone: 'copy', stage: 1 },
    { name: 'Art director', detail: 'Visual concept & creative direction', icon: Sparkles, tone: 'design', stage: 2 },
    { name: 'Outreach strategist', detail: 'Personalized follow-up for a real lead', icon: Send, tone: 'outreach', stage: 3 },
  ];
  const activeAgent = agentStages[Math.min(Math.max(agentStage, 0), agentStages.length - 1)];
  const ActiveAgentIcon = activeAgent.icon;
  const visibleHandoffs = generation === 'ready' ? agentHandoffs : agentHandoffs.slice(0, Math.max(0, agentStage));

  const generate = async () => {
    if (!brief.trim()) {
      onToast({ title: 'Add a campaign brief', detail: 'A little context gives the team a useful starting point.' });
      return;
    }
    setAgentStage(0);
    setTypedCopy('');
    setGeneration('working');
    setIsEditing(false);

    // Progressive agent stages for instant visual feedback
    const timer1 = window.setTimeout(() => setAgentStage(1), 350);
    const timer2 = window.setTimeout(() => setAgentStage(2), 850);
    const timer3 = window.setTimeout(() => setAgentStage(3), 1350);

    try {
      // Find matching knowledge chunks from the selected source
      const matchingPassages = (chunks || [])
        .filter(
          (c) =>
            !knowledgeBase ||
            c.source.toLowerCase().includes(knowledgeBase.toLowerCase()) ||
            knowledgeBase.toLowerCase().includes(c.source.toLowerCase())
        )
        .map((c) => c.text);

      // Call Gemini Multi-Agent engine (with automatic model fallback & retry)
      const result = await generateCampaignWithGemini(brief, knowledgeBase, matchingPassages);
      const nextCampaignId = `cmp-${Date.now()}`;

      let recentHistory: CreativeHistoryEntry[] = [];
      try {
        const histRes = await fetch('/api/creative-history?workspaceId=northstar-labs&limit=5');
        if (histRes.ok) {
          const histData = await histRes.json();
          if (Array.isArray(histData.history)) {
            recentHistory = histData.history;
          }
        }
      } catch {
        // Ignore history fetch errors and proceed with empty history
      }

      const campaignFacts = await extractCampaignFacts({
        brief,
        knowledgeBase,
        passages: matchingPassages,
      });

      if (
        (campaignFacts.campaignType === 'launch_event' ||
          campaignFacts.campaignType === 'product_feature') &&
        !selectedScreenshotUrl &&
        productScreenshots.length > 0
      ) {
        setSelectedScreenshotUrl(productScreenshots[0].url);
      }

      const creativeConcepts = await generateArtDirectorConcepts({
        brief,
        knowledgeBase,
        passages: matchingPassages,
        postCopy: result.socialPost.body,
        facts: campaignFacts,
        recentHistory,
      });

      setActiveCampaignId(nextCampaignId);
      setPlatformImages(createInitialPlatformImages());
      setDeliverables({ ...result, campaignFacts, creativeConcepts });
      setEditedCopy(result.socialPost.body);

      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);

      window.setTimeout(() => {
        setAgentStage(4);
        setGeneration('ready');

        if (onSaveWorkflow) {
          onSaveWorkflow({
            id: `wf-${Date.now()}`,
            title: brief.length > 34 ? brief.slice(0, 34) + '…' : brief,
            brief,
            knowledgeBase,
            status: 'Completed',
            createdAt: 'Just now',
            duration: '1.8s',
            itemsProduced: 5,
            triggerType: 'Manual Brief',
            tags: ['Marketing Bot', 'Gemini Flash', 'Multi-Agent'],
            nodes: defaultCampaignNodes,
            edges: defaultCampaignEdges,
            outputs: {
              social: {
                platform: 'LinkedIn',
                headline: result.socialPost.headline,
                body: result.socialPost.body,
                tags: result.socialPost.tags,
              },
              artDirection: {
                title: 'NORTHSTAR / FIELD NOTES',
                headline: result.visualDirection.headline,
                caption: result.visualDirection.caption,
                aspectRatio: result.visualDirection.aspectRatio,
                palette: result.visualDirection.palette,
              },
              dm: {
                recipient: result.personalizedDm.recipient,
                role: result.personalizedDm.role,
                company: result.personalizedDm.company,
                intent: result.personalizedDm.intent,
                body: result.personalizedDm.body,
              },
            },
          });
        }
      }, 300);
    } catch (err) {
      console.warn('Generation error, using fallback:', err);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
      window.setTimeout(() => {
        setAgentStage(4);
        setGeneration('ready');
      }, 300);
    }

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
    };
  };

  useEffect(() => {
    if (generation !== 'working' || agentStage !== 1) return;
    const targetText = deliverables?.socialPost?.body || currentSocialCopy;
    let cursor = 0;
    const timer = window.setInterval(() => {
      cursor = Math.min(cursor + 4, targetText.length);
      setTypedCopy(targetText.slice(0, cursor));
      if (cursor >= targetText.length) window.clearInterval(timer);
    }, 22);
    return () => window.clearInterval(timer);
  }, [generation, agentStage, deliverables, currentSocialCopy]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onToast({ title: 'Ready to copy', detail: 'Select the draft text and copy it from your browser.' });
    }
  };

  const handleSendForApproval = (channelName: string, title: string, text: string) => {
    if (onAddApproval) {
      onAddApproval({
        type: channelName,
        title,
        recipient: 'VTAB Pilot Workspace',
        detail: text.slice(0, 100) + '…',
        badge: 'High intent match',
      });
    }
    onToast({
      title: `${channelName} added to approval queue`,
      detail: 'Your draft has been sent to the Overview page for human review.',
    });
  };

  return (
    <>
      <PageHeader eyebrow="CAMPAIGNS / MARKETING BOT" title="Make the next move matter." description="A small team of agents turns your point of view into thoughtful, ready-to-review work.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="campaign-state">
            <span className="campaign-state-mark"><Sparkles size={13} /></span>
            {generation === 'working' ? '3 agents in sync' : generation === 'ready' ? '3 agents complete' : '3 agents ready'}
          </div>
          <PrimaryButton icon={Sparkles} onClick={() => setModalOpen(true)} disabled={generation === 'working'}>
            {generation === 'ready' ? 'New campaign' : 'Create campaign'}
          </PrimaryButton>
        </div>
      </PageHeader>

      <div className="campaign-full-workspace">
        {generation === 'idle' ? (
          <div className="campaign-idle-hero signal-card">
            <div className="campaign-hero-orb">
              <Sparkles size={26} />
            </div>
            <div className="eyebrow" style={{ color: '#4d6930', marginBottom: 4, letterSpacing: '0.8px' }}>MULTI-AGENT WORKSPACE</div>
            <h2>Orchestrate your content campaign.</h2>
            <p>
              Launch a synchronized multi-agent workflow. Vtab coordinates your Copywriter, Art Director, and Outreach Strategist to research your knowledge base, draft high-converting copy, design visuals, and craft 1:1 outreach — all with human approval.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PrimaryButton icon={Sparkles} onClick={() => setModalOpen(true)}>
                Create campaign
              </PrimaryButton>
              {onNavigate && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onNavigate('workflows')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Workflow size={14} />
                  View all workflows
                </button>
              )}
            </div>

            <div className="campaign-presets-wrap">
              <span className="presets-label">START WITH A PROVEN CAMPAIGN TEMPLATE</span>
              <div className="campaign-presets-grid">
                {campaignPresets.map((preset) => {
                  const PresetIcon = preset.icon;
                  return (
                    <button
                      key={preset.title}
                      type="button"
                      className="campaign-preset-card"
                      onClick={() => {
                        setBrief(preset.brief);
                        setKnowledgeBase(preset.knowledge);
                        setModalOpen(true);
                      }}
                    >
                      <div className="preset-card-head">
                        <PresetIcon size={15} className="preset-icon" />
                        <span className="preset-tag">{preset.tag}</span>
                      </div>
                      <strong>{preset.title}</strong>
                      <p>{preset.desc}</p>
                      <span className="preset-action">Configure & run →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="campaign-output full-card signal-card">
            <div className="output-header">
              <div>
                <div className="eyebrow">
                  {generation === 'working' ? 'ORCHESTRATING AGENTS' : 'CAMPAIGN READY FOR REVIEW'}
                </div>
                <h2>
                  {generation === 'ready'
                    ? 'Your campaign package is ready.'
                    : generation === 'working'
                    ? activeAgent.heading
                    : 'A good idea, made useful.'}
                </h2>
                <p>
                  {generation === 'ready'
                    ? `Synthesized by Copywriter, Art Director, and Outreach Strategist using ${knowledgeBase}.`
                    : generation === 'working'
                    ? activeAgent.activity
                    : 'Your drafts will show up here for a final human review.'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModalOpen(true)}
                  disabled={generation === 'working'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '7px 12px' }}
                >
                  <Sparkles size={13} />
                  New campaign
                </button>
                <div className={`output-orbit${generation === 'working' ? ' orbit-working' : ''}`}>
                  <Sparkles size={20} />
                </div>
              </div>
            </div>

            <div className="agent-steps">
              {agentStages.map((step, index) => {
                const Icon = step.icon;
                const done = generation === 'ready' || (generation === 'working' && index < agentStage);
                const active = generation === 'working' && index === agentStage;
                return (
                  <div className={`agent-step${done ? ' done' : ''}${active ? ' step-active' : ''}`} key={step.label}>
                    <span className="step-indicator">
                      {done ? <Check size={12} /> : active ? <LoaderCircle size={11} className="step-spinner" /> : index + 1}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <span>{done ? step.doneLabel : active ? 'Working now' : 'Queued'}</span>
                    </div>
                    {index < agentStages.length - 1 && <i className={`step-connector${done ? ' connector-done' : ''}`} />}
                  </div>
                );
              })}
            </div>

            <div className={`collaboration-panel${generation === 'working' ? ' collaboration-working' : ' collaboration-complete'}`}>
              <div className="collaboration-head">
                <div>
                  <div className="eyebrow">AGENT HANDOFFS</div>
                  <span>One shared brief, passed forward across agents.</span>
                </div>
                <div className={`collaboration-live${generation === 'working' ? ' live-now' : ''}`}>
                  <i />
                  {generation === 'working' ? 'LIVE RUN (GEMINI 3.5 FLASH)' : 'RUN COMPLETE'}
                </div>
              </div>
              <div className="handoff-list">
                {visibleHandoffs.map((handoff, index) => {
                  const Icon = handoff.icon;
                  return (
                    <div className="handoff-row" key={`${handoff.from}-${handoff.to}`} style={{ animationDelay: `${index * 90}ms` }}>
                      <div className={`handoff-avatar handoff-${handoff.tone}`}>
                        <Icon size={13} />
                      </div>
                      <div className="handoff-message">
                        <div className="handoff-route">
                          <strong>{handoff.from}</strong>
                          <ArrowRight size={11} />
                          <strong>{handoff.to}</strong>
                        </div>
                        <span>{handoff.detail}</span>
                      </div>
                      <Check size={13} className="handoff-check" />
                    </div>
                  );
                })}
              </div>
              {generation === 'working' ? (
                <div className={`active-agent-card agent-${activeAgent.tone}`}>
                  <div className={`active-agent-avatar handoff-${activeAgent.tone}`}>
                    <ActiveAgentIcon size={15} />
                  </div>
                  <div className="active-agent-copy">
                    <div className="active-agent-title">
                      <strong>{activeAgent.agent}</strong>
                      <span><i />Working</span>
                    </div>
                    <p>{activeAgent.activity}</p>
                    {agentStage === 1 && (
                      <div className="typing-preview">
                        <div className="typing-preview-head">
                          <span><i />LIVE COPY STREAM</span>
                          <small>PASSING TO ART DIRECTION</small>
                        </div>
                        <p>{typedCopy}<i className="typing-caret" /></p>
                      </div>
                    )}
                  </div>
                  <LoaderCircle size={15} className="active-agent-spinner" />
                </div>
              ) : (
                <div className="collaboration-summary">
                  <span><Check size={13} /></span>
                  <div>
                    <strong>All agent handoffs complete</strong>
                    <p>LinkedIn, Twitter/X thread, Cold Email sequence, Newsletter, and 1:1 outreach generated.</p>
                  </div>
                  <small>4 / 4 Complete</small>
                </div>
              )}
            </div>

            {generation === 'ready' && (
              <>
                {/* Multi-Channel Deliverable Switcher */}
                <div className="output-tabs" style={{ flexWrap: 'wrap' }}>
                  {([
                    { id: 'facebook', label: 'Facebook Post', icon: Facebook },
                    { id: 'instagram', label: 'Instagram Post', icon: Instagram },
                    { id: 'social', label: 'LinkedIn Post', icon: Linkedin },
                    { id: 'twitter', label: 'Twitter/X Thread', icon: Hash },
                    { id: 'email', label: 'Cold Email', icon: Mail },
                    { id: 'newsletter', label: 'Newsletter', icon: FileText },
                    { id: 'visual', label: 'Visual Specs', icon: Sparkles },
                    { id: 'dm', label: 'Personal DM', icon: Send },
                  ] as const).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} className={channel === item.id ? 'active' : ''} onClick={() => { setChannel(item.id); setIsEditing(false); }}>
                        <Icon size={14} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* 1. Official Facebook Page Tab */}
                {channel === 'facebook' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar" style={{ background: '#1877F2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Facebook size={16} />
                      </div>
                      <div>
                        <strong>Vtab Square</strong>
                        <span>Official Facebook Page · Ready to publish</span>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            if (!isEditing) setEditedCopy(deliverables?.facebookPost?.body || deliverables?.socialPost?.body || currentSocialCopy);
                            setIsEditing(!isEditing);
                          }}
                          style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit3 size={13} /> {isEditing ? 'Cancel Edit' : 'Edit Draft'}
                        </button>
                      </div>
                    </div>

                    {publishedUrls.facebook && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={15} color="#16a34a" /> Live on Facebook Page!
                        </span>
                        <a href={publishedUrls.facebook} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#15803d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          View Live Post <ExternalLink size={12} />
                        </a>
                      </div>
                    )}

                    <PlatformImageStudio
                      platform="facebook"
                      state={platformImages.facebook}
                      concepts={deliverables?.creativeConcepts || []}
                      campaignFacts={deliverables?.campaignFacts}
                      customEventDetails={customEventDetails}
                      onCustomEventDetailsChange={setCustomEventDetails}
                      screenshots={productScreenshots}
                      selectedScreenshotUrl={selectedScreenshotUrl}
                      onSelectScreenshot={setSelectedScreenshotUrl}
                      onUploadAsset={handleUploadProductAsset}
                      showCtaButton={showCtaButton}
                      onToggleCtaButton={setShowCtaButton}
                      aiDisclosure={aiDisclosure.facebook}
                      onToggleAiDisclosure={(next) =>
                        setAiDisclosure((prev) => ({ ...prev, facebook: next }))
                      }
                      onSelectConcept={(concept) => handleSelectConcept('facebook', concept)}
                      onSurpriseMe={() => handleSurpriseMe('facebook')}
                      onPromptChange={(nextPrompt) =>
                        setPlatformImages((prev) => ({
                          ...prev,
                          facebook: { ...prev.facebook, prompt: nextPrompt },
                        }))
                      }
                      onRegenerate={() => void generatePlatformImage('facebook')}
                    />

                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <textarea
                          rows={8}
                          value={editedCopy}
                          onChange={(e) => setEditedCopy(e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #d4ded1', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.5 }}
                        />
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            if (deliverables) {
                              setDeliverables({
                                ...deliverables,
                                facebookPost: {
                                  headline: deliverables.facebookPost?.headline || deliverables.socialPost?.headline || 'Vtab Update',
                                  body: editedCopy,
                                  tags: deliverables.facebookPost?.tags || ['VtabSquare', 'AI'],
                                },
                              });
                            }
                            setIsEditing(false);
                            onToast({ title: 'Draft updated', detail: 'Changes saved for Facebook deliverable.' });
                          }}
                          style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '12.5px' }}
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 style={{ margin: '0 0 10px', fontSize: '15px', color: '#142019' }}>
                          {deliverables?.facebookPost?.headline || deliverables?.socialPost?.headline || `Accelerating enterprise intelligence with Vtab Square.`}
                        </h3>
                        <p className="social-copy" style={{ whiteSpace: 'pre-wrap' }}>
                          {deliverables?.facebookPost?.body || deliverables?.socialPost?.body || currentSocialCopy}
                        </p>
                      </>
                    )}

                    <div className="draft-tags">
                      {(deliverables?.facebookPost?.tags || deliverables?.socialPost?.tags || ['VtabSquare', 'AI', 'Innovation']).map((t) => (
                        <span key={t}>#{t.replace(/^#/, '')}</span>
                      ))}
                    </div>

                    <div className="draft-actions" style={{ flexWrap: 'wrap', gap: '10px' }}>
                      <button className="secondary-button" onClick={() => copyText(formatFacebookDraftText())}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy draft'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('Facebook Post', brief, formatFacebookDraftText())}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={publishingPlatform === 'facebook'}
                        onClick={handlePublishToFacebook}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1877F2', borderColor: '#1877F2', color: '#fff', marginLeft: 'auto' }}
                      >
                        {publishingPlatform === 'facebook' ? (
                          <>
                            <LoaderCircle size={14} className="active-agent-spinner" />
                            Publishing to Facebook...
                          </>
                        ) : (
                          <>
                            <Facebook size={14} />
                            Publish to Facebook Page
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Official Instagram Account Tab */}
                {channel === 'instagram' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar" style={{ background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Instagram size={16} />
                      </div>
                      <div>
                        <strong>@vtabsquare</strong>
                        <span>Official Instagram Business · Ready to publish</span>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            if (!isEditing) setEditedCopy(deliverables?.instagramPost?.caption || deliverables?.socialPost?.body || currentSocialCopy);
                            setIsEditing(!isEditing);
                          }}
                          style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit3 size={13} /> {isEditing ? 'Cancel Edit' : 'Edit Caption'}
                        </button>
                      </div>
                    </div>

                    {publishedUrls.instagram && (
                      <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12.5px', color: '#9d174d', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={15} color="#db2777" /> Live on Instagram @vtabsquare!
                        </span>
                        <a href={publishedUrls.instagram} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#be185d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          View Live Post <ExternalLink size={12} />
                        </a>
                      </div>
                    )}

                    <PlatformImageStudio
                      platform="instagram"
                      state={platformImages.instagram}
                      concepts={deliverables?.creativeConcepts || []}
                      campaignFacts={deliverables?.campaignFacts}
                      customEventDetails={customEventDetails}
                      onCustomEventDetailsChange={setCustomEventDetails}
                      screenshots={productScreenshots}
                      selectedScreenshotUrl={selectedScreenshotUrl}
                      onSelectScreenshot={setSelectedScreenshotUrl}
                      onUploadAsset={handleUploadProductAsset}
                      showCtaButton={showCtaButton}
                      onToggleCtaButton={setShowCtaButton}
                      aiDisclosure={aiDisclosure.instagram}
                      onToggleAiDisclosure={(next) =>
                        setAiDisclosure((prev) => ({ ...prev, instagram: next }))
                      }
                      onSelectConcept={(concept) => handleSelectConcept('instagram', concept)}
                      onSurpriseMe={() => handleSurpriseMe('instagram')}
                      onPromptChange={(nextPrompt) =>
                        setPlatformImages((prev) => ({
                          ...prev,
                          instagram: { ...prev.instagram, prompt: nextPrompt },
                        }))
                      }
                      onRegenerate={() => void generatePlatformImage('instagram')}
                    />

                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <textarea
                          rows={8}
                          value={editedCopy}
                          onChange={(e) => setEditedCopy(e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #d4ded1', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.5 }}
                        />
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            if (deliverables) {
                              setDeliverables({
                                ...deliverables,
                                instagramPost: {
                                  caption: editedCopy,
                                  hashtags: deliverables.instagramPost?.hashtags || ['#VtabSquare', '#AI'],
                                },
                              });
                            }
                            setIsEditing(false);
                            onToast({ title: 'Caption updated', detail: 'Changes saved for Instagram deliverable.' });
                          }}
                          style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '12.5px' }}
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <p className="social-copy" style={{ whiteSpace: 'pre-wrap', fontSize: '13.5px' }}>
                        {deliverables?.instagramPost?.caption || 
                          `🚀 Transforming enterprise intelligence.\n\n${deliverables?.socialPost?.body || currentSocialCopy}\n\n🔗 Link in bio to explore our platform.\n\n#VtabSquare #AI #Innovation #EnterpriseTech`}
                      </p>
                    )}

                    <div className="draft-tags">
                      {(deliverables?.instagramPost?.hashtags || ['#VtabSquare', '#AI', '#EnterpriseTech', '#Innovation']).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>

                    <div className="draft-actions" style={{ flexWrap: 'wrap', gap: '10px' }}>
                      <button className="secondary-button" onClick={() => copyText(deliverables?.instagramPost?.caption || currentSocialCopy)}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy caption'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('Instagram Post', brief, deliverables?.instagramPost?.caption || currentSocialCopy)}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={publishingPlatform === 'instagram'}
                        onClick={handlePublishToInstagram}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)', borderColor: 'transparent', color: '#fff', marginLeft: 'auto' }}
                      >
                        {publishingPlatform === 'instagram' ? (
                          <>
                            <LoaderCircle size={14} className="active-agent-spinner" />
                            Publishing to @vtabsquare...
                          </>
                        ) : (
                          <>
                            <Instagram size={14} />
                            Publish to @vtabsquare
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* 1. LinkedIn Social Post Tab */}
                {channel === 'social' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar"><SignalMark small /></div>
                      <div>
                        <strong>VTAB Square</strong>
                        <span>LinkedIn · Draft for review</span>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            if (!isEditing) setEditedCopy(deliverables?.socialPost?.body || currentSocialCopy);
                            setIsEditing(!isEditing);
                          }}
                          style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit3 size={13} /> {isEditing ? 'Cancel Edit' : 'Edit Draft'}
                        </button>
                      </div>
                    </div>

                    <PlatformImageStudio
                      platform="linkedin"
                      state={platformImages.linkedin}
                      concepts={deliverables?.creativeConcepts || []}
                      campaignFacts={deliverables?.campaignFacts}
                      customEventDetails={customEventDetails}
                      onCustomEventDetailsChange={setCustomEventDetails}
                      screenshots={productScreenshots}
                      selectedScreenshotUrl={selectedScreenshotUrl}
                      onSelectScreenshot={setSelectedScreenshotUrl}
                      onUploadAsset={handleUploadProductAsset}
                      showCtaButton={showCtaButton}
                      onToggleCtaButton={setShowCtaButton}
                      aiDisclosure={aiDisclosure.linkedin}
                      onToggleAiDisclosure={(next) =>
                        setAiDisclosure((prev) => ({ ...prev, linkedin: next }))
                      }
                      onSelectConcept={(concept) => handleSelectConcept('linkedin', concept)}
                      onSurpriseMe={() => handleSurpriseMe('linkedin')}
                      onPromptChange={(nextPrompt) =>
                        setPlatformImages((prev) => ({
                          ...prev,
                          linkedin: { ...prev.linkedin, prompt: nextPrompt },
                        }))
                      }
                      onRegenerate={() => void generatePlatformImage('linkedin')}
                    />

                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <textarea
                          rows={8}
                          value={editedCopy}
                          onChange={(e) => setEditedCopy(e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #d4ded1', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.5 }}
                        />
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            if (deliverables) {
                              setDeliverables({
                                ...deliverables,
                                socialPost: { ...deliverables.socialPost, body: editedCopy },
                              });
                            }
                            setIsEditing(false);
                            onToast({ title: 'Draft updated', detail: 'Changes saved to this deliverable.' });
                          }}
                          style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '12.5px' }}
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 style={{ margin: '0 0 10px', fontSize: '15px', color: '#142019' }}>
                          {deliverables?.socialPost?.headline || `A smoother ${targetWord} starts before the first file moves.`}
                        </h3>
                        <p className="social-copy" style={{ whiteSpace: 'pre-wrap' }}>
                          {deliverables?.socialPost?.body || currentSocialCopy}
                        </p>
                      </>
                    )}

                    <div className="draft-tags">
                      {(deliverables?.socialPost?.tags || ['Product-led', 'Helpful, not hype', 'Engineering']).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>

                    <div className="draft-actions">
                      <button className="secondary-button" onClick={() => copyText(deliverables?.socialPost?.body || currentSocialCopy)}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy draft'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('LinkedIn Post', brief, deliverables?.socialPost?.body || currentSocialCopy)}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Twitter / X Thread Tab */}
                {channel === 'twitter' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar"><Hash size={14} /></div>
                      <div>
                        <strong>Northstar Tech Lead</strong>
                        <span>X (Twitter) · 5-Tweet Thread</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0' }}>
                      {(deliverables?.twitterThread || [
                        { index: 1, text: `Most enterprise ${targetWord}s fail before the first file moves. Here is the framework high-growth teams use: 🧵👇`, charCount: 140 },
                        { index: 2, text: `1. Run an unreferenced field audit before touching pipelines. Moving garbage compounds schema drift.`, charCount: 120 },
                        { index: 3, text: `2. Explicit table ownership. A single named engineer beats a group alias every time.`, charCount: 110 },
                        { index: 4, text: `3. Sandbox simulation with transaction replays protects live customer state.`, charCount: 105 },
                        { index: 5, text: `Check out our free 6-phase checklist: link in bio.`, charCount: 65 },
                      ]).map((tweet) => (
                        <div key={tweet.index} style={{ background: '#f8faf7', border: '1px solid #e5ede3', borderRadius: 8, padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#68776b', marginBottom: 4 }}>
                            <strong>Tweet {tweet.index} / 5</strong>
                            <span>{tweet.text.length} chars</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '13.5px', color: '#1a271f' }}>{tweet.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="draft-actions">
                      <button className="secondary-button" onClick={() => copyText(deliverables?.twitterThread?.map((t) => t.text).join('\n\n') || '')}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy thread'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('Twitter Thread', brief, deliverables?.twitterThread?.[0]?.text || '')}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Cold Email Sequence Tab */}
                {channel === 'email' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar"><Mail size={14} /></div>
                      <div>
                        <strong>Enterprise Outbound Sequence</strong>
                        <span>3-Touch Cadence</span>
                      </div>
                    </div>
                    <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ background: '#f8faf7', border: '1px solid #e2ece0', borderRadius: 8, padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#566a59' }}>SUBJECT LINE:</span>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#142019', marginTop: 2 }}>
                          {deliverables?.coldEmail?.subject || `Question regarding your ${targetWord} roadmap`}
                        </div>
                      </div>
                      <div style={{ background: '#ffffff', border: '1px solid #e1e7de', borderRadius: 8, padding: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#46672c', marginBottom: 6 }}>TOUCH 1 (RELEVANCE HOOK)</div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                          {deliverables?.coldEmail?.touch1 || `Hi Mara — saw your team discussing platform cutover deadlines.`}
                        </p>
                      </div>
                      <div style={{ background: '#ffffff', border: '1px solid #e1e7de', borderRadius: 8, padding: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#46672c', marginBottom: 6 }}>TOUCH 2 (RISK & BENCHMARK)</div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                          {deliverables?.coldEmail?.touch2 || `We put together an enterprise checklist mapping the 6 common failure modes teams run into.`}
                        </p>
                      </div>
                      <div style={{ background: '#ffffff', border: '1px solid #e1e7de', borderRadius: 8, padding: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#46672c', marginBottom: 6 }}>TOUCH 3 (SOFT CTA)</div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                          {deliverables?.coldEmail?.touch3 || `Would it be helpful if I shared the 1-page PDF summary? No pitch, just practical benchmarks.`}
                        </p>
                      </div>
                    </div>
                    <div className="draft-actions">
                      <button className="secondary-button" onClick={() => copyText(`Subject: ${deliverables?.coldEmail?.subject}\n\n${deliverables?.coldEmail?.touch1}\n\n${deliverables?.coldEmail?.touch2}\n\n${deliverables?.coldEmail?.touch3}`)}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy sequence'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('Cold Email Sequence', deliverables?.coldEmail?.subject || brief, deliverables?.coldEmail?.touch1 || '')}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Newsletter Tab */}
                {channel === 'newsletter' && (
                  <div className="draft-content">
                    <div className="draft-meta">
                      <div className="draft-brand-avatar"><FileText size={14} /></div>
                      <div>
                        <strong>Editorial Field Notes</strong>
                        <span>Customer Newsletter Edition</span>
                      </div>
                    </div>
                    <div style={{ margin: '14px 0' }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#142019' }}>
                        {deliverables?.newsletter?.title || `Field Notes: Engineering the ${targetWord}`}
                      </h3>
                      <p style={{ fontSize: '13.5px', color: '#4d5d51', lineHeight: 1.5, marginBottom: 12 }}>
                        {deliverables?.newsletter?.intro || `Why the cleanest technical transitions happen weeks before DNS records change.`}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {(deliverables?.newsletter?.insights || [
                          'Pre-migration data auditing eliminates 40% of post-launch schema drift.',
                          'Idempotent write logs protect customer state during parallel runs.',
                          'Executive peace of mind comes from verified rollback triggers.',
                        ]).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#1a271f' }}>
                            <CheckCircle2 size={14} color="#3c6b1d" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: '#f5faf2', borderLeft: '3px solid #c9f36a', padding: '10px 14px', fontSize: '12.5px', fontStyle: 'italic', color: '#274216' }}>
                        “{deliverables?.newsletter?.takeaway || 'True speed is built on quiet verification.'}”
                      </div>
                    </div>
                    <div className="draft-actions">
                      <button className="secondary-button" onClick={() => copyText(`${deliverables?.newsletter?.title}\n\n${deliverables?.newsletter?.intro}\n\n${deliverables?.newsletter?.insights?.join('\n')}`)}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy bulletin'}
                      </button>
                      <button
                        className="review-button"
                        onClick={() => handleSendForApproval('Newsletter Edition', deliverables?.newsletter?.title || brief, deliverables?.newsletter?.intro || '')}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. Visual Direction Tab */}
                {channel === 'visual' && (
                  <div className="visual-output">
                    <div className="visual-meta">
                      <span><Sparkles size={13} />ART DIRECTION</span>
                      <button className="plain-icon-button" onClick={() => onToast({ title: 'Visual concept saved', detail: 'The art direction is ready to hand off.' })}>
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="creative-preview">
                      <div className="creative-topline">NORTHSTAR / FIELD NOTES <span>NO. 04</span></div>
                      <div className="creative-headline">
                        {deliverables?.visualDirection?.headline || <>A clearer<br /><em>way through.</em></>}
                      </div>
                      <div className="creative-orbit creative-orbit-one" />
                      <div className="creative-orbit creative-orbit-two" />
                      <div className="creative-footline">
                        <span>THE MIGRATION READINESS CHECKLIST</span>
                        <span>01 — 06</span>
                      </div>
                    </div>
                    <div className="visual-caption">
                      <strong>{deliverables?.visualDirection?.aestheticTheme || 'Quiet confidence'}</strong>
                      <span>{deliverables?.visualDirection?.caption || 'Editorial type, warm paper and a single path through complexity.'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: 10 }}>
                      {(deliverables?.visualDirection?.palette || ['#142019', '#c9f36a', '#ffffff']).map((color) => (
                        <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#68776b' }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: color, border: '1px solid #ccc' }} />
                          <span>{color}</span>
                        </div>
                      ))}
                    </div>
                    <button className="secondary-button full-button" style={{ marginTop: 12 }} onClick={() => onToast({ title: 'Visual direction saved', detail: 'Your campaign creative is ready for review.' })}>
                      <Check size={14} />
                      Save visual direction
                    </button>
                  </div>
                )}

                {/* 6. Personal DM Tab with Matching Leads */}
                {channel === 'dm' && (
                  <div className="dm-output" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Matching Leads Header & Filter Toggle */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'rgba(201, 243, 106, 0.08)',
                      borderRadius: '8px',
                      border: '1px solid rgba(201, 243, 106, 0.3)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Target size={15} style={{ color: '#2d4b1a' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#17221b' }}>
                          Matching Prospects for this Campaign
                        </span>
                        <span style={{
                          fontSize: '11px',
                          background: '#c9f36a',
                          color: '#142019',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}>
                          {matchingLeads.length} matched
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setShowOnlyMatchingLeads(!showOnlyMatchingLeads)}
                          style={{
                            background: showOnlyMatchingLeads ? '#142019' : '#fff',
                            color: showOnlyMatchingLeads ? '#c9f36a' : '#57675b',
                            border: '1px solid #d0d7cf',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          {showOnlyMatchingLeads ? 'Matching Only' : `All Leads (${leads.length})`}
                        </button>
                      </div>
                    </div>

                    {/* Matching Leads Horizontal Selector */}
                    {displayedDmLeads.length > 0 ? (
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        overflowX: 'auto',
                        paddingBottom: '4px'
                      }}>
                        {displayedDmLeads.map((ld) => {
                          const isSelected = activeDmLead?.id === ld.id;
                          return (
                            <div
                              key={ld.id}
                              onClick={() => setSelectedDmLeadId(ld.id)}
                              style={{
                                flex: '0 0 auto',
                                minWidth: '180px',
                                maxWidth: '240px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: isSelected ? 'rgba(201, 243, 106, 0.15)' : '#ffffff',
                                border: isSelected ? '2px solid #5d8c28' : '1px solid #e1e7de',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <div className={`avatar avatar-${ld.color || 'sage'}`} style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                                {ld.initials}
                              </div>
                              <div style={{ overflow: 'hidden', textAlign: 'left', flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#17221b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ld.name}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#68776b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ld.role}
                                </div>
                              </div>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#2d4b1a', background: 'rgba(201,243,106,.4)', padding: '2px 5px', borderRadius: '4px' }}>
                                {ld.intent}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#68776b', background: '#f9faf8', borderRadius: '8px' }}>
                        No matching leads found for this campaign theme yet.{' '}
                        {onNavigate && (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => onNavigate('leadbot')}
                            style={{ fontWeight: 600, color: '#1f3a14', cursor: 'pointer' }}
                          >
                            Find prospects in Lead Bot →
                          </button>
                        )}
                      </div>
                    )}

                    {/* Active Selected Lead Card & Signal */}
                    {activeDmLead && (
                      <div style={{
                        padding: '12px 14px',
                        background: '#f8faf7',
                        borderRadius: '8px',
                        border: '1px solid #e2e8de',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className={`avatar avatar-${activeDmLead.color || 'sage'}`}>
                              {activeDmLead.initials}
                            </div>
                            <div>
                              <strong style={{ fontSize: '13px', color: '#17221b' }}>{activeDmLead.name}</strong>
                              <span style={{ display: 'block', fontSize: '11px', color: '#68776b' }}>
                                {activeDmLead.role} <i>at</i> {activeDmLead.company}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', background: 'rgba(201, 243, 106, 0.4)', color: '#213b10', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
                              {activeDmLead.intent}% intent
                            </span>
                            {activeDmLead.sourceUrl && (
                              <a
                                href={activeDmLead.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  color: '#2a5a1f',
                                  textDecoration: 'none',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: '#fff',
                                  border: '1px solid #d4ded2'
                                }}
                              >
                                {activeDmLead.source} <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        </div>

                        {activeDmLead.excerpt && (
                          <div style={{
                            fontSize: '11.5px',
                            color: '#47544a',
                            background: '#ffffff',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            borderLeft: '3px solid #b2e448',
                            fontStyle: 'italic'
                          }}>
                            “{activeDmLead.excerpt}”
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tailored DM Bubble */}
                    <div className="dm-bubble" style={{ marginTop: 0 }}>
                      <div className="dm-bubble-label">
                        <span className="green-pulse" />
                        TAILORED TO {activeDmLead?.name?.toUpperCase() || 'PROSPECT'} & CAMPAIGN CONTEXT
                      </div>
                      <p style={{ whiteSpace: 'pre-line' }}>
                        {getTailoredDmText(activeDmLead)}
                      </p>
                    </div>

                    <div className="dm-context">
                      <ShieldCheck size={14} />
                      <span>Directly references the prospect's public buying signal and connects it to VTAB's value proposition.</span>
                    </div>

                    {/* Actions: Copy, Open & Send, Send for Approval */}
                    <div className="draft-actions">
                      <button
                        className="secondary-button"
                        onClick={() => copyText(getTailoredDmText(activeDmLead))}
                      >
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy message'}
                      </button>

                      {activeDmLead?.sourceUrl && (
                        <a
                          href={activeDmLead.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary-button"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none'
                          }}
                        >
                          <ExternalLink size={14} />
                          Open on {activeDmLead.source.split(' · ')[0]} to DM
                        </a>
                      )}

                      <button
                        className="review-button"
                        onClick={() => {
                          const recipient = activeDmLead
                            ? `${activeDmLead.name} (${activeDmLead.role} at ${activeDmLead.company})`
                            : (deliverables?.personalizedDm?.recipient || 'Prospect');
                          const text = getTailoredDmText(activeDmLead);
                          handleSendForApproval(
                            'Personal DM',
                            `${recipient} · ${brief || 'Campaign outreach'}`,
                            text
                          );
                        }}
                      >
                        <ShieldCheck size={14} />
                        Send for approval
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="output-footer">
              <span><ShieldCheck size={13} />Human approval stays on</span>
              {generation === 'ready' && onNavigate && (
                <button
                  type="button"
                  className="view-in-workflows-btn"
                  onClick={() => onNavigate('workflows')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(201,243,106,.22)',
                    color: '#213a0e',
                    border: '1px solid #b8e64c',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Workflow size={13} />
                  View in Workflows Canvas →
                </button>
              )}
              <span>{generation === 'ready' ? `Grounded in ${knowledgeBase}` : 'Your sources stay private'}</span>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="campaign-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="campaign-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-modal-title">
            <div className="campaign-modal-head">
              <div className="modal-title-group">
                <span className="modal-badge"><Sparkles size={11} /> MULTI-AGENT SETUP</span>
                <h2 id="campaign-modal-title">Create campaign</h2>
                <p>Provide your direction. Specialist agents will coordinate to draft copy, visuals, and outreach.</p>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close modal">
                <X size={17} />
              </button>
            </div>

            <div className="campaign-modal-body">
              <div className="builder-section">
                <div className="builder-heading">
                  <span className="step-number">01</span>
                  <div>
                    <h2>Start with the brief.</h2>
                    <p>What do you want this campaign to say?</p>
                  </div>
                </div>
                <label htmlFor="campaign-brief-input" className="field-label">CAMPAIGN DIRECTION</label>
                <textarea
                  id="campaign-brief-input"
                  className="campaign-brief"
                  rows={4}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="Share a launch, insight or customer moment…"
                  autoFocus
                />
                <div className="brief-foot">
                  <span><span className="green-pulse" />{brief.length} characters</span>
                  <span>Keep it human. Vtab will handle the first draft.</span>
                </div>
              </div>

              <div className="builder-section builder-section-border">
                <div className="builder-heading">
                  <span className="step-number">02</span>
                  <div>
                    <h2>Choose what grounds it.</h2>
                    <p>Selected sources keep your message on-brand and accurate.</p>
                  </div>
                </div>
                <label className="field-label" htmlFor="campaign-knowledge-select">KNOWLEDGE BASE</label>
                <div className="select-wrap">
                  <BookOpen size={16} />
                  <select
                    id="campaign-knowledge-select"
                    value={knowledgeBase}
                    onChange={(event) => setKnowledgeBase(event.target.value)}
                  >
                    {sources.length > 0 ? (
                      sources.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name} ({s.kind} · {s.chunks} chunks)
                        </option>
                      ))
                    ) : (
                      <option value="">No sources connected (add one in Sources tab)</option>
                    )}
                  </select>
                  <ChevronDown size={15} />
                </div>
                <div className="selected-source-note">
                  <ShieldCheck size={14} />
                  {sources.length > 0
                    ? `${sources.length} ${sources.length === 1 ? 'source' : 'sources'} · ${sources.reduce((sum, s) => sum + s.chunks, 0)} searchable chunks ready`
                    : 'No knowledge sources connected yet. Add one in the Sources tab.'}
                </div>
              </div>

              <div className="builder-section builder-section-border">
                <div className="builder-heading">
                  <span className="step-number">03</span>
                  <div>
                    <h2>Assigned agent specialists.</h2>
                    <p>Each specialist shapes a different part of the campaign.</p>
                  </div>
                </div>
                {collaborators.map((collaborator) => {
                  const Icon = collaborator.icon;
                  return (
                    <div className="collaborator-row" key={collaborator.name}>
                      <div className={`collaborator-avatar collab-${collaborator.tone}`}>
                        <Icon size={15} />
                      </div>
                      <div>
                        <strong>{collaborator.name}</strong>
                        <span>{collaborator.detail}</span>
                      </div>
                      <span className="collaborator-ready">Ready</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="campaign-modal-footer">
              <div className="approval-reminder">
                <ShieldCheck size={15} />
                <span>Nothing sends without your approval.</span>
              </div>
              <PrimaryButton
                icon={Sparkles}
                onClick={() => {
                  setModalOpen(false);
                  generate();
                }}
              >
                Dispatch agents & create campaign
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsPage({ onToast }: { onToast: (toast: ToastMessage) => void }) {
  const [threshold, setThreshold] = useState(75);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [citations, setCitations] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [chunkSize, setChunkSize] = useState(700);
  const [integrations, setIntegrations] = useState({ Salesforce: false, Slack: false });
  const [socialTokens, setSocialTokens] = useState<SocialTokens>(getStoredSocialTokens());
  const [metaStatus, setMetaStatus] = useState<MetaAccountStatus | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);

  useEffect(() => {
    fetchMetaStatus().then((status) => {
      if (status) setMetaStatus(status);
    });
  }, []);

  const handleTestMeta = async () => {
    setTestingMeta(true);
    try {
      const status = await fetchMetaStatus();
      if (status && status.connected) {
        setMetaStatus(status);
        onToast({
          title: 'Meta accounts verified!',
          detail: `Connected to ${status.page.name} (Facebook) & @${status.instagram.username} (Instagram).`,
        });
      } else {
        onToast({
          title: 'Meta check completed',
          detail: 'Could not verify token with Meta Graph API.',
        });
      }
    } catch (e: any) {
      onToast({
        title: 'Connection error',
        detail: e.message || 'Failed to connect to Meta Graph API.',
      });
    } finally {
      setTestingMeta(false);
    }
  };

  const handleTokenChange = (key: keyof SocialTokens, value: string) => {
    const updated = { ...socialTokens, [key]: value };
    setSocialTokens(updated);
    saveSocialTokens(updated);
  };

  const toggleIntegration = (name: 'Salesforce' | 'Slack') => {
    setIntegrations((current) => ({ ...current, [name]: !current[name] }));
    const next = !integrations[name];
    onToast({
      title: next ? `${name} connection started` : `${name} disconnected`,
      detail: next ? 'Integration marked active.' : 'The integration is now marked as disconnected.',
    });
  };

  return (
    <>
      <PageHeader eyebrow="PREFERENCES / SETTINGS" title="Set the guardrails." description="Keep the right human in the loop, at the right moment.">
        <button className="save-settings-button" onClick={() => onToast({ title: 'Preferences saved', detail: 'Your workspace controls have been updated.' })}><Check size={14} />Saved automatically</button>
      </PageHeader>
      <div className="settings-layout">
        <div className="settings-main">
          {/* Social Media Handles / Access Tokens */}
          <section className="settings-card signal-card">
            <div className="settings-title-row">
              <div className="settings-icon settings-icon-lime"><Share2 size={17} /></div>
              <div>
                <div className="eyebrow">SOCIAL MEDIA CONNECTIONS</div>
                <h2>Developer Access Tokens</h2>
                <p>Connect Facebook, Instagram, Reddit, and X (Twitter) for direct publishing.</p>
              </div>
            </div>

            {/* Live Meta Verified Accounts Card */}
            <div style={{ background: '#f8faf7', border: '1px solid #dbe6d9', borderRadius: 10, padding: '16px', margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: metaStatus?.connected ? '#16a34a' : '#d97706', display: 'inline-block' }} />
                  <strong style={{ fontSize: '13px', color: '#142019' }}>
                    {metaStatus?.connected ? 'Meta Graph API Connected' : 'Checking Meta Connection...'}
                  </strong>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={testingMeta}
                  onClick={handleTestMeta}
                  style={{ fontSize: '11.5px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {testingMeta ? <LoaderCircle size={12} className="active-agent-spinner" /> : <CheckCircle2 size={12} />}
                  Test Connection
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {/* Facebook Page Pill */}
                <div style={{ background: '#fff', border: '1px solid #e1ebe0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: '#1877F2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Facebook size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '12.5px', color: '#142019' }}>
                      {metaStatus?.page?.name || 'Vtab Square'}
                    </strong>
                    <span style={{ fontSize: '11px', color: '#68776b' }}>
                      Page ID: {metaStatus?.page?.id || '1355894157615718'} · Feed Live
                    </span>
                  </div>
                </div>

                {/* Instagram Pill */}
                <div style={{ background: '#fff', border: '1px solid #e1ebe0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Instagram size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '12.5px', color: '#142019' }}>
                      @{metaStatus?.instagram?.username || 'vtabsquare'}
                    </strong>
                    <span style={{ fontSize: '11px', color: '#68776b' }}>
                      Business ID: {metaStatus?.instagram?.id || '17841429778510502'} · Media Live
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4d5d51', marginBottom: 4 }}>
                  FACEBOOK PAGE ACCESS TOKEN
                </label>
                <input
                  type="password"
                  placeholder="EAA..."
                  value={socialTokens.facebook || ''}
                  onChange={(e) => handleTokenChange('facebook', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #d4ded1', fontSize: '12.5px', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4d5d51', marginBottom: 4 }}>
                  INSTAGRAM ACCESS TOKEN
                </label>
                <input
                  type="password"
                  placeholder="IGQV..."
                  value={socialTokens.instagram || ''}
                  onChange={(e) => handleTokenChange('instagram', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #d4ded1', fontSize: '12.5px', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4d5d51', marginBottom: 4 }}>
                  REDDIT OAUTH ACCESS TOKEN
                </label>
                <input
                  type="password"
                  placeholder="Bearer token or script secret..."
                  value={socialTokens.reddit || ''}
                  onChange={(e) => handleTokenChange('reddit', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #d4ded1', fontSize: '12.5px', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4d5d51', marginBottom: 4 }}>
                  X (TWITTER) BEARER / OAUTH TOKEN
                </label>
                <input
                  type="password"
                  placeholder="AAAA..."
                  value={socialTokens.x || ''}
                  onChange={(e) => handleTokenChange('x', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #d4ded1', fontSize: '12.5px', fontFamily: 'monospace' }}
                />
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() => onToast({ title: 'Social credentials saved', detail: 'Ready for test publishing.' })}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              >
                Save Social Credentials
              </button>
            </div>
          </section>

          <section className="settings-card signal-card"><div className="settings-title-row"><div className="settings-icon settings-icon-lime"><Target size={17} /></div><div><div className="eyebrow">LEAD SIGNALS</div><h2>Alert me when intent is high.</h2><p>Set the minimum score that earns a place in your review queue.</p></div></div><div className="threshold-control"><div className="threshold-value"><strong>{threshold}</strong><span>/ 100</span><div className="threshold-label">MINIMUM INTENT SCORE</div></div><div className="range-control"><input type="range" min="50" max="100" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} style={{ '--range-progress': `${((threshold - 50) / 50) * 100}%` } as React.CSSProperties} aria-label="Minimum intent alert score" /><div className="range-labels"><span>50 · broader net</span><span>100 · highest intent</span></div></div></div><div className="settings-divider" /><div className="setting-row"><div><strong>Require approval before outreach</strong><span>Every AI-written message waits here before it can be sent.</span></div><Toggle checked={approvalRequired} onChange={() => setApprovalRequired((current) => !current)} label="Require human approval" /></div></section>

          <section className="settings-card signal-card"><div className="settings-title-row"><div className="settings-icon settings-icon-blue"><Database size={17} /></div><div><div className="eyebrow">KNOWLEDGE RETRIEVAL</div><h2>Give every answer a source.</h2><p>Shape how your knowledge base is prepared and referenced.</p></div></div><div className="rag-setting-row"><div><strong>Chunk size</strong><span>Balance context depth with precise retrieval.</span></div><div className="chunk-size-control"><button onClick={() => setChunkSize((current) => Math.max(400, current - 100))} aria-label="Decrease chunk size">−</button><strong>{chunkSize}<small> tokens</small></strong><button onClick={() => setChunkSize((current) => Math.min(1200, current + 100))} aria-label="Increase chunk size">+</button></div></div><div className="settings-divider" /><div className="setting-row"><div><strong>Show citations in generated answers</strong><span>Keep the source visible for every factual claim.</span></div><Toggle checked={citations} onChange={() => setCitations((current) => !current)} label="Show source citations" /></div><div className="settings-divider" /><div className="setting-row"><div><strong>Refresh when a source changes</strong><span>Keep your searchable index in step with your latest content.</span></div><Toggle checked={autoRefresh} onChange={() => setAutoRefresh((current) => !current)} label="Refresh knowledge automatically" /></div></section>

          <section className="settings-card integrations-card signal-card"><div className="settings-title-row"><div className="settings-icon settings-icon-dark"><Link2 size={17} /></div><div><div className="eyebrow">CONNECTED WORKSPACE</div><h2>Bring your tools with you.</h2><p>Choose where leads and handoffs should live.</p></div></div><div className="integration-list">{([{ name: 'Salesforce' as const, description: 'Sync qualified leads and account context', icon: Database, letters: 'SF' }, { name: 'Slack' as const, description: 'Send high-intent alerts to your team', icon: Hash, letters: 'SL' }]).map((integration) => { const Icon = integration.icon; const connected = integrations[integration.name]; return <div className="integration-row" key={integration.name}><div className={`integration-logo integration-${integration.name.toLowerCase()}`}><Icon size={19} /></div><div className="integration-copy"><strong>{integration.name}</strong><span>{integration.description}</span></div>{connected && <span className="connected-label"><i />Connected</span>}<button className={connected ? 'disconnect-button' : 'connect-button'} onClick={() => toggleIntegration(integration.name)}>{connected ? 'Disconnect' : 'Connect'}{!connected && <ArrowRight size={13} />}</button></div>; })}</div></section>
        </div>
        <aside className="settings-aside"><div className="guardrail-card"><div className="guardrail-symbol"><ShieldCheck size={19} /></div><div className="eyebrow">HUMAN, BY DESIGN</div><h3>Vtab finds the moment.<br />You make the call.</h3><p>Lead intent prioritizes what matters. Your approval settings decide what happens next.</p><div className="guardrail-lines"><span><CheckCircle2 size={14} />Messages reviewed</span><span><CheckCircle2 size={14} />Sources stay grounded</span><span><CheckCircle2 size={14} />Threshold set to {threshold}</span></div></div><div className="settings-help signal-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need another guardrail?</strong><span>Talk to your workspace admin about roles, access and retention.</span><button onClick={() => onToast({ title: 'Help center', detail: 'Reach out to your workspace admin for account-level controls.' })}>Visit help center <ExternalLink size={13} /></button></div></aside>
      </div>
    </>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`toggle-switch${checked ? ' is-on' : ''}`} onClick={onChange} role="switch" aria-checked={checked} aria-label={label}><span /></button>;
}

export default App;
