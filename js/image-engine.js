(function(){
  const images={},originals={};
  function loadImage(file,canvas){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const original=document.createElement('canvas');original.width=canvas.width;original.height=canvas.height;original.getContext('2d').drawImage(canvas,0,0);originals[canvas.id]=original;images[canvas.id]={url,fileName:file.name,width:canvas.width,height:canvas.height};URL.revokeObjectURL(url);resolve(images[canvas.id])};img.onerror=reject;img.src=url})}
  function restore(canvas){const original=originals[canvas.id];if(!original)return false;canvas.width=original.width;canvas.height=original.height;canvas.getContext('2d').drawImage(original,0,0);return true}
  function median(a){a.sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
  function hex(r,g,b){return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase()}
  function sample(canvas,x,y,r=7){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;
    if(!w||!h)throw Error('No image loaded');
    x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));
    const x0=Math.max(0,Math.floor(x-r)),y0=Math.max(0,Math.floor(y-r)),x1=Math.min(w,Math.ceil(x+r+1)),y1=Math.min(h,Math.ceil(y+r+1));
    const d=ctx.getImageData(x0,y0,x1-x0,y1-y0).data,R=[],G=[],B=[];
    for(let i=0;i<d.length;i+=4){if(d[i+3]<200)continue;R.push(d[i]);G.push(d[i+1]);B.push(d[i+2])}
    if(!R.length)throw Error('No usable pixels in pad sample');
    const rr=median(R),gg=median(G),bb=median(B);
    return {r:Math.round(rr),g:Math.round(gg),b:Math.round(bb),hex:hex(rr,gg,bb),sampleCount:R.length,method:'median-pixel-sample'};
  }
  // Multi-region sampling: take five small patches from the central pad area,
  // calculate a median RGB per patch, then combine the patch medians. This
  // reduces sensitivity to local glare, shadows and uneven reagent wetting.
  function samplePad(canvas,point){
    const w=canvas.width,h=canvas.height;
    const pw=Math.max(8,Number(point.width)||14),ph=Math.max(8,Number(point.height)||14);
    const cx=Number(point.x),cy=Number(point.y);
    const patchW=Math.max(3,Math.floor(pw*.16)),patchH=Math.max(3,Math.floor(ph*.16));
    const offsets=[[0,0],[-.20,-.20],[.20,-.20],[-.20,.20],[.20,.20]];
    const regions=[];
    for(const [ox,oy] of offsets){
      const x0=Math.max(0,Math.floor(cx+ox*pw-patchW)),y0=Math.max(0,Math.floor(cy+oy*ph-patchH));
      const x1=Math.min(w,Math.ceil(cx+ox*pw+patchW+1)),y1=Math.min(h,Math.ceil(cy+oy*ph+patchH+1));
      if(x1<=x0||y1<=y0)continue;
      const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,x1-x0,y1-y0).data;
      const R=[],G=[],B=[];
      for(let i=0;i<d.length;i+=4){
        if(d[i+3]<200)continue;
        const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
        if(lum<8)continue;
        R.push(d[i]);G.push(d[i+1]);B.push(d[i+2]);
      }
      if(R.length)regions.push({r:median(R),g:median(G),b:median(B),pixels:R.length});
    }
    if(!regions.length)throw Error('No usable pixels in detected pad regions');
    const r=median(regions.map(x=>x.r)),g=median(regions.map(x=>x.g)),b=median(regions.map(x=>x.b));
    const spreads={r:+(Math.max(...regions.map(x=>x.r))-Math.min(...regions.map(x=>x.r))).toFixed(1),g:+(Math.max(...regions.map(x=>x.g))-Math.min(...regions.map(x=>x.g))).toFixed(1),b:+(Math.max(...regions.map(x=>x.b))-Math.min(...regions.map(x=>x.b))).toFixed(1)};
    return {r:Math.round(r),g:Math.round(g),b:Math.round(b),hex:hex(r,g,b),sampleCount:regions.reduce((n,x)=>n+x.pixels,0),regionCount:regions.length,regionSamples:regions.map(x=>({r:Math.round(x.r),g:Math.round(x.g),b:Math.round(x.b),pixels:x.pixels})),channelSpread:spreads,method:'five-region median-of-medians'};
  }
  // Exact-file fingerprint only. Perceptual whole-scene hashes are deliberately
  // not used to reject replicates because a shared background can dominate them.
  async function hashFile(file){
    const buffer=await file.arrayBuffer();
    if(window.crypto&&crypto.subtle){
      try{
        const digest=await crypto.subtle.digest('SHA-256',buffer);
        return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      }catch(_){ /* use deterministic local fallback below */ }
    }
    // Local fallback for older/non-secure browser contexts. Exact-byte checksum,
    // not a cryptographic identity guarantee; used only as a duplicate warning.
    const bytes=new Uint8Array(buffer);let h1=0x811c9dc5,h2=0x01000193;
    for(let i=0;i<bytes.length;i++){h1^=bytes[i];h1=Math.imul(h1,0x01000193);h2=(Math.imul(h2^bytes[i],0x85ebca6b))>>>0;}
    return 'fallback-'+(h1>>>0).toString(16)+'-'+h2.toString(16)+'-'+bytes.length;
  }
  function quality(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;if(!w||!h)return {score:0,label:'No image'};const data=ctx.getImageData(0,0,w,h).data;let sum=0,sum2=0,n=0;for(let i=0;i<data.length;i+=Math.max(4,Math.floor(data.length/5000/4)*4)){const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=l;sum2+=l*l;n++}const mean=sum/n,sd=Math.sqrt(Math.max(0,sum2/n-mean*mean));let warnings=[];if(mean<55)warnings.push('Image may be too dark');if(mean>225)warnings.push('Image may be overexposed');if(sd<22)warnings.push('Low contrast / possible blur');return {mean:Math.round(mean),contrast:Math.round(sd),warnings,label:warnings.length?'Review image':'Basic checks passed'}}
  window.ImageEngine={images,loadImage,restore,sample,samplePad,quality,hashFile};
})();