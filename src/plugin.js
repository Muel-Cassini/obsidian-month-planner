'use strict';
const {Plugin,ItemView,Notice,Modal,PluginSettingTab,Setting,normalizePath}=require('obsidian');
const {calendarFiles,eventSignature,validDate,readCalendar}=require('./calendar.js');
// The build replaces this marker with the complete offline interface.
const PLANNER_HTML='__MONTH_PLANNER_HTML__';
const VIEW='month-planner-view';
const defaults=()=>({version:1,theme:'system',categories:[{id:'research',name:'科研',color:'#a78bfa'},{id:'course',name:'课程',color:'#60a5fa'},{id:'project',name:'项目',color:'#e5b86e'},{id:'life',name:'生活',color:'#71b99c'}],tasks:[],logs:{}});
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const clone=value=>JSON.parse(JSON.stringify(value));
function validatePlanner(input){
 if(!input||input.version!==1||!Array.isArray(input.categories)||!input.categories.length||!Array.isArray(input.tasks)||!input.logs||typeof input.logs!=='object'||Array.isArray(input.logs))throw new Error('计划数据格式不正确，已停止保存');
 const ids=new Set(),names=new Set();
 for(const c of input.categories){
  if(!c||typeof c.id!=='string'||!/^[a-z][a-z0-9-]{0,80}$/.test(c.id)||c.id==='all'||typeof c.name!=='string'||!c.name.trim()||c.name.length>24||!/^#[0-9a-f]{6}$/i.test(c.color)||ids.has(c.id)||names.has(c.name.trim().normalize('NFKC').toLowerCase()))throw new Error('类别数据不正确');
  ids.add(c.id);names.add(c.name.trim().normalize('NFKC').toLowerCase());
 }
 const taskIds=new Set();
 for(const task of input.tasks){
  if(!task||typeof task.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(task.id)||taskIds.has(task.id)||typeof task.title!=='string'||!task.title.trim()||task.title.length>120||!ids.has(task.category)||!['high','normal','low'].includes(task.priority)||(task.due&&!validDate(task.due))||(task.completedDate&&!validDate(task.completedDate)))throw new Error('事项数据不正确');
  taskIds.add(task.id);
 }
 for(const [day,value] of Object.entries(input.logs))if(!validDate(day)||typeof value!=='string')throw new Error('每日记录格式不正确');
 return {version:1,theme:'system',categories:clone(input.categories),tasks:clone(input.tasks),logs:clone(input.logs)};
}
class PlannerView extends ItemView{
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.channel=crypto.randomUUID();}
 getViewType(){return VIEW;}
 getDisplayText(){return '月计划';}
 getIcon(){return 'calendar-days';}
 async onOpen(){
  this.contentEl.empty();this.contentEl.addClass('month-planner-view');
  if(!this.actionsAdded){
   this.addAction('calendar-arrow-down','日历导入导出',()=>this.plugin.showCalendar());
   this.addAction('file-down','导出今天的回顾',()=>this.plugin.exportReview(today()));
   this.actionsAdded=true;
  }
  const html=PLANNER_HTML;
  const initial={channel:this.channel,initialData:this.plugin.state.planner,today:today(),theme:this.getTheme()};
  const bootstrap=JSON.stringify(initial).replace(/</g,'\\u003c');
  this.frame=this.contentEl.createEl('iframe',{attr:{title:'月计划',sandbox:'allow-scripts allow-forms'}});
  this.handler=async event=>{
   if(event.source!==this.frame?.contentWindow||event.data?.channel!==this.channel)return;
   const message=event.data;
   try{
    if(message.type==='save'){
     await this.plugin.commit(message.planner);
     this.send({type:'saved',seq:message.seq});
    }else if(message.type==='calendar')await this.plugin.showCalendar();
    else if(message.type==='review')await this.plugin.exportReview(message.date);
   }catch(error){this.send({type:'save-error',message:error.message});new Notice('月计划：'+error.message,8000);}
  };
  window.addEventListener('message',this.handler);
  this.frame.srcdoc=html.replace('/* MONTH_PLANNER_BOOTSTRAP */',`globalThis.monthPlannerHost=${bootstrap};`);
  this.observer=new MutationObserver(()=>this.send({type:'theme',theme:this.getTheme()}));
  this.observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 }
 getTheme(){return document.body.classList.contains('theme-dark')?'dark':'light';}
 send(message){this.frame?.contentWindow?.postMessage({channel:this.channel,...message},'*');}
 async onClose(){window.removeEventListener('message',this.handler);this.observer?.disconnect();this.frame=null;}
}
class CalendarDialog extends Modal{
 constructor(app,plugin){super(app);this.plugin=plugin;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'日历导入导出'});
  this.contentEl.createEl('p',{text:'选择方向和事项，通过 .ics 文件手动交换。没有 DDL 的事项、手写进展和已完成事项不会导出。'});
  const outgoing=this.plugin.state.planner.tasks.filter(t=>t.due&&!t.completedDate);
  const selection=new Set(outgoing.map(t=>t.id));
  this.contentEl.createEl('h3',{text:'Obsidian 导出到日历'});
  this.contentEl.createEl('p',{text:'勾选本次导出的事项。每条导出为截止当天的全天事件。'});
  const controls=this.contentEl.createDiv({cls:'month-planner-transfer-controls'});
  const list=this.contentEl.createDiv({cls:'month-planner-transfer-list'});
  const render=()=>{
   list.empty();
   for(const task of [...outgoing].sort((a,b)=>a.due.localeCompare(b.due))){
    const row=list.createEl('label',{cls:'month-planner-transfer-row'}),check=row.createEl('input',{type:'checkbox'});
    check.checked=selection.has(task.id);check.onchange=()=>check.checked?selection.add(task.id):selection.delete(task.id);
    row.createEl('span',{text:task.due+' · '+task.title});
   }
  };
  const all=controls.createEl('button',{text:'全选'});all.onclick=()=>{for(const task of outgoing)selection.add(task.id);render();};
  const none=controls.createEl('button',{text:'全不选'});none.onclick=()=>{selection.clear();render();};
  render();
  const output=this.contentEl.createEl('p',{cls:'month-planner-settings-note'});
  new Setting(this.contentEl).addButton(button=>button.setButtonText('导出勾选的 DDL').setCta().setDisabled(!outgoing.length).onClick(async()=>{
   if(!selection.size){new Notice('请至少选择一个事项');return;}
   try{const folder=await this.plugin.exportSelection(selection);output.textContent='已生成：'+folder+'。可通过文件管理器取出 all.ics，或分别导入类别文件。';new Notice('所选事项已导出');}catch(error){new Notice(error.message,8000);}
  }));
  this.contentEl.createEl('h3',{text:'日历导入到 Obsidian'});
  this.contentEl.createEl('p',{text:'选择 .ics 文件后，可以逐项预览并选择导入的事件和目标类别。'});
  const picker=this.contentEl.createEl('input',{type:'file',attr:{accept:'.ics,text/calendar'}});
  picker.onchange=async()=>{try{const file=picker.files?.[0];if(!file)return;const result=readCalendar(await file.text());new CalendarImportDialog(this.app,this.plugin,result).open();}catch(error){new Notice(error.message,8000);}finally{picker.value='';}};
  this.contentEl.createEl('h3',{text:'本地日历文件'});
  this.contentEl.createEl('p',{text:'导出目录：'+this.plugin.calendarFolder()});
  this.contentEl.createEl('p',{text:'all.ics 包含全部类别。每个类别也有单独文件，可在苹果日历中分别设置颜色。'});
  this.contentEl.createEl('p',{text:'导出后可将 .ics 作为邮件附件发送给自己，在 iPhone「邮件」中打开并导入日历。选择 iCloud 下的目标日历。',cls:'month-planner-settings-note'});
  this.contentEl.createEl('p',{text:'文件记录的是导出时的状态。后续在任意一边修改，需要重新选择文件导入。',cls:'month-planner-settings-note'});
  const fileList=this.contentEl.createEl('ul');
  for(const c of this.plugin.state.planner.categories)fileList.createEl('li',{text:c.name+'：'+c.id+'.ics'});
  new Setting(this.contentEl).addButton(button=>button.setButtonText('重新生成日历文件').setCta().onClick(async()=>{try{await this.plugin.exportCalendars();new Notice('日历文件已更新');}catch(error){new Notice(error.message,7000);}}));
 }
 onClose(){this.contentEl.empty();}
}
class CalendarImportDialog extends Modal{
 constructor(app,plugin,result){super(app);this.plugin=plugin;this.result=result;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'选择导入的日历事件'});
  this.contentEl.createEl('p',{text:'事件开始日期将作为 DDL。带时间的事件转换为当天事项，不保留小时级排程。含明确时区的本地时间按原事件当地日期导入，UTC 时间按设备时区换算。',cls:'month-planner-settings-note'});
  this.contentEl.createEl('p',{text:'相同 UID 会更新已有事项的名称和 DDL，保留原重要程度、类别和完成状态。'});
  let categoryId='new-import';
  new Setting(this.contentEl).setName('新事项的类别').addDropdown(dropdown=>{dropdown.addOption('new-import','新建或使用「日历导入」类别');for(const c of this.plugin.state.planner.categories)dropdown.addOption(c.id,c.name);dropdown.setValue(categoryId).onChange(value=>categoryId=value);});
  const selection=new Set(this.result.events.map(event=>event.uid));
  const controls=this.contentEl.createDiv({cls:'month-planner-transfer-controls'}),list=this.contentEl.createDiv({cls:'month-planner-transfer-list'});
  const render=()=>{
   list.empty();
   for(const event of this.result.events){
    const existing=this.plugin.findCalendarTask(event.uid),row=list.createEl('label',{cls:'month-planner-transfer-row'}),check=row.createEl('input',{type:'checkbox'});
    check.checked=selection.has(event.uid);check.onchange=()=>check.checked?selection.add(event.uid):selection.delete(event.uid);
    row.createEl('span',{text:event.due+' · '+event.title+(existing?'（更新已有）':'（新增）')+(event.timed?' · 原事件带时间':'')});
   }
  };
  controls.createEl('button',{text:'全选'}).onclick=()=>{for(const event of this.result.events)selection.add(event.uid);render();};
  controls.createEl('button',{text:'全不选'}).onclick=()=>{selection.clear();render();};render();
  if(this.result.warnings.length){this.contentEl.createEl('h3',{text:'未纳入本次导入'});const warnings=this.contentEl.createEl('ul',{cls:'month-planner-settings-note'});for(const text of this.result.warnings)warnings.createEl('li',{text});}
  new Setting(this.contentEl).addButton(button=>button.setButtonText('导入勾选事件').setCta().setDisabled(!this.result.events.length).onClick(async()=>{
   if(!selection.size){new Notice('请至少选择一个事件');return;}
   try{await this.plugin.importEvents(this.result.events.filter(event=>selection.has(event.uid)),categoryId);this.close();new Notice('日历事件已导入月计划');}catch(error){new Notice(error.message,8000);}
  }));
 }
 onClose(){this.contentEl.empty();}
}
class PlannerSettings extends PluginSettingTab{
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
 display(){
  const el=this.containerEl;el.empty();el.createEl('h2',{text:'月计划'});
  el.createEl('p',{text:'事项、自定义类别和进展存放于本插件的 data.json。请将插件数据纳入笔记库同步与备份。',cls:'month-planner-settings-note'});
  new Setting(el).setName('自动更新本地日历文件').setDesc('修改 DDL、类别或完成状态后更新当前库中的 .ics 文件。苹果日历仍需手动导入。').addToggle(toggle=>toggle.setValue(this.plugin.state.autoExport).onChange(async value=>{this.plugin.state.autoExport=value;await this.plugin.saveData(this.plugin.state);if(value)await this.plugin.exportCalendars();}));
  new Setting(el).setName('打开月计划').addButton(button=>button.setButtonText('打开').onClick(()=>this.plugin.activate()));
  new Setting(el).setName('日历导出与 iOS 说明').addButton(button=>button.setButtonText('查看').onClick(()=>this.plugin.showCalendar()));
 }
}
module.exports=class MonthPlannerPlugin extends Plugin{
 async onload(){
  this.queue=Promise.resolve();
  const stored=await this.loadData();
  this.state=stored||{schema:1,namespace:crypto.randomUUID(),autoExport:true,planner:defaults(),revisions:{}};
  if(this.state.schema!==1)throw new Error('不支持此版本的月计划数据');
  this.state.planner=validatePlanner(this.state.planner);
  this.state.revisions=this.state.revisions||{};
  this.registerView(VIEW,leaf=>new PlannerView(leaf,this));
  this.addRibbonIcon('calendar-days','打开月计划',()=>this.activate());
  this.addCommand({id:'open-month-planner',name:'打开月计划',callback:()=>this.activate()});
  this.addCommand({id:'export-calendars',name:'更新日历文件 / iOS 同步说明',callback:()=>this.showCalendar()});
  this.addCommand({id:'export-daily-review',name:'导出今天的回顾为笔记',callback:()=>this.exportReview(today())});
  this.addSettingTab(new PlannerSettings(this.app,this));
 }
 async activate(){
  let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];
  if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}
  await this.app.workspace.revealLeaf(leaf);
 }
 async commit(input){
  const planner=validatePlanner(input);
  const job=this.queue.catch(()=>{}).then(async()=>{
   if(JSON.stringify(this.state.planner)===JSON.stringify(planner))return;
   const next=clone(this.state),now=new Date().toISOString();
   const categories=new Map(planner.categories.map(c=>[c.id,c]));
   for(const task of planner.tasks){
    const signature=eventSignature(task,categories.get(task.category));
    const previous=next.revisions[task.id];
    if(previous?.signature!==signature)next.revisions[task.id]={signature,sequence:previous?previous.sequence+1:0,updatedAt:now};
   }
   next.planner=planner;
   await this.app.vault.adapter.write(this.manifest.dir+'/data.previous.json',JSON.stringify(this.state,null,2));
   await this.saveData(next);this.state=next;
   if(next.autoExport){try{await this.exportCalendars();}catch(error){new Notice('计划已保存，但日历文件未更新：'+error.message,8000);}}
  });
  this.queue=job;return job;
 }
 calendarFolder(){return '月计划/日历导出';}
 async ensureFolder(folder){
  const parts=normalizePath(folder).split('/');let current='';
  for(const part of parts){current=current?current+'/'+part:part;if(!await this.app.vault.adapter.exists(current))await this.app.vault.createFolder(current);}
 }
 async exportCalendars(){
  await this.ensureFolder(this.calendarFolder());
  const files=calendarFiles(this.state.planner,{namespace:this.state.namespace,revisions:this.state.revisions});
  for(const [name,content] of Object.entries(files)){
   const target=this.calendarFolder()+'/'+name;
   if(await this.app.vault.adapter.exists(target)){
    const existing=await this.app.vault.adapter.read(target);
    if(!existing.includes('PRODID:-//Month Planner//Obsidian DDL//ZH'))throw new Error('同名文件不是本插件生成的，已停止覆盖：'+target);
   }
   await this.app.vault.adapter.write(target,content);
  }
  const generated=await this.app.vault.adapter.list(this.calendarFolder());
  for(const target of generated.files){
   const name=target.slice(target.lastIndexOf('/')+1);
   if(target!==this.calendarFolder()+'/'+name||!/^[a-z][a-z0-9-]{0,80}\.ics$/.test(name)||Object.hasOwn(files,name))continue;
   const content=await this.app.vault.adapter.read(target);
   if(content.includes('PRODID:-//Month Planner//Obsidian DDL//ZH'))await this.app.vault.adapter.remove(target);
  }
  return files;
 }
 async showCalendar(){await this.queue.catch(()=>{});await this.exportCalendars();new CalendarDialog(this.app,this).open();}
 async exportSelection(ids){
  await this.queue.catch(()=>{});
  const planner=clone(this.state.planner);planner.tasks=planner.tasks.filter(task=>ids.has(task.id)&&task.due&&!task.completedDate);
  if(!planner.tasks.length)throw new Error('选择中没有可导出的 DDL');
  const used=new Set(planner.tasks.map(task=>task.category));planner.categories=planner.categories.filter(c=>used.has(c.id));
  const folder='月计划/手动导出/'+today()+'-'+crypto.randomUUID().slice(0,8);
  await this.ensureFolder(folder);
  const files=calendarFiles(planner,{namespace:this.state.namespace,revisions:this.state.revisions});
  for(const [name,content] of Object.entries(files))await this.app.vault.adapter.write(folder+'/'+name,content);
  return folder;
 }
 findCalendarTask(uid){return this.state.planner.tasks.find(task=>task.calendarSource?.uid===uid||uid===this.state.namespace+'.'+task.id+'@month-planner.local');}
 async importEvents(events,categoryId){
  const planner=clone(this.state.planner);
  if(categoryId==='new-import'){
   let category=planner.categories.find(c=>c.name==='日历导入');
   if(!category){category={id:'cat-'+crypto.randomUUID(),name:'日历导入',color:'#5eb9c9'};planner.categories.push(category);}
   categoryId=category.id;
  }
  if(!planner.categories.some(c=>c.id===categoryId))throw new Error('目标类别不存在');
  for(const event of events){
   const prior=this.findCalendarTask(event.uid),task=prior?planner.tasks.find(t=>t.id===prior.id):{id:crypto.randomUUID(),category:categoryId,priority:'normal',completedDate:null};
   task.title=event.title;task.due=event.due;
   task.calendarSource={uid:event.uid,originalStart:event.originalStart,timezone:event.timezone,timed:event.timed};
   if(!prior)planner.tasks.push(task);
  }
  await this.commit(planner);
  for(const leaf of this.app.workspace.getLeavesOfType(VIEW)){await leaf.view.onClose();await leaf.view.onOpen();}
 }
 async exportReview(day){
  if(!validDate(day))throw new Error('回顾日期无效');
  await this.queue.catch(()=>{});
  const p=this.state.planner,completed=p.tasks.filter(t=>t.completedDate===day),due=p.tasks.filter(t=>t.due===day),categories=new Map(p.categories.map(c=>[c.id,c.name]));
  const clean=value=>String(value).replace(/[\r\n]/g,' ');
  const taskLine=t=>`- [${t.completedDate?'x':' '}] ${clean(t.title)} · ${clean(categories.get(t.category)||'未分类')}${t.due?' · DDL '+t.due:''}`;
  const text=`# ${day} 每日回顾\n\n此笔记是导出时的快照，可自由编辑。后续导出会创建新文件。\n\n## 当日截止\n\n${due.map(taskLine).join('\n')||'当天没有截止事项。'}\n\n## 实际完成\n\n${completed.map(taskLine).join('\n')||'当天没有完成记录。'}\n\n## 手写进展\n\n${p.logs[day]||'当天尚未记录进展。'}\n`;
  await this.ensureFolder('月计划/回顾导出');
  const file=await this.app.vault.create('月计划/回顾导出/'+day+'-'+crypto.randomUUID().slice(0,8)+'.md',text);
  await this.app.workspace.getLeaf('tab').openFile(file);
  return file;
 }
 async onExternalSettingsChange(){
  await this.queue.catch(()=>{});
  const next=await this.loadData();
  if(next?.schema!==1)return;
  try{next.planner=validatePlanner(next.planner);this.state=next;for(const leaf of this.app.workspace.getLeavesOfType(VIEW))await leaf.view.onClose();for(const leaf of this.app.workspace.getLeavesOfType(VIEW))await leaf.view.onOpen();}
  catch(error){new Notice('外部同步的数据未载入：'+error.message,8000);}
 }
};
