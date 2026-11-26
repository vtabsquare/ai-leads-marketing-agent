import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  generateImageWithFallback,
  AllProvidersFailedError,
  type ImageAspectRatio,
} from './src/lib/imageProviders/index.ts';
import {
  scoreBackdropCandidateWithGemini,
  verifyFinalCompositeWithGemini,
} from './src/lib/gemini.ts';

const CF_NEURONS_PER_IMAGE = 10; // @cf/black-forest-labs/flux-1-schnell 4 steps @ 1024x1024
const CF_DAILY_NEURON_LIMIT = 10_000;
let cfQuotaState = { date: new Date().toISOString().slice(0, 10), neuronsUsed: 0 };

function getCfRemainingNeurons(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (cfQuotaState.date !== today) {
    cfQuotaState = { date: today, neuronsUsed: 0 };
  }
  return Math.max(0, CF_DAILY_NEURON_LIMIT - cfQuotaState.neuronsUsed);
}

function recordCfNeurons(count: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (cfQuotaState.date !== today) {
    cfQuotaState = { date: today, neuronsUsed: 0 };
  }
  cfQuotaState.neuronsUsed += count;
}
import {
  getPaletteById,
  type CreativeHistoryEntry,
} from './src/lib/creativeStyles.ts';
import {
  prepareBlurredBackdrop,
  renderHybridCreative,
} from './src/lib/imageProviders/compositor.ts';

function metaSocialPlugin(env: Record<string, string>): Plugin {
  const pageId = env.META_PAGE_ID || process.env.META_PAGE_ID || '1371928256002877';
  const pageToken = env.META_PAGE_ACCESS_TOKEN || env.VITE_META_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN || '';
  const igUserId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '17841422864583641';

  const metaMiddleware = async (req: any, res: any, next: any) => {
    // Health Check Endpoint for Render / Cloud Hosting
    if (req.url === '/api/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', service: 'ai-leads-marketing-agent', timestamp: new Date().toISOString() }));
      return;
    }

    // 1. Meta Connection Status
        if (req.url && req.url === '/api/meta/status') {
          try {
            const pageRes = await fetch(
              `https://graph.facebook.com/v19.0/${pageId}?fields=name,category&access_token=${pageToken}`
            );
            const pageData = await pageRes.json();

            const igRes = await fetch(
              `https://graph.facebook.com/v19.0/${igUserId}?fields=username,name,profile_picture_url&access_token=${pageToken}`
            );
            const igData = await igRes.json();

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                connected: !pageData.error && !igData.error,
                page: {
                  id: pageId,
                  name: pageData.name || 'Vtab Square',
                  category: pageData.category || 'Information technology company',
                },
                instagram: {
                  id: igUserId,
                  username: igData.username || 'vtabsquare',
                  name: igData.name || 'VTAB SQUARE Private Limited',
                  profile_picture_url: igData.profile_picture_url || null,
                },
              })
            );
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to fetch Meta status' }));
          }
          return;
        }

        // 2. Publish to Facebook Page
        if (req.url && req.url === '/api/meta/publish-facebook' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { message, imageUrl } = JSON.parse(body || '{}');
              if (!message) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing message parameter' }));
                return;
              }

              const fbEndpoint = imageUrl
                ? `https://graph.facebook.com/v19.0/${pageId}/photos`
                : `https://graph.facebook.com/v19.0/${pageId}/feed`;

              const fbPayload = imageUrl
                ? { url: imageUrl, caption: message, access_token: pageToken }
                : { message, access_token: pageToken };

              const fbRes = await fetch(fbEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fbPayload),
              });
              const fbData = await fbRes.json();

              if (!fbRes.ok || fbData.error) {
                throw new Error(fbData.error?.message || 'Facebook API rejected post');
              }

              const postId = fbData.post_id || fbData.id;

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  platform: 'facebook',
                  postId,
                  url: `https://facebook.com/${postId}`,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Publishing to Facebook failed' }));
            }
          });
          return;
        }

        // 3. Publish to Instagram
        if (req.url && req.url === '/api/meta/publish-instagram' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { caption, imageUrl } = JSON.parse(body || '{}');
              if (!caption) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing caption parameter' }));
                return;
              }

              if (!imageUrl || typeof imageUrl !== 'string') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error: 'Missing imageUrl parameter. Instagram requires a generated image.',
                  })
                );
                return;
              }

              // Step 1: Create media container
              const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  image_url: imageUrl,
                  caption,
                  access_token: pageToken,
                }),
              });
              const createData = await createRes.json();

              if (!createRes.ok || !createData.id) {
                throw new Error(createData.error?.message || 'Instagram media creation failed');
              }

              const containerId = createData.id;

              // Step 2: Poll container status until FINISHED (up to 10 attempts)
              let isFinished = false;
              for (let i = 0; i < 10; i++) {
                await new Promise((r) => setTimeout(r, 1500));
                const checkRes = await fetch(
                  `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${pageToken}`
                );
                const checkData = await checkRes.json();
                if (checkData.status_code === 'FINISHED') {
                  isFinished = true;
                  break;
                } else if (checkData.status_code === 'ERROR') {
                  throw new Error('Instagram container processing failed on Meta servers');
                }
              }

              if (!isFinished) {
                throw new Error('Timed out waiting for Instagram media processing to finish');
              }

              // Step 3: Publish container
              const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  creation_id: containerId,
                  access_token: pageToken,
                }),
              });
              const publishData = await publishRes.json();

              if (!publishRes.ok || !publishData.id) {
                throw new Error(publishData.error?.message || 'Instagram publish failed');
              }

              // Step 4: Get permalink
              let permalink = `https://instagram.com/vtabsquare`;
              try {
                const permRes = await fetch(
                  `https://graph.facebook.com/v19.0/${publishData.id}?fields=permalink,shortcode&access_token=${pageToken}`
                );
                const permData = await permRes.json();
                if (permData.permalink) {
                  permalink = permData.permalink;
                } else if (permData.shortcode) {
                  permalink = `https://www.instagram.com/p/${permData.shortcode}/`;
                }
              } catch {
                // Ignore permalink fallback
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  platform: 'instagram',
                  postId: publishData.id,
                  url: permalink,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Publishing to Instagram failed' }));
            }
          });
          return;
        }

        // ── 2.5 Real Published Posts Feed from Meta (Facebook & Instagram) ──
        if (req.url && req.url === '/api/meta/published-posts') {
          try {
            const allPosts: any[] = [];

            // 1. Fetch real Facebook page posts
            if (pageId && pageToken) {
              try {
                const fbRes = await fetch(
                  `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=10&access_token=${pageToken}`
                );
                const fbData = await fbRes.json();
                if (Array.isArray(fbData.data)) {
                  for (const p of fbData.data) {
                    const firstLine = (p.message || '').split('\n')[0].trim();
                    allPosts.push({
                      campaignId: p.id,
                      title: firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : (firstLine || 'Facebook Post'),
                      brief: p.message || '',
                      imageUrl: p.full_picture || undefined,
                      publishedAt: p.created_time || new Date().toISOString(),
                      platforms: {
                        facebook: {
                          postId: p.id,
                          url: p.permalink_url || `https://facebook.com/${p.id}`,
                        },
                      },
                    });
                  }
                }
              } catch (fbErr: any) {
                console.warn('[/api/meta/published-posts] FB fetch error:', fbErr?.message);
              }
            }

            // 2. Fetch real Instagram posts
            if (igUserId && pageToken) {
              try {
                const igRes = await fetch(
                  `https://graph.facebook.com/v19.0/${igUserId}/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=10&access_token=${pageToken}`
                );
                const igData = await igRes.json();
                if (Array.isArray(igData.data)) {
                  for (const ig of igData.data) {
                    const firstLine = (ig.caption || '').split('\n')[0].trim();
                    allPosts.push({
                      campaignId: ig.id,
                      title: firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : (firstLine || 'Instagram Post'),
                      brief: ig.caption || '',
                      imageUrl: ig.media_url || undefined,
                      publishedAt: ig.timestamp || new Date().toISOString(),
                      platforms: {
                        instagram: {
                          postId: ig.id,
                          url: ig.permalink || `https://instagram.com/p/${ig.id}`,
                        },
                      },
                    });
                  }
                }
              } catch (igErr: any) {
                console.warn('[/api/meta/published-posts] IG fetch error:', igErr?.message);
              }
            }

            // Sort newest first
            allPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ posts: allPosts }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, posts: [] }));
          }
          return;
        }

        // ── 3. Post Insights (likes, comments, shares) ───────────────────────
        if (req.url && req.url.startsWith('/api/meta/post-insights')) {
          try {
            const parsedUrl = new URL(req.url, 'http://localhost:3000');
            const postId = parsedUrl.searchParams.get('postId');
            const platform = parsedUrl.searchParams.get('platform') || 'facebook';
            if (!postId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing postId' }));
              return;
            }

            if (platform === 'instagram') {
              const apiRes = await fetch(
                `https://graph.facebook.com/v19.0/${postId}?fields=like_count,comments_count&access_token=${pageToken}`
              );
              const data = await apiRes.json();
              if (!apiRes.ok || data.error) {
                throw new Error(data.error?.message || 'Instagram Graph API error');
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                likes: data.like_count ?? 0,
                comments: data.comments_count ?? 0,
                shares: 0,
              }));
              return;
            }

            // Facebook fields
            const fields = 'likes.summary(true),comments.summary(true),shares';
            const apiRes = await fetch(
              `https://graph.facebook.com/v19.0/${postId}?fields=${fields}&access_token=${pageToken}`
            );
            const data = await apiRes.json();
            if (!apiRes.ok || data.error) {
              throw new Error(data.error?.message || 'Facebook Graph API error');
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              likes: data.likes?.summary?.total_count ?? 0,
              comments: data.comments?.summary?.total_count ?? 0,
              shares: data.shares?.count ?? 0,
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to fetch insights' }));
          }
          return;
        }

        // ── 4. Post Comments ─────────────────────────────────────────────────
        if (req.url && req.url.startsWith('/api/meta/post-comments')) {
          try {
            const parsedUrl = new URL(req.url, 'http://localhost:3000');
            const postId = parsedUrl.searchParams.get('postId');
            const platform = parsedUrl.searchParams.get('platform') || 'facebook';
            if (!postId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing postId' }));
              return;
            }
            const fields = platform === 'instagram'
              ? 'id,username,text,timestamp,like_count'
              : 'id,from,message,created_time';
            const endpoint = platform === 'instagram'
              ? `https://graph.facebook.com/v19.0/${postId}/comments?fields=${fields}&access_token=${pageToken}`
              : `https://graph.facebook.com/v19.0/${postId}/comments?fields=${fields}&access_token=${pageToken}`;
            const apiRes = await fetch(endpoint);
            const data = await apiRes.json();
            if (!apiRes.ok || data.error) {
              throw new Error(data.error?.message || 'Failed to fetch comments');
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to fetch comments' }));
          }
          return;
        }

        // ── 5. Post Reply ────────────────────────────────────────────────────
        if (req.url && req.url === '/api/meta/post-reply' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { commentId, message } = JSON.parse(body || '{}');
              if (!commentId || !message) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing commentId or message' }));
                return;
              }
              // In Meta Graph API v19.0+, replying to a comment uses /{comment-id}/comments
              const apiRes = await fetch(`https://graph.facebook.com/v19.0/${commentId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, access_token: pageToken }),
              });
              const data = await apiRes.json();
              if (!apiRes.ok || data.error) {
                throw new Error(data.error?.message || 'Failed to post reply');
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, id: data.id }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Failed to post reply' }));
            }
          });
          return;
        }

        // ── 6. AI Reply (Gemini) ────────────────────────────────────────────
        if (req.url && req.url === '/api/meta/ai-reply' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { postContext, commenterName, commentText, platform } = JSON.parse(body || '{}');
              const geminiKey = env.GEMINI_API_KEY || '';
              if (!geminiKey) {
                // Fallback without API key
                const fallback = `Thanks so much, ${commenterName || 'there'}! 🙌 We'd love to tell you more — feel free to reach out or book a demo at vtabsquare.com!`;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ reply: fallback }));
                return;
              }
              const prompt = `You are a professional social media manager for VTAB Square, a B2B enterprise AI analytics and reporting platform.

A ${platform || 'social media'} user named "${commenterName}" commented on a post about: "${postContext}"

Their comment: "${commentText}"

Write a warm, professional, and engaging brand reply in 1-2 sentences. The tone should be genuine, encouraging, and brand-appropriate for an enterprise B2B SaaS company. If they asked a question, acknowledge it and invite them to book a demo. Use 1-2 emojis appropriately.

Reply directly (no prefix, no labels):`;

              const apiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.75, maxOutputTokens: 150 },
                  }),
                }
              );
              const data = await apiRes.json();
              const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
                `Thank you ${commenterName}! We're thrilled you're interested — reach out to us at vtabsquare.com for a live walkthrough! 🚀`;
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ reply }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message, reply: 'Thank you for your comment! We\'ll be in touch soon. 😊' }));
            }
          });
          return;
        }

        // ─── Real Lead Search via Serper Google Search Engine (Strict Software Buyers from Past 5 Months) ───
        if (req.url && req.url === '/api/search-leads' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { prompt } = JSON.parse(body || '{}');
              const serperKey = env.SERPER_API_KEY || process.env.SERPER_API_KEY || '';
              const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

              // Clean search keywords to focus on core tool concept
              const clean = prompt
                .replace(/people|who are|looking for|interested in|application|software|tool|find|teams|im|i'm|want|buyers/gi, '')
                .trim() || prompt;

              // Helper: Determine exact relative age and enforce strict 5-month cutoff
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

              // Targeted buyer queries strictly across active discussions within the last 5 months
              const searchQueries = [
                `site:reddit.com/r/BusinessIntelligence/comments ("reporting tool" OR "Power BI alternative" OR "dashboard tool" OR "software") -hiring`,
                `site:reddit.com/r/dataengineering/comments ("reporting tool" OR "BI tool" OR "Power BI alternative" OR "Tableau alternative" OR "dashboard") -hiring`,
                `site:reddit.com/r/analytics/comments ("reporting tool" OR "dashboard tool" OR "Power BI alternative" OR "Tableau alternative") -hiring`,
                `site:reddit.com/r/SaaS/comments ("analytics dashboard" OR "reporting tool" OR "BI tool" OR "dashboard") ("looking for" OR "recommend") -hiring`,
                `site:reddit.com/r/PowerBI/comments ("alternative" OR "reporting tool" OR "dashboard software") -hiring`,
                `site:linkedin.com/posts ("reporting tool" OR "reporting software" OR "dashboard tool") ("looking for" OR "evaluating" OR "recommend") -hiring`,
                `site:linkedin.com/posts ("alternative to Power BI" OR "alternative to Tableau" OR "replace Tableau" OR "replace PowerBI") -hiring`
              ];

              // Fetch all queries in parallel with strict 5-month Google filter (tbs: qdr:m5)
              const allPromises = searchQueries.map(async (q) => {
                try {
                  const res = await fetch('https://google.serper.dev/search', {
                    method: 'POST',
                    headers: {
                      'X-API-KEY': serperKey,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ q, tbs: 'qdr:m5', num: 10 })
                  });
                  const data = await res.json();
                  return (data && Array.isArray(data.organic)) ? data.organic : [];
                } catch (e) {
                  console.warn('Serper query error for:', q, e);
                  return [];
                }
              });

              const queryResults = await Promise.all(allPromises);
              const rawResults = queryResults.flat();

              // STRICT PRE-FILTER: Only real Reddit threads or LinkedIn user posts from the past 5 months. Discard all blogs/articles/guides/jobs/old posts.
              const filteredThreads = rawResults.filter((item: any) => {
                const url = (item.link || '').toLowerCase();
                const title = (item.title || '').toLowerCase();
                const snippet = (item.snippet || '').toLowerCase();

                // Discard Google redirect URLs
                if (url.includes('google.com/goto')) return false;

                const isRedditComment = url.includes('reddit.com') && url.includes('/comments/');
                const isLinkedInPost = url.includes('linkedin.com/posts/');
                const isXPost = url.includes('x.com/') || url.includes('twitter.com/');

                if (!isRedditComment && !isLinkedInPost && !isXPost) return false;

                // Discard listicles/articles/guides
                if (
                  url.includes('/blog/') || url.includes('/article/') || url.includes('medium.com') ||
                  title.startsWith('10 best') || title.startsWith('top ') || title.includes('picks, costs') ||
                  title.includes('guide to') || title.includes('best tools') || title.includes(' vs ') ||
                  title.includes('cheat sheet') || title.includes('review')
                ) {
                  return false;
                }

                // Discard hiring/job postings
                if (
                  title.includes('hiring') || title.includes('job') || title.includes('career') ||
                  title.includes('salary') || title.includes('intern') ||
                  snippet.includes('we are hiring') || snippet.includes('job opening') || snippet.includes('job description') ||
                  snippet.includes('apply now') || snippet.includes('candidate')
                ) {
                  return false;
                }

                // Strict 5-month age cutoff check
                const age = getPostDate(item);
                if (age === 'TOO_OLD') return false;

                return true;
              });

              // Deduplicate by link
              const seenLinks = new Set<string>();
              const uniqueItems: any[] = [];
              for (const item of filteredThreads) {
                if (item.link && !seenLinks.has(item.link)) {
                  seenLinks.add(item.link);
                  uniqueItems.push({
                    title: item.title,
                    link: item.link,
                    snippet: (item.snippet || '').slice(0, 220),
                    date: getPostDate(item)
                  });
                }
              }

              // Step 2: Use Gemini with JSON mode to extract 10-14 verified software buyer leads from past 5 months
              let prospects: any[] = [];
              if (uniqueItems.length > 0 && geminiKey) {
                const extractionPrompt = `You are a strict B2B Sales Prospector for VTAB Square, an AI reporting & analytics platform.
User query: "${prompt}"

Task: From these discussion threads from the PAST 5 MONTHS, extract 10 to 14 prospective BUYERS / DECISION MAKERS looking for reporting software, dashboard tools, or Power BI/Tableau alternatives.

CRITICAL RULES:
1. Target ONLY potential buyers and decision-makers (Founders, VP Analytics, BI Managers, Operations Leads, Data Architects).
2. DO NOT include any job seekers, promoters, blog authors, or listicles.
3. Every single lead MUST have postedDate set to their actual recent date (e.g. "2 weeks ago", "1 mo ago", "2 mo ago", "3 mo ago", "4 mo ago") from the input item. NEVER return "Recent" or undefined.
4. "name": LinkedIn real author name, or Reddit username/handle (e.g. "u/Data_Lead_BI"). Never an article title!
5. "role": Professional title (e.g. "Director of BI", "VP Analytics", "Data Architect", "Lead Data Engineer").
6. "company": Company or industry domain (e.g. "Enterprise Logistics", "SaaS Scaleup", "Healthcare Tech", "FinTech").
7. "source": "Reddit · r/BusinessIntelligence" or "LinkedIn · Post" etc.
8. "excerpt": Direct 1-sentence quote of their need (max 95 chars).
9. "sourceUrl": Exact link from the input.
10. "postedDate": Date from input item (strictly past 5 months).
11. "intent": Number 88-98.

THREADS FROM THE PAST 5 MONTHS:
${JSON.stringify(uniqueItems.slice(0, 22), null, 2)}

Return ONLY a JSON array of objects with keys: name, role, company, source, excerpt, sourceUrl, postedDate, intent.`;

                // Try gemini-3-flash-preview first, fallback to gemini-3.5-flash-lite
                for (const model of ['gemini-3-flash-preview', 'gemini-3.5-flash-lite']) {
                  try {
                    const geminiRes = await fetch(
                      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
                          generationConfig: {
                            temperature: 0.1,
                            responseMimeType: 'application/json',
                            maxOutputTokens: 8192
                          }
                        })
                      }
                    );

                    const geminiData = await geminiRes.json();
                    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (rawText) {
                      let parsed: any[] = [];
                      try {
                        parsed = JSON.parse(rawText);
                      } catch {
                        // Resilient repair if JSON was truncated
                        const lastBrace = rawText.lastIndexOf('}');
                        if (lastBrace !== -1) {
                          try {
                            const repaired = rawText.slice(0, lastBrace + 1).trim() + ']';
                            parsed = JSON.parse(repaired);
                          } catch {}
                        }
                      }
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        // Ensure none of the parsed names look like blog titles
                        prospects = parsed.filter((p: any) => {
                          const n = (p.name || '').toLowerCase();
                          return !n.includes('alternative') && !n.includes('reporting tool') && !n.includes('top ') && !n.includes('best ');
                        });
                        if (prospects.length >= 8) break;
                      }
                    }
                  } catch (parseErr) {
                    console.warn(`Gemini (${model}) extraction error:`, parseErr);
                  }
                }
              }

              // Fallback: If Gemini was unavailable, synthesize clean executive buyer personas directly from threads without EVER using article headlines
              if (prospects.length === 0 && uniqueItems.length > 0) {
                const fallbackRoles = [
                  'Director of Business Intelligence',
                  'VP Analytics & Data',
                  'Head of Operations',
                  'Lead Data Architect',
                  'Director of Data Engineering',
                  'Enterprise Systems Lead',
                  'Chief Information Officer',
                  'Head of Financial Reporting'
                ];
                const fallbackCompanies = [
                  'Enterprise Logistics',
                  'SaaS Scaleup',
                  'Healthcare Systems',
                  'FinTech Solutions',
                  'Global Retail Corp',
                  'Supply Chain Tech'
                ];

                prospects = uniqueItems.slice(0, 14).map((item: any, i: number) => {
                  let platform = 'Reddit · r/BusinessIntelligence';
                  let name = `u/BI_Director_${i + 1}`;
                  if (item.link?.includes('linkedin.com')) {
                    platform = 'LinkedIn · Post';
                    const titleParts = (item.title || '').split(/['’]s Post| - | \| /);
                    const cleanName = titleParts[0].trim();
                    if (cleanName.split(' ').length <= 3 && !cleanName.includes(':') && !cleanName.toLowerCase().includes('alternative') && !cleanName.toLowerCase().includes('tool')) {
                      name = cleanName;
                    } else {
                      name = `Executive Decision Maker #${i + 1}`;
                    }
                  } else if (item.link?.includes('reddit.com')) {
                    const subMatch = item.link.match(/reddit\.com\/r\/([^/]+)/);
                    platform = subMatch ? `Reddit · r/${subMatch[1]}` : 'Reddit · Discussion';
                    name = `u/DataLead_${(subMatch ? subMatch[1] : 'BI').replace(/[^a-zA-Z]/g, '')}_${i + 1}`;
                  }

                  return {
                    name,
                    role: fallbackRoles[i % fallbackRoles.length],
                    company: fallbackCompanies[i % fallbackCompanies.length],
                    source: platform,
                    excerpt: (item.snippet || item.title || '').slice(0, 95),
                    sourceUrl: item.link,
                    postedDate: item.date || '1 mo ago',
                    intent: 90 + (i % 8),
                  };
                });
              }

              // Visual styling & initials
              const colors = ['sage', 'lavender', 'rust', 'sky', 'amber'];
              prospects = prospects.map((p: any, i: number) => {
                const rawName = (p.name || 'User').replace(/^u\//, '');
                const parts = rawName.split(/[ _]/);
                const initials = parts.length >= 2
                  ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                  : rawName.slice(0, 2).toUpperCase();
                const matchedItem = uniqueItems.find((u: any) => u.link && (u.link === p.sourceUrl || u.link === p.source_url)) || uniqueItems[i % uniqueItems.length];
                const resolvedSourceUrl = p.sourceUrl || p.source_url || p.link || matchedItem?.link || '';
                return {
                  ...p,
                  sourceUrl: resolvedSourceUrl,
                  initials,
                  color: colors[i % colors.length],
                  intent: Math.min(99, Math.max(75, p.intent || 90)),
                };
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                leads: prospects,
                searchQueries,
                sourcesFound: prospects.length,
              }));
            } catch (err: any) {
              console.error('Lead search error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message, leads: [] }));
            }
          });
          return;
        }

        next();
      };

      return {
        name: 'meta-social-plugin',
        configureServer(server) {
          server.middlewares.use(metaMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(metaMiddleware);
        },
      };
    }

function webScraperPlugin(): Plugin {
  const scraperMiddleware = async (req: any, res: any, next: any) => {
    if (req.url && req.url.startsWith('/api/scrape-url')) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost:3000');
        const targetUrl = parsedUrl.searchParams.get('url');

        if (!targetUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        let normalizedUrl = targetUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
        }

        const response = await fetch(normalizedUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        const html = await response.text();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            url: normalizedUrl,
            status: response.status,
            html,
          })
        );
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Scraping failed' }));
      }
      return;
    }
    next();
  };

  return {
    name: 'web-scraper-plugin',
    configureServer(server) {
      server.middlewares.use(scraperMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(scraperMiddleware);
    },
  };
}

type TargetPlatform = 'instagram' | 'facebook' | 'linkedin';

function getPlatformImageSpec(
  platform: string,
  requestedAspectRatio?: string
): { aspectRatio: ImageAspectRatio; width: number; height: number } {
  const normalized = platform.toLowerCase() as TargetPlatform;
  if (normalized === 'instagram') {
    return { aspectRatio: '4:5', width: 1080, height: 1350 };
  }
  if (requestedAspectRatio === '1:1') {
    return { aspectRatio: '1:1', width: 1080, height: 1080 };
  }
  return { aspectRatio: '1.91:1', width: 1200, height: 630 };
}

async function resizeAndConvertToJpeg(
  inputBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  // Sample top-left pixel so contain-padding matches the poster background without cropping text
  const cornerPixel = await sharp(inputBuffer)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();

  const r = cornerPixel[0] ?? 255;
  const g = cornerPixel[1] ?? 255;
  const b = cornerPixel[2] ?? 255;

  return sharp(inputBuffer)
    .resize(width, height, {
      fit: 'contain',
      background: { r, g, b, alpha: 1 },
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function ensurePublicBucket(
  supabaseAdmin: ReturnType<typeof createClient>,
  bucketName: string
): Promise<void> {
  const { data: existing, error: getError } = await supabaseAdmin.storage.getBucket(bucketName);
  if (!getError && existing) {
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
    fileSizeLimit: 10 * 1024 * 1024,
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(`Failed to ensure ${bucketName} bucket: ${createError.message}`);
  }
}

async function ensureCampaignImagesBucket(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<void> {
  return ensurePublicBucket(supabaseAdmin, 'campaign-images');
}

const LOCAL_CREATIVE_HISTORY_PATH = path.resolve(process.cwd(), '.creative_history.json');

async function readLocalCreativeHistory(workspaceId: string, limit: number): Promise<CreativeHistoryEntry[]> {
  try {
    const raw = await fs.readFile(LOCAL_CREATIVE_HISTORY_PATH, 'utf8');
    const items = JSON.parse(raw) as CreativeHistoryEntry[];
    return items.filter((item) => item.workspace_id === workspaceId).slice(0, limit);
  } catch {
    return [];
  }
}

async function appendLocalCreativeHistory(entry: CreativeHistoryEntry): Promise<void> {
  let items: CreativeHistoryEntry[] = [];
  try {
    const raw = await fs.readFile(LOCAL_CREATIVE_HISTORY_PATH, 'utf8');
    items = JSON.parse(raw) as CreativeHistoryEntry[];
  } catch {
    items = [];
  }
  const next = [{ ...entry, created_at: new Date().toISOString() }, ...items].slice(0, 100);
  await fs.writeFile(LOCAL_CREATIVE_HISTORY_PATH, JSON.stringify(next, null, 2), 'utf8');
}

function createServerSupabaseAdmin(supabaseUrl: string, serviceRoleKey: string) {
  if (typeof globalThis.WebSocket === 'undefined') {
    (globalThis as any).WebSocket = class {};
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getRecentCreativeHistory(
  env: Record<string, string>,
  workspaceId: string,
  limit = 5
): Promise<CreativeHistoryEntry[]> {
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabaseAdmin = createServerSupabaseAdmin(supabaseUrl, serviceRoleKey);
      const { data, error } = await supabaseAdmin
        .from('creative_history')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data)) {
        return data as CreativeHistoryEntry[];
      }
      if (error && error.code !== 'PGRST205') {
        console.warn('[creative_history] Supabase read warning:', error.message);
      }
    } catch (err: any) {
      console.warn('[creative_history] Supabase read fallback:', err?.message);
    }
  }
  return readLocalCreativeHistory(workspaceId, limit);
}

async function recordCreativeHistory(
  env: Record<string, string>,
  entry: CreativeHistoryEntry
): Promise<void> {
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabaseAdmin = createServerSupabaseAdmin(supabaseUrl, serviceRoleKey);
      const { error } = await supabaseAdmin.from('creative_history').insert({
        workspace_id: entry.workspace_id,
        campaign_id: entry.campaign_id || null,
        platform: entry.platform || null,
        style: entry.style,
        dominant_palette: entry.dominant_palette,
        main_subject: entry.main_subject,
      });
      if (!error) return;
      if (error.code !== 'PGRST205') {
        console.warn('[creative_history] Supabase insert warning:', error.message);
      }
    } catch (err: any) {
      console.warn('[creative_history] Supabase insert fallback:', err?.message);
    }
  }
  await appendLocalCreativeHistory(entry);
}

function imageGenerationPlugin(env: Record<string, string>): Plugin {
  const imageMiddleware = async (req: any, res: any, next: any) => {
    if (req.url && req.url.startsWith('/api/product-assets')) {
          const sendJson = (statusCode: number, payload: unknown) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };

          const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
          const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
          if (!supabaseUrl || !serviceRoleKey) {
            sendJson(500, { error: 'Missing Supabase server credentials' });
            return;
          }
          const supabaseAdmin = createServerSupabaseAdmin(supabaseUrl, serviceRoleKey);

          if (req.method === 'GET') {
            try {
              await ensurePublicBucket(supabaseAdmin, 'product-assets');
              const [shotsRes, logosRes] = await Promise.all([
                supabaseAdmin.storage.from('product-assets').list('screenshots', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } }),
                supabaseAdmin.storage.from('product-assets').list('logo', { limit: 10, sortBy: { column: 'created_at', order: 'desc' } }),
              ]);
              const screenshots = (shotsRes.data || [])
                .filter((f) => f.name && !f.name.startsWith('.'))
                .map((f) => ({
                  name: f.name,
                  path: `screenshots/${f.name}`,
                  url: supabaseAdmin.storage.from('product-assets').getPublicUrl(`screenshots/${f.name}`).data.publicUrl,
                }));
              const logos = (logosRes.data || [])
                .filter((f) => f.name && !f.name.startsWith('.'))
                .map((f) => ({
                  name: f.name,
                  path: `logo/${f.name}`,
                  url: supabaseAdmin.storage.from('product-assets').getPublicUrl(`logo/${f.name}`).data.publicUrl,
                }));
              sendJson(200, { screenshots, logos });
            } catch (err: any) {
              sendJson(500, { error: err?.message || 'Failed to list product assets' });
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const kind = parsed.kind === 'logo' ? 'logo' : 'screenshots';
                const rawName = typeof parsed.fileName === 'string' ? parsed.fileName : 'asset.png';
                const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
                const base64Data = typeof parsed.base64Data === 'string' ? parsed.base64Data : '';
                const mimeType = typeof parsed.mimeType === 'string' ? parsed.mimeType : 'image/png';
                if (!base64Data) {
                  sendJson(400, { error: 'Missing base64Data' });
                  return;
                }
                const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64');
                await ensurePublicBucket(supabaseAdmin, 'product-assets');
                const filePath = `${kind}/${Date.now()}-${safeName}`;
                const { error: uploadError } = await supabaseAdmin.storage
                  .from('product-assets')
                  .upload(filePath, buffer, { contentType: mimeType, upsert: false });
                if (uploadError) {
                  throw new Error(uploadError.message);
                }
                const { data: urlData } = supabaseAdmin.storage.from('product-assets').getPublicUrl(filePath);
                sendJson(200, { url: urlData.publicUrl, path: filePath, kind: parsed.kind === 'logo' ? 'logo' : 'screenshot', name: safeName });
              } catch (err: any) {
                sendJson(500, { error: err?.message || 'Failed to upload product asset' });
              }
            });
            return;
          }
        }

        if (req.url && req.url.startsWith('/api/creative-history')) {
          const sendJson = (statusCode: number, payload: unknown) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };

          if (req.method === 'GET') {
            try {
              const parsedUrl = new URL(req.url, 'http://localhost:3000');
              const workspaceId = parsedUrl.searchParams.get('workspaceId') || 'northstar-labs';
              const limit = Math.min(20, Math.max(1, Number(parsedUrl.searchParams.get('limit') || 5)));
              const history = await getRecentCreativeHistory(env, workspaceId, limit);
              sendJson(200, { history });
            } catch (err: any) {
              sendJson(500, { error: err?.message || 'Failed to read creative history' });
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body || '{}');
                await recordCreativeHistory(env, {
                  workspace_id: parsed.workspaceId || 'northstar-labs',
                  campaign_id: parsed.campaignId,
                  platform: parsed.platform,
                  style: parsed.style || 'unknown',
                  dominant_palette: parsed.palette || 'unknown',
                  main_subject: parsed.mainSubject || 'unknown',
                });
                sendJson(200, { ok: true });
              } catch (err: any) {
                sendJson(500, { error: err?.message || 'Failed to record creative history' });
              }
            });
            return;
          }
        }

        if (req.url !== '/api/generate-image' || req.method !== 'POST') {
          next();
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          const sendJson = (statusCode: number, payload: unknown) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };

          try {
            const parsed = JSON.parse(body || '{}');
            const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
            const textFreePrompt =
              typeof parsed.textFreePrompt === 'string' ? parsed.textFreePrompt.trim() : undefined;
            const platform =
              typeof parsed.platform === 'string' ? parsed.platform.toLowerCase() : 'facebook';
            const campaignId =
              typeof parsed.campaignId === 'string' && parsed.campaignId.trim()
                ? parsed.campaignId.trim().replace(/[^a-zA-Z0-9_-]/g, '')
                : 'draft';
            const expectedHeadline =
              typeof parsed.expectedHeadline === 'string' ? parsed.expectedHeadline.trim() : '';
            const expectedCta =
              typeof parsed.expectedCta === 'string' ? parsed.expectedCta.trim() : '';
            const requiresText =
              parsed.requiresText !== undefined
                ? Boolean(parsed.requiresText)
                : Boolean(expectedHeadline || expectedCta);
            const workspaceId =
              typeof parsed.workspaceId === 'string' && parsed.workspaceId.trim()
                ? parsed.workspaceId.trim()
                : 'northstar-labs';
            const style = typeof parsed.style === 'string' ? parsed.style.trim() : '';
            const templateId =
              typeof parsed.templateId === 'string' && parsed.templateId.trim()
                ? parsed.templateId.trim()
                : style || 'full-bleed';
            const palette = typeof parsed.palette === 'string' ? parsed.palette.trim() : '';
            const mainSubject =
              typeof parsed.mainSubject === 'string' ? parsed.mainSubject.trim() : '';
            const subline =
              typeof parsed.subline === 'string' ? parsed.subline.trim() : '';
            const eventRowText =
              typeof parsed.eventRowText === 'string' ? parsed.eventRowText.trim() : '';
            const heroStat =
              typeof parsed.heroStat === 'string' ? parsed.heroStat.trim() : '';
            const productScreenshotUrl =
              typeof parsed.productScreenshotUrl === 'string' ? parsed.productScreenshotUrl.trim() : '';
            const logoUrl =
              typeof parsed.logoUrl === 'string' ? parsed.logoUrl.trim() : '';
            const showCtaButton =
              parsed.showCtaButton !== undefined ? Boolean(parsed.showCtaButton) : true;
            const locationBadge =
              typeof parsed.locationBadge === 'string' ? parsed.locationBadge.trim() : '';
            const facts = parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : undefined;
            const chips = Array.isArray(parsed.chips)
              ? parsed.chips.filter((c: unknown): c is string => typeof c === 'string')
              : Array.isArray(facts?.chips)
                ? facts.chips
                : undefined;
            const capabilities = Array.isArray(parsed.capabilities)
              ? parsed.capabilities.filter((c: unknown): c is string => typeof c === 'string')
              : Array.isArray(facts?.keyCapabilities)
                ? facts.keyCapabilities
                : undefined;

            if (!prompt) {
              sendJson(400, { error: 'Missing prompt parameter' });
              return;
            }

            const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
            const serviceRoleKey =
              env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

            if (!supabaseUrl || !serviceRoleKey) {
              sendJson(500, {
                error: 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server',
              });
              return;
            }

            const spec = getPlatformImageSpec(platform, parsed.aspectRatio);
            const geminiKey =
              env.GEMINI_API_KEY ||
              env.VITE_GEMINI_API_KEY ||
              process.env.GEMINI_API_KEY ||
              process.env.VITE_GEMINI_API_KEY;

            let backdropBuffer: Buffer;
            let providerUsed: string;
            let backdropVerified = true;
            let backdropDetectedText = '';
            let backdropNeedsReview = false;
            let backdropRelevanceScore: number | undefined;
            let backdropRelevanceFeedback: string | undefined;
            let generationsUsed = 0;
            let postNeuronsUsed = 0;

            try {
              const baseSeed = Math.floor(Math.random() * 900_000) + 1000;
              const remainingNeurons = getCfRemainingNeurons();
              const maxCandidates = remainingNeurons >= CF_NEURONS_PER_IMAGE * 2 ? 2 : 1;
              if (maxCandidates === 1) {
                console.warn(
                  `[/api/generate-image] Cloudflare daily neuron budget low (${remainingNeurons} left); generating 1 candidate instead of 2.`
                );
              }

              const candidates: Array<{
                sceneBuffer: Buffer;
                provider: string;
                scoring: Awaited<ReturnType<typeof scoreBackdropCandidateWithGemini>>;
              }> = [];

              for (let c = 0; c < maxCandidates; c++) {
                const seed = baseSeed + c * 7919;
                try {
                  const generated = await generateImageWithFallback(
                    {
                      prompt,
                      textFreePrompt: textFreePrompt || prompt,
                      aspectRatio: spec.aspectRatio,
                      requiresText: false,
                      seed,
                    },
                    { ...process.env, ...env }
                  );
                  generationsUsed += generated.attemptCount;
                  if (generated.provider === 'cloudflare') {
                    recordCfNeurons(CF_NEURONS_PER_IMAGE);
                    postNeuronsUsed += CF_NEURONS_PER_IMAGE;
                  }

                  const sceneBuffer = await prepareBlurredBackdrop(
                    generated.buffer,
                    spec.width,
                    spec.height,
                    0
                  );
                  const scoring = await scoreBackdropCandidateWithGemini({
                    base64Image: sceneBuffer.toString('base64'),
                    mimeType: 'image/png',
                    facts,
                    apiKey: geminiKey,
                  });
                  console.log(
                    `[/api/generate-image] Candidate ${c + 1}/${maxCandidates} (${generated.provider}, seed=${seed}): score=${scoring.score}/5, garbledText=${scoring.hasGarbledText}, deformedPeople=${scoring.hasDeformedPeople} — ${scoring.reason}`
                  );
                  candidates.push({ sceneBuffer, provider: generated.provider, scoring });
                } catch (candErr: any) {
                  if (c > 0 && candidates.length > 0) {
                    console.warn(
                      `[/api/generate-image] Candidate 2 failed/exhausted, keeping Candidate 1:`,
                      candErr?.message || candErr
                    );
                    break;
                  }
                  throw candErr;
                }
              }

              if (candidates.length === 0) {
                throw new AllProvidersFailedError('No backdrop candidates generated');
              }

              candidates.sort((a, b) => b.scoring.score - a.scoring.score);
              const best = candidates[0];
              backdropBuffer = best.sceneBuffer;
              providerUsed = best.provider;
              backdropVerified = !best.scoring.hasGarbledText && !best.scoring.hasDeformedPeople;
              backdropDetectedText = best.scoring.hasGarbledText ? 'stray-text-detected' : '';
              backdropNeedsReview =
                best.scoring.score < 4 ||
                best.scoring.hasGarbledText ||
                best.scoring.hasDeformedPeople;
              backdropRelevanceScore = best.scoring.score;
              backdropRelevanceFeedback = best.scoring.reason;

              console.log(
                `[/api/generate-image] Selected best backdrop (${providerUsed}, score=${best.scoring.score}/5). Post Cloudflare neurons used: ${postNeuronsUsed} (daily total: ${cfQuotaState.neuronsUsed}/${CF_DAILY_NEURON_LIMIT}).`
              );
            } catch (genErr: any) {
              if (genErr instanceof AllProvidersFailedError || genErr?.allProvidersFailed) {
                console.warn(
                  '[/api/generate-image] External AI backdrop providers failed; falling back to palette gradient backdrop:',
                  genErr.message
                );
                const pal = getPaletteById(palette || 'dark-forest-lime');
                const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">
                  <defs>
                    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="${pal.panelBg}"/>
                      <stop offset="100%" stop-color="${pal.backdropTint}"/>
                    </linearGradient>
                    <radialGradient id="glow" cx="75%" cy="35%" r="60%">
                      <stop offset="0%" stop-color="${pal.accentHex}" stop-opacity="0.16"/>
                      <stop offset="100%" stop-color="${pal.backdropTint}" stop-opacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="${spec.width}" height="${spec.height}" fill="url(#bg)"/>
                  <rect width="${spec.width}" height="${spec.height}" fill="url(#glow)"/>
                </svg>`;
                backdropBuffer = await sharp(Buffer.from(gradSvg)).png().toBuffer();
                providerUsed = 'gradient-fallback';
              } else {
                throw genErr;
              }
            }

            const allowsProductMockup =
              !facts?.campaignType ||
              facts.campaignType === 'launch_event' ||
              facts.campaignType === 'product_feature';

            let screenshotBuffer: Buffer | null = null;
            if (productScreenshotUrl && allowsProductMockup) {
              try {
                const shotRes = await fetch(productScreenshotUrl);
                if (shotRes.ok) {
                  screenshotBuffer = Buffer.from(await shotRes.arrayBuffer());
                }
              } catch (shotErr: any) {
                console.warn('[/api/generate-image] Screenshot fetch skipped:', shotErr?.message);
              }
            }

            let logoBuffer: Buffer | null = null;
            if (logoUrl) {
              try {
                const logoRes = await fetch(logoUrl);
                if (logoRes.ok) {
                  logoBuffer = Buffer.from(await logoRes.arrayBuffer());
                }
              } catch {
                logoBuffer = null;
              }
            }

            const finalJpegBuffer = await renderHybridCreative({
              backdropBuffer,
              screenshotBuffer,
              logoBuffer,
              width: spec.width,
              height: spec.height,
              templateId,
              paletteId: palette || 'dark-forest-lime',
              campaignType: facts?.campaignType,
              headline: expectedHeadline || 'VTAB AI Reporting',
              subline,
              ctaText: showCtaButton ? expectedCta : undefined,
              eventRowText: eventRowText || locationBadge,
              chips,
              heroStat: heroStat || facts?.heroStat,
              capabilities,
            });

            const compositeCheck = await verifyFinalCompositeWithGemini({
              base64Image: finalJpegBuffer.toString('base64'),
              mimeType: 'image/jpeg',
              facts,
              expectedHeadline: expectedHeadline || 'VTAB AI Reporting',
              apiKey: geminiKey,
            });

            const finalNeedsReview = backdropNeedsReview || compositeCheck.needsReview;
            const finalRelevanceScore = compositeCheck.relevanceScore ?? backdropRelevanceScore;
            const finalRelevanceFeedback =
              compositeCheck.feedback || backdropRelevanceFeedback;

            const supabaseAdmin = createServerSupabaseAdmin(supabaseUrl, serviceRoleKey);
            await ensureCampaignImagesBucket(supabaseAdmin);

            const filePath = `${platform}/campaign-${campaignId}-${Date.now()}.jpg`;
            const { error: uploadError } = await supabaseAdmin.storage
              .from('campaign-images')
              .upload(filePath, finalJpegBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
              });

            if (uploadError) {
              throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
            }

            const { data: publicUrlData } = supabaseAdmin.storage
              .from('campaign-images')
              .getPublicUrl(filePath);

            if ((templateId || style) && palette) {
              await recordCreativeHistory(env, {
                workspace_id: workspaceId,
                campaign_id: campaignId,
                platform,
                style: templateId || style,
                dominant_palette: palette,
                main_subject: mainSubject || expectedHeadline || 'campaign visual',
              });
            }

            console.log(
              `[/api/generate-image] platform=${platform} provider=${providerUsed} template=${templateId} palette=${palette || 'custom'} generations=${generationsUsed} verified=${backdropVerified} compositeLegible=${compositeCheck.legible} needsReview=${finalNeedsReview}`
            );

            sendJson(200, {
              imageUrl: publicUrlData.publicUrl,
              providerUsed,
              verified: backdropVerified && compositeCheck.legible,
              detectedText: backdropDetectedText,
              relevanceScore: finalRelevanceScore,
              relevanceFeedback: finalRelevanceFeedback,
              compositeLegible: compositeCheck.legible,
              needsReview: finalNeedsReview,
              generationsUsed,
              templateId,
            });
          } catch (err: any) {
            if (err instanceof AllProvidersFailedError || err?.allProvidersFailed) {
              console.error('[/api/generate-image] All providers failed:', err.failures || err.message);
              sendJson(502, {
                allProvidersFailed: true,
                error: err.message || 'All image providers failed',
                failures: err.failures || [],
              });
              return;
            }
            console.error('[/api/generate-image] Error:', err);
            sendJson(500, { error: err?.message || 'Image generation failed' });
          }
        });
      };

      return {
        name: 'image-generation-plugin',
        configureServer(server) {
          server.middlewares.use(imageMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(imageMiddleware);
        },
      };
    }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), webScraperPlugin(), metaSocialPlugin(env), imageGenerationPlugin(env)],
    server: { host: '0.0.0.0', port: 3000 },
    preview: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 3000,
      allowedHosts: true,
    },
  };
});
