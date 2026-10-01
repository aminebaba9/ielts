import {gradePractice} from './progress.js';
// Cloudflare Workers Free + D1; the paid course files are protected Worker assets.
// All asset requests run through this script (wrangler.jsonc: run_worker_first=true).
const COURSE_IDS = new Set(['sp', 'rd', 'ls', 'wt1', 'wt2', 'es']);
const MODULE_COUNTS = {rd:11,ls:4,wt1:7,wt2:4,sp:3,es:8};
const SESSION_SECONDS = 12 * 60 * 60;
const AUDIO_MAX=5000000, AUDIO_CHUNK=256000, AUDIO_CAP=120000000, AUDIO_KEEP_DAYS=30, AUDIO_PER_LEARNER=8;
const H = { 'Cache-Control':'private, no-store, max-age=0', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'SAMEORIGIN' };
const enc = new TextEncoder();

function reply(data, status=200, more={}) {
  return new Response(JSON.stringify(data), { status, headers:{...H, 'Content-Type':'application/json; charset=utf-8', ...more} });
}
function text(message, status=400) { return new Response(message,{status,headers:{...H,'Content-Type':'text/plain; charset=utf-8'}}); }
function go(path) { return new Response(null,{status:302,headers:{...H,Location:path}}); }
function nowIso() { return new Date().toISOString(); }
function todayAlgiers() {
  const p = new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Algiers',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = type => p.find(x=>x.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function isDate(v) {
  return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
}
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function newSecret() { const b = new Uint8Array(32); crypto.getRandomValues(b); return base64url(b); }
async function sha256(s) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function accessReason(u) {
  if (u.role==='owner') return null;
  if (!u.active) return 'Account paused. Please contact the masterclass owner.';
  if (u.school_id !== null) {
    if (!u.school_active || !u.school_name) return 'School membership paused.';
    if (!u.school_until || u.school_until < todayAlgiers()) return 'School membership expired.';
  } else if (!u.paid_until || u.paid_until < todayAlgiers()) return 'Membership expired.';
  return null;
}
async function currentUser(request, env) {
  const c = (request.headers.get('Cookie')||'').match(/(?:^|;\s*)mcs=([A-Za-z0-9_-]{40,50})(?:;|$)/);
  if (!c) return null;
  const digest = await sha256(c[1]);
  const u = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.active,u.school_id,u.paid_until,u.session_version,
         s.name AS school_name,s.active AS school_active,s.paid_until AS school_until,
         sess.token_hash FROM sessions sess JOIN users u ON u.id=sess.user_id
         LEFT JOIN schools s ON u.school_id=s.id
         WHERE sess.token_hash=? AND sess.expires_at>? AND sess.session_version=u.session_version`).bind(digest,nowIso()).first();
  return u || null;
}
function withCookie(res, cookie) { const h = new Headers(res.headers); h.set('Set-Cookie', cookie); return new Response(res.body,{status:res.status,headers:h}); }
function expireCookie() { return 'mcs=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'; }
function sameOrigin(request) { return request.headers.get('Origin') === new URL(request.url).origin; }
async function input(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Send JSON.');
  if (Number(request.headers.get('Content-Length')||0)>16000) throw new Error('Request too large.');
  const raw = await request.text();
  if(raw.length>16000) throw new Error('Request too large.');
  const value=JSON.parse(raw);
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid data.');
  return value;
}
function schoolId(value) {
  if (value===null || value===undefined || value==='') return null;
  const id=Number(value);
  if (!Number.isSafeInteger(id) || id<1) throw new Error('Invalid school.');
  return id;
}
function seats(value) {
  const n=Number(value);
  if (!Number.isSafeInteger(n)||n<1||n>1000) throw new Error('Seats must be between 1 and 1000.');
  return n;
}
function cleanName(s) { if(typeof s!=='string'||s.trim().length<2||s.trim().length>120) throw new Error('Name must be 2–120 characters.'); return s.trim(); }
function status(v) { if(v!==true && v!==false) throw new Error('Invalid status.'); return v?1:0; }
function membershipDate(v) { if(!isDate(v)) throw new Error('Enter a valid paid-through date.'); return v; }
async function serveAsset(request, env, file) {
  const url = new URL('/'+file, request.url);
  const asset = await env.ASSETS.fetch(new Request(url,{method:'GET'}));
  if (!asset.ok) return text('Asset unavailable.',404);
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control',H['Cache-Control']);
  headers.set('X-Content-Type-Options',H['X-Content-Type-Options']);
  headers.set('X-Frame-Options','SAMEORIGIN');
  headers.delete('ETag');
  return new Response(asset.body,{status:asset.status,headers});
}
async function login(request,env) {
  const b=await input(request);
  const email=String(b.email||'').trim().toLowerCase().slice(0,254);
  const code=String(b.code||'');
  if (!email.includes('@') || code.length<16 || code.length>150) return reply({error:'Incorrect email or access code.'},401);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const key=await sha256(ip+':'+email);
  const cutoff=Math.floor(Date.now()/1000)-900;
  await env.DB.prepare('DELETE FROM login_failures WHERE created_at<?').bind(cutoff).run();
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key_hash=?').bind(key).first();
  if (count.n>=10) return reply({error:'Too many attempts. Try again in 15 minutes.'},429);
  const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  const hash=await sha256(code);
  if(!u || u.access_hash!==hash){
    await env.DB.prepare('INSERT INTO login_failures(key_hash,created_at) VALUES(?,?)').bind(key,Math.floor(Date.now()/1000)).run();
    return reply({error:'Incorrect email or access code.'},401);
  }
  await env.DB.prepare('DELETE FROM login_failures WHERE key_hash=?').bind(key).run();
  const token=newSecret(), digest=await sha256(token);
  const expiry=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(nowIso()).run();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,session_version,expires_at) VALUES(?,?,?,?)')
    .bind(digest,u.id,u.session_version,expiry).run();
  const full=await env.DB.prepare(`SELECT u.*,s.name AS school_name,s.active AS school_active,
    s.paid_until AS school_until FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=?`).bind(u.id).first();
  const r=reply({ok:true,role:u.role,active:!accessReason(full)});
  return withCookie(r,`mcs=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
}
async function overview(env) {
  const [schools,users]=await Promise.all([
    env.DB.prepare(`SELECT s.id,s.name,s.seat_limit,s.paid_until,s.active,COUNT(u.id) AS used_seats
      FROM schools s LEFT JOIN users u ON u.school_id=s.id GROUP BY s.id ORDER BY s.name`).all(),
    env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.school_id,u.paid_until,u.active,s.name AS school_name
      FROM users u LEFT JOIN schools s ON s.id=u.school_id ORDER BY u.id DESC`).all()
  ]);
  return reply({schools:schools.results,users:users.results,today:todayAlgiers()});
}
async function freeSchool(env,id,except=null) {
  const s=await env.DB.prepare('SELECT * FROM schools WHERE id=?').bind(id).first();
  if(!s) throw new Error('School not found.');
  const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE school_id=? AND id!=?').bind(id,except||0).first();
  if(n.n>=s.seat_limit) throw new Error('School has no free seats.');
  return s;
}
async function adminAction(path,body,env) {
  const b=body;
  if(path==='/api/admin/schools'){
    const name=cleanName(b.name), limit=seats(b.seat_limit), until=membershipDate(b.paid_until);
    const result=await env.DB.prepare('INSERT INTO schools(name,seat_limit,paid_until,active) VALUES(?,?,?,1)')
      .bind(name,limit,until).run();
    return reply({ok:true,id:result.meta.last_row_id});
  }
  let m=path.match(/^\/api\/admin\/schools\/(\d+)$/);
  if(m){
    const id=Number(m[1]),name=cleanName(b.name),limit=seats(b.seat_limit),until=membershipDate(b.paid_until),active=status(b.active);
    const used=await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE school_id=?').bind(id).first();
    if(used.n>limit) throw new Error(`School has ${used.n} assigned members; move them before reducing seats.`);
    const r=await env.DB.prepare('UPDATE schools SET name=?,seat_limit=?,paid_until=?,active=? WHERE id=?').bind(name,limit,until,active,id).run();
    if(!r.meta.changes) throw new Error('School not found.');
    return reply({ok:true});
  }
  if(path==='/api/admin/users'){
    const name=cleanName(b.name), email=String(b.email||'').trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email.');
    if(!['teacher','student'].includes(b.role)) throw new Error('Choose teacher or student.');
    const sid=schoolId(b.school_id);
    if(sid) await freeSchool(env,sid);
    const until=sid?null:membershipDate(b.paid_until);
    const code=newSecret(), hash=await sha256(code);
    try {
      const r=await env.DB.prepare(`INSERT INTO users(name,email,role,access_hash,school_id,paid_until,active)
        VALUES(?,?,?,?,?,?,1)`).bind(name,email,b.role,hash,sid,until).run();
      // The generated code is displayed once; D1 stores only its SHA-256 digest.
      return reply({ok:true,id:r.meta.last_row_id,access_code:code});
    } catch(e) {
      if(String(e).includes('UNIQUE')) throw new Error('Email already used.');
      throw e;
    }
  }
  m=path.match(/^\/api\/admin\/users\/(\d+)\/rotate$/);
  if(m){
    const id=Number(m[1]);
    const code=newSecret(),hash=await sha256(code);
    const r=await env.DB.prepare(`UPDATE users SET access_hash=?,session_version=session_version+1
      WHERE id=? AND role!='owner'`).bind(hash,id).run();
    if(!r.meta.changes) throw new Error('Customer not found.');
    return reply({ok:true,access_code:code});
  }
  m=path.match(/^\/api\/admin\/users\/(\d+)$/);
  if(m){
    const id=Number(m[1]);
    const old=await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first();
    if(!old||old.role==='owner') throw new Error('Customer not found.');
    if(!['teacher','student'].includes(b.role)) throw new Error('Choose teacher or student.');
    const name=cleanName(b.name);
    const sid=schoolId(b.school_id);
    if(sid) await freeSchool(env,sid,id);
    const until=sid?null:membershipDate(b.paid_until),active=status(b.active);
    await env.DB.prepare('UPDATE users SET name=?,role=?,school_id=?,paid_until=?,active=? WHERE id=?')
      .bind(name,b.role,sid,until,active,id).run();
    return reply({ok:true});
  }
  return text('Not found.',404);
}


function asInt(v,min,max,label) {
  if(!Number.isInteger(v)||v<min||v>max) throw new Error(`Invalid ${label}.`);
  return v;
}
async function ownProgress(env,id) {
  const [positions,visits,attempts,writing,speaking,reviews,oldNotes] = await Promise.all([
    env.DB.prepare('SELECT deck,module_index,slide_index,seen_at FROM lesson_positions WHERE user_id=? ORDER BY seen_at DESC').bind(id).all(),
    env.DB.prepare('SELECT deck,module_index,first_seen_at FROM module_visits WHERE user_id=? ORDER BY deck,module_index').bind(id).all(),
    env.DB.prepare('SELECT id,deck,module_index,score,total,submitted_at FROM practice_history WHERE user_id=? ORDER BY submitted_at,id').bind(id).all(),
    env.DB.prepare('SELECT id,deck,module_index,response,word_count,submitted_at FROM writing_history WHERE user_id=? ORDER BY submitted_at DESC,id DESC').bind(id).all(),
    env.DB.prepare(`SELECT sh.id,sh.part,sh.duration_seconds,sh.submitted_at,
      CASE WHEN ar.status='ready' AND ar.created_at>=? THEN sh.audio_id ELSE NULL END AS audio_id
      FROM speaking_history sh LEFT JOIN audio_recordings ar ON sh.audio_id=ar.id
      WHERE sh.user_id=? ORDER BY sh.submitted_at DESC,sh.id DESC`).bind(new Date(Date.now()-AUDIO_KEEP_DAYS*86400000).toISOString(),id).all(),
    env.DB.prepare(`SELECT r.id,r.skill,r.activity_id,r.rating,r.note,r.created_at,u.name AS author
      FROM teacher_reviews r JOIN users u ON u.id=r.author_id WHERE r.user_id=? ORDER BY r.created_at DESC,r.id DESC`).bind(id).all(),
    env.DB.prepare(`SELECT f.skill,f.day,f.note,f.updated_at,u.name AS author FROM skill_feedback f
      JOIN users u ON u.id=f.author_id WHERE f.user_id=? ORDER BY f.updated_at DESC`).bind(id).all()
  ]);
  return {positions:positions.results,visits:visits.results,attempts:attempts.results,
    writing:writing.results,speaking:speaking.results,reviews:reviews.results,old_notes:oldNotes.results};
}
async function visibleLearner(env,staff,targetId) {
  if(staff.role!=='owner' && (staff.role!=='teacher'||!staff.school_id||accessReason(staff))) return null;
  const target=await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.school_id,s.name AS school_name
    FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=? AND u.role!='owner'`).bind(targetId).first();
  if(!target) return null;
  if(staff.role==='teacher' && (target.role!=='student'||target.school_id!==staff.school_id)) return null;
  return target;
}
async function learnersList(env,staff) {
  if(staff.role!=='owner' && (staff.role!=='teacher'||!staff.school_id||accessReason(staff))) return reply({error:'Not permitted.'},403);
  const filter=staff.role==='owner'?"u.role!='owner'":"u.role='student' AND u.school_id=?";
  const q=`SELECT u.id,u.name,u.email,u.role,u.school_id,s.name AS school_name,
    (SELECT COUNT(*) FROM practice_history a WHERE a.user_id=u.id) AS practice_count,
    (SELECT COUNT(*) FROM writing_history w WHERE w.user_id=u.id) AS writing_count,
    (SELECT COUNT(*) FROM speaking_history sp WHERE sp.user_id=u.id) AS speaking_count,
    (SELECT COUNT(*) FROM teacher_reviews r WHERE r.user_id=u.id) AS review_count,
    (SELECT COUNT(*) FROM module_visits v WHERE v.user_id=u.id) AS modules_opened,
    (SELECT MAX(seen_at) FROM lesson_positions lp WHERE lp.user_id=u.id) AS last_lesson_at
    FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE ${filter} ORDER BY s.name,u.name`;
  const r=staff.role==='owner'?await env.DB.prepare(q).all():await env.DB.prepare(q).bind(staff.school_id).all();
  return reply({learners:r.results});
}

async function audioPost(p,request,u,env) {
  if(accessReason(u)) return reply({error:'Membership expired or paused.'},403);
  const stamp=nowIso();
  if(p==='/api/audio/init') {
    const b=await input(request);
    if(!['p1','p2','p3','combined'].includes(b.part)) throw new Error('Choose a Speaking part.');
    const duration=asInt(b.duration_seconds,1,1800,'duration');
    if(duration<({p1:30,p2:90,p3:60,combined:300}[b.part])) throw new Error('Recording too short for this Speaking activity.');
    const size=asInt(b.size_bytes,1,AUDIO_MAX,'audio size');
    const mime=String(b.mime||'').split(';')[0].trim().toLowerCase();
    if(!['audio/webm','audio/mp4','audio/ogg'].includes(mime)) throw new Error('Unsupported audio format. Try a current Chrome, Edge, Firefox or Safari.');
    const count=Math.ceil(size/AUDIO_CHUNK);
    const cutoff=new Date(Date.now()-AUDIO_KEEP_DAYS*86400000).toISOString();
    await env.DB.prepare('DELETE FROM audio_chunks WHERE recording_id IN (SELECT id FROM audio_recordings WHERE created_at<?)').bind(cutoff).run();
    await env.DB.prepare('UPDATE speaking_history SET audio_id=NULL WHERE audio_id IN (SELECT id FROM audio_recordings WHERE created_at<?)').bind(cutoff).run();
    await env.DB.prepare('DELETE FROM audio_recordings WHERE created_at<?').bind(cutoff).run();
    const used=await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM audio_recordings').first();
    if(used.bytes+size>AUDIO_CAP) return reply({error:'Private audio storage is full. Ask the owner to remove older recordings.'},413);
    const mine=await env.DB.prepare("SELECT COUNT(*) AS n FROM audio_recordings WHERE user_id=? AND status='ready'").bind(u.id).first();
    if(mine.n>=AUDIO_PER_LEARNER) return reply({error:'You have reached the recording limit. Ask the owner to remove an old recording.'},413);
    const row=await env.DB.prepare(`INSERT INTO audio_recordings(user_id,part,mime,duration_seconds,size_bytes,chunk_count,status,created_at)
      VALUES(?,?,?,?,?,?,'pending',?)`).bind(u.id,b.part,mime,duration,size,count,stamp).run();
    return reply({ok:true,id:row.meta.last_row_id,chunk_size:AUDIO_CHUNK,chunks:count});
  }
  const chunk=p.match(/^\/api\/audio\/(\d+)\/chunk\/(\d+)$/);
  if(chunk){
    const id=Number(chunk[1]),idx=Number(chunk[2]);
    const row=await env.DB.prepare('SELECT * FROM audio_recordings WHERE id=? AND user_id=? AND status=?').bind(id,u.id,'pending').first();
    if(!row||idx>=row.chunk_count) return reply({error:'Upload not found.'},404);
    if(Number(request.headers.get('Content-Length')||0)>AUDIO_CHUNK) return reply({error:'Audio chunk too large.'},413);
    if(!request.body) return reply({error:'Missing audio data.'},400);
    const reader=request.body.getReader();let n=0;const blocks=[];
    while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;
      if(n>AUDIO_CHUNK){await reader.cancel();return reply({error:'Audio chunk too large.'},413);}blocks.push(value);}
    const expected=idx===row.chunk_count-1?row.size_bytes-idx*AUDIO_CHUNK:AUDIO_CHUNK;
    if(n!==expected) return reply({error:'Incomplete audio chunk; retry upload.'},400);
    const bytes=new Uint8Array(n);let offset=0;for(const block of blocks){bytes.set(block,offset);offset+=block.length;}
    const exists=await env.DB.prepare('SELECT 1 AS present FROM audio_chunks WHERE recording_id=? AND idx=?').bind(id,idx).first();
    if(exists) return reply({error:'Chunk already received.'},409);
    await env.DB.prepare('INSERT INTO audio_chunks(recording_id,idx,bytes) VALUES(?,?,?)').bind(id,idx,bytes).run();
    return reply({ok:true});
  }
  const finish=p.match(/^\/api\/audio\/(\d+)\/finish$/);
  if(finish){
    const id=Number(finish[1]);
    const row=await env.DB.prepare('SELECT * FROM audio_recordings WHERE id=? AND user_id=?').bind(id,u.id).first();
    if(!row) return reply({error:'Recording not found.'},404);
    if(row.status==='ready') return reply({ok:true,already_saved:true});
    const uploaded=await env.DB.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(bytes)),0) AS bytes FROM audio_chunks WHERE recording_id=?').bind(id).first();
    if(uploaded.n!==row.chunk_count||uploaded.bytes!==row.size_bytes) return reply({error:'Upload incomplete. Try finishing after all chunks arrive.'},409);
    await env.DB.batch([
      env.DB.prepare("UPDATE audio_recordings SET status='ready',completed_at=? WHERE id=? AND status='pending'").bind(stamp,id),
      env.DB.prepare('INSERT INTO speaking_history(user_id,part,duration_seconds,submitted_at,audio_id) VALUES(?,?,?,?,?)')
        .bind(u.id,row.part,row.duration_seconds,stamp,id)
    ]);
    return reply({ok:true});
  }
  const del=p.match(/^\/api\/audio\/(\d+)\/delete$/);
  if(del){
    if(u.role!=='owner') return reply({error:'Owner only.'},403);
    const id=Number(del[1]);
    await env.DB.batch([
      env.DB.prepare('UPDATE speaking_history SET audio_id=NULL WHERE audio_id=?').bind(id),
      env.DB.prepare('DELETE FROM audio_chunks WHERE recording_id=?').bind(id),
      env.DB.prepare('DELETE FROM audio_recordings WHERE id=?').bind(id)
    ]);
    return reply({ok:true});
  }
  return text('Not found.',404);
}
async function audioGet(request,u,env,id) {
  if(!u||accessReason(u)) return reply({error:'Sign in and renew access.'},401);
  const row=await env.DB.prepare("SELECT * FROM audio_recordings WHERE id=? AND status='ready'").bind(id).first();
  if(!row||Date.parse(row.created_at)<Date.now()-AUDIO_KEEP_DAYS*86400000) return reply({error:'Recording unavailable.'},404);
  if(u.id!==row.user_id && !(await visibleLearner(env,u,row.user_id))) return reply({error:'Not permitted.'},403);
  const pieces=await env.DB.prepare('SELECT idx,bytes FROM audio_chunks WHERE recording_id=? ORDER BY idx').bind(id).all();
  if(pieces.results.length!==row.chunk_count) return reply({error:'Recording incomplete.'},404);
  const all=new Uint8Array(row.size_bytes);let at=0;
  for(const part of pieces.results){const bytes=new Uint8Array(part.bytes);all.set(bytes,at);at+=bytes.length;}
  if(at!==row.size_bytes) return reply({error:'Recording incomplete.'},404);
  const range=request.headers.get('Range'),match=range&&range.match(/^bytes=(\d+)-(\d*)$/);
  let start=0,end=all.length-1,code=200;
  if(range){if(!match)return text('Invalid range.',416);
    start=Number(match[1]);end=match[2]?Number(match[2]):end;
    if(start>=all.length||end>=all.length||end<start)return text('Invalid range.',416);
    code=206;
  }
  const headers={...H,'Content-Type':row.mime,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),
    'Content-Disposition':'inline; filename="speaking-practice"'};
  if(code===206) headers['Content-Range']=`bytes ${start}-${end}/${all.length}`;
  return new Response(all.slice(start,end+1),{status:code,headers});
}

async function automaticPost(p,b,u,env) {
  if(accessReason(u)) return reply({error:'Membership expired or paused.'},403);
  const stamp=nowIso();
  if(p==='/api/auto/attempt') {
    if(!['rd','ls'].includes(b.deck)) throw new Error('Invalid practice set.');
    const mod=asInt(b.mod,0,b.deck==='rd'?10:3,'module');
    const graded=gradePractice(b.deck,mod,b.answers);
    // One check can trigger twice on a slow connection; avoid recording accidental double clicks.
    const last=await env.DB.prepare(`SELECT id,score,total,submitted_at FROM practice_history
      WHERE user_id=? AND deck=? AND module_index=? ORDER BY id DESC LIMIT 1`).bind(u.id,b.deck,mod).first();
    if(last && Date.now()-Date.parse(last.submitted_at)<10000) {
      const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM practice_history WHERE user_id=? AND deck=? AND module_index=?')
        .bind(u.id,b.deck,mod).first();
      return reply({ok:true,saved:false,score:last.score,total:last.total,attempt_number:n.n});
    }
    await env.DB.prepare(`INSERT INTO practice_history(user_id,deck,module_index,score,total,submitted_at) VALUES(?,?,?,?,?,?)`)
      .bind(u.id,b.deck,mod,graded.score,graded.total,stamp).run();
    const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM practice_history WHERE user_id=? AND deck=? AND module_index=?')
      .bind(u.id,b.deck,mod).first();
    return reply({ok:true,saved:true,attempt_number:n.n,...graded});
  }
  if(p==='/api/auto/writing') {
    if(!['wt1','wt2'].includes(b.deck)) throw new Error('Choose an Academic Writing task.');
    const mod=asInt(b.mod,0,b.deck==='wt1'?6:3,'module');
    if(typeof b.response!=='string'||b.response.length>12000) throw new Error('Response must be text under 12,000 characters.');
    const response=b.response.trim(),words=response.match(/\S+/g)?.length||0;
    if(words<(b.deck==='wt1'?150:250)) throw new Error('Write at least '+(b.deck==='wt1'?150:250)+' words before submitting this task.');
    await env.DB.prepare(`INSERT INTO writing_history(user_id,deck,module_index,response,word_count,submitted_at)
      VALUES(?,?,?,?,?,?)`).bind(u.id,b.deck,mod,response,words,stamp).run();
    const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM writing_history WHERE user_id=? AND deck=? AND module_index=?')
      .bind(u.id,b.deck,mod).first();
    return reply({ok:true,word_count:words,version:n.n});
  }
  return text('Not found.',404);
}

async function progressPost(p,b,u,env) {
  if(accessReason(u)) return reply({error:'Membership expired or paused.'},403);
  const stamp=nowIso();
  if(p==='/api/progress/position') {
    if(!COURSE_IDS.has(b.deck)) throw new Error('Invalid course.');
    const mod=asInt(b.mod,0,MODULE_COUNTS[b.deck]-1,'module');
    const slide=asInt(b.slide,0,80,'slide');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO lesson_positions(user_id,deck,module_index,slide_index,seen_at) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,deck) DO UPDATE SET module_index=excluded.module_index,
        slide_index=excluded.slide_index,seen_at=excluded.seen_at`).bind(u.id,b.deck,mod,slide,stamp),
      env.DB.prepare(`INSERT INTO module_visits(user_id,deck,module_index,first_seen_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,deck,module_index) DO NOTHING`).bind(u.id,b.deck,mod,stamp)
    ]);
    return reply({ok:true});
  }
  const reviewRoute=p.match(/^\/api\/progress\/learners\/(\d+)\/review$/);
  if(reviewRoute) {
    const target=await visibleLearner(env,u,Number(reviewRoute[1]));
    if(!target) return reply({error:'Not permitted.'},403);
    if(!['writing','speaking'].includes(b.skill)) throw new Error('Choose Writing or Speaking.');
    const activityId=asInt(b.activity_id,1,2147483647,'practice activity');
    const rating=asInt(b.rating,1,5,'teacher rating');
    if(typeof b.note!=='string'||!b.note.trim()||b.note.trim().length>1200) throw new Error('Feedback must be 1–1200 characters.');
    const table=b.skill==='writing'?'writing_history':'speaking_history';
    const activity=await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).bind(activityId,target.id).first();
    if(!activity) return reply({error:'Practice activity not found for this learner.'},404);
    await env.DB.prepare(`INSERT INTO teacher_reviews(user_id,skill,activity_id,rating,note,author_id,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(target.id,b.skill,activityId,rating,b.note.trim(),u.id,stamp).run();
    return reply({ok:true});
  }
  const m=p.match(/^\/api\/progress\/learners\/(\d+)\/feedback$/);
  if(m) {
    const target=await visibleLearner(env,u,Number(m[1]));
    if(!target) return reply({error:'Not permitted.'},403);
    if(!['writing','speaking'].includes(b.skill)) throw new Error('Choose Writing or Speaking.');
    const day=asInt(b.day,b.skill==='writing'?11:16,b.skill==='writing'?15:20,'lesson day');
    if(typeof b.note!=='string'||!b.note.trim()||b.note.trim().length>1200) throw new Error('Feedback must be 1–1200 characters.');
    await env.DB.prepare(`INSERT INTO skill_feedback(user_id,skill,day,note,author_id,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,skill,day) DO UPDATE SET note=excluded.note,author_id=excluded.author_id,updated_at=excluded.updated_at`)
      .bind(target.id,b.skill,day,b.note.trim(),u.id,stamp).run();
    return reply({ok:true});
  }
  return text('Not found.',404);
}

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url), p=url.pathname, method=request.method;
      // ALL static assets must pass through this Worker; never expose course-data/*.
      if(p.startsWith('/course-data/') || p==='/hub.html' && method!=='GET') return text('Not found.',404);
      if(method==='POST') {
        if(!sameOrigin(request)) return reply({error:'Request origin not allowed.'},403);
        if(p==='/api/login') return login(request,env);
        const u=await currentUser(request,env);
        if(!u) return reply({error:'Sign in required.'},401);
        if(p==='/api/logout') {
          await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(u.token_hash).run();
          return withCookie(reply({ok:true}),expireCookie());
        }
        if(p.startsWith('/api/audio/')) {
          try{return await audioPost(p,request,u,env);}
          catch(e){if(e instanceof Error&&!String(e).includes('D1_ERROR'))return reply({error:e.message},400);throw e;}
        }
        if(p.startsWith('/api/auto/')) {
          const b=await input(request);
          try {return await automaticPost(p,b,u,env);}
          catch(e) {if(e instanceof Error && !String(e).includes('D1_ERROR')) return reply({error:e.message},400);throw e;}
        }
        if(p.startsWith('/api/progress/')) {
          const b=await input(request);
          try { return await progressPost(p,b,u,env); }
          catch(e) { if(e instanceof Error && !String(e).includes('D1_ERROR')) return reply({error:e.message},400); throw e; }
        }
        if(!p.startsWith('/api/admin/') || u.role!=='owner') return reply({error:'Not permitted.'},403);
        const b=await input(request);
        try { return await adminAction(p,b,env); }
        catch(e) { if(e instanceof Error && !String(e).includes('D1_ERROR')) return reply({error:e.message},400); throw e; }
      }
      if(method!=='GET') return text('Method not allowed.',405);
      if(p==='/ui.css') return serveAsset(request,env,'ui.css');
      if(p==='/login') return serveAsset(request,env,'login.html');
      if(p==='/expired') return serveAsset(request,env,'expired.html');
      const u=await currentUser(request,env);
      if(p==='/api/access') return !u?reply({error:'Sign in required.'},401):
        accessReason(u)?reply({error:'Membership expired.'},403):reply({ok:true});
      if(p==='/api/me') return !u?reply({error:'Sign in required.'},401):reply({name:u.name,email:u.email,role:u.role,
        school_name:u.school_name,paid_until:u.school_id?u.school_until:u.paid_until,active:!accessReason(u)});
      const sound=p.match(/^\/api\/audio\/(\d+)$/);
      if(sound) return audioGet(request,u,env,Number(sound[1]));
      if(p==='/api/progress/me') return !u?reply({error:'Sign in required.'},401):
        accessReason(u)?reply({error:'Membership expired or paused.'},403):reply(await ownProgress(env,u.id));
      if(p==='/api/progress/learners') return !u?reply({error:'Sign in required.'},401):learnersList(env,u);
      const studentProgress=p.match(/^\/api\/progress\/learners\/(\d+)$/);
      if(studentProgress) {
        if(!u) return reply({error:'Sign in required.'},401);
        const target=await visibleLearner(env,u,Number(studentProgress[1]));
        return target?reply({learner:target,...await ownProgress(env,target.id)}):reply({error:'Not permitted.'},403);
      }
      if(p==='/api/admin') return !u?reply({error:'Sign in required.'},401):
        u.role!=='owner'?reply({error:'Not permitted.'},403):overview(env);
      if(p==='/progress') return !u?go('/login'):
        accessReason(u)?go('/expired'):serveAsset(request,env,'progress.html');
      if(p==='/account') return !u?go('/login'):serveAsset(request,env,'account.html');
      if(p==='/admin') return !u?go('/login'):u.role!=='owner'?text('Not permitted.',403):serveAsset(request,env,'admin.html');
      if(p==='/' || p==='/hub.html') return !u?go('/login'):
        accessReason(u)?go('/expired'):serveAsset(request,env,'hub.html');
      const m=p.match(/^\/api\/decks\/(sp|rd|ls|wt1|wt2|es)$/);
      if(m) return !u?reply({error:'Sign in required.'},401):
        accessReason(u)?reply({error:'Membership expired.'},403):serveAsset(request,env,`course-data/${m[1]}.html`);
      return text('Not found.',404);
    } catch (e) {
      console.error('Worker request failed:',e);
      return reply({error:'An unexpected error occurred.'},500);
    }
  }
};
