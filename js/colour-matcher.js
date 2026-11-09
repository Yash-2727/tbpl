/* TBPL v1.4 colour matching
   sRGB (D65/2°) -> CIELAB -> CIEDE2000.
   ΔE00 ranks chart swatches; it is a perceptual colour distance, not analytical accuracy. */
(function(){
  function rgb(hex){
    const s=String(hex||'').replace('#','').trim();
    if(!/^[0-9a-f]{6}$/i.test(s)) throw new Error('Invalid reference HEX colour: '+hex);
    return {r:parseInt(s.slice(0,2),16),g:parseInt(s.slice(2,4),16),b:parseInt(s.slice(4,6),16)};
  }
  const linear=v=>(v/=255)<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
  function rgbToLab(c){
    const r=linear(c.r),g=linear(c.g),b=linear(c.b);
    const x=(.4124564*r+.3575761*g+.1804375*b)/.95047;
    const y=.2126729*r+.7151522*g+.072175*b;
    const z=(.0193339*r+.119192*g+.9503041*b)/1.08883;
    const f=t=>t>.008856451679?Math.cbrt(t):7.787037037*t+16/116;
    const fx=f(x),fy=f(y),fz=f(z);
    return {L:116*fy-16,a:500*(fx-fy),b:200*(fy-fz)};
  }
  function deltaE2000(p,q){
    const rad=Math.PI/180,deg=180/Math.PI;
    const C1=Math.hypot(p.a,p.b),C2=Math.hypot(q.a,q.b),Cbar=(C1+C2)/2;
    const G=.5*(1-Math.sqrt(Math.pow(Cbar,7)/(Math.pow(Cbar,7)+Math.pow(25,7))));
    const a1=(1+G)*p.a,a2=(1+G)*q.a,C1p=Math.hypot(a1,p.b),C2p=Math.hypot(a2,q.b);
    const hue=(a,b)=>{if(a===0&&b===0)return 0;let h=Math.atan2(b,a)*deg;return h<0?h+360:h};
    const h1=hue(a1,p.b),h2=hue(a2,q.b),dL=q.L-p.L,dC=C2p-C1p;
    let dh=0;
    if(C1p*C2p!==0){if(Math.abs(h2-h1)<=180)dh=h2-h1;else if(h2<=h1)dh=h2-h1+360;else dh=h2-h1-360}
    const dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh*rad/2),Lb=(p.L+q.L)/2,CbarP=(C1p+C2p)/2;
    let hb;
    if(C1p*C2p===0)hb=h1+h2;else if(Math.abs(h1-h2)<=180)hb=(h1+h2)/2;else if(h1+h2<360)hb=(h1+h2+360)/2;else hb=(h1+h2-360)/2;
    const T=1-.17*Math.cos((hb-30)*rad)+.24*Math.cos(2*hb*rad)+.32*Math.cos((3*hb+6)*rad)-.20*Math.cos((4*hb-63)*rad);
    const dTheta=30*Math.exp(-Math.pow((hb-275)/25,2)),Rc=2*Math.sqrt(Math.pow(CbarP,7)/(Math.pow(CbarP,7)+Math.pow(25,7)));
    const Sl=1+.015*Math.pow(Lb-50,2)/Math.sqrt(20+Math.pow(Lb-50,2)),Sc=1+.045*CbarP,Sh=1+.015*CbarP*T;
    const Rt=-Math.sin(2*dTheta*rad)*Rc,x=dL/Sl,y=dC/Sc,z=dH/Sh;
    return Math.sqrt(Math.max(0,x*x+y*y+z*z+Rt*y*z));
  }
  function rgbDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)}
  function matchAll(colour,param){
    if(!colour||!param||!Array.isArray(param.levels)||!param.levels.length)throw new Error('A pad colour and chart levels are required.');
    const measured=rgbToLab(colour);
    const ranked=param.levels.map((level,index)=>{
      const ref=rgb(level[1]),lab=rgbToLab(ref),dE=deltaE2000(measured,lab),dRGB=rgbDistance(colour,ref);
      return {value:String(level[0]),hex:String(level[1]).toUpperCase(),deltaE2000:+dE.toFixed(3),distance:+dE.toFixed(3),rgbDistance:+dRGB.toFixed(2),method:'CIEDE2000',lab,referenceLab:lab,index};
    }).sort((a,b)=>a.deltaE2000-b.deltaE2000);
    return ranked.map((item,i)=>({...item,rank:i+1,deltaToNext:i<ranked.length-1?+(ranked[i+1].deltaE2000-item.deltaE2000).toFixed(3):null}));
  }
  function assessMatch(best,second){
    if(!second)return {status:'insufficient-reference-levels',label:'Insufficient chart levels',review:true,reason:'Only one reference level is available.'};
    const gap=+(second.deltaE2000-best.deltaE2000).toFixed(3);
    // Provisional ranking ambiguity flag only. It is not a validated accuracy
    // threshold and must be tuned using instrument-verified samples.
    if(gap<1)return {status:'ambiguous',label:'Ambiguous match — review',review:true,reason:'The two closest chart colours have very similar ΔE00 scores.'};
    return {status:'ranked-match',label:'Closest chart match',review:false,reason:'The closest chart level ranks ahead of the second-best level; analytical accuracy is not established.'};
  }
  function match(colour,param){
    const ranked=matchAll(colour,param),best=ranked[0],second=ranked[1]||null;
    const assessment=assessMatch(best,second);
    return {...best,topMatches:ranked.slice(0,3),secondBest:second?{value:second.value,deltaE2000:second.deltaE2000,hex:second.hex}:null,matchGap:second?+(second.deltaE2000-best.deltaE2000).toFixed(3):null,assessment,lab:rgbToLab(colour)};
  }
  window.ColourMatcher={match,matchAll,rgbDistance,rgbToLab,deltaE2000};
})();