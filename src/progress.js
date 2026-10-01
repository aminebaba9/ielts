// First checked practice attempts and learner activity are not official IELTS results.
const R = [
 ['false','false','true','not given','true'],
 ['ii','i','iii','iv'],
 ['b','b'],
 ['skies','north america','migratory','melatonin'],
 ['no','no','yes','not given'],
 ['a','b','c','b'],
 ['b','a'],
 ['1977','four','heliopause','golden record'],
 ['60 bar','semi-permeable membrane','permeate','brine'],
 ['2300 kilometres','captain james cook','four','dr terry hughes','unesco'],
 ['top bar','side bars','bottom bar','foundation wax']
];
const L = [
 [['c'],['b'],['b'],['14 brightwell avenue','brightwell avenue','14 brightwell'],['03221 7774','032217774'],['morning','early morning'],['£32.25','32.25'],['changing rooms','changing room'],['shoe department','shoe dept','shoes'],['cash desk','cash']],
 [['midday','12 pm','noon'],['the shopping district','shopping district'],['the military museum','military museum'],['c'],['a'],['c'],['b'],['the driver','driver'],['$7','7','seven dollars'],['15%','fifteen per cent','15 per cent','15','fifteen percent']],
 [['nocturnal'],['material'],['narrow'],['d'],['e'],['g'],['strides'],['spots'],['lower section','lower part'],['claws']],
 [['temporary'],['stone'],['geographical positioning','geographical position'],['decorative'],['individuals'],['globalisation','globalization'],['laboratories','labs'],['a'],['b'],['e']]
];
function norm(v){return String(v||'').toLowerCase().normalize('NFKC').replace(/[.,\s]+/g,' ').trim();}
export function gradePractice(deck,mod,answers){
  if(!Array.isArray(answers)||answers.length>15||answers.some(v=>typeof v!=='string'||v.length>120)) throw new Error('Invalid practice answers.');
  const key=deck==='rd'?R[mod]:deck==='ls'?L[mod]:null;
  if(!key||answers.length!==key.length) throw new Error('Invalid practice set.');
  if(answers.some(x=>!x.trim())) throw new Error('Answer every question before checking this practice set.');
  let score=0;
  key.forEach((expected,i)=>{
    if(deck==='ls'&&mod===2&&i>=3&&i<=5)return;
    const options=Array.isArray(expected)?expected:[expected];
    if(options.some(a=>norm(a)===norm(answers[i])))score++;
  });
  // Q24–26 scores three distinct choices; more than three selections are invalid.
  if(deck==='ls'&&mod===2){
    const picked=answers.slice(3,6).filter(x=>x.trim()).map(norm);
    if(picked.length===3&&new Set(picked).size===3)score+=picked.filter(v=>['d','e','g'].includes(v)).length;
  }
  return {score,total:key.length};
}
