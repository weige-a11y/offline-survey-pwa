                
                                                                                                                                            
export function inside(p  ,poly    ){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function crossesBox(a  ,b  ,r         ){
 // Liang-Barsky clipping: a label must not cover a structural line.
 let lo=0,hi=1;const d=[b[0]-a[0],b[1]-a[1]];
 for(let k=0;k<2;k++){if(Math.abs(d[k])<1e-9){if(a[k]<r[k]||a[k]>r[k]+r[k+2])return false;}else{let x=(r[k]-a[k])/d[k],y=(r[k]+r[k+2]-a[k])/d[k];if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}}return true;
}
export function placeLabel(a  ,b  ,w       ,h       ,o        ){
 const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],L=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/L,(b[1]-a[1])/L];let n=[-u[1],u[0]];
 const solid=(p  )=>o.regions.some(poly=>inside(p,poly.outer)&&!poly.holes.some(hole=>inside(p,hole)));
 const plus=solid(mid.map((v,k)=>v+n[k]*o.probe)),minus=solid(mid.map((v,k)=>v-n[k]*o.probe));
 if(plus&&!minus)n=n.map(v=>-v);
 // When neither side is wall solid (sill/low wall), prefer the less obstructed side.
 const normals=plus!==minus&&!o.bothSides?[n]:[n,n.map(v=>-v)];
 const free=(r         )=>r[0]>1&&r[1]>1&&r[0]+w<o.width-1&&r[1]+h<o.height-1&&!o.boxes.some(s=>r[0]<s[0]+s[2]+3&&r[0]+w+3>s[0]&&r[1]<s[1]+s[3]+3&&r[1]+h+3>s[1])&&![[0,0],[w,0],[0,h],[w,h],[w/2,h/2]].some(p=>solid([r[0]+p[0],r[1]+p[1]]))&&!o.segments.some(([p,q])=>crossesBox(p,q,r));
 let box                   ;let bestScore=Infinity;
 const intersects=(q  ,[c,d]    )=>{const v=[q[0]-mid[0],q[1]-mid[1]],z=[d[0]-c[0],d[1]-c[1]],cross=(a  ,b  )=>a[0]*b[1]-a[1]*b[0],det=cross(v,z);if(Math.abs(det)<1e-8)return false;const r=[c[0]-mid[0],c[1]-mid[1]],t=cross(r,z)/det,k=cross(r,v)/det;return t>.001&&t<1&&k>=0&&k<=1;};
 for(let ring=0;ring<30;ring++){
  for(const normal of normals){const d=Math.abs(normal[0])*w/2+Math.abs(normal[1])*h/2+9+ring*10;
   for(const t of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6]){const offset=t*22;const r=[mid[0]+normal[0]*d+u[0]*offset-w/2,mid[1]+normal[1]*d+u[1]*offset-h/2,w,h];if(!free(r))continue;
    const center=[r[0]+w/2,r[1]+h/2];const crossings=o.segments.filter(seg=>intersects(center,seg)).length;
    const score=Math.hypot(d,offset)+crossings*250+o.boxes.filter(box=>crossesBox(mid,center,box)).length*250;
    if(score<bestScore){box=r;bestScore=score;}
   }
  }
  if(box&&bestScore<9+ring*10)break;
 }
 // No valid room for the label in this viewport: omit it until zoom/pan instead of placing it in a wall.
 if(!box)return {mid,box:null};
 const cx=box[0]+w/2,cy=box[1]+h/2,dx=mid[0]-cx,dy=mid[1]-cy;
 const t=Math.min(w/2/Math.max(Math.abs(dx),1e-9),h/2/Math.max(Math.abs(dy),1e-9));
 return {mid,box,end:[cx+dx*t,cy+dy*t]};
}
