(function(){
  const $=id=>document.getElementById(id), RECORDS='tbplStripRecords_v1';
  let profiles=ChartManager.load(),selectedProfile=profiles[0],loaded={1:false,2:false,3:false},analyses={},detections={},fileHashes={},inspectionCache={},duplicateFlags={},lastRecord=null,activeEditor=null;
  const today=new Date().toISOString().slice(0,10);
  $('testingDate').value=today;$('sampleId').value='TBPL-'+today.replaceAll('-','')+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  function populateProfiles(){const manufacturers=[...new Set(profiles.map(p=>p.manufacturer))];$('manufacturer').innerHTML=manufacturers.map(m=>`<option>${esc(m)}</option>`).join('');populateModels();renderProfileSummary()}
  function populateModels(){const m=$('manufacturer').value,arr=profiles.filter(p=>p.manufacturer===m);$('stripModel').innerHTML=arr.map(p=>`<option value="${esc(p.id)}">${esc(p.model)}</option>`).join('');selectedProfile=arr[0]||profiles[0];renderProfileSummary()}
  function renderProfileSummary(){if(!selectedProfile)return;$('profileSummary').innerHTML=`<b>${esc(selectedProfile.manufacturer)} · ${esc(selectedProfile.model)}</b><span>${selectedProfile.parameters.length} parameters · ${selectedProfile.parameters.reduce((n,p)=>n+p.levels.length,0)} reference colour levels</span>`}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  $('manufacturer').addEventListener('change',populateModels);$('stripModel').addEventListener('change',()=>{selectedProfile=profiles.find(p=>p.id===$('stripModel').value)||profiles[0];renderProfileSummary();clearResults()});
  document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));$('view-'+b.dataset.view).classList.remove('hidden');if(b.dataset.view==='records')renderRecords();if(b.dataset.view==='charts')renderProfiles()}));
  document.querySelectorAll('.strip-file').forEach(input=>input.addEventListener('change',async e=>{
    const rep=+e.target.dataset.rep,file=e.target.files[0];if(!file)return;
    loaded[rep]=false;delete analyses[rep];delete detections[rep];delete fileHashes[rep];delete inspectionCache[rep];delete duplicateFlags[rep];
    const oldPicker=document.querySelector(`[data-rep="${rep}"] .pad-picker`);if(oldPicker)oldPicker.remove();
    const oldManual=document.querySelector(`[data-rep="${rep}"] .manual-pad-tools`);if(oldManual)oldManual.remove();
    try{
      const canvas=$('canvas'+rep);await ImageEngine.loadImage(file,canvas);
      const inspection=ImageVerifier.inspect(canvas),verdict=inspection.verification,det=inspection.detection;
      const orientation=det.accepted?assessStripOrientation(canvas,det):{accepted:false,status:'needs-manual',label:'Manual pad marking available',reason:'Automatic detection could not reliably locate all seven pads. You can mark the seven visible pads manually.'};
      detections[rep]=det;inspectionCache[rep]={...inspection,orientation};fileHashes[rep]=await ImageEngine.hashFile(file);
      // Recompute all slots whenever one upload changes, so stale duplicate
      // warnings disappear when an image is replaced or cleared.
      refreshDuplicateFlags();
      loaded[rep]=!!((verdict.accepted||!det.accepted)&&det.accepted&&orientation.accepted);
      const card=document.querySelector(`[data-rep="${rep}"]`);
      card.querySelector('.preview-wrap').style.display='flex';card.querySelector('.rep-status').textContent=loaded[rep]?'✓ Orientation verified':orientation.status==='reversed'?'✕ Upside down':orientation.status==='uncertain'?'✕ Check orientation':det.accepted?'✕ Check image':'Manual pad marking needed';
      card.querySelector('.upload-zone').style.display='none';card.querySelector('.preview-wrap').querySelector('canvas').style.maxHeight='155px';
      renderVerification(rep,verdict,det,duplicateFlags[rep]||null,orientation);
      card.querySelector('.analyze-one').disabled=!loaded[rep];
      clearResults();
      $('analysisStatus').textContent=loaded[rep]?`Strip ${rep}: seven pads and orientation verified.`:orientation.status==='reversed'?`Strip ${rep}: likely upside down. Rotate 180° and upload again.`:orientation.status==='uncertain'?`Strip ${rep}: orientation uncertain. Confirm the top pad manually if the strip is clearly upright.`:`Strip ${rep}: automatic pad detection needs help. Use Mark 7 Pads Manually if all seven pads are visible.`;
    }catch(err){loaded[rep]=false;alert('Could not load image: '+err.message)}
  }));

  // Orientation gate: compare the detected pad sequence in its current order
  // against the manufacturer-specific parameter chart, then compare the
  // reversed sequence. This is a conservative screening heuristic, not AI.
  function assessStripOrientation(canvas,det){
    if(!det||!det.accepted||!Array.isArray(det.points)||det.points.length!==7||
       !selectedProfile||!Array.isArray(selectedProfile.parameters)||selectedProfile.parameters.length!==7){
      return {accepted:false,status:'unavailable',label:'Orientation could not be verified',reason:'Seven detected pads and a seven-parameter chart profile are required.',directScore:null,reversedScore:null,margin:null};
    }
    const colours=det.points.map(point=>ImageEngine.samplePad(canvas,point));
    const scoreOrder=order=>{
      const scores=selectedProfile.parameters.map((param,i)=>{
        const ranked=ColourMatcher.matchAll(colours[order[i]],param);
        return ranked.length?ranked[0].deltaE2000:Infinity;
      }).filter(Number.isFinite).sort((a,b)=>a-b);
      if(scores.length!==7)return Infinity;
      // Median reduces the influence of one unusual/poorly developed pad.
      return scores.length%2?scores[3]:(scores[2]+scores[3])/2;
    };
    const directScore=scoreOrder([0,1,2,3,4,5,6]);
    const reversedScore=scoreOrder([6,5,4,3,2,1,0]);
    const margin=+(reversedScore-directScore).toFixed(3);
    // Require both a meaningful absolute separation and a relative advantage.
    // These are conservative prototype thresholds and need validation.
    const directClearlyBetter=margin>=2.0&&directScore<=reversedScore*.85;
    const reverseClearlyBetter=margin<=-2.0&&reversedScore<=directScore*.85;
    if(directClearlyBetter){
      return {accepted:true,status:'forward',label:'Orientation verified',reason:'Detected pad order best matches the manufacturer profile from pad 1 to pad 7.',directScore:+directScore.toFixed(3),reversedScore:+reversedScore.toFixed(3),margin};
    }
    if(reverseClearlyBetter){
      return {accepted:false,status:'reversed',label:'Upside-down strip detected',reason:'The reversed pad sequence matches the manufacturer profile better. Rotate the strip image 180° so Nitrate is at the top and pH is at the bottom, then upload again.',directScore:+directScore.toFixed(3),reversedScore:+reversedScore.toFixed(3),margin};
    }
    return {accepted:false,status:'uncertain',label:'Strip orientation uncertain',reason:'The application cannot confidently distinguish the correct pad order from the reversed order. Retake the image with the Nitrate end at the top and pH end at the bottom, keeping all seven pads visible.',directScore:+directScore.toFixed(3),reversedScore:+reversedScore.toFixed(3),margin};
  }

  function refreshDuplicateFlags(){
    [1,2,3].forEach(n=>{duplicateFlags[n]=null;});
    for(let i=1;i<=3;i++)for(let j=i+1;j<=3;j++){
      if(fileHashes[i]&&fileHashes[i]===fileHashes[j]){duplicateFlags[i]=j;duplicateFlags[j]=i;}
    }
    [1,2,3].forEach(n=>{
      const cached=inspectionCache[n];
      if(cached&&detections[n])renderVerification(n,cached.verification,detections[n],duplicateFlags[n]||null,cached.orientation);
    });
  }

  function renderVerification(rep,v,d,duplicateOf=null,orientation=null){
    const box=$('verify'+rep),pass=!!(v.accepted&&d&&d.accepted&&orientation&&orientation.accepted);
    box.className='verification-result '+(pass?'pass':'fail');
    const lines=[pass?`STRIP VERIFIED · 7 PADS LOCATED · ${d.confidence}% detection confidence`:'IMAGE / PAD VERIFICATION NEEDS REVIEW',...(duplicateOf?[`Exact same source file as Strip ${duplicateOf}. This is an exact-file duplicate, not a background/pattern similarity warning.`]:[]),...(orientation?[`ORIENTATION: ${orientation.label} · forward score ${orientation.directScore??'—'} · reversed score ${orientation.reversedScore??'—'}`,...(orientation.accepted?[]:[orientation.reason])]:['ORIENTATION: not assessed']),`Strip pattern: ${v.identity||'not detected'} · ${v.axis||d?.axis||'axis unavailable'}`,`Automatic pad detection: ${d?.points?.length||0}/7 · alignment ${d?.alignmentRatio??'—'} · spacing variation ${d?.gapCV??'—'}`,`Focus: ${v.focus??d?.focus??'—'} · Brightness: ${v.brightness??d?.brightness??'—'}`,...(v.blockers||[]),...(d&&!d.accepted?[d.reason||'Seven pads could not be detected confidently.']:[]),...(v.warnings||[])];
    box.innerHTML=lines.map((t,i)=>`<div>${i===0?'<b>':''}${esc(t)}${i===0?'</b>':''}</div>`).join('');
    if(!d?.accepted){const b=document.createElement('button');b.className='btn small secondary';b.type='button';b.textContent='Mark 7 Pads Manually';b.style.marginTop='8px';b.addEventListener('click',()=>startManualPadMarking(rep));box.appendChild(b)}
    else if(orientation&&!orientation.accepted&&orientation.status==='uncertain'){const b=document.createElement('button');b.className='btn small secondary';b.type='button';b.textContent='Confirm top pad is Nitrate';b.style.marginTop='8px';b.addEventListener('click',()=>confirmManualOrientation(rep));box.appendChild(b)}
  }

  // Manual fallback for pale pads / difficult backgrounds. The technician
  // clicks the centres in manufacturer order: Nitrate through pH.
  function startManualPadMarking(rep){
    const canvas=$('canvas'+rep),card=document.querySelector(`[data-rep="${rep}"]`),box=document.createElement('div');
    const old=card.querySelector('.manual-pad-tools');if(old)old.remove();
    box.className='manual-pad-tools notice';box.innerHTML='<b>Manual pad marking</b><p>Click the centre of each coloured pad in order: 1 Nitrate, 2 Nitrite, 3 Chlorine, 4 GH, 5 TA, 6 KH, 7 pH. Click the pads from top to bottom (or left to right if the strip is horizontal). Avoid the white gaps and strip handle.</p><p class="manual-progress">0 of 7 pads marked.</p><button type="button" class="btn small ghost cancel-manual">Cancel</button>';
    card.appendChild(box);const points=[],progress=box.querySelector('.manual-progress');canvas.style.cursor='crosshair';
    const finish=()=>{canvas.removeEventListener('click',onClick);canvas.style.cursor='';};
    const cancel=()=>{finish();box.remove()};box.querySelector('.cancel-manual').addEventListener('click',cancel);
    function onClick(ev){
      const rect=canvas.getBoundingClientRect(),x=(ev.clientX-rect.left)*canvas.width/rect.width,y=(ev.clientY-rect.top)*canvas.height/rect.height;
      const size=Math.max(12,Math.min(canvas.width,canvas.height)*.045);points.push({pad:points.length+1,x,y,width:size,height:size,box:{x:x-size/2,y:y-size/2,width:size,height:size}});
      progress.textContent=`${points.length} of 7 pads marked.`;
      const ctx=canvas.getContext('2d');ctx.save();ctx.beginPath();ctx.arc(x,y,Math.max(8,size*.28),0,Math.PI*2);ctx.fillStyle='#063b46';ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(points.length),x,y);ctx.restore();
      if(points.length===7){finish();
        const dx=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),dy=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)),axis=dy>=dx?'vertical':'horizontal';
        const along=axis==='vertical'?points.map(p=>p.y):points.map(p=>p.x),cross=axis==='vertical'?points.map(p=>p.x):points.map(p=>p.y),gaps=along.slice(1).map((v,i)=>Math.abs(v-along[i]));
        const gm=gaps.reduce((a,b)=>a+b,0)/gaps.length,gcv=gm?Math.sqrt(gaps.reduce((a,b)=>a+(b-gm)**2,0)/gaps.length)/gm:99,crossSpread=Math.max(...cross)-Math.min(...cross),span=Math.max(...along)-Math.min(...along),monotonic=gaps.every(g=>g>size*.55),aligned=crossSpread<=Math.max(size*1.6,span*.12);
        if(!monotonic||gcv>.85||!aligned){progress.textContent='The seven clicks do not form one evenly spaced pad row. Please cancel and mark the centre of each pad in order, avoiding the handle and white gaps.';points.length=0;return;}
        const det={accepted:true,manual:true,points,axis,confidence:100,gapCV:+gcv.toFixed(3),sizeCV:null,alignmentRatio:+(crossSpread/Math.max(1,size)).toFixed(3),candidateCount:7,sequenceCandidates:7,focus:inspectionCache[rep]?.detection?.focus||0,reason:'Seven aligned pad centres marked manually by technician.'};
        detections[rep]=det;const orientation=assessStripOrientation(canvas,det);inspectionCache[rep].orientation=orientation;
        if(orientation.status==='uncertain'){
          progress.textContent='Seven pads marked. Chart comparison is inconclusive; visually confirm that Nitrate is at the first pad.';
          const confirm=document.createElement('button');confirm.className='btn small secondary';confirm.textContent='Confirm first pad is Nitrate';confirm.addEventListener('click',()=>{orientation.accepted=true;orientation.status='technician-confirmed';orientation.label='Technician confirmed';orientation.reason='Technician visually confirmed the first marked pad is Nitrate.';inspectionCache[rep].orientation=orientation;completeManual(rep,det,orientation,box)});box.appendChild(confirm);
        }else if(orientation.status==='reversed'){
          progress.textContent='The reversed sequence matches the chart better. Rotate the image 180° and upload it again.';
        }else completeManual(rep,det,orientation,box);
      }
    }
    canvas.addEventListener('click',onClick);
  }
  function confirmManualOrientation(rep){const orientation=inspectionCache[rep]?.orientation;if(!orientation||orientation.status!=='uncertain')return;orientation.accepted=true;orientation.status='technician-confirmed';orientation.label='Technician confirmed';orientation.reason='Technician visually confirmed Nitrate is at the first pad and pH at the last pad.';completeManual(rep,detections[rep],orientation,document.querySelector(`[data-rep="${rep}"] .manual-pad-tools`));}
  function completeManual(rep,det,orientation,toolsBox){
    const card=document.querySelector(`[data-rep="${rep}"]`);loaded[rep]=!!orientation.accepted;
    const old=card.querySelector('.pad-picker');if(old)old.remove();if(toolsBox)toolsBox.remove();
    const v=inspectionCache[rep].verification;renderVerification(rep,v,det,duplicateFlags[rep]||null,orientation);
    card.querySelector('.rep-status').textContent=loaded[rep]?'✓ Pads manually marked':'✕ Orientation needs correction';card.querySelector('.analyze-one').disabled=!loaded[rep];
    if(loaded[rep]){const manualDet={...det,accepted:true};detections[rep]=manualDet;analyses[rep]={quality:ImageEngine.quality($('canvas'+rep)),verification:v,detection:manualDet,pads:[]};renderPadPicker(rep,manualDet);$('analysisStatus').textContent=`Strip ${rep}: seven pads marked manually and orientation ${orientation.label.toLowerCase()}. Review the seven colour matches.`}
    else $('analysisStatus').textContent=`Strip ${rep}: orientation check failed. Rotate the image 180° and upload again.`;
  }

  document.querySelectorAll('.clear-one').forEach(b=>b.addEventListener('click',()=>clearRep(+b.dataset.rep)));
  function clearRep(n){loaded[n]=false;delete analyses[n];delete detections[n];delete fileHashes[n];delete inspectionCache[n];delete duplicateFlags[n];const card=document.querySelector(`[data-rep="${n}"]`);const oldPicker=card.querySelector('.pad-picker');if(oldPicker)oldPicker.remove();const manualTools=card.querySelector('.manual-pad-tools');if(manualTools)manualTools.remove();card.querySelector('.preview-wrap').style.display='none';card.querySelector('.upload-zone').style.display='flex';card.querySelector('.rep-status').textContent='Waiting for image';card.querySelector('.strip-file').value='';card.querySelector('.analyze-one').disabled=false;$('verify'+n).className='verification-result';$('verify'+n).textContent='Image verification will run after upload.';const c=$('canvas'+n);c.width=0;c.height=0;refreshDuplicateFlags();clearResults()}
  document.querySelectorAll('.analyze-one').forEach(b=>b.addEventListener('click',()=>analyzeRep(+b.dataset.rep)));
  function analyzeRep(n){
    if(!loaded[n]){alert('Strip '+n+' did not pass verification and seven-pad detection. Upload a clear photo showing all seven pads.');return}
    const canvas=$('canvas'+n);ImageEngine.restore(canvas);const inspection=ImageVerifier.inspect(canvas),v=inspection.verification,det=(detections[n]?.manual?detections[n]:inspection.detection),orientation=assessStripOrientation(canvas,det);
    if((!v.accepted&&!det.manual)||!det.accepted||det.points.length!==7||!orientation.accepted){loaded[n]=false;detections[n]=det;inspectionCache[n]={...inspection,orientation};renderVerification(n,v,det,duplicateFlags[n]||null,orientation);document.querySelector(`[data-rep="${n}"] .analyze-one`).disabled=true;alert('Automatic detection could not confidently locate all seven pads. Colour analysis is blocked. Retake the image.');return}
    const q=ImageEngine.quality(canvas);analyses[n]={quality:q,verification:v,detection:det,pads:[]};
    const box=renderPadPicker(n,det);
    // Refresh the concentration table once all three replicate strips have
    // seven automatically sampled pads. This completion check was defined
    // but not called in the previous build, leaving chart matches on the
    // replicate cards without producing the final comparison table.
    renderResultsIfComplete();
    const completed=[1,2,3].filter(rep=>analyses[rep] &&
      analyses[rep].pads.length===selectedProfile.parameters.length &&
      analyses[rep].pads.every(pad=>pad && pad.match && pad.match.value!==undefined)).length;
    $('analysisStatus').textContent=`Strip ${n}: seven pads sampled after orientation verification, using central-region median colour extraction and compared with the Aquarium 7-in-1 chart. ${completed}/3 strips analyzed.`;
    return box;
  }
  function renderPadPicker(n,det){
    const card=document.querySelector(`[data-rep="${n}"]`),canvas=$('canvas'+n);let old=card.querySelector('.pad-picker');if(old)old.remove();
    const box=document.createElement('div');box.className='pad-picker';
    box.innerHTML='<p class="muted"><b>Automatic pad detection and orientation check complete.</b> Numbered markers show the detected pad centres. The parameter order was checked against the selected manufacturer chart before sampling.</p><div class="pad-list"></div><p class="muted detection-note"></p>';
    const list=box.querySelector('.pad-list'),ctx=canvas.getContext('2d');
    // Sample all seven pads from the unmarked source pixels before drawing overlay markers.
    selectedProfile.parameters.forEach((p,i)=>{
      const point=det.points[i];
      const radius=Math.max(2,Math.min(6,Math.floor(Math.min(point.width,point.height)*.16)));
      const colour=ImageEngine.samplePad(canvas,point);
      const match=ColourMatcher.match(colour,p);
      analyses[n].pads[i]={parameter:p.name,colour,match,x:point.x,y:point.y,autoDetected:true,detectionConfidence:det.confidence};
      const row=document.createElement('div');row.className='pad-row';
      row.innerHTML=`<span><b>${i+1}. ${esc(p.name)}</b></span><span><i class="swatch" style="background:${colour.hex}"></i>${colour.hex}<small class="muted">${colour.sampleCount||0} pixels · ${colour.regionCount||1} regions · median-of-medians</small></span><span>Closest chart level: <b>${esc(match.value)} ${esc(p.unit)}</b><small class="muted">Best ΔE₀₀ ${match.deltaE2000.toFixed(2)} · next ${match.secondBest?match.secondBest.deltaE2000.toFixed(2):'—'} · gap ${match.matchGap??'—'}</small><small class="muted">Top matches: ${(match.topMatches||[]).map(m=>`${esc(m.value)} (${m.deltaE2000.toFixed(2)})`).join(' · ')}</small></span>`;
      list.appendChild(row);
    });
    const orientation=inspectionCache[n]?.orientation;box.querySelector('.detection-note').textContent=`Detection confidence: ${det.confidence}% · Direction: ${det.axis==='vertical'?'top to bottom':'left to right'} · Orientation: ${orientation?.label||'not verified'} · Seven pad regions detected. Review the overlay before accepting the readings.`;
    card.appendChild(box);
    // Overlay is drawn only after all colour samples have been extracted.
    ctx.save();ctx.lineWidth=Math.max(2,canvas.width/350);ctx.font=`bold ${Math.max(12,canvas.width/38)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
    const padLeft=Math.min(...det.points.map(p=>p.x-p.width*.55)),padTop=Math.min(...det.points.map(p=>p.y-p.height*.55));
    const padRight=Math.max(...det.points.map(p=>p.x+p.width*.55)),padBottom=Math.max(...det.points.map(p=>p.y+p.height*.55));
    ctx.strokeStyle='#0b8f83';ctx.lineWidth=Math.max(2,canvas.width/420);ctx.setLineDash([Math.max(5,canvas.width/100),Math.max(3,canvas.width/180)]);ctx.strokeRect(padLeft,padTop,padRight-padLeft,padBottom-padTop);ctx.setLineDash([]);
    det.points.forEach((pt,i)=>{const r=Math.max(10,Math.min(pt.width,pt.height)*.42);ctx.beginPath();ctx.arc(pt.x,pt.y,r,0,Math.PI*2);ctx.strokeStyle='#00a6a6';ctx.stroke();ctx.fillStyle='#063b46';ctx.fill();ctx.fillStyle='#fff';ctx.fillText(String(i+1),pt.x,pt.y)});ctx.restore();
    return box;
  }
  function renderResultsIfComplete(){if([1,2,3].some(n=>!analyses[n]||analyses[n].pads.length!==selectedProfile.parameters.length||analyses[n].pads.some(x=>!x)))return;renderResults()}
  function median(vals){const a=vals.map(Number).sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2}
  function renderResults(){
    const results=selectedProfile.parameters.map((p,i)=>{
      const vals=[1,2,3].map(n=>analyses[n].pads[i].match.value),nums=vals.map(Number),med=median(nums),variation=Math.max(...nums)-Math.min(...nums);
      const diagnostics=[1,2,3].map(n=>analyses[n].pads[i].match);
      return {parameter:p.name,unit:p.unit,values:vals,median:String(med),variation:String(variation),diagnostics};
    });
    lastRecord=collectRecord(results);
    $('resultsArea').innerHTML=`<div class="muted" style="margin-bottom:10px">Matching: CIEDE2000 (sRGB → CIELAB, D65/2°). The lowest ΔE₀₀ selects the nearest chart swatch. Each pad uses a robust median from its central detected region. ΔE₀₀ is a perceptual colour distance, not a validated concentration-accuracy score.</div>
    <table class="results-table"><thead><tr><th>Parameter</th><th>Unit</th><th>Strip 1</th><th>Strip 2</th><th>Strip 3</th><th>Median / selected</th><th>Range</th></tr></thead><tbody>${results.map((r,i)=>`<tr><td><b>${esc(r.parameter)}</b></td><td>${esc(r.unit)}</td>${r.values.map((v,j)=>`<td><i class="swatch" style="background:${analyses[j+1].pads[i].colour.hex}"></i>${esc(v)}<small class="muted">ΔE₀₀ ${analyses[j+1].pads[i].match.deltaE2000.toFixed(2)}</small></td>`).join('')}<td><input class="median-edit" data-index="${i}" value="${esc(r.median)}"></td><td>${esc(r.variation)}</td></tr>`).join('')}</tbody></table>
    <details class="match-diagnostics"><summary>View colour-match diagnostics (top 3 chart matches per strip)</summary>
      ${results.map((r,i)=>`<div class="diagnostic-param"><b>${esc(r.parameter)}</b><div class="diagnostic-grid">${[1,2,3].map(n=>{const pad=analyses[n].pads[i],m=pad.match;return `<div class="diagnostic-card"><b>Strip ${n}</b><div><i class="swatch" style="background:${pad.colour.hex}"></i>Measured ${pad.colour.hex}</div><small>Pixels sampled: ${pad.colour.sampleCount||'—'} · ${pad.colour.regionCount||1} regions · channel spread R/G/B: ${pad.colour.channelSpread?`${pad.colour.channelSpread.r}/${pad.colour.channelSpread.g}/${pad.colour.channelSpread.b}`:'—'}</small><div><b>${m.assessment?.label||'Match status unavailable'}</b>${m.assessment?.review?' · Manual review recommended':''}</div><ol>${(m.topMatches||[]).map(x=>`<li>${esc(x.value)} ${esc(r.unit)} — ΔE₀₀ ${x.deltaE2000.toFixed(2)} <span class="swatch tiny" style="background:${x.hex}"></span></li>`).join('')}</ol><small>Best-to-second gap: ${m.matchGap??'—'}</small><small>${esc(m.assessment?.reason||'')}</small></div>`}).join('')}</div></div>`).join('')}
    </details>
    <div class="notice compact"><b>Automatic image verification:</b> ${[1,2,3].map(n=>`Strip ${n}: pattern detected (${analyses[n].verification.detectedPadRegions} pad regions; focus ${analyses[n].verification.focus})`).join(' · ')}. Technician inspection is still required.</div>
    <div class="notice compact"><b>Image quality:</b> ${[1,2,3].map(n=>`Strip ${n}: ${esc(analyses[n].quality.label)} (${analyses[n].quality.warnings.join(', ')||'no basic warning'})`).join(' · ')}</div>
    <div class="notice compact"><b>Match review:</b> ${results.some(r=>r.diagnostics.some(m=>m.assessment?.review))?'At least one parameter has a close competing chart match. Review its top-three scores and confirm manually.':'No close top-two match was flagged by the provisional ranking check.'} The ambiguity flag is a screening heuristic, not a validated accuracy threshold. No analytical accuracy is claimed.</div><div class="notice compact"><b>Reference-chart calibration:</b> Current HEX swatches are visual estimates from bottle photographs. For better traceability, use a flat, evenly lit chart image or manually enter calibrated swatch HEX values in Chart Profiles. Do not treat the current chart as instrument-calibrated.</div>`;
    $('saveRecord').disabled=false;$('downloadReport').disabled=false;
    document.querySelectorAll('.median-edit').forEach(inp=>inp.addEventListener('change',()=>{lastRecord.results[+inp.dataset.index].median=inp.value}));
  }
  function collectRecord(results){return {sampleId:$('sampleId').value,testingDate:$('testingDate').value,customer:$('customer').value,technician:$('technician').value,waterSource:$('waterSource').value,pincode:$('pincode').value,location:$('location').value,manufacturer:selectedProfile.manufacturer,model:selectedProfile.model,profileId:selectedProfile.id,chartSnapshot:selectedProfile,notes:$('notes').value,results,replicates:[1,2,3].map(n=>({rep:n,fileName:ImageEngine.images['canvas'+n]?.fileName,sourceFileHash:fileHashes[n],duplicateOf:duplicateFlags[n]||null,quality:analyses[n].quality,verification:analyses[n].verification,orientation:inspectionCache[n]?.orientation||null,pads:analyses[n].pads})),savedAt:new Date().toISOString()}}
  function clearResults(){$('resultsArea').className='empty-state';$('resultsArea').textContent='Results will appear after all three strips are analyzed.';$('saveRecord').disabled=true;$('downloadReport').disabled=true;lastRecord=null}
  $('analyzeAll').addEventListener('click',()=>{
    if(![1,2,3].every(n=>loaded[n])){
      alert('All three images must pass strip/pad verification and orientation review. If automatic detection misses a visible pad, use Mark 7 Pads Manually.');
      return;
    }
    const exactDuplicatePair=[];
    for(let i=1;i<=3;i++)for(let j=i+1;j<=3;j++)if(fileHashes[i]&&fileHashes[i]===fileHashes[j])exactDuplicatePair.push(`Strip ${i} and Strip ${j}`);
    if(exactDuplicatePair.length){
      alert('The following uploads are byte-identical copies of the same source file: '+exactDuplicatePair.join('; ')+'. Please upload a separate photograph for each replicate. Similar backgrounds or similar-looking strip patterns are not treated as duplicates.');
      return;
    }
    [1,2,3].forEach(analyzeRep);
    renderResultsIfComplete();
    if([1,2,3].every(n=>analyses[n] && analyses[n].pads.length===selectedProfile.parameters.length)){
      $('analysisStatus').textContent='All three strips analyzed. Seven parameter concentrations have been matched against the selected Aquarium 7-in-1 chart using CIEDE2000. Review the median and variation table below.';
    }
  });
  $('resetTest').addEventListener('click',()=>{[1,2,3].forEach(clearRep);$('sampleId').value='TBPL-'+today.replaceAll('-','')+'-'+Math.random().toString(36).slice(2,6).toUpperCase();$('analysisStatus').textContent='Test reset.'});
  $('saveRecord').addEventListener('click',()=>{if(!lastRecord)return;const arr=JSON.parse(localStorage.getItem(RECORDS)||'[]');arr.unshift(lastRecord);localStorage.setItem(RECORDS,JSON.stringify(arr));$('analysisStatus').textContent='Record saved in this browser.';alert('Test record saved locally.')});
  $('downloadReport').addEventListener('click',()=>{if(lastRecord)ReportGenerator.download(lastRecord)});
  $('getLocation').addEventListener('click',()=>{if(!navigator.geolocation){$('gpsStatus').textContent='GPS not supported';return}navigator.geolocation.getCurrentPosition(pos=>{$('gpsStatus').textContent=`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;$('gpsStatus').dataset.coords=JSON.stringify({lat:pos.coords.latitude,lon:pos.coords.longitude})},()=>{$('gpsStatus').textContent='Location permission denied or unavailable'})});
  function renderRecords(){const arr=JSON.parse(localStorage.getItem(RECORDS)||'[]');$('recordsList').innerHTML=arr.length?arr.map((r,i)=>`<div class="record-row"><div><b>${esc(r.sampleId)} · ${esc(r.customer||'No customer')}</b><small>${esc(r.testingDate)} · ${esc(r.waterSource)} · ${esc(r.manufacturer)} / ${esc(r.model)}</small></div><div><button class="btn small secondary" data-record="${i}">Download report</button></div></div>`).join(''):'<div class="empty-state">No saved records yet.</div>';document.querySelectorAll('[data-record]').forEach(b=>b.addEventListener('click',()=>ReportGenerator.download(arr[+b.dataset.record])))}
  $('exportRecords').addEventListener('click',()=>{const blob=new Blob([localStorage.getItem(RECORDS)||'[]'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tbpl-test-records.json';a.click();URL.revokeObjectURL(url)});
  function renderProfiles(){$('profileList').innerHTML=profiles.map(p=>`<div class="profile-item ${activeEditor===p.id?'selected':''}" data-profile="${esc(p.id)}"><b>${esc(p.manufacturer)} · ${esc(p.model)}</b><small>${p.parameters.length} parameters · ${p.parameters.reduce((n,x)=>n+x.levels.length,0)} levels</small></div>`).join('');document.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('click',()=>{activeEditor=el.dataset.profile;renderProfiles();renderEditor()}))}
  function renderEditor(){const p=profiles.find(x=>x.id===activeEditor);if(!p){$('profileEditor').textContent='Select a profile or create a new one.';return}$('profileEditor').innerHTML=`<label>Manufacturer<input class="editor-input" id="editManufacturer" value="${esc(p.manufacturer)}"></label><label>Model<input class="editor-input" id="editModel" value="${esc(p.model)}"></label><label>Notes<textarea class="editor-input" id="editNotes" rows="2">${esc(p.notes||'')}</textarea></label><div id="paramEditor">${p.parameters.map((param,i)=>`<div class="editor-param"><b>${esc(param.name)} (${esc(param.unit)})</b>${param.levels.map((lv,j)=>`<div class="editor-level"><input class="editor-input" data-p="${i}" data-l="${j}" data-k="0" value="${esc(lv[0])}" aria-label="Concentration"><input class="editor-input" data-p="${i}" data-l="${j}" data-k="1" value="${esc(lv[1])}" aria-label="Hex colour"><input type="color" class="editor-input colour-input" data-p="${i}" data-l="${j}" data-k="1" value="${esc(lv[1])}"></div>`).join('')}<button class="btn small ghost add-level" data-p="${i}">＋ Add level</button></div>`).join('')}</div><div class="toolbar"><button class="btn primary" id="saveProfile">Save profile</button><button class="btn secondary" id="deleteProfile">Delete profile</button></div>`;
    $('profileEditor').querySelectorAll('input[data-k="1"]').forEach(inp=>inp.addEventListener('input',()=>{const peer=inp.parentElement.querySelector('input[type=color]');peer.value=/^#[0-9a-f]{6}$/i.test(inp.value)?inp.value:'#ffffff'}));$('profileEditor').querySelectorAll('input[type=color]').forEach(inp=>inp.addEventListener('input',()=>{inp.parentElement.querySelector('input[data-k="1"]').value=inp.value}));
    $('profileEditor').querySelectorAll('.add-level').forEach(b=>b.addEventListener('click',()=>{p.parameters[+b.dataset.p].levels.push(['new','#ffffff']);renderEditor()}));
    $('saveProfile').addEventListener('click',()=>{p.manufacturer=$('editManufacturer').value;p.model=$('editModel').value;p.notes=$('editNotes').value;$('paramEditor').querySelectorAll('input[data-k="0"]').forEach(inp=>p.parameters[+inp.dataset.p].levels[+inp.dataset.l][0]=inp.value);$('paramEditor').querySelectorAll('input[data-k="1"]').forEach(inp=>p.parameters[+inp.dataset.p].levels[+inp.dataset.l][1]=inp.value);ChartManager.save(profiles);populateProfiles();renderProfiles();alert('Reference profile saved.')});
    $('deleteProfile').addEventListener('click',()=>{if(profiles.length===1){alert('At least one profile must remain.');return}if(confirm('Delete this profile?')){profiles=profiles.filter(x=>x.id!==p.id);ChartManager.save(profiles);activeEditor=null;populateProfiles();renderProfiles();renderEditor()}});
  }
  $('newProfile').addEventListener('click',()=>{const p={id:'profile-'+Date.now(),manufacturer:'New manufacturer',model:'New strip model',notes:'Enter exact chart details and units.',parameters:[{name:'Parameter 1',unit:'ppm',levels:[['0','#ffffff'],['1','#aaaaaa']]}]};profiles.push(p);ChartManager.save(profiles);activeEditor=p.id;renderProfiles();renderEditor()});
  populateProfiles();clearResults();
})();