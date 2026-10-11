import {active,canonical} from './core.mjs';
// Original desktop data is a read-only layer. Only the new batch can override its display.
export function projectState(session){
 const p=session.package,w=p.workbench;if(!w)throw Error('此户型包缺少电脑版工作台信息，请在 Mac 重新生成并导入；原复测记录保留。');
 const ledger=structuredClone(w.ledger);let count=0;
 for(const e of p.measurements){const r=active(session.batch,e.id);if(!r)continue;count++;ledger.active[e.id]={...r,id:e.id,status:'synced',source:'手机本轮复测',_mobile:true};}
 ledger.pastCount=session.batch.undo?.length||0;ledger.futureCount=session.batch.redo?.length||0;ledger.generation=session.batch.id;
 return {model:w.model,points:w.points,ledger,historicalReadings:w.historicalReadings,geometryMode:'record-only',sourceHash:p.source.sha,revision:session.version,progress:{recorded:count},mobileCount:count};
}
// The new private pack may add the desktop view to an existing phone session. Its base,
// source, originals and all other fields must remain identical.
export function compatiblePackages(a,b){const clean=p=>{const c=structuredClone(p);delete c.integrity;delete c.workbench;return c;};return canonical(clean(a))===canonical(clean(b))&&(!a.workbench||!b.workbench||canonical(a.workbench)===canonical(b.workbench));}
export function extendsHistory(local,incoming){
 if(local.id!==incoming.id)return false;
 return Object.entries(local.records).every(([id,r])=>{const rows=incoming.records[id]?.revisions||[];return rows.length>=r.revisions.length&&canonical(rows.slice(0,r.revisions.length))===canonical(r.revisions);});
}
