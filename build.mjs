import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const standalone=fs.existsSync(path.join(root,'src','ui-template.html'));
const sourceRoot=standalone?path.join(root,'src'):root;
const template=standalone?path.join(sourceRoot,'ui-template.html'):path.join(root,'../obsidian-month-prototype/index.html');
let html=fs.readFileSync(template,'utf8').replace(/\r\n/g,'\n');
function replace(before,after){if(!html.includes(before))throw new Error('Missing UI anchor: '+before.slice(0,90));html=html.replace(before,after);}
replace("const TODAY = '2026-10-20';","const HOST = globalThis.monthPlannerHost;\nconst TODAY = HOST.today;");
const seedStart=html.indexOf('const seed = () =>');
const seedEnd=html.indexOf('function isDate',seedStart);
html=html.slice(0,seedStart)+"const seed = () => ({version:1,theme:'system',categories:defaultCategories(),tasks:[],logs:{}});\n"+html.slice(seedEnd);
replace('const raw = localStorage.getItem(STORE);','const raw = JSON.stringify(HOST.initialData);');
const persistStart=html.indexOf('function persist() {');
const persistEnd=html.indexOf('function setTheme',persistStart);
html=html.slice(0,persistStart)+`function persist() {
 HOST.seq=(HOST.seq||0)+1;
 parent.postMessage({channel:HOST.channel,type:'save',seq:HOST.seq,planner:data},'*');
 $('storage-status').textContent='正在保存到笔记库…';
 return true;
}
`+html.slice(persistEnd);
replace("value === 'system' ? (mediaTheme.matches ? 'dark' : 'light') : value","HOST.theme");
replace("'已记入 10 月 20 日的完成记录'","'已记入 '+shortDate(TODAY)+' 的完成记录'");
html=html.replaceAll('演示当天','今天').replaceAll('演示今天','今天').replaceAll('演示日期 2026-10-20','保存到当前笔记库').replaceAll('自动保存到本浏览器','自动保存到笔记库').replaceAll('已保存在本浏览器','已保存在笔记库').replaceAll('跟随系统主题仅用于预览，正式插件将跟随 Obsidian 主题。','界面跟随 Obsidian 的深浅主题。').replaceAll('页面使用示例数据，尚未接入 Obsidian。','事项和进展会保存到当前笔记库。').replaceAll('完成操作记入今天 10 月 20 日。','完成操作记入今天。');
html=html.replaceAll('月计划 · Obsidian 界面原型','月计划 Month Planner').replaceAll('原型使用说明','使用说明').replaceAll('已删除该示例事项','已删除事项');
replace('<script>','<script>\n/* MONTH_PLANNER_BOOTSTRAP */');
replace('<span class="view-label">月视图</span>','<span class="view-label">月视图</span><button class="quiet" id="calendar-transfer">日历导入导出</button>');
const resetStart=html.indexOf("$('help-dialog').addEventListener('close',()=>{resetArmed=false;");
const resetEnd=html.indexOf('setTheme(data.theme);\nrenderAll();',resetStart);
if(resetStart<0||resetEnd<resetStart)throw new Error('Missing demo reset anchors');
html=html.slice(0,resetStart)+html.slice(resetEnd);
html=html.replace(/<button[^>]*id="reset-demo"[\s\S]*?<\/button><p[^>]*id="reset-hint"[\s\S]*?<\/p>/,'');
const hostScript=`
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!==HOST.channel)return;
 const message=event.data;
 if(message.type==='saved'&&message.seq===HOST.seq)$('storage-status').textContent='已保存到当前笔记库';
 if(message.type==='save-error'){$('storage-status').textContent='保存失败，请保留此页面';toast(message.message);}
 if(message.type==='theme'){HOST.theme=message.theme;document.documentElement.dataset.theme=message.theme;if($('category-dialog').open)updateCategoryPreview();}
});
$('calendar-transfer').addEventListener('click',()=>parent.postMessage({channel:HOST.channel,type:'calendar'},'*'));
document.addEventListener('click',event=>{if(event.target.closest('#export-selected-review'))parent.postMessage({channel:HOST.channel,type:'review',date:selectedDate},'*');});
`;
replace('setTheme(data.theme);\nrenderAll();',hostScript+'\nsetTheme(data.theme);\nrenderAll();');
replace('<div class="detail-kicker">每日回顾</div>','<div class="between"><div class="detail-kicker">每日回顾</div><button class="journal-save" id="export-selected-review">导出笔记</button></div>');
replace('</head>',`<style>
.titlebar,.ribbon,#reset-demo,#reset-hint{display:none!important}.workspace{grid-template-columns:216px minmax(0,1fr) 292px;min-height:calc(100vh - 28px)}.main{padding:22px 18px 15px}.details{padding:24px 16px}.sidebar{padding-left:13px;padding-right:13px}.main-title{font-size:24px}.vault-name{display:none}.sidebar>.section-heading{margin-top:0}.month-en{display:none}.sidebar.open{left:0;top:0;bottom:28px}.main .toolbar{gap:5px}.search{width:132px}.days{grid-auto-rows:minmax(126px,1fr)}
@media(max-width:1100px){.workspace{grid-template-columns:minmax(0,1fr) 280px}}
@media(max-width:800px){.workspace{grid-template-columns:minmax(0,1fr)}.details{grid-column:1}.main{padding:20px 12px}.days{grid-auto-rows:126px}.details .between{align-items:flex-start}.sidebar.open{left:0}}
</style></head>`);
fs.writeFileSync(path.join(root,'ui.html'),html);
const calendar=fs.readFileSync(path.join(sourceRoot,'calendar.js'),'utf8').replace(/\r\n/g,'\n');
const source=fs.readFileSync(path.join(sourceRoot,standalone?'plugin.js':'plugin.cjs'),'utf8').replace(/\r\n/g,'\n');
const calendarImport="require('./calendar.js')",uiMarker="'__MONTH_PLANNER_HTML__'";
if(!source.includes(calendarImport)||!source.includes(uiMarker))throw new Error('Missing source bundling marker');
const bundled=source.replace(calendarImport,()=>`(()=>{const module={exports:{}};${calendar}\nreturn module.exports;})()`).replace(uiMarker,()=>JSON.stringify(html));
fs.writeFileSync(path.join(root,'main.js'),bundled);
console.log('Built self-contained main.js; ui.html is only an optional local preview.');
