/*
 * TBPL Aquarium 7-in-1 image verification and adaptive pad detector.
 * v1.4.5: isolates chromatic reagent pads from low-level background texture.
 * This is a browser-side CV heuristic, not a trained semantic classifier.
 */
(function(){
  function hsv(r,g,b){
    r/=255;g/=255;b/=255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
    return {s:mx?d/mx:0,v:mx};
  }

  // Detect distinctly coloured reagent-pad regions. Earlier versions included
  // nearly every pixel with a 4-level RGB channel spread; paper texture and
  // shadows then connected pads to the strip/background into one huge blob.
  function components(data,w,h){
    const n=w*h,mask=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n),out=[];
    for(let i=0;i<n;i++){
      const k=i*4,z=hsv(data[k],data[k+1],data[k+2]);
      // Adaptive chroma gate: exclude neutral paper and low-level sensor noise.
      // Pale pads are handled by the manual marking fallback if not separable.
      if(z.s>=.075 && z.v>.12 && z.v<.995) mask[i]=1;
    }
    for(let start=0;start<n;start++){
      if(!mask[start]||seen[start])continue;
      let head=0,tail=0,minX=w,minY=h,maxX=0,maxY=0,area=0;
      queue[tail++]=start;seen[start]=1;
      while(head<tail){
        const q=queue[head++],x=q%w,y=(q/w)|0;area++;
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const xx=x+dx,yy=y+dy;
          if(xx<0||yy<0||xx>=w||yy>=h)continue;
          const at=yy*w+xx;
          if(mask[at]&&!seen[at]){seen[at]=1;queue[tail++]=at;}
        }
      }
      const bw=maxX-minX+1,bh=maxY-minY+1,ratio=bw/bh;
      // Pads are approximately square; reject long background lines and specks.
      if(area>=24&&bw>=7&&bh>=7&&bw<=170&&bh<=170&&ratio>=.35&&ratio<=2.85){
        out.push({x:minX,y:minY,w:bw,h:bh,cx:(minX+maxX)/2,cy:(minY+maxY)/2,area});
      }
    }
    if(out.length>400)out.sort((a,b)=>b.area-a.area).length=400;
    return out;
  }

  function dedupeAlong(group,along,cross,sizeKey){
    const sorted=group.slice().sort((a,b)=>a[along]-b[along]),out=[];
    for(const p of sorted){
      const last=out[out.length-1];
      if(last && Math.abs(p[along]-last[along])<Math.max(8,Math.min(p[sizeKey],last[sizeKey])*.58)
        && Math.abs(p[cross]-last[cross])<Math.max(12,Math.min(p[sizeKey],last[sizeKey])*.8)){
        if(p.area>last.area)out[out.length-1]=p;
      } else out.push(p);
    }
    return out;
  }

  function bestSequence(comps,axis){
    const cross=axis==='vertical'?'cx':'cy',along=axis==='vertical'?'cy':'cx';
    const cw=axis==='vertical'?'w':'h',ch=axis==='vertical'?'h':'w';
    let best=null;
    for(const anchor of comps){
      let group=comps.filter(p=>
        Math.abs(p[cross]-anchor[cross])<Math.max(14,anchor[cw]*1.25) &&
        p[cw]/Math.max(1,anchor[cw])>=.38 && p[cw]/Math.max(1,anchor[cw])<=2.6 &&
        p[ch]/Math.max(1,anchor[ch])>=.38 && p[ch]/Math.max(1,anchor[ch])<=2.6
      );
      if(group.length<7)continue;
      group=dedupeAlong(group,along,cross,cw);
      if(group.length<7)continue;
      const medSize=group.map(p=>p[cw]).sort((a,b)=>a-b)[Math.floor(group.length/2)];
      group=group.filter(p=>p[cw]>=medSize*.55&&p[cw]<=medSize*1.75);
      if(group.length<7)continue;
      for(let start=0;start<=group.length-7;start++){
        const seven=group.slice(start,start+7),gaps=[];
        for(let i=1;i<7;i++)gaps.push(seven[i][along]-seven[i-1][along]);
        if(gaps.some(g=>g<=0))continue;
        const gm=gaps.reduce((a,b)=>a+b,0)/6;
        const gapCV=Math.sqrt(gaps.reduce((a,b)=>a+(b-gm)**2,0)/6)/Math.max(1,gm);
        const sizes=seven.map(p=>p[cw]),sm=sizes.reduce((a,b)=>a+b,0)/7;
        const sizeCV=Math.sqrt(sizes.reduce((a,b)=>a+(b-sm)**2,0)/7)/Math.max(1,sm);
        const crossSpread=Math.max(...seven.map(p=>p[cross]))-Math.min(...seven.map(p=>p[cross]));
        const alignmentRatio=crossSpread/Math.max(1,medSize);
        const span=seven[6][along]-seven[0][along],lengthRatio=span/Math.max(1,medSize);
        const regularityOK=gapCV<=.72&&sizeCV<=.68&&alignmentRatio<=1.35&&lengthRatio>=4.2;
        const score=Math.max(0,Math.min(99,Math.round(100-gapCV*28-sizeCV*20-alignmentRatio*18+Math.min(8,(lengthRatio-4.2)*1.2))));
        if(!best||score>best.score)best={points:seven,axis,score,gapCV,sizeCV,alignmentRatio,lengthRatio,regularityOK,detectedCount:group.length};
      }
    }
    return best;
  }

  function analysePixels(source){
    const max=1000,scale=Math.min(1,max/Math.max(source.width,source.height));
    const w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
    const temp=document.createElement('canvas');temp.width=w;temp.height=h;
    const ctx=temp.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data,n=w*h,gray=new Float32Array(n);
    let sum=0,sum2=0;
    for(let i=0;i<n;i++){const k=i*4,l=.299*data[k]+.587*data[k+1]+.114*data[k+2];gray[i]=l;sum+=l;sum2+=l*l;}
    const mean=sum/n,contrast=Math.sqrt(Math.max(0,sum2/n-mean*mean));
    let lap=0,lap2=0,count=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x,v=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-w]-gray[i+w];lap+=v;lap2+=v*v;count++;
    }
    const focus=count?Math.max(0,lap2/count-(lap/count)**2):0;
    const comps=components(data,w,h);
    const vertical=bestSequence(comps,'vertical'),horizontal=bestSequence(comps,'horizontal');
    const seq=[vertical,horizontal].filter(Boolean).sort((a,b)=>b.score-a.score)[0]||null;
    return {w,h,scale,mean,contrast,focus,components:comps,sequence:seq};
  }

  function inspect(source){
    if(!source||!source.width||!source.height){
      const v={accepted:false,identity:'not-detected',score:0,blockers:['No image loaded.'],warnings:[]};
      return {verification:v,detection:{accepted:false,points:[],reason:'No image loaded.'}};
    }
    const a=analysePixels(source),s=a.sequence;
    const qualityOK=a.focus>=6&&a.mean>=28&&a.mean<=248;
    const points=s?s.points.map((p,i)=>({
      pad:i+1,x:p.cx/a.scale,y:p.cy/a.scale,width:p.w/a.scale,height:p.h/a.scale,
      box:{x:p.x/a.scale,y:p.y/a.scale,width:p.w/a.scale,height:p.h/a.scale}
    })):[];
    const detectionAccepted=!!(s&&s.regularityOK&&qualityOK&&points.length===7);
    const detection={
      accepted:detectionAccepted,points,axis:s?s.axis:null,confidence:s?s.score:0,
      gapCV:s?+s.gapCV.toFixed(3):null,sizeCV:s?+s.sizeCV.toFixed(3):null,
      alignmentRatio:s?+s.alignmentRatio.toFixed(3):null,
      candidateCount:a.components.length,sequenceCandidates:s?s.detectedCount:0,
      focus:Math.round(a.focus*10)/10,brightness:Math.round(a.mean),
      reason:detectionAccepted?'Seven pad centres detected.':
        !s?'Could not locate seven distinct coloured pad regions. Try a closer, evenly lit photograph or mark the pads manually.':
        !qualityOK?'Image quality is not sufficient for automatic pad detection.':
        'Pad candidates were found but their spacing/alignment is uncertain. Use manual pad marking.'
    };
    const blockers=[],warnings=[];
    const identityOK=!!(s&&s.regularityOK),focusOK=a.focus>=3,exposureOK=a.mean>=24&&a.mean<=250;
    if(!identityOK)blockers.push('A complete seven-pad sequence was not confidently detected.');
    if(!focusOK)blockers.push('The image may be too blurred. Retake in focus or mark pads manually if all seven are clear.');
    if(!exposureOK)blockers.push(a.mean<42?'The image is too dark. Use even lighting.':'The image is overexposed. Reduce glare and retake.');
    if(a.contrast<5)warnings.push('Very low overall contrast; inspect the strip carefully.');
    warnings.push('Pale/near-white pads and strips on strongly coloured backgrounds may require manual pad marking.');
    warnings.push('Visual inspection remains required for dirt, oil, chemical interference and expiry.');
    const verification={
      accepted:identityOK&&focusOK&&exposureOK,
      identity:identityOK?'seven-pad-pattern-detected':'not-confidently-detected',
      score:s?s.score:0,detectedPadRegions:s?7:0,axis:s?s.axis:null,
      focus:Math.round(a.focus*10)/10,brightness:Math.round(a.mean),
      contrast:Math.round(a.contrast),blockers,warnings
    };
    return {verification,detection};
  }
  function verify(source){return inspect(source).verification;}
  function detectPads(source){return inspect(source).detection;}
  window.ImageVerifier={verify,detectPads,inspect};
})();
