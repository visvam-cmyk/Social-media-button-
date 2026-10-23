/**
 * GOD OF EVERYTHING Creator Hub — Cloudflare Worker
 * Required binding: CREATOR_PAGES (KV namespace)
 * Stores creator page data only. No fan accounts, visits, or report records.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:cors});
const clean = (v, max=500) => String(v ?? '').trim().slice(0,max);
const slugOk = s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 48;
const urlOk = s => { if(!s) return true; try { const u=new URL(s); return u.protocol==='https:' || u.protocol==='http:'; } catch { return false; } };
async function digest(s) { const bytes=new TextEncoder().encode(s); const hash=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function randomKey(){const bytes=crypto.getRandomValues(new Uint8Array(32));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function publicProfile(p){const {editKeyHash, ...safe}=p;return safe;}
async function readProfile(env,slug){return await env.CREATOR_PAGES.get('profile:'+slug,'json');}
async function listProfiles(env){const list=await env.CREATOR_PAGES.list({prefix:'profile:'});const out=[];for(const k of list.keys){const p=await env.CREATOR_PAGES.get(k.name,'json');if(p)out.push(publicProfile(p));}return out.sort((a,b)=>a.name.localeCompare(b.name));}
export default {
 async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!env.CREATOR_PAGES)return json({error:'Missing CREATOR_PAGES KV binding. Configure it in Cloudflare.'},500);
  const url=new URL(request.url);const parts=url.pathname.split('/').filter(Boolean);
  if(request.method==='GET' && parts.length===1 && parts[0]==='creators')return json({creators:await listProfiles(env)});
  if(request.method==='GET' && parts.length===2 && parts[0]==='creators'){
    const slug=parts[1];if(!slugOk(slug))return json({error:'Invalid creator page address.'},400);
    const p=await readProfile(env,slug);return p?json({creator:publicProfile(p)}):json({error:'Creator page not found.'},404);
  }
  if(request.method==='POST' && url.pathname==='/creators'){
    let b;try{b=await request.json()}catch{return json({error:'Invalid JSON.'},400)}
    const p={name:clean(b.name,60),slug:clean(b.slug,48).toLowerCase(),bio:clean(b.bio,500),avatar:clean(b.avatar,1000),banner:clean(b.banner,1000),bgcolor:/^#[0-9a-fA-F]{6}$/.test(b.bgcolor)?b.bgcolor:'#211a36',youtube:clean(b.youtube,1000),twitch:clean(b.twitch,1000),instagram:clean(b.instagram,1000),xlink:clean(b.xlink,1000),other:clean(b.other,1000),createdAt:new Date().toISOString()};
    if(!p.name||!slugOk(p.slug))return json({error:'Enter a name and a valid page address using letters, numbers, and hyphens.'},400);
    for(const k of ['avatar','banner','youtube','twitch','instagram','xlink','other'])if(!urlOk(p[k]))return json({error:'Invalid URL in '+k+'. Use an http or https link.'},400);
    if(await readProfile(env,p.slug))return json({error:'That creator page address is already taken. Choose another.'},409);
    const editKey=randomKey();p.editKeyHash=await digest(editKey);
    await env.CREATOR_PAGES.put('profile:'+p.slug,JSON.stringify(p));
    return json({creator:publicProfile(p),editKey},201);
  }
  if(request.method==='PUT' && parts.length===2 && parts[0]==='creators'){
    const slug=parts[1];if(!slugOk(slug))return json({error:'Invalid creator page address.'},400);
    const p=await readProfile(env,slug);if(!p)return json({error:'Creator page not found.'},404);
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token || await digest(token)!==p.editKeyHash)return json({error:'Private edit key is missing or incorrect.'},401);
    let b;try{b=await request.json()}catch{return json({error:'Invalid JSON.'},400)}
    const updated={...p,name:clean(b.name,60),bio:clean(b.bio,500),avatar:clean(b.avatar,1000),banner:clean(b.banner,1000),bgcolor:/^#[0-9a-fA-F]{6}$/.test(b.bgcolor)?b.bgcolor:p.bgcolor,youtube:clean(b.youtube,1000),twitch:clean(b.twitch,1000),instagram:clean(b.instagram,1000),xlink:clean(b.xlink,1000),other:clean(b.other,1000),updatedAt:new Date().toISOString()};
    if(!updated.name)return json({error:'Creator name is required.'},400);
    for(const k of ['avatar','banner','youtube','twitch','instagram','xlink','other'])if(!urlOk(updated[k]))return json({error:'Invalid URL in '+k+'. Use an http or https link.'},400);
    await env.CREATOR_PAGES.put('profile:'+slug,JSON.stringify(updated));return json({creator:publicProfile(updated)});
  }
  return json({error:'Not found.'},404);
 }
};
