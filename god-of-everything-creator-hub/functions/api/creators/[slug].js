const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const cleanText = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function cleanUrl(v) { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href.slice(0, 500) : ''; } catch { return ''; } }
function cleanProfile(input, slug) {
  const socials = input?.socials || {}; const name = cleanText(input?.name, 60);
  if (!name) throw new Error('Creator name is required.');
  return { name, slug, bio: cleanText(input?.bio, 500), avatarUrl: cleanUrl(input?.avatarUrl), backgroundUrl: cleanUrl(input?.backgroundUrl), socials: { youtube: cleanUrl(socials.youtube), twitch: cleanUrl(socials.twitch), instagram: cleanUrl(socials.instagram), x: cleanUrl(socials.x) }, updatedAt: new Date().toISOString() };
}
async function hashToken(token) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
export async function onRequestGet({ params, env }) {
  if (!env.CREATOR_PAGES) return json({ error: 'Storage is not configured. Add a KV binding named CREATOR_PAGES.' }, 503);
  const slug = String(params.slug || '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: 'Creator page not found.' }, 404);
  const raw = await env.CREATOR_PAGES.get('creator:' + slug);
  if (!raw) return json({ error: 'Creator page not found.' }, 404);
  const p = JSON.parse(raw); const { tokenHash, ...creator } = p;
  return json({ creator });
}
export async function onRequestPut({ request, params, env }) {
  if (!env.CREATOR_PAGES) return json({ error: 'Storage is not configured. Add a KV binding named CREATOR_PAGES.' }, 503);
  const slug = String(params.slug || '').toLowerCase(); const key = 'creator:' + slug;
  const raw = await env.CREATOR_PAGES.get(key);
  if (!raw) return json({ error: 'Creator page not found.' }, 404);
  const current = JSON.parse(raw); const auth = request.headers.get('Authorization') || ''; const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!supplied || await hashToken(supplied) !== current.tokenHash) return json({ error: 'Invalid private edit link. Open the complete edit link you received when creating the page.' }, 403);
  let input; try { input = await request.json(); } catch { return json({ error: 'Please send valid JSON.' }, 400); }
  let profile; try { profile = cleanProfile(input, slug); } catch (e) { return json({ error: e.message }, 400); }
  const updated = { ...current, ...profile, slug, tokenHash: current.tokenHash, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  await env.CREATOR_PAGES.put(key, JSON.stringify(updated));
  const { tokenHash, ...creator } = updated;
  return json({ creator });
}
