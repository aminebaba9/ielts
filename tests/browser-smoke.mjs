// Local-only authenticated browser check. Requires a fixture DB and Wrangler on port 8787.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/login');
 await page.locator('input[type="email"]').fill('sa@local.test');
 await page.locator('input[type="password"]').fill('LOCAL_TEST_STUDENT_A11b22c33');
 await page.locator('button[type="submit"]').click();
 await page.waitForURL('**/');
 for(const [deck,selector] of [['rd','#mod-m1'],['wt1','#mod-t1'],['wt2','#module-opinion'],['sp','#mod-p1']]){
   await page.goto('http://127.0.0.1:8787/api/decks/'+deck);
   await page.waitForFunction(sel=>document.querySelector(sel)?.querySelectorAll(':scope > .slide').length===10,selector);
   const result=await page.evaluate(sel=>{
      const mod=document.querySelector(sel),slides=mod.querySelectorAll(':scope > .slide');
      const practice=slides[8].innerText,model=slides[9].innerText;
      return {count:slides.length,practice,model,label:document.querySelectorAll('#sub-nav a').length,nav:slides[8].querySelector('.slide-nav button:last-of-type')?.textContent};
   },selector);
   assert.equal(result.count,10);assert.equal(result.label,10);
   assert.match(result.nav,/Model/i);
   assert.doesNotMatch(result.practice,/Band 9 Model Answer|^Answers\b/m);
   assert.match(result.model,deck==='rd'?/Answers/:/Model Answer/);
   await page.evaluate(sel=>{const mod=document.querySelector(sel);  goSlide(8);const btn=mod.querySelector(':scope > .slide:nth-child(9) .slide-nav button:last-of-type');btn.click();},selector);
   assert.equal(await page.locator(selector+' > .slide.active').count(),1);
   assert.match(await page.locator(selector+' > .slide.active').innerText(),/Practice review/i);
   const all=await page.evaluate(()=>[...document.querySelectorAll('[data-slides="10"]')].filter(m=>m.querySelectorAll(':scope > .slide').length===10).map(m=>{
     const slides=m.querySelectorAll(':scope > .slide');return {id:m.id,practice:slides[8].textContent,model:slides[9].textContent};}));
   for(const x of all){assert.doesNotMatch(x.practice,/Band 9 Model Answer|^Answers\b/m,x.id);assert.match(x.model,deck==='rd'?/Answers/:/Model Answer/,x.id);}
   console.log('Browser model-slide OK:',deck,all.length,'modules');
 }
 await page.goto('http://127.0.0.1:8787/api/decks/ls');
 assert.match(await page.locator('#mod-sec1 .slide').nth(1).innerText(),/Listen & Answer/);
 assert.match(await page.locator('#mod-sec1 .slide').nth(2).innerText(),/Answer Reveal/);
 await page.goto('http://127.0.0.1:8787/progress');
 await page.waitForSelector('#my-writing details');
 assert.match(await page.locator('#my-writing').innerText(),/Task 1/);
 // Admin view lives in the account management tab, not only the progress page.
 await page.goto('http://127.0.0.1:8787/login');
 await page.locator('input[type="email"]').fill('owner@local.test');
 await page.locator('input[type="password"]').fill('LOCAL_TEST_OWNER_A11b22c33d44');
 await page.locator('button[type="submit"]').click();
 await page.waitForURL("http://127.0.0.1:8787/");
 await page.goto('http://127.0.0.1:8787/admin');
 await page.waitForFunction(()=>document.querySelector('#work-user').options.length>1);
 await page.locator('#work-user').selectOption('3');
 await page.locator('#work-items details').first().waitFor();
 await page.locator('#work-items details').first().click();
 assert.match(await page.locator('#work-items').innerText(),/The table shows/);
 assert.deepEqual(errors,[]);
 console.log('Browser admin submissions and progress UI OK.');
}finally{await browser.close()}
