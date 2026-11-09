(function(){
  // Shared helper for automatic pad detection; no technician coordinate picking.
  function analyze(canvas,profile,rep){
    const quality=ImageEngine.quality(canvas),detection=ImageVerifier.detectPads(canvas);
    if(!detection.accepted||detection.points.length!==7)return {rep,quality,detection,padPoints:[],results:[],accepted:false};
    const padPoints=detection.points.map((point,i)=>{
      const parameter=profile.parameters[i];
      const colour=ImageEngine.samplePad(canvas,point);
      const match=ColourMatcher.match(colour,parameter);
      return {pad:i+1,parameter:parameter.name,x:point.x,y:point.y,colour,match,autoDetected:true};
    });
    return {rep,quality,detection,padPoints,results:padPoints,accepted:true};
  }
  window.ReplicateAnalysis={analyze};
})();