import {active,canonical} from './core.mjs';
// Completion is a read-only view; original confirmations never create batch records.
export function originalConfirmed(p,id){
 const m=p.measurements.find(e=>e.id===id),e=p.workbench?.model.edges.find(e=>e.id===id),r=p.workbench?.ledger.active[id];
 const accepted=s=>['synced','confirmed'].includes(s);
 return !!(m?.measurable&&e&&!e.displayUnlocked&&r&&r.locked!==false&&Number.isFinite(r.value)&&r.value>0&&accepted(r.status)&&(!r.displayState||accepted(r.displayState))&&canonical(r.endpointIds)===canonical(m.endpointIds));
}
export function isConfirmed(session,id){
 const p=session.package,e=p.workbench?.model.edges.find(e=>e.id===id);
 return !!(p.measurements.some(e=>e.id===id&&e.measurable)&&e&&!e.displayUnlocked&&(active(session.batch,id)||originalConfirmed(p,id)));
}
export function completionCounts(session){
 let original=0,added=0,pending=0;
 for(const e of session.package.measurements.filter(e=>e.measurable)){
  if(originalConfirmed(session.package,e.id))original++;
  else if(isConfirmed(session,e.id))added++;
  else pending++;
 }
 return {originalConfirmed:original,currentAdded:added,pending,total:original+added+pending};
}
// Original desktop data is a read-only layer. Only the new batch can override its values.
export function projectState(session){
 const p=session.package,w=p.workbench;if(!w)throw Error('此户型包缺少电脑版工作台信息，请在 Mac 重新生成并导入；原复测记录保留。');
 const ledger=structuredClone(w.ledger);let count=0;
 for(const e of p.measurements){const r=active(session.batch,e.id);if(!r)continue;count++;ledger.active[e.id]={...r,id:e.id,status:'synced',source:'手机本轮复测',_mobile:true};}
 ledger.pastCount=session.batch.undo?.length||0;ledger.futureCount=session.batch.redo?.length||0;ledger.generation=session.batch.id;
 return {model:w.model,points:w.points,ledger,historicalReadings:w.historicalReadings,geometryMode:'record-only',sourceHash:p.source.sha,revision:session.version,progress:{recorded:count},mobileCount:count,completion:completionCounts(session)};
}
// The new private pack may add the desktop view to an existing phone session. Its base,
// source, originals and all other fields must remain identical.
export function compatiblePackages(a,b){const clean=p=>{const c=structuredClone(p);delete c.integrity;delete c.workbench;return c;};return canonical(clean(a))===canonical(clean(b))&&(!a.workbench||!b.workbench||canonical(a.workbench)===canonical(b.workbench));}
export function extendsHistory(local,incoming){
 if(local.id!==incoming.id)return false;
 return Object.entries(local.records).every(([id,r])=>{const rows=incoming.records[id]?.revisions||[];return rows.length>=r.revisions.length&&canonical(rows.slice(0,r.revisions.length))===canonical(r.revisions);});
}
