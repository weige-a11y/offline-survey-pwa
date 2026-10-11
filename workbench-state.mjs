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
 for(const e of p.measurements){const r=active(session.batch,e.id);if(!r||!e.measurable)continue;count++;ledger.active[e.id]={...r,id:e.id,status:'synced',source:'手机本轮复测',_mobile:true};}
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
// Existing facts stay identical. A replaced survey binding remains as read-only history.
export function additivePackage(a,b){
 if(!a.workbench||!b.workbench||b.geometry.nodes.length<=a.geometry.nodes.length||b.measurements.length<=a.measurements.length)return false;
 const nodes=b.geometry.nodes.slice(a.geometry.nodes.length),measurements=b.measurements.slice(a.measurements.length);
 if(nodes.some(n=>!n.measurementOnly)||measurements.some(e=>e.kind!=='pipe-location'||(!e.measurable&&!e.supersededBy)||e.historical||e.nodes.some(n=>n<a.geometry.nodes.length)))return false;
 const before=a.workbench.model.surveyMarkers||[],markers=b.workbench.model.surveyMarkers||[];
 if(markers.length<before.length||markers.slice(before.length).some(m=>m.kind!=='pipe-location'||m.positionBasis!=='user-marked-schematic'||m.node<a.geometry.nodes.length))return false;
 const clean=p=>{const c=structuredClone(p);delete c.integrity;delete c.upgrade;delete c.packageId;delete c.baseSha;return c;},old=clean(a),next=clean(b);
 for(let i=0;i<a.measurements.length;i++){
  const prior=a.measurements[i],m=next.measurements[i];if(!m||m.id!==prior.id)return false;
  if(m.supersededBy&&!prior.supersededBy){
   const e=next.workbench.model.edges.find(e=>e.id===m.id),target=next.measurements.find(e=>e.id===m.supersededBy),replacement=next.workbench.model.edges.find(e=>e.id===m.supersededBy);
   if(prior.kind!=='pipe-location'||!prior.measurable||m.measurable||!e?.referenceOnly||e.supersededBy!==m.supersededBy||!target?.measurable||target.kind!=='pipe-location'||replacement?.replaces!==m.id||target.nodes.some(n=>n<a.geometry.nodes.length)||prior.nodes.some(n=>!a.geometry.nodes[n]?.measurementOnly))return false;
   delete m.supersededBy;m.measurable=prior.measurable;m.excludedReason=prior.excludedReason;delete e.supersededBy;delete e.referenceOnly;
  }
 }
 for(let i=0;i<before.length;i++){
  const prior=before[i],m=next.workbench.model.surveyMarkers[i];if(!m||m.id!==prior.id)return false;
  if(canonical(m.measurementIds)!==canonical(prior.measurementIds)){
   if(m.measurementIds.some((id,k)=>b.measurements.find(e=>e.id===prior.measurementIds[k])?.supersededBy!==id))return false;
   m.measurementIds=prior.measurementIds.slice();
  }
 }
 next.geometry.nodes=next.geometry.nodes.slice(0,a.geometry.nodes.length);
 next.measurements=next.measurements.slice(0,a.measurements.length);
 next.workbench.model.nodes=next.workbench.model.nodes.slice(0,a.workbench.model.nodes.length);
 next.workbench.model.edges=next.workbench.model.edges.slice(0,a.workbench.model.edges.length);
 next.workbench.points=next.workbench.points.slice(0,a.workbench.points.length);
 if(a.workbench.model.surveyMarkers)next.workbench.model.surveyMarkers=next.workbench.model.surveyMarkers.slice(0,before.length);else delete next.workbench.model.surveyMarkers;
 return canonical(old)===canonical(next);
}
export function upgradeSession(prior,p){
 const a=prior.package,from=[p.upgrade?.from,...(p.upgrade?.ancestors||[])].find(f=>f?.packageId===a.packageId&&f.baseSha===a.baseSha&&f.integrity===a.integrity.value);
 if(!from||!additivePackage(a,p))throw Error('新增测量包与本机原户型不一致，原记录未覆盖；请先导出本机 JSON。');
 return {...prior,package:p,batch:{...prior.batch,packageId:p.packageId,baseSha:p.baseSha}};
}
