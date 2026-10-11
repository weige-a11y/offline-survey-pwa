const DB='offline-survey-v1';
export async function openStore(){
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{for(const name of ['sessions','meta','views'])req.result.createObjectStore(name);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('本地数据库被另一页面占用，请关闭旧页面后重开。'));});
 db.onversionchange=()=>db.close();
 const tx=(names,mode,fn)=>new Promise((resolve,reject)=>{const t=db.transaction(names,mode);let result,error;t.oncomplete=()=>resolve(result);t.onabort=()=>reject(error||t.error||Error('本地保存被中断。'));t.onerror=()=>{};fn(t,v=>result=v,e=>{error=e;t.abort();});});
 return {
  async load(key){return tx(['sessions','meta'],'readonly',(t,done)=>{if(key){const r=t.objectStore('sessions').get(key);r.onsuccess=()=>done(r.result||null);}else {const r=t.objectStore('meta').get('active');r.onsuccess=()=>{if(!r.result){done(null);return;}const v=t.objectStore('sessions').get(r.result);v.onsuccess=()=>done(v.result||null);};}});},
  async loadPackage(packageId){return tx(['sessions','meta'],'readonly',(t,done)=>{const r=t.objectStore('meta').get('package:'+packageId);r.onsuccess=()=>{if(!r.result){done(null);return;}const v=t.objectStore('sessions').get(r.result);v.onsuccess=()=>done(v.result||null);};});},
  async save(session,expectedVersion){return tx(['sessions','meta'],'readwrite',(t,done,abort)=>{const store=t.objectStore('sessions'),r=store.get(session.key);r.onsuccess=()=>{if((r.result?.version||0)!==expectedVersion){abort(Error('另一页面已保存新数据；请重新打开工具后继续，本次没有覆盖。'));return;}const next={...session,version:expectedVersion+1};store.put(next,session.key);t.objectStore('meta').put(session.key,'active');t.objectStore('meta').put(session.key,'package:'+session.package.packageId);done(next);};});},
  async view(key,v){return tx(['views'],'readwrite',(t,done)=>{t.objectStore('views').put(v,key);done(true);});},
  async loadView(key){return tx(['views'],'readonly',(t,done)=>{const r=t.objectStore('views').get(key);r.onsuccess=()=>done(r.result||null);});}
 };
}
