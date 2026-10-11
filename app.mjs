import {validatePackage,newBatch,record,active,history,validateBatch,exportSurvey,validateExport} from './core.mjs';
import {openStore} from './storage.mjs';import {projectState,compatiblePackages,extendsHistory} from './workbench-state.mjs';import {installEdgeEditor} from './desktop-workbench.mjs';
const $=id=>document.getElementById(id);let store,session=null,installed=false,importBusy=false,prepared=null,viewTimer,exportTicket=0;
const message=(text,bad=false)=>{for(const id of ['message','options-message','entry-error']){const e=$(id);if(e){e.textContent=text;e.classList.toggle('error',bad);}}};
const show=id=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();$(id).showModal();};for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const io={menu:()=>show('options'),notify:message,isMeasurable:id=>session?.package.measurements.some(e=>e.id===id&&e.measurable),hasNewRecord:id=>!!active(session.batch,id),
 async fetch(url,options={}){
  if(!session)return response({message:'请先导入私人户型 JSON。'},400);
  if(!options.method){session=await store.load(session.key);return response(projectState(session));}
  try{const input=JSON.parse(options.body),p=session.package;
   if(input.sourceHash!==p.source.sha||input.revision!==session.version||input.generation!==session.batch.id)throw Error('当前记录版本已变化，请保留输入后重试。');
   let batch;if(url.endsWith('/record'))batch=record(p,session.batch,input.id,input.valueText);else if(url.endsWith('/history'))batch=history(p,session.batch,input.action);else throw Error('固定户型只允许录入已有唯一绑定尺寸。');
   session=await store.save({...session,batch},session.version);prepared=null;return response(projectState(session));
  }catch(e){return response({message:e.message},/另一页面|版本已变化/.test(e.message)?409:400);}
 },
 appendHistory(target,id){const p=session.package,w=p.workbench;const box=document.createElement('div');box.className='mobile-history';const line=t=>{const row=document.createElement('p');row.textContent=t;box.append(row);};const original=w.ledger.active[id]||w.historicalReadings?.[id];line('原尺寸：'+(original?original.value+' mm（只读保留）':'未找到可靠原尺寸'));for(const r of session.batch.records[id]?.revisions||[])line('本轮：'+r.valueText+' mm · '+new Date(r.recordedAt).toLocaleString('zh-CN')+(active(session.batch,id)?.revisionId===r.revisionId?' · 当前值':' · 历史值'));target.append(box);},
 saveView(camera){if(!session)return;const key=session.key,c=structuredClone(camera);clearTimeout(viewTimer);viewTimer=setTimeout(()=>store.view(key,{camera:c,collapsed:document.body.classList.contains('panel-collapsed')}).catch(e=>message(e.message,true)),100);},
 async restoreView(camera,apply){const key=session.key,initial=JSON.stringify(camera),view=await store.loadView(key);if(key!==session.key||JSON.stringify(window.edgeEditor.camera)!==initial)return;if(view?.camera&&[view.camera.x,view.camera.y,view.camera.scale].every(Number.isFinite)&&view.camera.scale>0)apply(view.camera);}
};
async function adopt(next){await validatePackage(next.package);validateBatch(next.package,next.batch);if(!next.package.workbench)throw Error('此户型包缺少电脑版显示信息，请在 Mac 重新生成后导入；本机原复测仍保留。');session=next;$('empty').hidden=true;$('title').textContent=next.package.title+' CAD 实时核对';document.title=$('title').textContent;$('filename').textContent=String(next.package.workbench.model.sourcePath||next.package.source.version).split(/[\\/]/).at(-1);
 if(!installed){installed=true;installEdgeEditor(io);}else await io.reload();
}
async function importFile(file){if(!file||importBusy)return;importBusy=true;message('正在验证文件…');try{
 if(file.size>25*1024*1024)throw Error('文件超过25MB，请选择户型 JSON。');const v=JSON.parse(await file.text());let p,b;
 if(v.type==='measurement-export'){await validateExport(v);if(v.scope.type!=='whole-house')throw Error('请用整屋 JSON 恢复，单房导出仅供核算。');p=v.package;b=v.batch;}else{await validatePackage(v);p=v;}
 const prior=await store.loadPackage(p.packageId);if(prior&&!compatiblePackages(prior.package,p))throw Error('同一户型标识的版本不同，原记录没有覆盖。');
 if(!p.workbench&&prior?.package.workbench)p=prior.package;if(!p.workbench)throw Error('请用 Mac 生成新版户型包；此文件缺少电脑版工作台。');
 if(!b&&prior){const next=await store.save({...prior,package:p},prior.version);await adopt(next);message('户型已恢复，本机原复测及修改历史保留。');$('options').close();return;}
 b||=newBatch(p);const key=v.type==='measurement-export'?'batch:'+b.id:'package:'+p.packageId;const existing=await store.load(key);
 if(existing&&(!compatiblePackages(existing.package,p)||!extendsHistory(existing.batch,b)))throw Error('备份早于本机记录或历史有冲突；未覆盖，请先导出本机 JSON。');
 const next=await store.save({key,package:p,batch:b},existing?.version||0);await adopt(next);$('options').close();message('导入成功，数据只保存在本机。');try{await navigator.storage?.persist?.();}catch{}
 }catch(e){message('导入失败：'+e.message,true);}finally{importBusy=false;$('import-file').value='';}}
$('import-file').onchange=()=>void importFile($('import-file').files[0]);for(const id of ['import','import-empty'])$(id).onclick=()=>$('import-file').click();
function panel(){const collapsed=document.body.classList.contains('panel-collapsed');$('toggle-panel').textContent=collapsed?'展开面板':'收起面板';$('toggle-panel').setAttribute('aria-expanded',String(!collapsed));}
panel();$('toggle-panel').onclick=()=>{document.body.classList.toggle('panel-collapsed');panel();if(session){requestAnimationFrame(()=>{window.edgeEditor.fit();io.saveView(window.edgeEditor.camera);});}};
async function prepareExport(room=''){
 if(!session){message('请先导入户型。',true);return;}show('export-dialog');$('share').disabled=true;$('download').disabled=true;const ticket=++exportTicket;
 try{const latest=await store.load(session.key),value=await exportSurvey(latest.package,latest.batch,room);if(ticket!==exportTicket)return;const stamp=new Date().toLocaleString('sv-SE').replace(/[^0-9]/g,'');const name=latest.package.title+'_手机全屋复测_'+stamp+(room?'_'+room:'')+'.json';const file=new File([JSON.stringify(value,null,2)],name,{type:'application/json'});prepared={file,value};$('export-info').textContent=`${room||'整屋'} · ${value.measurements.filter(e=>e.status==='measured').length} 条本轮复测，${value.measurements.filter(e=>e.status==='pending').length} 条待复测；含原尺寸、修改历史、端点及固定底图。`;$('download').disabled=false;const shareable=navigator.canShare?.({files:[file]});$('share').disabled=!shareable;$('share').textContent=shareable?'系统分享 / 隔空投送':'请下载到“文件”';}catch(e){$('export-info').textContent='导出失败：'+e.message;message(e.message,true);}
}
$('export-options').onclick=()=>void prepareExport();$('export-room').onclick=()=>{const room=$('survey-room-select')?.value||session?.package.measurements.find(e=>e.id===window.edgeEditor?.state.selected)?.room;if(!room){message('请先在右侧选房间或点一条尺寸。',true);return;}void prepareExport(room);};
$('share').onclick=()=>{if(prepared)navigator.share({files:[prepared.file],title:'本轮复测 JSON'}).catch(e=>{if(e.name!=='AbortError')$('export-info').textContent='分享失败：'+e.message+'；可用下载。';});};$('download').onclick=()=>{if(!prepared)return;const url=URL.createObjectURL(prepared.file),a=document.createElement('a');a.href=url;a.download=prepared.file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
async function offline(){if(!('serviceWorker' in navigator)||!isSecureContext){$('cache-state').textContent='请用 Safari HTTPS 入口安装';return;}try{
 await navigator.serviceWorker.register('./sw.js',{scope:'./'});const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('完整缓存尚未成功，请联网重开。')),15000))]);
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('程序尚未接管，请联网重开。')),15000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
 const channel=new MessageChannel();const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('缓存检查超时')),5000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data.ready);};(navigator.serviceWorker.controller||registration.active).postMessage({type:'CACHE_STATUS'},[channel.port2]);});if(!ready)throw Error('程序缓存不完整');$('cache-state').textContent='离线程序已就绪';$('cache-state').dataset.ready='true';
 }catch(e){$('cache-state').textContent='离线准备失败：'+e.message;$('cache-state').dataset.ready='false';}}
Object.defineProperty(window,'surveyApp',{value:{ready:false,get session(){return session;},get camera(){return window.edgeEditor?.camera;},get selected(){return window.edgeEditor?.state.selected;},focus:id=>window.edgeEditor.focus(id,false)}});
try{store=await openStore();const prior=await store.load();if(prior)try{await adopt(prior);}catch(e){message(e.message,true);}$('storage-state').textContent='每条实测自动保存；建议每完成一个房间导出 JSON 备份。';window.surveyApp.ready=true;void offline();}catch(e){message('本机存储不可用：'+e.message+'；请在非隐私浏览模式重开。',true);$('import-empty').disabled=true;}
