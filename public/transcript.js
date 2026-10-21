(function(root){
 function merge(previous,part){previous=String(previous||'');part=String(part||'');if(!part)return previous;if(!previous)return part;if(part===previous||(part.length>4&&/\s/.test(part)&&previous.endsWith(part)))return previous;if(previous.length>4&&part.startsWith(previous))return part;return previous+part;}
 function clean(value){
  let text=String(value||'').normalize('NFC').replace(/<(?:noise|silence|inaudible|unintelligible|unk|end_of_task|audio|soft_audio|text_sentinel|audio_perception)[^>]*>/gi,' ').replace(/\[(?:noise|silence|inaudible|unintelligible|музыка|шум|неразборчиво)\]/gi,' ').replace(/<[^>]*$/g,'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\uFFFD]/g,' ').replace(/\s+/g,' ').trim();
  const letters=text.match(/\p{L}/gu)||[],foreign=letters.filter(c=>!/[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(c));
  return {text,uncertain:foreign.length>=2&&foreign.length/Math.max(1,letters.length)>.6};
 }
 const api={clean,merge};if(typeof module!=='undefined')module.exports=api;else root.JarvisTranscript=api;
})(typeof window!=='undefined'?window:globalThis);
