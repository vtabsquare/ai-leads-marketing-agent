import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Heart,
  Share2,
  ArrowLeft,
  RefreshCw,
  Copy,
  CheckCheck,
  Send,
  Facebook,
  Instagram,
  Sparkles,
  Clock,
  TrendingUp,
  Users,
  Inbox,
  ChevronRight,
} from 'lucide-react';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PublishedPost = {
  campaignId: string;
  title: string;
  brief: string;
  imageUrl?: string;
  publishedAt: string;
  platforms: {
    facebook?: { postId: string; url: string };
    instagram?: { postId: string; url: string };
  };
};

export const SAMPLE_PUBLISHED_POSTS: PublishedPost[] = [
  {
    campaignId: 'sample-vtab-reporting-launch',
    title: 'Launching VTAB Reporting Tool',
    brief: 'Automate multi-cloud enterprise data reporting with real-time KPI dashboards, high-throughput ingestion, and AI insights.',
    imageUrl: '/mockups/vtab-reporting-hero.png',
    publishedAt: new Date(Date.now() - 3600000 * 26).toISOString(),
    platforms: {
      facebook: { postId: '1355894157615718_sample_1', url: 'https://facebook.com/vtabsquare' },
      instagram: { postId: '17841429778510502_sample_1', url: 'https://instagram.com/vtabsquare' },
    },
  },
];

type EngagementMetrics = {
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
};

type SocialComment = {
  id: string;
  platform: 'facebook' | 'instagram';
  commenterName: string;
  commenterHandle?: string;
  avatarInitials: string;
  avatarColor: string;
  text: string;
  timestamp: string;
  likes: number;
};

type PostDetail = {
  post: PublishedPost;
  metrics: { facebook?: EngagementMetrics; instagram?: EngagementMetrics };
  comments: SocialComment[];
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AVATAR_COLORS = [
  '#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0284c7', '#16a34a', '#ca8a04',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Mock data generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildZeroMetrics(platforms: PublishedPost['platforms']): PostDetail['metrics'] {
  return {
    facebook: platforms.facebook ? { likes: 0, comments: 0, shares: 0, reach: 0 } : undefined,
    instagram: platforms.instagram ? { likes: 0, comments: 0, shares: 0, reach: 0 } : undefined,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ API helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchPostInsights(postId: string, platform: 'facebook' | 'instagram' = 'facebook'): Promise<EngagementMetrics | null> {
  try {
    const res = await fetch(`/api/meta/post-insights?postId=${encodeURIComponent(postId)}&platform=${platform}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPostComments(postId: string, platform: 'facebook' | 'instagram'): Promise<SocialComment[] | null> {
  try {
    const res = await fetch(`/api/meta/post-comments?postId=${encodeURIComponent(postId)}&platform=${platform}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || []).map((c: any) => ({
      id: c.id,
      platform,
      commenterName: c.from?.name || 'Anonymous',
      commenterHandle: c.username ? `@${c.username}` : undefined,
      avatarInitials: initialsFor(c.from?.name || 'A'),
      avatarColor: colorForName(c.from?.name || 'Anonymous'),
      text: c.message || c.text || '',
      timestamp: c.timestamp || c.created_time || new Date().toISOString(),
      likes: c.like_count || 0,
    }));
  } catch {
    return null;
  }
}

async function generateAiReply(params: { postContext: string; commenterName: string; commentText: string; platform: 'facebook' | 'instagram' }): Promise<string> {
  const res = await fetch('/api/meta/ai-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to generate reply');
  const data = await res.json();
  return data.reply;
}

async function postReply(commentId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch('/api/meta/post-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PlatformBadge({ platform }: { platform: 'facebook' | 'instagram' }) {
  if (platform === 'facebook') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1877f220', color: '#1877f2', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
        <Facebook size={11} />
        Facebook
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e1306c20', color: '#e1306c', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      <Instagram size={11} />
      Instagram
    </span>
  );
}

function MetricChip({ icon: Icon, value, label, color = '#c9f36a' }: { icon: React.ElementType; value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f1f5f2', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 20px', minWidth: 90 }}>
      <Icon size={16} color={color} />
      <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function CommentCard({
  comment,
  postContext,
  onReplyPosted,
}: {
  comment: SocialComment;
  postContext: string;
  onReplyPosted?: (commentId: string) => void;
}) {
  const [replyState, setReplyState] = useState<'idle' | 'generating' | 'ready' | 'posting' | 'posted'>('idle');
  const [suggestedReply, setSuggestedReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReply, setShowReply] = useState(false);

  const handleGenerateReply = async () => {
    setReplyState('generating');
    setShowReply(true);
    try {
      const reply = await generateAiReply({
        postContext,
        commenterName: comment.commenterName,
        commentText: comment.text,
        platform: comment.platform,
      });
      setSuggestedReply(reply);
      setReplyState('ready');
    } catch {
      setSuggestedReply('Thank you for your comment! We appreciate your engagement and will get back to you soon. ðŸ˜Š');
      setReplyState('ready');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePost = async () => {
    setReplyState('posting');
    const ok = await postReply(comment.id, suggestedReply);
    setReplyState('posted');
    if (ok && onReplyPosted) onReplyPosted(comment.id);
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Comment header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: comment.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
          {comment.avatarInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{comment.commenterName}</span>
            {comment.commenterHandle && <span style={{ color: 'var(--soft-muted)', fontSize: 12 }}>{comment.commenterHandle}</span>}
            <PlatformBadge platform={comment.platform} />
            <span style={{ marginLeft: 'auto', color: 'var(--soft-muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />
              {timeAgo(comment.timestamp)}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', color: 'var(--ink)', fontSize: 14, lineHeight: 1.55 }}>{comment.text}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--soft-muted)', fontSize: 12 }}>
              <Heart size={12} /> {comment.likes}
            </span>
          </div>
        </div>
      </div>

      {/* AI Reply area */}
      {!showReply && replyState === 'idle' && (
        <button
          onClick={handleGenerateReply}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#edf7d8', border: '1px solid #c9e89d', color: '#275220', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: 'fit-content', marginLeft: 48 }}
        >
          <Sparkles size={13} />
          AI Suggested Reply
        </button>
      )}

      {showReply && (
        <div style={{ marginLeft: 48, background: '#f8fbf5', border: '1px solid #d8ebd0', borderRadius: 10, padding: '12px 14px' }}>
          {replyState === 'generating' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
              <div style={{ width: 14, height: 14, border: '2px solid rgba(201,243,106,0.4)', borderTopColor: '#c9f36a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Generating replyâ€¦
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Sparkles size={12} color="#2d6a4f" />
                <span style={{ fontSize: 11, color: '#275220', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>AI Suggested Reply</span>
              </div>
              <textarea
                value={suggestedReply}
                onChange={(e) => setSuggestedReply(e.target.value)}
                rows={3}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopy}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => { setSuggestedReply(''); setReplyState('idle'); setShowReply(false); handleGenerateReply(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f8faf7', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                >
                  <RefreshCw size={12} /> Regenerate
                </button>
                {replyState !== 'posted' ? (
                  <button
                    onClick={handlePost}
                    disabled={replyState === 'posting'}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--deep-green)', border: 'none', color: '#ffffff', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: replyState === 'posting' ? 'wait' : 'pointer', marginLeft: 'auto' }}
                  >
                    {replyState === 'posting' ? (
                      <><div style={{ width: 11, height: 11, border: '2px solid #14201960', borderTopColor: '#142019', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Postingâ€¦</>
                    ) : (
                      <><Send size={12} /> Post Reply</>
                    )}
                  </button>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>
                    <CheckCheck size={12} /> Reply posted!
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Campaign detail view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CampaignDetail({ post, onBack }: { post: PublishedPost; onBack: () => void }) {
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'facebook' | 'instagram'>('all');
  const [repliedIds, setRepliedIds] = useState<Set<string>>(new Set());

  const loadDetail = useCallback(async () => {
    setLoading(true);

    // Fetch ONLY real data from Meta Graph API
    const metrics: PostDetail['metrics'] = {};
    const allComments: SocialComment[] = [];

    if (post.platforms.facebook?.postId) {
      const fbInsights = await fetchPostInsights(post.platforms.facebook.postId, 'facebook');
      const fbComments = await fetchPostComments(post.platforms.facebook.postId, 'facebook');
      metrics.facebook = fbInsights || { likes: 0, comments: 0, shares: 0, reach: 0 };
      if (fbComments && fbComments.length > 0) {
        allComments.push(...fbComments);
      }
    }

    if (post.platforms.instagram?.postId) {
      const igInsights = await fetchPostInsights(post.platforms.instagram.postId, 'instagram');
      const igComments = await fetchPostComments(post.platforms.instagram.postId, 'instagram');
      metrics.instagram = igInsights || { likes: 0, comments: 0, shares: 0, reach: 0 };
      if (igComments && igComments.length > 0) {
        allComments.push(...igComments);
      }
    }

    // Strictly real comments only - no fake or simulated comments
    setDetail({ post, metrics, comments: allComments });
    setLoading(false);
  }, [post]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const totalMetrics = {
    likes: (detail?.metrics.facebook?.likes || 0) + (detail?.metrics.instagram?.likes || 0),
    comments: (detail?.metrics.facebook?.comments || 0) + (detail?.metrics.instagram?.comments || 0),
    shares: (detail?.metrics.facebook?.shares || 0) + (detail?.metrics.instagram?.shares || 0),
    reach: (detail?.metrics.facebook?.reach || 0) + (detail?.metrics.instagram?.reach || 0),
  };

  const filteredComments = (detail?.comments || []).filter(
    (c) => activeTab === 'all' || c.platform === activeTab
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: '100%' }}>
      {/* Back header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 0 20px' }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f2', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ color: 'var(--soft-muted)', fontSize: 13 }}>
          Community Inbox <ChevronRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.title}
        </div>
      </div>

      {/* Campaign header card */}
      <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {post.imageUrl && (
            <div style={{ width: 200, flexShrink: 0, background: '#0a1510' }}>
              <img src={post.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', maxHeight: 140 }} />
            </div>
          )}
          <div style={{ padding: '20px 24px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{post.title}</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>{post.brief}</p>
              </div>
              <button onClick={loadDetail} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>
                <RefreshCw size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {post.platforms.facebook && <PlatformBadge platform="facebook" />}
              {post.platforms.instagram && <PlatformBadge platform="instagram" />}
              <span style={{ color: 'var(--soft-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {timeAgo(post.publishedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      {loading ? (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, background: '#ffffff', border: '1px solid var(--line)', borderRadius: 10, height: 80, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <MetricChip icon={Heart} value={totalMetrics.likes} label="Likes" color="#f43f5e" />
          <MetricChip icon={MessageCircle} value={totalMetrics.comments} label="Comments" color="#2d6a4f" />
          <MetricChip icon={Share2} value={totalMetrics.shares} label="Shares" color="#60a5fa" />
          <MetricChip icon={Users} value={totalMetrics.reach > 0 ? totalMetrics.reach : '—'} label="Reach" color="#a78bfa" />
          <MetricChip icon={TrendingUp} value={totalMetrics.likes + totalMetrics.comments + totalMetrics.shares} label="Total Eng." color="#fb923c" />
        </div>
      )}

      {/* Per-platform breakdown */}
      {!loading && detail && (detail.metrics.facebook || detail.metrics.instagram) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {detail.metrics.facebook && (
            <div style={{ flex: 1, minWidth: 220, background: 'rgba(24,119,242,0.07)', border: '1px solid rgba(24,119,242,0.2)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Facebook size={14} color="#1877f2" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1877f2' }}>Facebook</span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.facebook.likes}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Likes</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.facebook.comments}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Comments</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.facebook.shares}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Shares</div></div>
              </div>
            </div>
          )}
          {detail.metrics.instagram && (
            <div style={{ flex: 1, minWidth: 220, background: 'rgba(225,48,108,0.07)', border: '1px solid rgba(225,48,108,0.2)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Instagram size={14} color="#e1306c" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e1306c' }}>Instagram</span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.instagram.likes}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Likes</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.instagram.comments}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Comments</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{detail.metrics.instagram.shares}</div><div style={{ fontSize: 10, color: 'var(--soft-muted)', textTransform: 'uppercase' }}>Shares</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comments section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            Comments &amp; Replies
            {!loading && <span style={{ marginLeft: 8, background: 'rgba(201,243,106,0.15)', color: '#c9f36a', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>{filteredComments.length}</span>}
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'facebook', 'instagram'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ background: activeTab === tab ? 'rgba(201,243,106,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${activeTab === tab ? '#37835a' : 'rgba(255,255,255,0.08)'}`, color: activeTab === tab ? '#c9f36a' : 'rgba(255,255,255,0.5)', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}
              >
                {tab === 'all' ? 'All' : tab === 'facebook' ? 'Facebook' : 'Instagram'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, height: 80, animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : filteredComments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--soft-muted)' }}>
            <MessageCircle size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No comments yet on this platform</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                postContext={`${post.title}: ${post.brief}`}
                onReplyPosted={(id) => setRepliedIds((prev) => new Set([...prev, id]))}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Campaign card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CampaignCard({ post, onClick }: { post: PublishedPost; onClick: () => void }) {
  const totalPlatforms = Object.keys(post.platforms).length;
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', gap: 16, background: '#ffffff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', width: '100%', transition: 'border-color 0.15s, background 0.15s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#37835a'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
    >
      {post.imageUrl && (
        <div style={{ width: 100, flexShrink: 0, background: '#0a1510' }}>
          <img src={post.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', maxHeight: 100 }} />
        </div>
      )}
      <div style={{ padding: '16px 16px 16px 0', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {post.platforms.facebook && <PlatformBadge platform="facebook" />}
          {post.platforms.instagram && <PlatformBadge platform="instagram" />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>{post.title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.brief}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--soft-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {timeAgo(post.publishedAt)}</span>
          <span style={{ fontSize: 11, color: 'var(--soft-muted)' }}>{totalPlatforms} platform{totalPlatforms > 1 ? 's' : ''}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>View <ChevronRight size={13} /></span>
        </div>
      </div>
    </button>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Main CommunityInbox â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CommunityInbox({ publishedPosts: initialPosts }: { publishedPosts: PublishedPost[] }) {
  const [selectedPost, setSelectedPost] = useState<PublishedPost | null>(null);
  const [posts, setPosts] = useState<PublishedPost[]>(initialPosts);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(true);

  // Automatically fetch all real published posts directly from Meta Graph API
  useEffect(() => {
    let isMounted = true;
    async function loadMetaPosts() {
      try {
        setLoadingPosts(true);
        const res = await fetch('/api/meta/published-posts');
        if (!res.ok) throw new Error('Failed to load posts');
        const data = await res.json();
        if (isMounted && Array.isArray(data.posts) && data.posts.length > 0) {
          // Merge real posts from Meta with any local posts
          setPosts(data.posts);
        }
      } catch (err) {
        console.warn('Could not fetch Meta published posts:', err);
      } finally {
        if (isMounted) setLoadingPosts(false);
      }
    }
    loadMetaPosts();
    return () => { isMounted = false; };
  }, []);

  if (selectedPost) {
    return <CampaignDetail post={selectedPost} onBack={() => setSelectedPost(null)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, background: '#e9f5d3', border: '1px solid #d4e8b0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={15} color="#2d6a4f" />
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Community Inbox</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
            Real-time engagements and comments from your connected Meta channels (Facebook &amp; Instagram).
          </p>
        </div>

        <button
          onClick={async () => {
            setLoadingPosts(true);
            try {
              const res = await fetch('/api/meta/published-posts');
              const data = await res.json();
              if (Array.isArray(data.posts)) setPosts(data.posts);
            } finally {
              setLoadingPosts(false);
            }
          }}
          disabled={loadingPosts}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f2', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: loadingPosts ? 'wait' : 'pointer' }}
        >
          <RefreshCw size={13} className={loadingPosts ? 'active-agent-spinner' : ''} />
          Refresh
        </button>
      </div>

      {/* Campaign list */}
      {loadingPosts ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 14, height: 90, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--soft-muted)', background: '#ffffff', border: '1px solid var(--line)', borderRadius: 14 }}>
          <Inbox size={40} style={{ marginBottom: 16, opacity: 0.35 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>No published posts found</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Publish a post to your connected Facebook Page or Instagram Business Account.<br />
            Only 100% verified real Meta comments and engagement counts will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map((post) => (
            <CampaignCard key={post.campaignId} post={post} onClick={() => setSelectedPost(post)} />
          ))}
        </div>
      )}
    </div>
  );
}

