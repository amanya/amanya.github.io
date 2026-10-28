(function () {
  'use strict';
  const C=window.LexiconCore;
  const deck=JSON.parse(document.getElementById('deck-data').textContent);
  const cards=deck.cards, byId=new Map(cards.map(c=>[c.id,c]));
  const KEY='wayfarers-lexicon-v1';
  const embeddedRevision=deck.corpus?.deckHash||deck.corpus?.hash||'';
  const $=id=>document.getElementById(id);
  const icons={'All words':'✧','Magic & faith':'☽','Creatures & wilds':'♧','Steel & survival':'⚔','Dark words & deeds':'♜','Old speech & dealings':'⌘'};
  let state={version:1,progress:{},stars:[],contexts:deck.contexts||{},corpus:deck.corpus||null,daily:{},embeddedSource:embeddedRevision};
  let category='All words',game='all',view='study',mode='ready',queue=[],position=0,flipped=false,history=[],detailId=null,toastTimer,importing=false;
  let storageAvailable=true;
  function validate(input) {
    if (!input || input.version!==1 || !input.progress || typeof input.progress!=='object') throw new Error('This is not a supported Lexicon backup.');
    const clean={version:1,progress:{},stars:[],contexts:{},corpus:null,daily:{},embeddedSource:typeof input.embeddedSource==='string'?input.embeddedSource.slice(0,64):''};
    for(const c of cards) {
      const p=input.progress[c.id];
      if(p && ['known','learning'].includes(p.status) && ['due','interval','reviews','last'].every(k=>Number.isFinite(p[k]) && p[k]>=0) && p.interval<=60 && p.due<9e15) clean.progress[c.id]={status:p.status,due:p.due,interval:p.interval,reviews:Math.floor(p.reviews),last:p.last};
      const ctx=input.contexts?.[c.id];
      if(ctx && typeof ctx.text==='string' && ctx.text.length<2000 && typeof ctx.sourceId==='string' && ctx.sourceId.length<300 && [...ctx.text.matchAll(C.pattern(c))].length) clean.contexts[c.id]={text:ctx.text,sourceId:ctx.sourceId,count:Number.isFinite(ctx.count)?Math.max(1,ctx.count):1,...(typeof ctx.catalan==='string'&&ctx.catalan.trim()&&ctx.catalan.length<3000?{catalan:ctx.catalan}:{})};
    }
    clean.stars=Array.isArray(input.stars)?[...new Set(input.stars.filter(id=>byId.has(id)))]:[];
    if(input.corpus && typeof input.corpus.name==='string' && Object.keys(clean.contexts).length) clean.corpus={name:input.corpus.name.slice(0,200),entries:Number.isFinite(input.corpus.entries)?Math.max(0,input.corpus.entries):0,importedAt:typeof input.corpus.importedAt==='string'?input.corpus.importedAt.slice(0,50):'',hash:typeof input.corpus.hash==='string'?input.corpus.hash.slice(0,64):'',deckHash:typeof input.corpus.deckHash==='string'?input.corpus.deckHash.slice(0,64):''};
    for(const [date,n] of Object.entries(input.daily||{})) if(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(n) && n>=0) clean.daily[date]=n;
    return clean;
  }
  try {const saved=localStorage.getItem(KEY);if(saved)state=validate(JSON.parse(saved));if(embeddedRevision&&state.embeddedSource!==embeddedRevision){state.contexts=deck.contexts;state.corpus=deck.corpus;state.embeddedSource=embeddedRevision;}localStorage.setItem(KEY,JSON.stringify(state));}
  catch(e){storageAvailable=false;}
  function persist() {
    try{localStorage.setItem(KEY,JSON.stringify(state));storageAvailable=true;}
    catch(e){storageAvailable=false;toast('Progress is in memory only. Export a backup to keep it.');}
    $('storage-status').textContent=storageAvailable?'Saved automatically in this browser.':'Local storage is unavailable. Export a backup before closing the page.';
  }
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4300);}
  const hasSource=()=>!!state.corpus;
  const sourceCards=()=>hasSource()?cards.filter(c=>state.contexts[c.id]):cards;
  const collection=()=>sourceCards().filter(c=>(category==='All words'||c.category===category)&&(game==='all'||(game==='bg1'?c.id.startsWith('bg1-'):!c.id.startsWith('bg1-'))));
  const isReady=c=>!state.progress[c.id]||state.progress[c.id].due<=Date.now();
  function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function startSession(firstId) {
    const pool=collection().filter(c=>mode==='all'||(mode==='starred'?state.stars.includes(c.id):isReady(c)));
    // Due reviews first, then new vocabulary. Randomise within those groups.
    queue=mode==='ready'?[...shuffled(pool.filter(c=>state.progress[c.id])),...shuffled(pool.filter(c=>!state.progress[c.id]))].map(c=>c.id):shuffled(pool).map(c=>c.id);
    if(firstId){queue=queue.filter(id=>id!==firstId);queue.unshift(firstId);}
    position=0;flipped=false;history=[];render();
  }
  function showView(next){view=next;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${next}`);document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);if(b.dataset.view===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('page-title').textContent=next==='study'?'Words beyond the familiar.':next==='library'?'A wordbook for the road.':'Every word has a source.';$('page-subtitle').textContent=next==='study'?'Learn the language of oaths, old magic, and unfamiliar worlds.':next==='library'?'Browse, save, and revisit the words you want to make your own.':'Use your game file, keep your progress, and know what you are studying.';render();}
  function renderCategories(){const root=$('categories');root.replaceChildren();const pool=sourceCards();for(const name of ['All words',...new Set(cards.map(c=>c.category))]){const b=document.createElement('button');b.className='category'+(name===category?' active':'');b.setAttribute('aria-pressed',String(name===category));const symbol=document.createElement('span');symbol.className='glyph';symbol.textContent=icons[name];symbol.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=name;const count=document.createElement('span');count.className='count';count.textContent=pool.filter(c=>name==='All words'||c.category===name).length;b.append(symbol,label,count);b.onclick=()=>{category=name;startSession();};root.append(b);}}
  function highlighted(target,text,card){target.replaceChildren();const re=C.pattern(card);let start=0;for(const match of text.matchAll(re)){target.append(document.createTextNode(text.slice(start,match.index)));const mark=document.createElement('mark');mark.textContent=match[0];target.append(mark);start=match.index+match[0].length;}target.append(document.createTextNode(text.slice(start)));}
  function current(){return byId.get(queue[position]);}
  function renderCard(){const card=current();const empty=!card;$('card-area').hidden=empty;$('empty-study').hidden=!empty;$('session-label').textContent=queue.length?`${Math.min(position+1,queue.length)} / ${queue.length} cards`: 'No cards ready';const pct=queue.length?Math.round(position/queue.length*100):0;$('progress-fill').style.width=`${pct}%`;$('session-progress').setAttribute('aria-valuenow',pct);
    if(empty){const hasAny=collection().length>0;const savedEmpty=mode==='starred';$('empty-title').textContent=savedEmpty?'A place for discoveries.':hasAny?'Your path is clear.':'No words here yet.';$('empty-message').textContent=savedEmpty?'Save words with the star on a flashcard or in the wordbook.':hasAny?'You have finished this collection for now. Come back when reviews are due, or explore all its words.':'No curated words in this collection have a readable context in your XML. Try another collection or use the practice deck.';$('shuffle').hidden=!hasAny||savedEmpty;$('empty-undo').disabled=!history.length;return;}
    const context=hasSource()?state.contexts[card.id]:null;
    $('card-category').textContent=flipped?'Català · '+card.category:card.category;
    $('card-word').textContent=flipped?card.catalan:card.word;$('card-word').classList.toggle('ca',flipped);$('card-word').lang=flipped?'ca':'en';$('card-definition').hidden=!flipped;$('card-definition').textContent=card.meaning;
    if(flipped){$('card-sentence').textContent=context?(context.catalan||context.text):card.exampleCa;$('card-sentence').lang=context&&!context.catalan?'en':'ca';}else{highlighted($('card-sentence'),context?context.text:card.example,card);$('card-sentence').lang='en';}
    $('card-source').textContent=context?(flipped?(context.catalan?'Game sentence · Catalan translation':'Original game context · English (not translated)'):(card.id.startsWith('bg1-')?'BG1 TLK':'BG3 XML')+' · sentence excerpt')+(context.sourceId?' · '+context.sourceId:''):(flipped?'Original practice example · Catalan translation':'Original practice example · not a game quote');
    $('reveal-row').hidden=flipped;$('rating-row').hidden=!flipped;$('keyboard-hint').textContent=flipped?'1 Again · 2 Hard · 3 Got it · 4 Familiar · Space to see the front':'Recall the meaning before you reveal.  ·  Space to flip  ·  1–4 to rate';
    $('star').textContent=state.stars.includes(card.id)?'★':'☆';$('star').classList.toggle('saved',state.stars.includes(card.id));$('star').setAttribute('aria-pressed',String(state.stars.includes(card.id)));$('star').setAttribute('aria-label',state.stars.includes(card.id)?'Unsave word':'Save word');$('undo').disabled=!history.length;
    $('good-delay').textContent=`In ${C.schedule(state.progress[card.id],'good').interval} days`;
  }
  function render(){renderCategories();const pool=collection();$('nav-count').textContent=sourceCards().length;$('stat-total').textContent=pool.length;$('stat-ready').textContent=pool.filter(isReady).length;$('stat-known').textContent=pool.filter(c=>state.progress[c.id]?.status==='known').length;$('stat-reviewed').textContent=state.daily[C.dateKey()]||0;$('side-source').textContent=hasSource()?`${sourceCards().length} cards from both games.`:`${cards.length} curated practice cards.`;document.querySelector('.side-note p').textContent=hasSource()?'Game lines may contain spoilers. Imported text is kept on this device.':'Game lines may contain spoilers. No dialogue has been imported yet.';
    $('source-banner').replaceChildren();const strong=document.createElement('strong');strong.textContent=hasSource()?'Your game, your context. ':'Practice deck. ';$('source-banner').append(strong,document.createTextNode(hasSource()?`${sourceCards().length} game cards available. ${sourceCards().filter(c=>state.contexts[c.id]?.catalan).length} sentence translations in Catalan. `:'Sentences are authored examples. Import your XML for genuine game context. '));const link=document.createElement('button');link.textContent=hasSource()?'Manage source →':'Import dialogue →';link.onclick=()=>showView('source');$('source-banner').append(link);
    $('source-summary').textContent=hasSource()?`BG3: ${state.corpus.entries.toLocaleString()} XML entries scanned. BG1: ${Object.keys(deck.bg1Contexts||{}).length} reviewed cards from the English TLK. ${sourceCards().length} game cards are available. Other curated words are hidden until you return to the practice deck. Original XML bytes are not stored in the browser backup.`:'You are using the practice deck with authored examples. Import an English XML file to study verified game context.';
    $('clear-import').disabled=!hasSource();$('download-contexts').disabled=!hasSource();renderCard();if(view==='library')renderList();
  }
  function grade(rating){const card=current();if(!card)return;history.push({id:card.id,position,queue:[...queue],progress:state.progress[card.id]?{...state.progress[card.id]}:null,date:C.dateKey(),dayCount:state.daily[C.dateKey()]||0});state.progress[card.id]=C.schedule(state.progress[card.id],rating);state.daily[C.dateKey()]=(state.daily[C.dateKey()]||0)+1;if(rating==='again')queue.splice(Math.min(queue.length,position+4),0,card.id);position++;flipped=false;persist();render();}
  function undo(){const prev=history.pop();if(!prev)return;if(prev.progress)state.progress[prev.id]=prev.progress;else delete state.progress[prev.id];state.daily[prev.date]=prev.dayCount;queue=prev.queue;position=prev.position;flipped=false;persist();render();toast('Last review undone.');}
  function toggleStar(){const card=current();if(!card)return;state.stars=state.stars.includes(card.id)?state.stars.filter(id=>id!==card.id):[...state.stars,card.id];persist();renderCard();}
  function renderList(){const term=C.normalise($('search').value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');const status=$('list-status').value;const list=collection().filter(c=>{const p=state.progress[c.id];return C.normalise(c.word+' '+c.catalan).normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(term)&&(status==='all'||status==='starred'&&state.stars.includes(c.id)||status==='new'&&!p||p&&status===p.status);}).sort((a,b)=>a.word.localeCompare(b.word));$('list-count').textContent=`${list.length} words · Select a word to see both sides.`;$('word-list').replaceChildren();for(const c of list){const row=document.createElement('button');row.className='word-row';const left=document.createElement('span'),word=document.createElement('strong'),sub=document.createElement('small');word.textContent=(state.stars.includes(c.id)?'★ ':'')+c.word;sub.textContent=c.category;left.append(word,sub);const right=document.createElement('span');right.className='translation';right.lang='ca';right.textContent=c.catalan;const badge=document.createElement('span');badge.className='badge';badge.textContent=state.progress[c.id]?.status==='known'?'Familiar':state.progress[c.id]?'Learning':'Not studied';right.append(badge);row.append(left,right);row.onclick=()=>openDetail(c.id);$('word-list').append(row);}if(!list.length)$('word-list').textContent='No matching words. Try a different search or collection.';}
  function openDetail(id){detailId=id;const c=byId.get(id);const box=$('word-detail');box.replaceChildren();const title=document.createElement('h2');title.textContent=c.word;const ca=document.createElement('p');ca.lang='ca';ca.textContent=c.catalan;const def=document.createElement('p');def.textContent=c.meaning;const quote=document.createElement('blockquote');const context=hasSource()?state.contexts[id]:null;quote.textContent=context?context.text:c.example;const translated=document.createElement('p');translated.lang='ca';translated.textContent=context?(context.catalan||'No Catalan translation is available for this game sentence.'):c.exampleCa;const source=document.createElement('p');source.textContent=context?(id.startsWith('bg1-')?'BG1 TLK · ':'BG3 XML · ')+context.sourceId:'Original practice example · not a game quote';box.append(title,ca,def,quote,translated,source);$('word-dialog').showModal();}
  function download(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importXML(file) {
    if(!file||importing)return;
    importing=true;
    $('xml-input').disabled=true;
    const status=$('import-status');
    status.classList.remove('error');
    const progress=$('import-progress');
    progress.hidden=false;
    progress.value=0;
    status.textContent='Reading XML locally…';
    const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
    try {
      if(file.size>150*1024*1024)throw new Error('This file exceeds the 150 MB browser limit. Use scripts/import_xml.py for large XML files.');
      await yieldUI();
      const text=await file.text();
      if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('XML with DTD or entity declarations is not supported. Use the original BG3 localisation export.');
      status.textContent='Parsing localisation entries…';
      await yieldUI();
      const xml=new DOMParser().parseFromString(text,'application/xml');
      if(xml.querySelector('parsererror'))throw new Error('This file is not valid XML. The previous deck has been kept.');
      let entries=xml.querySelectorAll('content[contentuid]');
      if(!entries.length)entries=xml.querySelectorAll('content');
      if(!entries.length)throw new Error('No <content> entries found. Expected BG3 English localisation XML.');
      const index=C.createIndex(cards), result={}, verified={};
      const reviewedBySource=new Map();
      for(const [id,ctx] of Object.entries(deck.contexts||{})) {
        if(!reviewedBySource.has(ctx.sourceId))reviewedBySource.set(ctx.sourceId,{});
        reviewedBySource.get(ctx.sourceId)[id]=ctx;
      }
      status.textContent=`Matching ${entries.length.toLocaleString()} entries against the glossary…`;
      for(let i=0;i<entries.length;i++) {
        const el=entries[i];
        const entry={id:el.getAttribute('contentuid')||el.getAttribute('id')||'',text:el.textContent};
        C.collectEntry(index,entry,result);
        const reviewed=reviewedBySource.get(entry.id);
        if(reviewed)for(const [id,ctx] of C.reviewedForEntry(reviewed,entry))verified[id]={...ctx};
        if(i%1000===0){progress.value=i/entries.length*100;await yieldUI();}
      }
      for(const [id,ctx] of Object.entries(verified))result[id]={...ctx,count:result[id]?.count||1};
      const n=Object.keys(result).length;
      if(!n)throw new Error('No suitable contexts matched the curated glossary. The previous deck has been kept.');
      state.contexts={...result,...(deck.bg1Contexts||{})};
      state.corpus={name:file.name,entries:entries.length,importedAt:new Date().toISOString()};
      category='All words';mode='ready';$('study-mode').value=mode;
      persist();startSession();progress.value=100;
      status.textContent=`Imported ${n} words from ${entries.length.toLocaleString()} entries. Open Study to begin. Only selected context lines are saved, not the original XML file.`;
      toast(`${n} words now use real game context.`);
    } catch(e) {
      status.classList.add('error');status.textContent=e.message;
    } finally {
      importing=false;$('xml-input').disabled=false;$('xml-input').value='';progress.hidden=true;
    }
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
  $('reveal').onclick=()=>{flipped=!flipped;renderCard();};$('skip').onclick=()=>grade('known');$('undo').onclick=undo;$('empty-undo').onclick=undo;document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>grade(b.dataset.rate));$('star').onclick=toggleStar;$('study-mode').onchange=e=>{mode=e.target.value;startSession();};$('game-filter').onchange=e=>{game=e.target.value;startSession();};$('explore-all').onclick=()=>{mode='all';$('study-mode').value=mode;startSession();};$('shuffle').onclick=()=>startSession();$('search').oninput=renderList;$('list-status').onchange=renderList;
  $('speak').onclick=()=>{const c=current();if(!c)return;if(!('speechSynthesis'in window)){toast('Speech is unavailable in this browser.');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(c.word);u.lang='en-GB';u.rate=.8;u.onerror=()=>toast('No English voice is available. Install a device voice to use pronunciation offline.');speechSynthesis.speak(u);};
  $('xml-input').onchange=e=>importXML(e.target.files[0]);$('clear-import').onclick=()=>{if(!confirm('Return to the authored practice examples? Review progress will be kept.'))return;state.contexts={};state.corpus=null;category='All words';persist();startSession();$('import-status').textContent='Practice deck restored.';};$('download-contexts').onclick=()=>download('bg3-matched-contexts.json',{corpus:state.corpus,contexts:state.contexts});$('export-progress').onclick=()=>download('wayfarer-backup-'+C.dateKey()+'.json',state);$('restore-backup').onclick=()=>$('backup-input').click();
  $('backup-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('Backup is too large (maximum 8 MB).');const restored=validate(JSON.parse(await file.text()));if(!confirm('Replace current progress and imported contexts with this backup?'))return;state=restored;category='All words';persist();startSession();toast('Backup restored.');}catch(err){$('storage-status').textContent='Could not restore backup: '+err.message;}finally{e.target.value='';}};
  $('reset-progress').onclick=()=>{if(!confirm('Reset all review progress? Saved words and imported contexts will be kept.'))return;state.progress={};state.daily={};persist();startSession();toast('Review progress reset.');};$('close-dialog').onclick=()=>$('word-dialog').close();$('study-this').onclick=()=>{$('word-dialog').close();mode='all';$('study-mode').value=mode;startSession(detailId);showView('study');};
  document.addEventListener('keydown',e=>{if(view!=='study'||$('word-dialog').open||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(e.code==='Space'&&current()&&e.target.tagName!=='BUTTON'){e.preventDefault();flipped=!flipped;renderCard();}if(flipped&&/^[1-4]$/.test(e.key)){e.preventDefault();grade(['again','hard','good','known'][Number(e.key)-1]);}if(e.key.toLowerCase()==='u'){e.preventDefault();undo();}});
  window.addEventListener('storage',e=>{if(e.key===KEY)toast('Progress changed in another tab. Reload this tab before continuing.');});
  startSession();$('storage-status').textContent=storageAvailable?'Saved automatically in this browser.':'Local storage is unavailable. Export a backup before closing the page.';
})();
