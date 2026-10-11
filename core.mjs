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
 next.records[edgeId].revisions.push(revision);return next;
}
export function active(b,id){return b.records[id]?.revisions.at(-1)||null;}
export function validateBatch(p,b){
 if(!id(b?.id)||!id(b?.name)||!time(b.createdAt)||b.packageId!==p.packageId||b.baseSha!==p.baseSha||!b.records||Array.isArray(b.records)||typeof b.records!=='object')fail('复测批次无效。');
 const ids=new Set();for(const [k,r] of Object.entries(b.records)){
  const e=p.measurements.find(e=>e.id===k&&e.measurable);
  if(!e||r.id!==k||!eq(r.endpointIds,e.endpointIds)||r.endpointSemantic!==e.endpointSemantic||r.semantic!==e.semantic||!Array.isArray(r.revisions)||!r.revisions.length||r.revisions.length>10000)fail('本轮记录端点或历史无效：'+k);
  let last=0;for(const rev of r.revisions){const v=parseValue(rev.valueText);if(v.value!==rev.value||v.decimalPlaces!==rev.decimalPlaces||!time(rev.recordedAt)||!id(rev.revisionId)||ids.has(rev.revisionId)||Date.parse(rev.recordedAt)<last)fail('修改历史/数值精度无效：'+k);last=Date.parse(rev.recordedAt);ids.add(rev.revisionId);}
 }return b;
}
export async function exportSurvey(p,b,room=''){
 validateBatch(p,b);const edges=p.measurements.filter(e=>e.measurable&&(!room||e.room===room));
 if(!edges.length)fail('本区域没有可测项目。');
 const batch=room?{...b,records:Object.fromEntries(Object.entries(b.records).filter(([k])=>edges.some(e=>e.id===k)))}:structuredClone(b);
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
 if(Object.keys(v.batch.records).some(k=>!seen.has(k)))fail('导出批次含范围外记录。');return v;
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
