// Shared by the browser and read-only Mac receiver. No geometry solver.
export const FORMAT=1;
export function canonical(v){
 if(v===null||typeof v!=='object'){if(typeof v==='number'&&!Number.isFinite(v))throw Error('非有限数值');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof v==='string'?v:canonical(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function seal(v){delete v.integrity;v.integrity={algorithm:'SHA-256',value:await sha(v)};return v;}
const fail=m=>{throw Error(m);};
const isSha=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const eq=(a,b)=>canonical(a)===canonical(b);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const id=s=>typeof s==='string'&&s.length>0&&s.length<500&&!['__proto__','constructor','prototype'].includes(s);
const time=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export async function checkSeal(v){const c=structuredClone(v);delete c.integrity;if(v.integrity?.algorithm!=='SHA-256'||v.integrity?.value!==await sha(c))fail('完整性校验失败，文件可能损坏。');}
export async function validatePackage(p){
 if(p?.type!=='fixed-survey-package'||p.formatVersion!==FORMAT||p.unit!=='mm'||!id(p.packageId)||!id(p.title)||!isSha(p.baseSha)||!isSha(p.source?.sha)||!Number.isInteger(p.source?.revision))fail('户型格式或版本不支持。');
 await checkSeal(p);if(!p.geometry||p.baseSha!==await sha(p.geometry))fail('固定底图SHA不一致。');
 const g=p.geometry;
 if(!Array.isArray(g.nodes)||g.nodes.length<2||g.nodes.length>20000||!Array.isArray(g.entities)||g.entities.length>20000||!Array.isArray(p.measurements)||p.measurements.length>10000||!Array.isArray(p.rooms))fail('户型范围无效。');
 const nodeIds=new Set();for(const n of g.nodes){if(!id(n.id)||!point(n.p)||nodeIds.has(n.id))fail('节点无效或重复。');nodeIds.add(n.id);}
 const entityIds=new Set();for(const e of g.entities){if(!id(e.id)||entityIds.has(e.id)||!['LINE','LWPOLYLINE','CIRCLE','ARC'].includes(e.type)||!Array.isArray(e.nodes)||e.nodes.some(n=>!Number.isInteger(n)||!g.nodes[n])||!id(e.layer))fail('固定图元无效。');entityIds.add(e.id);
  if(e.displayNodes&&e.displayNodes.some(n=>!g.nodes[n]))fail('显示节点失效。');
  if(['CIRCLE','ARC'].includes(e.type)&&(!(e.radius>0)||!Number.isFinite(e.radius)))fail('曲线半径无效。');
  if(e.type==='ARC'&&(!Number.isFinite(e.startAngle)||!Number.isFinite(e.endAngle)))fail('圆弧无效。');
 }
 const seen=new Set();for(const e of p.measurements){if(!id(e.id)||seen.has(e.id)||!id(e.name)||!id(e.room)||typeof e.measurable!=='boolean'||!Array.isArray(e.nodes)||e.nodes.length!==2||e.nodes.some(n=>!g.nodes[n])||!eq(e.endpointIds,e.nodes.map(n=>g.nodes[n].id))||!eq(e.endpoints,e.nodes.map(n=>g.nodes[n].p))||typeof e.semantic!=='string'||typeof e.endpointSemantic!=='string')fail('测量ID或A/B绑定失效：'+e.id);seen.add(e.id);}
 if(p.workbench){const w=p.workbench;if(!eq(w.points,g.nodes.map(n=>n.p))||!eq(w.model?.nodes?.map(n=>n.id),g.nodes.map(n=>n.id)))fail('电脑版显示节点与固定底图不一致。');for(const e of w.model.edges){const m=p.measurements.find(m=>m.id===e.id);if(!m||!eq(e.nodes,m.nodes)||e.semantic!==m.semantic)fail('电脑版数字端点绑定失效：'+e.id);}const shape=e=>Object.fromEntries(Object.entries(e).filter(([k])=>['id','type','layer','nodes','displayNodes','hiddenInWallReference','closed','radius','startAngle','endAngle','bulges'].includes(k)));if(!eq(w.model.entities.map(shape),g.entities))fail('电脑版图元与固定底图不一致。');}
 const markers=p.workbench?.model.surveyMarkers||[],markerIds=new Set();if(!Array.isArray(markers)||markers.length>10000)fail('测量圆圈范围无效。');
 for(const m of p.measurements.filter(m=>m.supersededBy)){const e=p.workbench?.model.edges.find(e=>e.id===m.id),target=p.measurements.find(e=>e.id===m.supersededBy),replacement=p.workbench?.model.edges.find(e=>e.id===m.supersededBy);if(m.kind!=='pipe-location'||m.measurable||m.nodes.some(n=>!g.nodes[n].measurementOnly)||!e?.referenceOnly||e.supersededBy!==m.supersededBy||target?.kind!=='pipe-location'||!target.measurable||replacement?.replaces!==m.id)fail('旧定位线与替代项绑定失效。');}
 for(const m of markers){if(!id(m.id)||markerIds.has(m.id)||m.kind!=='pipe-location'||m.positionBasis!=='user-marked-schematic'||!Number.isInteger(m.node)||!g.nodes[m.node]?.measurementOnly||!(m.symbolRadiusMm>0)||!Number.isFinite(m.symbolRadiusMm)||(m.diameterMm!==null&&(!(m.diameterMm>0)||!Number.isFinite(m.diameterMm)))||!Array.isArray(m.measurementIds)||m.measurementIds.length!==2||new Set(m.measurementIds).size!==2)fail('测量圆圈绑定失效。');markerIds.add(m.id);for(const measureId of m.measurementIds){const e=p.workbench.model.edges.find(e=>e.id===measureId);if(!e||e.markerId!==m.id||e.measurementBinding?.centerNodeId!==g.nodes[m.node].id)fail('测量圆圈与定位线不一致。');}}
 if(p.rooms.some(r=>!id(r.name)||!point(r.p)))fail('房间信息无效。');return p;
}
export function parseValue(text){
 const valueText=String(text).trim();if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(valueText))fail('请输入大于0的毫米数，允许小数。');
 const value=Number(valueText);if(!(value>0)||!Number.isFinite(value)||value>Number.MAX_SAFE_INTEGER)fail('毫米数超出有效范围。');
 return {value,valueText,decimalPlaces:valueText.includes('.')?valueText.split('.')[1].length:0};
}
export function newBatch(p){return {id:crypto.randomUUID(),name:'全屋第二轮复测',packageId:p.packageId,baseSha:p.baseSha,createdAt:new Date().toISOString(),records:{}};}
export function record(p,b,edgeId,text){
 const e=p.measurements.find(e=>e.id===edgeId&&e.measurable);if(!e||b.baseSha!==p.baseSha||b.packageId!==p.packageId)fail('测量项或底图版本不匹配。');
 const next=structuredClone(b),revision={revisionId:crypto.randomUUID(),...parseValue(text),recordedAt:new Date().toISOString()};
 if(!Object.hasOwn(next.records,edgeId))next.records[edgeId]={id:edgeId,endpointIds:e.endpointIds,endpointSemantic:e.endpointSemantic,semantic:e.semantic,revisions:[]};
 const before=selection(b);next.records[edgeId].revisions.push(revision);next.selection={...before,[edgeId]:revision.revisionId};next.undo=[...(b.undo||[]),before];next.redo=[];return next;
}
export function active(b,id){const rows=b.records[id]?.revisions||[];return b.selection!==undefined?rows.find(r=>r.revisionId===b.selection[id])||null:rows.at(-1)||null;}
function selection(b){return Object.fromEntries(Object.keys(b.records).map(id=>[id,active(b,id)?.revisionId||null]));}
export function history(p,b,action){validateBatch(p,b);const next=structuredClone(b),current=selection(b);next.undo||=[];next.redo||=[];if(action==='undo'&&next.undo.length){next.redo.push(current);next.selection=next.undo.pop();}else if(action==='redo'&&next.redo.length){next.undo.push(current);next.selection=next.redo.pop();}else if(action==='reset'){next.undo.push(current);next.selection=Object.fromEntries(Object.keys(b.records).map(id=>[id,null]));next.redo=[];}else if(!['undo','redo'].includes(action))fail('不支持的历史操作。');return next;}
export function validateBatch(p,b){
 if(!id(b?.id)||!id(b?.name)||!time(b.createdAt)||b.packageId!==p.packageId||b.baseSha!==p.baseSha||!b.records||Array.isArray(b.records)||typeof b.records!=='object')fail('复测批次无效。');
 const ids=new Set();for(const [k,r] of Object.entries(b.records)){
  const e=p.measurements.find(e=>e.id===k&&(e.measurable||e.supersededBy));
  if(!e||r.id!==k||!eq(r.endpointIds,e.endpointIds)||r.endpointSemantic!==e.endpointSemantic||r.semantic!==e.semantic||!Array.isArray(r.revisions)||!r.revisions.length||r.revisions.length>10000)fail('本轮记录端点或历史无效：'+k);
  let last=0;for(const rev of r.revisions){const v=parseValue(rev.valueText);if(v.value!==rev.value||v.decimalPlaces!==rev.decimalPlaces||!time(rev.recordedAt)||!id(rev.revisionId)||ids.has(rev.revisionId)||Date.parse(rev.recordedAt)<last)fail('修改历史/数值精度无效：'+k);last=Date.parse(rev.recordedAt);ids.add(rev.revisionId);}
 }
 const checkSelection=map=>{if(!map||typeof map!=='object'||Array.isArray(map))fail('历史选中状态无效。');for(const[k,v]of Object.entries(map)){if(!b.records[k]||(v!==null&&!b.records[k].revisions.some(r=>r.revisionId===v)))fail('历史引用失效。');}};if(b.selection)checkSelection(b.selection);for(const list of [b.undo,b.redo])if(list!==undefined){if(!Array.isArray(list)||list.length>10000)fail('撤销历史无效。');list.forEach(checkSelection);}
 return b;
}
export async function exportSurvey(p,b,room=''){
 validateBatch(p,b);const edges=p.measurements.filter(e=>e.measurable&&(!room||e.room===room));
 if(!edges.length)fail('本区域没有可测项目。');
 const batch=structuredClone(b);if(room){const ids=new Set(edges.map(e=>e.id)),scope=map=>Object.fromEntries(Object.entries(map).filter(([k])=>ids.has(k)));batch.records=scope(batch.records);if(batch.selection)batch.selection=scope(batch.selection);if(batch.undo)batch.undo=batch.undo.map(scope);if(batch.redo)batch.redo=batch.redo.map(scope);}
 return seal({type:'measurement-export',formatVersion:FORMAT,exportedAt:new Date().toISOString(),unit:'mm',packageId:p.packageId,originalVersion:p.source.version,baseSha:p.baseSha,sourceSha:p.source.sha,scope:{type:room?'room':'whole-house',room:room||null},package:p,batch,
  measurements:edges.map(e=>({id:e.id,endpointIds:e.endpointIds,endpoints:e.endpoints,semantic:e.semantic,endpointSemantic:e.endpointSemantic,room:e.room,status:active(batch,e.id)?'measured':'pending',current:active(batch,e.id),history:batch.records[e.id]?.revisions||[]}))});
}
export async function validateExport(v,expected){
 if(v?.type!=='measurement-export'||v.formatVersion!==FORMAT||v.unit!=='mm'||!time(v.exportedAt)||!['whole-house','room'].includes(v.scope?.type))fail('复测JSON格式不支持。');
 await checkSeal(v);await validatePackage(v.package);const p=v.package;
 if(expected&&!eq(p,expected))fail('数据包与Mac端当前固定底图/历史版本不一致。');
 if(v.baseSha!==p.baseSha||v.packageId!==p.packageId||v.sourceSha!==p.source.sha||v.originalVersion!==p.source.version)fail('底图版本不匹配。');
 validateBatch(p,v.batch);const edges=p.measurements.filter(e=>e.measurable&&(v.scope.type==='whole-house'||e.room===v.scope.room));
 if(!edges.length||!Array.isArray(v.measurements)||v.measurements.length!==edges.length)fail('缺少未复测记录，导出不完整。');
 const seen=new Set();for(const r of v.measurements){const e=edges.find(e=>e.id===r.id);if(!e||seen.has(r.id)||!eq(r.endpointIds,e.endpointIds)||!eq(r.endpoints,e.endpoints)||r.semantic!==e.semantic||r.endpointSemantic!==e.endpointSemantic||r.room!==e.room||!eq(r.current,active(v.batch,e.id))||!eq(r.history,v.batch.records[e.id]?.revisions||[])||r.status!==(active(v.batch,e.id)?'measured':'pending'))fail('导出端点/记录不完整：'+r.id);seen.add(r.id);}
 if(Object.keys(v.batch.records).some(k=>!seen.has(k)&&!(v.scope.type==='whole-house'&&p.measurements.some(e=>e.id===k&&e.supersededBy))))fail('导出批次含范围外记录。');return v;
}
export function screen(p,c,w,h){return [w/2+(p[0]-c.x)*c.scale,h/2-(p[1]-c.y)*c.scale];}
export function world(p,c,w,h){return [c.x+(p[0]-w/2)/c.scale,c.y-(p[1]-h/2)/c.scale];}
export function pinch(c,before,after,w,h){const distance=a=>Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]),mid=a=>[(a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2];
 const oldMid=mid(before),newMid=mid(after),anchor=world(oldMid,c,w,h),scale=Math.max(.002,Math.min(10,c.scale*distance(after)/Math.max(1,distance(before))));
 return {x:anchor[0]-(newMid[0]-w/2)/scale,y:anchor[1]+(newMid[1]-h/2)/scale,scale};
}
export function hitEdges(p,c,pos,w,h){
 return p.measurements.filter(e=>e.measurable).map(e=>{const [a,b]=e.endpoints.map(q=>screen(q,c,w,h)),v=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,((pos[0]-a[0])*v[0]+(pos[1]-a[1])*v[1])/(v[0]**2+v[1]**2||1)));return {edge:e,distance:Math.hypot(pos[0]-a[0]-t*v[0],pos[1]-a[1]-t*v[1])};}).filter(x=>x.distance<=14).sort((a,b)=>a.distance-b.distance);
}
