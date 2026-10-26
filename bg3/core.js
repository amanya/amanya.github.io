/* Shared pure logic: the browser and node tests use the same implementation. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalise = s => s.toLowerCase().replace(/[’‘]/g, "'");
  function cleanLine(text) {
    const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    let value = text;
    for (let i=0;i<2;i++) value = value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all,key) => {
      if (key[0] !== '#') return entities[key.toLowerCase()] ?? all;
      const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
    return value.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().replace(/^\*|\*$/g,'').trim();
  }
  function pattern(card) {
    return new RegExp('\\b(?:' + [...card.forms].sort((a,b)=>b.length-a.length).map(escapeRegExp).join('|') + ')\\b','gi');
  }
  function createIndex(cards) {
    const index = new Map();
    for (const card of cards) for (const form of card.forms) {
      const first = normalise(form).match(/[a-z]+(?:'[a-z]+)?/)?.[0];
      if (!first) continue;
      if (!index.has(first)) index.set(first, new Set());
      index.get(first).add(card);
    }
    return index;
  }
  function meaningful(card, line) {
    const s=normalise(line);
    if (card.word === 'keep') return /\b(?:the|a|this|that|our|their|his|her) (?:(?:old|ancient|ruined|fortified|stone|abandoned|inner) )?keep\b/.test(s) && !/\bkeep (?:you|me|us|them|it|him|her|your|my|our|their)\b/.test(s);
    if (card.word === 'hide') return /\b(?:thick|tough|leathery|scaly|beast's|animal's|dragon's) hide\b|\bhide (?:armour|armor)\b/.test(s);
    if (card.word === 'brood') return /\b(?:her|its|their|the|a|our) brood\b|\bbrood of\b/.test(s);
    if (card.word === 'quiver') return /\b(?:my|your|his|her|the|a|empty|full) quiver\b|\bquiver of\b/.test(s);
    if (card.word === 'barrow') return !/\b(?:wheelbarrow|barrow of|barrow full)\b/.test(s);
    if (card.word === 'beholder') return !/eye of the beholder/.test(s);
    if (card.word === 'spell') return !/\bspell (?:it|your|my|the word|his name|her name|out)\b/.test(s);
    if (card.word === 'bog') return !/\bbog[ -](?:roll|paper)\b/.test(s);
    if (card.word === 'cleave') return !/\bcleave soul to body\b/.test(s);
    if (card.word === 'ere') return !/['’]ere\b/.test(s);
    if (card.word === 'gauntlet') return !/\bgauntlet of shar\b/.test(s);
    if (card.word === 'loathe') return !/\b(?:am|was|is|are|were|be) loathe to\b/.test(s);
    if (card.word === 'rend') return !/\brent\b/.test(s) || /\brent (?:asunder|apart|the|his|her|their|my)\b/.test(s);
    return true;
  }
  function sentencesFrom(text) {
    const clean = cleanLine(text);
    if (!clean || /\[[^\]]*\]|\{[^}]*\}|\\[nrt]|https?:\/\//.test(clean)) return [];
    return (clean.match(/[^.!?]+(?:[.!?]+["'”’]*|$)/g) || []).map(s=>s.trim()).filter(s=> {
      const words=s.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[];
      return words.length>=6 && words.length<=38 && !/^[^A-Za-z“"'*]*\d/.test(s) && !/\b(?:UUID|TODO|DEBUG|tooltip|deprecated|placeholder|PLEASE RECORD|DO NOT RECORD)\b/i.test(s);
    });
  }
  function collectEntry(index, entry, result) {
    for (const line of sentencesFrom(entry.text)) {
      const candidates = new Set();
      const tokens=normalise(line).match(/[a-z]+(?:'[a-z]+)?/g)||[];
      for (const token of tokens) for (const card of index.get(token)||[]) candidates.add(card);
      for (const card of candidates) {
        const matches=[...line.matchAll(pattern(card))];
        if (!matches.length || !meaningful(card,line)) continue;
        const n=line.split(/\s+/).length;
        const score=Math.abs(n-16) + (/\d/.test(line)?12:0) + (!/[.!?]["'”’]*$/.test(line)?8:0) + (matches.length>2?6:0);
        const old=result[card.id];
        const count=(old?.count||0)+1;
        if (!old || score<old.score) result[card.id]={text:line,sourceId:entry.id||'',score,count};
        else old.count=count;
      }
    }
  }
  function reviewedForEntry(reviewed, entry) {
    const clean=cleanLine(entry.text);
    return Object.entries(reviewed).filter(([,ctx])=>ctx.sourceId===entry.id && clean.includes(ctx.text));
  }
  function dateKey(time=Date.now()) {
    const d=new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function schedule(previous, rating, now=Date.now()) {
    const old=previous||{};
    const days=rating==='again'?0:rating==='hard'?1:rating==='known'?30:Math.min(60,Math.max(3,(old.interval||0)*2));
    const due=new Date(now); if(days) due.setDate(due.getDate()+days);
    return {status:rating==='known'?'known':'learning',interval:days,due:days?due.getTime():now+10*60000,reviews:(old.reviews||0)+1,last:now};
  }
  const api={DAY,escapeRegExp,normalise,cleanLine,pattern,createIndex,meaningful,sentencesFrom,collectEntry,reviewedForEntry,dateKey,schedule};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.LexiconCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
