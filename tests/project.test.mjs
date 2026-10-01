import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {gradePractice} from '../src/progress.js';
const root=process.cwd();
const config=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8'));

test('every static request passes through authentication Worker',()=>{
  assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.assets.binding,'ASSETS');
  assert.equal(config.d1_databases[0].binding,'DB');
});
test('six lesson files fit Cloudflare Workers Free asset-size limit',()=>{
  for(const id of ['sp','rd','ls','wt1','wt2','es']){
    const file=join(root,'assets','course-data',id+'.html');
    assert.ok(statSync(file).size<25*1024*1024,`${id} exceeds 25 MiB`);
  }
});
test('inline browser scripts parse',()=>{
  for(const id of ['hub','login','admin','account','expired','progress']){
    const source=readFileSync(join(root,'assets',id+'.html'),'utf8');
    const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    assert.ok(scripts.length>0,`${id} has no inline script`);
    scripts.forEach(code=>new vm.Script(code,{filename:id+'.html'}));
  }
});
test('Worker denies direct asset URL before authenticated route',()=>{
  const code=readFileSync(join(root,'src','worker.js'),'utf8');
  assert.match(code,/p\.startsWith\('\/course-data\/'\)/);
  assert.match(code,/return !u\?reply\(\{error:'Sign in required\.'/);
});
test('member identity and school are shown separately from the creator credit',()=>{
  const hub=readFileSync(join(root,'assets','hub.html'),'utf8');
  assert.match(hub,/id="signedInName"/);
  assert.match(hub,/id="signedInSchool"/);
  assert.match(hub,/fetch\('\/api\/me'/);
  assert.match(hub,/Created by <b>Ahmed Amine Baba<\/b>/);
});
test('admin can change a teacher or student name',()=>{
  const worker=readFileSync(join(root,'src','worker.js'),'utf8');
  const admin=readFileSync(join(root,'assets','admin.html'),'utf8');
  assert.match(worker,/UPDATE users SET name=\?,role=\?/);
  assert.match(admin,/Student\/teacher name/);
});
test('progress data uses account-linked tables and teacher school scoping',()=>{
  const worker=readFileSync(join(root,'src','worker.js'),'utf8');
  const schema=readFileSync(join(root,'migrations','0003_progress.sql'),'utf8');
  const hub=readFileSync(join(root,'assets','hub.html'),'utf8');
  assert.match(schema,/CREATE TABLE IF NOT EXISTS module_visits/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS first_attempt_results/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS skill_feedback/);
  assert.match(readFileSync(join(root,'migrations','0005_practice_history.sql'),'utf8'),/CREATE TABLE IF NOT EXISTS practice_history/);
  assert.match(worker,/target\.school_id!==staff\.school_id/);
  assert.match(worker,/target\.role!=='student'/);
  assert.match(worker,/INSERT INTO practice_history/);
  assert.match(hub,/fetch\('\/api\/progress\/me'/);
  assert.match(hub,/e\.source!==document\.getElementById/);
  const progress=readFileSync(join(root,'assets','progress.html'),'utf8');
  assert.doesNotMatch(progress,/id="pathway"/);
  assert.doesNotMatch(progress,/auto_days|dayHtml|id="score-form"/);
});
test('Reading and Listening grading uses real practice answers',()=>{
  assert.deepEqual(gradePractice('rd',0,['FALSE','false','true','NOT GIVEN','true']),{score:5,total:5});
  assert.deepEqual(gradePractice('ls',1,['midday','shopping district','military museum','C','A','C','B','driver','7','15%']),{score:10,total:10});
  assert.deepEqual(gradePractice('ls',2,['nocturnal','material','narrow','D','E','G','strides','spots','lower section','claws']),{score:10,total:10});
  assert.throws(()=>gradePractice('rd',0,['','','','','']),/Answer every question/);
});
test('practice scripts in all four active lesson decks parse',()=>{
 for(const id of ['rd','ls','wt1','wt2']){
   const source=readFileSync(join(root,'assets','course-data',id+'.html'),'utf8');
   const scripts=[...source.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
   const practice=scripts.find(x=>x.includes(id==='rd'?'Auto-graded Reading practice':id==='ls'?'reportCheckedSection':'Account-saved writing response'));
   assert.ok(practice,`${id} practice script missing`);
   new vm.Script(practice,{filename:id+'-practice.js'});
 }
});

test('private audio schema and owner UI accompany the microphone uploader',()=>{
 const worker=readFileSync(join(root,'src','worker.js'),'utf8');
 const schema=readFileSync(join(root,'migrations','0006_private_audio.sql'),'utf8');
 const learner=readFileSync(join(root,'assets','progress.html'),'utf8');
 const owner=readFileSync(join(root,'assets','admin.html'),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS audio_chunks/);
 assert.match(schema,/ALTER TABLE speaking_history ADD COLUMN audio_id/);
 assert.match(worker,/async function audioGet/);
 assert.match(worker,/visibleLearner\(env,u,row.user_id\)/);
 assert.match(learner,/await uploadRecording\(blob,part,seconds\)/);
 assert.doesNotMatch(learner,/api\/auto\/speaking/);
 assert.match(owner,/id="owner-work"/);
 assert.match(owner,/id="work-items"/);
});
test('practice-specific models have follow-up slides in Reading, Writing and Speaking',()=>{
 for(const id of ['rd','wt1','wt2','sp']){
  const source=readFileSync(join(root,'assets','course-data',id+'.html'),'utf8');
  assert.match(source,/data-slides="10"/);
  assert.match(source,/Next: Practice model/);
  const scripts=[...source.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const split=scripts.find(code=>code.includes('const deck=')&&code.includes('Practice review'));
  assert.ok(split,id+' needs answer separation');
  new vm.Script(split,{filename:id+'-model-slides.js'});
 }
 const listening=readFileSync(join(root,'assets','course-data','ls.html'),'utf8');
 assert.match(listening,/Listen &amp; Answer/);
 assert.match(listening,/Audioscript &amp; Answer Reveal/);
});
