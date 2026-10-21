'use strict';
const encoder = new TextEncoder();
function escapeText(value) { return String(value ?? '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function foldLine(line) {
 let result='',current='',bytes=0;
 for (const char of line) {
  const size=encoder.encode(char).length;
  if(bytes+size>75){result+=current+'\r\n';current=' ';bytes=1;}
  current+=char;bytes+=size;
 }
 return result+current;
}
function nextDay(date) { const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10).replace(/-/g,''); }
function timestamp(date) { return new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
function validDate(date) { return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='1900-01-01'&&date<='2199-12-31'&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date; }
function eventSignature(task,category) { return JSON.stringify([task.title,task.due,task.completedDate,task.priority,category?.name,category?.color,task.calendarSource?.uid]); }
function calendarFiles(planner,{namespace='month-planner',revisions={},now=new Date().toISOString()}={}) {
 const categories=new Map(planner.categories.map(c=>[c.id,c]));
 const tasks=planner.tasks.filter(t=>validDate(t.due)&&!t.completedDate);
 const make=(name,items,color=null)=>{
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Month Planner//Obsidian DDL//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+escapeText(name)];
  if(color&&/^#[0-9a-f]{6}$/i.test(color))lines.push('X-APPLE-CALENDAR-COLOR:'+color);
  for(const task of [...items].sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id))){
   const category=categories.get(task.category);
   const revision=revisions[task.id]||{sequence:0,updatedAt:now};
   const label=task.priority==='high'?'[重要] ':task.priority==='low'?'[低] ':'';
   const prefix=(category?'['+category.name+'] ':'')+label;
   lines.push('BEGIN:VEVENT','UID:'+escapeText(task.calendarSource?.uid||namespace+'.'+task.id+'@month-planner.local'),'DTSTAMP:'+timestamp(revision.updatedAt),'LAST-MODIFIED:'+timestamp(revision.updatedAt),'SEQUENCE:'+Math.max(0,Number(revision.sequence)||0),'DTSTART;VALUE=DATE:'+task.due.replace(/-/g,''),'DTEND;VALUE=DATE:'+nextDay(task.due),'SUMMARY:'+escapeText(prefix+task.title),'X-MONTH-PLANNER-SUMMARY-PREFIX:'+escapeText(prefix),'CATEGORIES:'+escapeText(category?.name||'未分类'),'DESCRIPTION:'+escapeText('截止事项，来自 Obsidian 月计划。请在 Obsidian 中修改。'),'PRIORITY:'+(task.priority==='high'?1:task.priority==='low'?9:5),'TRANSP:TRANSPARENT','STATUS:CONFIRMED','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n')+'\r\n';
 };
 const files={'all.ics':make('Obsidian 月计划 · 全部 DDL',tasks)};
 for(const category of planner.categories){
  if(!/^[a-z][a-z0-9-]{0,80}$/.test(category.id))continue;
  files[category.id+'.ics']=make('月计划 · '+category.name,tasks.filter(t=>t.category===category.id),category.color);
 }
 return files;
}
function unescapeText(value){return String(value||'').replace(/\\([nN,;\\])/g,(_,char)=>char.toLowerCase()==='n'?'\n':char);}
function readCalendar(text){
 if(typeof text!=='string'||encoder.encode(text).length>5*1024*1024)throw new Error('请选择 5 MB 以内的 .ics 文件');
 text=text.replace(/^\uFEFF/,'');
 if(!/^BEGIN:VCALENDAR\s*$/im.test(text)||!/^END:VCALENDAR\s*$/im.test(text))throw new Error('文件不是完整有效的 iCalendar 日历');
 const lines=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'').split('\n');
 const events=[],warnings=[];let current=null,depth=0;
 for(const line of lines){
  if(line.toUpperCase()==='BEGIN:VEVENT'){current={};depth=0;continue;}
  if(!current)continue;
  if(line.toUpperCase()==='END:VEVENT'){
   let title=unescapeText(current.SUMMARY?.value||'未命名事件').replace(/[\r\n]/g,' ').trim();
   const exportedPrefix=unescapeText(current['X-MONTH-PLANNER-SUMMARY-PREFIX']?.value);
   if(exportedPrefix&&title.startsWith(exportedPrefix))title=title.slice(exportedPrefix.length).trim();
   const start=current.DTSTART;
   if(current.RRULE||current['RECURRENCE-ID'])warnings.push(title+'：含重复规则，首版暂不导入');
   else if(current.STATUS?.value.toUpperCase()==='CANCELLED')warnings.push(title+'：已取消，未导入');
   else if(!current.UID?.value)warnings.push(title+'：缺少事件标识 UID，未导入');
   else if(!start)warnings.push(title+'：缺少开始日期，未导入');
   else{
    let date;
    const value=start.value;
    if(/^\d{8}$/.test(value))date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
    else if(/^\d{8}T\d{6}Z$/.test(value)){
     const d=new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+'T'+value.slice(9,11)+':'+value.slice(11,13)+':'+value.slice(13,15)+'Z');
     if(!Number.isNaN(d.getTime()))date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }else if(/^\d{8}T\d{6}$/.test(value)){
     date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
    }
    if(!validDate(date))warnings.push(title+'：无法识别日期，未导入');
    else events.push({uid:unescapeText(current.UID.value),title:title.slice(0,120)||'未命名事件',due:date,originalStart:start.value,timezone:start.parameters.TZID||null,timed:value.includes('T')});
   }
   current=null;continue;
  }
  if(line.startsWith('BEGIN:')){depth++;continue;}
  if(line.startsWith('END:')){depth--;continue;}
  if(depth>0)continue;
  const colon=line.indexOf(':');if(colon<0)continue;
  const head=line.slice(0,colon).split(';'),name=head.shift().toUpperCase(),parameters={};
  for(const parameter of head){const index=parameter.indexOf('=');if(index>0)parameters[parameter.slice(0,index).toUpperCase()]=parameter.slice(index+1).replace(/^"|"$/g,'');}
  if(!current[name])current[name]={value:line.slice(colon+1),parameters};
 }
 const seen=new Set();
 return {events:events.filter(event=>{if(seen.has(event.uid)){warnings.push(event.title+'：文件中存在重复 UID，仅保留首个');return false;}seen.add(event.uid);return true;}),warnings};
}
module.exports={calendarFiles,eventSignature,escapeText,foldLine,validDate,readCalendar};
