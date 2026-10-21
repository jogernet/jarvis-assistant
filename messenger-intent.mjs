const clean=text=>String(text||'').toLowerCase().replace(/ё/g,'е').replace(/[.,!?«»"']/g,' ').replace(/\s+/g,' ').trim();
export function sendRequested(text){const value=clean(text),explicit=/(?:отправ(?:ь|ить|ляй)|пошли|отошли|send\b)/i.test(value);return !/(?:не\s+(?:отправ|пиши|посылай|шли)|без отправки|только\s+(?:черновик|подготовь)|не надо отправ)/.test(value)&&(explicit||!/черновик|подготовь|сгенерируй/.test(value)&&/напиши/i.test(value));}
export function sendConfirmed(text){return /^(?:(?:джарвис|jarvis)\s+)?(?:да\s+)?(?:подтверждаю|подтверждаю отправку|подтверждаю отправку сообщения|отправляй|давай отправляй|да|давай|согласен)(?:\s+(?:сэр|пожалуйста))?$/.test(clean(text));}
export function deleteRequested(text){const value=clean(text);return !/(?:не\s+(?:удал|стирай|сотри|убирай)|без удаления)/.test(value)&&/(?:удали|удалить|удаляй|сотри|стереть|убери\s+(?:это\s+|последнее\s+)?сообщение|delete\b)/i.test(value);}

export function callRequested(text){const value=clean(text);return !/(?:не\s+(?:звони|надо звонить|нужно звонить)|без звонка)/.test(value)&&/(?:позвони|позвонить|набери|сделай\s+(?:голосовой\s+)?(?:звонок|вызов)|call\b)/i.test(value);}
