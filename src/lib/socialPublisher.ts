// ==============================================================================
// VTAB SOCIAL MEDIA PUBLISHING DISPATCHER
// Supports Facebook, Instagram, Reddit, X (Twitter), and LinkedIn
// ==============================================================================

import { supabase } from './supabase';

export interface SocialTokens {
  facebook?: string;
  instagram?: string;
  reddit?: string;
  x?: string;
  linkedin?: string;
}

export interface MetaAccountStatus {
  connected: boolean;
  page: {
    id: string;
    name: string;
    category: string;
  };
  instagram: {
    id: string;
    username: string;
    name: string;
    profile_picture_url: string | null;
  };
}

const STORAGE_KEY = 'vtab_social_tokens';
const POSTS_STORAGE_KEY = 'vtab_published_social_posts';

export function getStoredSocialTokens(): SocialTokens {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSocialTokens(tokens: SocialTokens): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.error('Failed to save social tokens', err);
  }
}

export interface PublishResult {
  success: boolean;
  platform: 'facebook' | 'instagram' | 'reddit' | 'x' | 'linkedin';
  postId?: string;
  url?: string;
  error?: string;
}

export async function fetchMetaStatus(): Promise<MetaAccountStatus | null> {
  try {
    const res = await fetch('/api/meta/status');
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function recordSocialPost(
  platform: 'facebook' | 'instagram' | 'reddit' | 'x' | 'linkedin',
  content: string,
  postId?: string,
  postUrl?: string
) {
  const postRecord = {
    id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    platform,
    content,
    post_id: postId || null,
    post_url: postUrl || null,
    status: 'Published',
    created_at: new Date().toISOString(),
  };

  // 1. Save locally
  try {
    const existing = JSON.parse(localStorage.getItem(POSTS_STORAGE_KEY) || '[]');
    localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify([postRecord, ...existing]));
  } catch (e) {
    console.warn('Failed to cache post locally:', e);
  }

  // 2. Persist to Supabase if configured
  if (supabase) {
    try {
      await supabase.from('social_posts').insert([postRecord]);
    } catch (e) {
      console.warn('Failed to insert post in Supabase social_posts table:', e);
    }
  }
}

export async function publishToFacebook(
  message: string,
  imageUrl?: string,
  pageId = 'me',
  token?: string
): Promise<PublishResult> {
  // Try server proxy first
  try {
    const proxyRes = await fetch('/api/meta/publish-facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, imageUrl }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.postId) {
        await recordSocialPost('facebook', message, data.postId, data.url);
        return {
          success: true,
          platform: 'facebook',
          postId: data.postId,
          url: data.url || `https://facebook.com/${data.postId}`,
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Facebook proxy call failed, checking direct fallback:', proxyErr);
  }

  // Fallback to direct client API
  const accessToken =
    token ||
    import.meta.env.VITE_META_PAGE_ACCESS_TOKEN ||
    import.meta.env.VITE_META_ACCESS_TOKEN ||
    getStoredSocialTokens().facebook;

  if (!accessToken) {
    return {
      success: false,
      platform: 'facebook',
      error: 'Missing Facebook Page Access Token.',
    };
  }

  try {
    const targetPage = pageId === 'me' ? '1371928256002877' : pageId;
    const fbEndpoint = imageUrl
      ? `https://graph.facebook.com/v19.0/${targetPage}/photos`
      : `https://graph.facebook.com/v19.0/${targetPage}/feed`;
    const fbBody = imageUrl
      ? { url: imageUrl, caption: message, access_token: accessToken }
      : { message, access_token: accessToken };

    const res = await fetch(fbEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbBody),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || 'Facebook API error');
    }
    const postId = data.post_id || data.id;
    const postUrl = `https://facebook.com/${postId}`;
    await recordSocialPost('facebook', message, postId, postUrl);
    return {
      success: true,
      platform: 'facebook',
      postId,
      url: postUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      platform: 'facebook',
      error: err.message || 'Failed to publish to Facebook',
    };
  }
}

export async function publishToInstagram(
  caption: string,
  imageUrl?: string,
  igUserId?: string,
  token?: string
): Promise<PublishResult> {
  // Try server proxy first
  try {
    const proxyRes = await fetch('/api/meta/publish-instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, imageUrl }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.postId) {
        await recordSocialPost('instagram', caption, data.postId, data.url);
        return {
          success: true,
          platform: 'instagram',
          postId: data.postId,
          url: data.url || 'https://instagram.com/vtabsquare',
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Instagram proxy call failed, checking direct fallback:', proxyErr);
  }

  // Fallback to direct client API
  const accessToken =
    token ||
    import.meta.env.VITE_META_PAGE_ACCESS_TOKEN ||
    import.meta.env.VITE_META_ACCESS_TOKEN ||
    getStoredSocialTokens().instagram;

  const targetIgId = igUserId || '17841422864583641';

  if (!accessToken || !targetIgId) {
    return {
      success: false,
      platform: 'instagram',
      error: 'Missing Instagram User ID or Access Token.',
    };
  }

  if (!imageUrl) {
    return {
      success: false,
      platform: 'instagram',
      error: 'Instagram requires a generated image before publishing.',
    };
  }

  try {
    // Step 1: Create media container
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${targetIgId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      throw new Error(createData.error?.message || 'Instagram media creation failed');
    }

    // Wait 3s for container to process
    await new Promise((r) => setTimeout(r, 3000));

    // Step 2: Publish media
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${targetIgId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: createData.id,
        access_token: accessToken,
      }),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      throw new Error(publishData.error?.message || 'Instagram publish failed');
    }

    const postUrl = 'https://instagram.com/vtabsquare';
    await recordSocialPost('instagram', caption, publishData.id, postUrl);
    return {
      success: true,
      platform: 'instagram',
      postId: publishData.id,
      url: postUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      platform: 'instagram',
      error: err.message || 'Failed to publish to Instagram',
    };
  }
}

export async function publishToReddit(
  title: string,
  text: string,
  subreddit = 'startups',
  token?: string
): Promise<PublishResult> {
  const accessToken = token || getStoredSocialTokens().reddit;
  if (!accessToken) {
    return {
      success: false,
      platform: 'reddit',
      error: 'Missing Reddit OAuth Token. Add it in Settings / Social Connections.',
    };
  }

  try {
    const params = new URLSearchParams({
      api_type: 'json',
      kind: 'self',
      sr: subreddit,
      title,
      text,
    });

    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'VtabMarketingBot/1.0',
      },
      body: params.toString(),
    });
    const data = await res.json();
    return {
      success: true,
      platform: 'reddit',
      url: data.json?.data?.url,
    };
  } catch (err: any) {
    return {
      success: false,
      platform: 'reddit',
      error: err.message || 'Failed to submit post to Reddit',
    };
  }
}

export async function publishToX(
  tweetText: string,
  token?: string
): Promise<PublishResult> {
  const accessToken = token || getStoredSocialTokens().x;
  if (!accessToken) {
    return {
      success: false,
      platform: 'x',
      error: 'Missing X (Twitter) Bearer/OAuth Token. Add it in Settings / Social Connections.',
    };
  }

  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.title || 'Twitter API error');
    }
    return {
      success: true,
      platform: 'x',
      postId: data.data?.id,
      url: `https://x.com/i/status/${data.data?.id}`,
    };
  } catch (err: any) {
    return {
      success: false,
      platform: 'x',
      error: err.message || 'Failed to tweet to X',
    };
  }
}
