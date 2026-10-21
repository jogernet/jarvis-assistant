const normalized=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}_@]+/gu,' ').replace(/\s+/g,' ').trim();
const compact=value=>normalized(value).replace(/[\s@_]/g,'');
const tokens=value=>normalized(value).match(/[\p{L}_]+|[0-9]+/gu)||[];
const stem=value=>/^[а-я]{4,}$/.test(value)?value.replace(/(?:ами|ями|ого|ому|ой|ей|ий|ый|ая|яя|а|я|у|ю|е|ы|и)$/,''):value;
function score(query,aliases){
 const wanted=normalized(query),key=compact(query),parts=tokens(query);if(!key)return 0;
 let best=0;
 for(const alias of aliases.filter(Boolean)){
  const text=normalized(alias),name=compact(alias),words=tokens(alias);let rank=0;
  if(wanted===text)rank=100;else if(key===name)rank=98;else if(name.includes(key))rank=90;
  else if(parts.length&&parts.every(p=>words.some(w=>w.includes(p))))rank=82;
  else if(parts.length&&parts.every(p=>words.some(w=>p===w||/^[а-я]+$/.test(p)&&stem(p).length>=3&&stem(p)===stem(w))))rank=65;
  best=Math.max(best,rank);
 }
 return best;
}
function exactCandidates(value,candidates){const key=compact(value);if(!key)return [];return candidates.filter(c=>[c.id,c.peerId,c.name,...(c.aliases||[])].filter(Boolean).some(a=>compact(a)===key||compact(String(a).split(' · @')[0])===key));}
module.exports={normalized,compact,score,exactCandidates};
