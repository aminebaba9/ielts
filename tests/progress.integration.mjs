// Run against a FRESH local Wrangler D1 state only, never --remote.
// See README for local integration verification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:8787',persist=process.env.PROGRESS_TEST_DB;
if(!persist) throw new Error('Set PROGRESS_TEST_DB to a fresh local D1 persistence directory. Never test production.');
const tmp=mkdtempSync(join(tmpdir(),'ielts-progress-test-'));
const codes={owner:'LOCAL_TEST_OWNER_A11b22c33d44',ta:'LOCAL_TEST_TEACHER_A11b22c33',tb:'LOCAL_TEST_TEACHER_B11b22c33',sa:'LOCAL_TEST_STUDENT_A11b22c33',sb:'LOCAL_TEST_STUDENT_B11b22c33',individual:'LOCAL_TEST_INDIVIDUAL_A11b22'};
const users=[['owner@local.test','Owner','owner',null,codes.owner],['ta@local.test','Teacher A','teacher',1,codes.ta],['sa@local.test','Student A','student',1,codes.sa],['tb@local.test','Teacher B','teacher',2,codes.tb],['sb@local.test','Student B','student',2,codes.sb],['individual@local.test','Individual','student',null,codes.individual]];
const sql="INSERT INTO schools(name,seat_limit,paid_until,active) VALUES('A School',10,'2035-12-31',1),('B School',10,'2035-12-31',1);\n"+users.map(([email,name,role,school,code])=>`INSERT INTO users(email,name,role,access_hash,school_id,paid_until,active) VALUES('${email}','${name}','${role}','${createHash('sha256').update(code).digest('hex')}',${school||'NULL'},${school?'NULL':"'2035-12-31'"},1);`).join('\n');
const file=join(tmp,'fixtures.sql');writeFileSync(file,sql);
try {execFileSync(join(process.cwd(),'node_modules/.bin/wrangler'),['d1','execute','ielts-members','--local','--persist-to',persist,'--file',file],{stdio:'ignore'});}
finally {rmSync(tmp,{recursive:true,force:true});}
const req=async(path,token,body)=>{
 const r=await fetch(base+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{...(token?{Cookie:token}:{}),...(body===undefined?{}:{Origin:base,'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 let data=null;try{data=await r.json()}catch{}return {status:r.status,data,headers:r.headers};
};
async function auth(email,code){const r=await req('/api/login',null,{email,code});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
assert.equal((await req('/api/progress/me')).status,401);
assert.equal((await req('/progress')).status,302);
assert.equal((await req('/progress.html')).status,404);
const tokens=[];for(const u of users)tokens.push(await auth(u[0],u[4]));
const [owner,ta,sa,tb,sb,individual]=tokens;
assert.equal((await req('/api/me',ta)).data.role,'teacher');
assert.equal((await req('/api/me',tb)).data.role,'teacher');
assert.equal((await req('/api/progress/pathway',sa,{pathway:'5.5-6.5'})).status,404);
assert.equal((await req('/api/progress/day',sa,{day:1,completed:true})).status,404);
assert.equal((await req('/api/progress/result',sa,{task:'listening-1',correct:7,total:10})).status,404);
assert.equal((await req('/api/progress/position',sa,{deck:'rd',mod:0,slide:8,user_id:5})).status,200);
assert.equal((await req('/api/progress/me',sa)).data.attempts.length,0); // a visit is not a score
let attempt=await req('/api/auto/attempt',sa,{deck:'rd',mod:0,answers:['FALSE','FALSE','TRUE','NOT GIVEN','TRUE']});
assert.equal(attempt.status,200);assert.equal(attempt.data.attempt_number,1);assert.equal(attempt.data.score,5);
let duplicate=await req('/api/auto/attempt',sa,{deck:'rd',mod:0,answers:['TRUE','TRUE','TRUE','TRUE','TRUE']});
assert.equal(duplicate.data.saved,false);assert.equal(duplicate.data.attempt_number,1);
// Move the local-only fixture timestamp backwards to simulate a learner returning another day.
const timestampSql=join(tmpdir(),'ielts-test-shift.sql');writeFileSync(timestampSql,"UPDATE practice_history SET submitted_at='2026-01-01T00:00:00.000Z' WHERE user_id=3 AND deck='rd' AND module_index=0;");
try{execFileSync(join(process.cwd(),'node_modules/.bin/wrangler'),['d1','execute','ielts-members','--local','--persist-to',persist,'--file',timestampSql],{stdio:'ignore'});}finally{rmSync(timestampSql,{force:true});}
attempt=await req('/api/auto/attempt',sa,{deck:'rd',mod:0,answers:['TRUE','TRUE','TRUE','TRUE','TRUE']});
assert.equal(attempt.status,200);assert.equal(attempt.data.saved,true);assert.equal(attempt.data.attempt_number,2);assert.equal(attempt.data.score,2);
const listen={deck:'ls',mod:1,answers:['midday','shopping district','military museum','C','A','C','B','driver','7','15%']};
assert.equal((await req('/api/auto/attempt',sa,listen)).data.score,10);
assert.equal((await req('/api/auto/attempt',sa,{deck:'ls',mod:1,answers:['','','','','','','','','','']})).status,400);
const line=('The figure rose steadily from the first year to the final year, while the other series remained comparatively stable throughout the period. ').repeat(9);
const revision=('The table shows a clear contrast between the largest group and the smallest group; the main pattern is easy to identify in both periods. ').repeat(9);
assert.equal((await req('/api/auto/writing',sa,{deck:'wt1',mod:0,response:line})).data.version,1);
assert.equal((await req('/api/auto/writing',sa,{deck:'wt1',mod:0,response:revision})).data.version,2);
assert.equal((await req('/api/auto/writing',sa,{deck:'wt2',mod:0,response:'too short'})).status,400);
assert.equal((await req('/api/auto/speaking',sa,{part:'p1',duration_seconds:38})).status,404); // metadata-only save removed
assert.equal((await req('/api/audio/init',sa,{part:'p1',duration_seconds:29,size_bytes:1,mime:'audio/webm'})).status,400);
assert.equal((await req('/api/audio/init',sa,{part:'combined',duration_seconds:840,size_bytes:5000001,mime:'audio/webm'})).status,400);
assert.equal((await req('/api/audio/init',sa,{part:'p1',duration_seconds:40,size_bytes:10,mime:'text/plain'})).status,400);
const sound=new Uint8Array(256100);for(let i=0;i<sound.length;i++)sound[i]=i%251;
async function raw(path,token,body,range){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:token,...(body===undefined?{}:{Origin:base,'Content-Type':'application/octet-stream'}),...(range?{Range:range}:{})},body});}
const init=await req('/api/audio/init',sa,{part:'combined',duration_seconds:840,size_bytes:sound.length,mime:'audio/webm'});
assert.equal(init.status,200);assert.equal(init.data.chunks,2);
const id=init.data.id;
assert.equal((await req(`/api/audio/${id}/finish`,sa,{})).status,409);
assert.equal((await raw(`/api/audio/${id}/chunk/0`,sb,sound.slice(0,256000))).status,404);
assert.equal((await raw(`/api/audio/${id}/chunk/0`,sa,sound.slice(0,256000))).status,200);
assert.equal((await raw(`/api/audio/${id}/chunk/0`,sa,sound.slice(0,256000))).status,409);
assert.equal((await raw(`/api/audio/${id}/chunk/1`,sa,sound.slice(256000))).status,200);
assert.equal((await req(`/api/audio/${id}/finish`,sa,{})).status,200);
assert.equal((await req(`/api/audio/${id}/finish`,sa,{})).data.already_saved,true);
assert.equal((await raw(`/api/audio/${id}`,null)).status,401);
assert.equal((await raw(`/api/audio/${id}`,tb)).status,403); // teacher in another school
assert.equal((await raw(`/api/audio/${id}`,sb)).status,403); // another learner
for(const token of [sa,ta,owner]){
 const recording=await raw(`/api/audio/${id}`,token);
 assert.equal(recording.status,200);assert.equal(recording.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.deepEqual(new Uint8Array(await recording.arrayBuffer()),sound);
}
const partial=await raw(`/api/audio/${id}`,owner,undefined,'bytes=255995-256004');
assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),`bytes 255995-256004/${sound.length}`);
assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),sound.slice(255995,256005));
assert.equal((await raw(`/api/audio/${id}`,owner,undefined,'bytes=256100-')).status,416);
assert.equal((await req(`/api/audio/${id}/delete`,ta,{})).status,403);
const next=await req('/api/audio/init',sa,{part:'p1',duration_seconds:38,size_bytes:3,mime:'audio/ogg'});
assert.equal(next.status,200);
assert.equal((await raw(`/api/audio/${next.data.id}/chunk/0`,sa,new Uint8Array([1,2,3]))).status,200);
assert.equal((await req(`/api/audio/${next.data.id}/finish`,sa,{})).status,200);
let self=await req('/api/progress/me',sa);
assert.equal(self.data.attempts.filter(x=>x.deck==='rd').length,2);assert.equal(self.data.writing.length,2);assert.equal(self.data.speaking.length,2);assert.equal(self.data.speaking[1].audio_id,id);
assert.equal((await req('/api/progress/me',sb)).data.attempts.length,0);
const al=await req('/api/progress/learners',ta);assert.equal(al.status,200);assert.deepEqual(al.data.learners.map(x=>x.email),['sa@local.test']);assert.equal(al.data.learners[0].practice_count,3);
const bl=await req('/api/progress/learners',tb);assert.deepEqual(bl.data.learners.map(x=>x.email),['sb@local.test']);
assert.equal((await req('/api/progress/learners',owner)).data.learners.length,5);
assert.equal((await req('/api/progress/learners',sa)).status,403);
assert.equal((await req('/api/progress/learners/5',ta)).status,403);
assert.equal((await req('/api/progress/learners/6',ta)).status,403);
let detail=await req('/api/progress/learners/3',ta);assert.equal(detail.status,200);assert.match(detail.data.writing[0].response,/The table shows/);
assert.equal((await req('/api/progress/learners/5/review',ta,{skill:'writing',activity_id:detail.data.writing[0].id,rating:5,note:'Wrong school'})).status,403);
assert.equal((await req('/api/progress/learners/3/review',sa,{skill:'writing',activity_id:detail.data.writing[0].id,rating:5,note:'Self rating'})).status,403);
assert.equal((await req('/api/progress/learners/3/review',ta,{skill:'writing',activity_id:9999,rating:5,note:'No such draft'})).status,404);
const [oldDraft,newDraft]=[detail.data.writing[1],detail.data.writing[0]];
assert.equal((await req('/api/progress/learners/3/review',ta,{skill:'writing',activity_id:oldDraft.id,rating:2,note:'Needs an overview.'})).status,200);
assert.equal((await req('/api/progress/learners/3/review',ta,{skill:'writing',activity_id:newDraft.id,rating:4,note:'Clearer overview and comparisons.'})).status,200);
assert.equal((await req('/api/progress/learners/3/review',ta,{skill:'speaking',activity_id:detail.data.speaking[0].id,rating:3,note:'Better fluency.'})).status,200);
self=await req('/api/progress/me',sa);assert.equal(self.data.reviews.length,3);assert.equal(self.data.reviews.filter(x=>x.skill==='writing').length,2);
assert.equal((await req('/api/progress/learners/3',owner)).status,200);
assert.equal((await req('/api/admin',ta)).status,403);
assert.equal((await req(`/api/audio/${id}/delete`,owner,{})).status,200);
assert.equal((await raw(`/api/audio/${id}`,owner)).status,404);
assert.equal((await req('/api/progress/me',sa)).data.speaking.find(x=>x.part==='combined').audio_id,null);
// Expired recordings may not be played even before cleanup.
const timestampAudio=join(tmpdir(),'ielts-audio-expire.sql');writeFileSync(timestampAudio,`UPDATE audio_recordings SET created_at='2026-01-01T00:00:00.000Z' WHERE id=${next.data.id};`);
try{execFileSync(join(process.cwd(),'node_modules/.bin/wrangler'),['d1','execute','ielts-members','--local','--persist-to',persist,'--file',timestampAudio],{stdio:'ignore'});}finally{rmSync(timestampAudio,{force:true});}
assert.equal((await raw(`/api/audio/${next.data.id}`,owner)).status,404);
assert.equal((await req('/api/progress/me',sa)).data.speaking.find(x=>x.part==='p1').audio_id,null);
assert.equal((await req('/progress',sa)).status,200);
console.log('Integration passed: repeat scores, writing, private chunked audio, Range playback, owner deletion, expiry, school isolation.');
