const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const cleanText = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function cleanUrl(v) { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href.slice(0, 500) : ''; } catch { return ''; } }
function cleanProfile(input) {
  const socials = input?.socials || {};
  const name = cleanText(input?.name, 60);
  const slug = cleanText(input?.slug, 40).toLowerCase();
  if (!name) throw new Error('Creator name is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Page address must use lowercase letters, numbers, and single hyphens.');
  return { name, slug, bio: cleanText(input?.bio, 500), avatarUrl: cleanUrl(input?.avatarUrl), backgroundUrl: cleanUrl(input?.backgroundUrl), socials: { youtube: cleanUrl(socials.youtube), twitch: cleanUrl(socials.twitch), instagram: cleanUrl(socials.instagram), x: cleanUrl(socials.x) }, updatedAt: new Date().toISOString() };
}
function randomToken() { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
async function hashToken(token) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
export async function onRequestGet({ request, env }) {
  if (!env.CREATOR_PAGES) return json({ error: 'Storage is not configured. Add a KV binding named CREATOR_PAGES.' }, 503);
  const url = new URL(request.url); const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  const listed = await env.CREATOR_PAGES.list({ prefix: 'creator:' });
  const creators = [];
  for (const key of listed.keys.slice(0, 1000)) {
    const raw = await env.CREATOR_PAGES.get(key.name);
    if (!raw) continue;
    try { const p = JSON.parse(raw); if (!q || p.name.toLowerCase().includes(q) || p.slug.includes(q) || p.bio.toLowerCase().includes(q)) creators.push({ name: p.name, slug: p.slug, bio: p.bio, avatarUrl: p.avatarUrl, backgroundUrl: p.backgroundUrl, socials: p.socials }); } catch {}
  }
  creators.sort((a, b) => a.name.localeCompare(b.name));
  if (url.pathname.endsWith('/creators')) return json({ creators: creators.slice(0, 100) });
  return json({ creators: creators.slice(0, 100) });
}
export async function onRequestPost({ request, env }) {
  if (!env.CREATOR_PAGES) return json({ error: 'Storage is not configured. Add a KV binding named CREATOR_PAGES.' }, 503);
  let input; try { input = await request.json(); } catch { return json({ error: 'Please send valid JSON.' }, 400); }
  let profile; try { profile = cleanProfile(input); } catch (e) { return json({ error: e.message }, 400); }
  const key = 'creator:' + profile.slug;
  if (await env.CREATOR_PAGES.get(key)) return json({ error: 'That page address is already in use. Choose another.' }, 409);
  const editToken = randomToken(); const tokenHash = await hashToken(editToken);
  const record = { ...profile, tokenHash, createdAt: new Date().toISOString() };
  await env.CREATOR_PAGES.put(key, JSON.stringify(record));
  const { tokenHash: ignored, ...publicProfile } = record;
  return json({ creator: publicProfile, editToken }, 201);
}
