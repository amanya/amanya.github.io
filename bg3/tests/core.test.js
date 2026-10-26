const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const mk=(word,forms=[word])=>({id:word,word,forms});

test('normalises encoded formatting without executing it',()=>{
  assert.equal(C.cleanLine('&lt;LSTag Type="Spell"&gt;An eldritch light&lt;/LSTag&gt; &amp; darkness.'),'An eldritch light & darkness.');
  assert.equal(C.cleanLine('The &lt;i&gt;old&lt;/i&gt; ward&#39;s light.'),"The old ward's light.");
});
test('matches whole words and irregular forms, retaining traceable source ID',()=>{
  const cards=[mk('slay',['slay','slain','slew']),mk('hex')];
  const result={};
  C.collectEntry(C.createIndex(cards),{id:'h_test_only',text:'The beast was slain before the village gates. We found a hexagon painted on the floor.'},result);
  assert.equal(result.slay.sourceId,'h_test_only');
  assert.equal(result.slay.text,'The beast was slain before the village gates.');
  assert.equal(result.hex,undefined);
});
test('rejects ambiguous ordinary senses, placeholders, and short UI labels',()=>{
  const cards=[mk('keep'),mk('hide'),mk('quiver'),mk('eldritch')];
  const index=C.createIndex(cards), result={};
  for(const text of ['You must keep your friends safe from harm.','We must hide from the guards near the gate.','His hands quiver with fear beneath the cold sky.','Eldritch Blast','The eldritch [1] will destroy our village tonight.'])C.collectEntry(index,{id:'test',text},result);
  assert.deepEqual(result,{});
  C.collectEntry(index,{id:'test_keep',text:'The villagers fled into the keep before nightfall.'},result);
  assert.ok(result.keep);
});
test('multiword phrases are matched and an informative sentence is preferred',()=>{
  const card=mk('stave off',['stave off','staved off']);const result={},index=C.createIndex([card]);
  C.collectEntry(index,{id:'long',text:'We were hoping that all of these supplies would finally help us stave off the hunger that had been troubling us throughout the difficult journey.'},result);
  C.collectEntry(index,{id:'short',text:'These supplies may stave off hunger until we reach the next village along the river.'},result);
  assert.equal(result['stave off'].sourceId,'short');
  assert.equal(result['stave off'].count,2);
});
test('review intervals, due dates, and repeated reviews reflect the chosen grade',()=>{
  const now=new Date(2026,9,26,12).getTime();
  assert.equal(C.schedule(null,'again',now).due,now+600000);
  assert.equal(C.schedule(null,'hard',now).interval,1);
  const good=C.schedule(null,'good',now);
  assert.equal(good.interval,3);assert.equal(good.reviews,1);
  assert.equal(C.schedule(good,'good',now).interval,6);
  assert.equal(C.schedule({interval:40,reviews:2},'good',now).interval,60);
  assert.equal(C.schedule(good,'known',now).status,'known');
  assert.equal(C.dateKey(now),'2026-10-26');
});
test('rejects observed BG3 sense mismatches and recording directions',()=>{
  assert.equal(C.meaningful(mk('keep'),'Small weights in the fletching keep this arrow well-balanced.'),false);
  assert.equal(C.meaningful(mk('bog'),'You might as well use it as bog roll then.'),false);
  assert.equal(C.meaningful(mk('cleave'),'I will cleave soul to body once more.'),false);
  assert.equal(C.meaningful(mk('ere'),"Serious work going on in 'ere."),false);
  assert.equal(C.meaningful(mk('gauntlet'),'We have found the Gauntlet of Shar.'),false);
  assert.equal(C.meaningful(mk('loathe'),'I am loathe to put an ultimatum to you.'),false);
  assert.deepEqual(C.sentencesFrom('PLEASE RECORD (roar, not words): Great roar summons many ghouls into camp.'),[]);
});
test('reviewed translations require both the exact source ID and English sentence',()=>{
  const reviewed={ward:{sourceId:'test-uid',text:'A ward surrounds you.',catalan:'Una protecció màgica t’envolta.'}};
  assert.equal(C.reviewedForEntry(reviewed,{id:'test-uid',text:'A ward surrounds you.'}).length,1);
  assert.equal(C.reviewedForEntry(reviewed,{id:'other-uid',text:'A ward surrounds you.'}).length,0);
  assert.equal(C.reviewedForEntry(reviewed,{id:'test-uid',text:'Your ward surrounds them.'}).length,0);
});
