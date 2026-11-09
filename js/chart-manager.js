(function(){
  // Versioned key ensures the corrected user-confirmed Aquarium chart is loaded
  // without overwriting the user's older v1 chart data.
  const KEY='tbplStripProfiles_aquarium7in1_v2';
  const starter={
    id:'aquarium-7in1-user-chart-v2',
    manufacturer:'Aquarium Test Strips',
    model:'7-in-1 Water Test Strip',
    notes:'Reference levels transcribed from the two user-supplied bottle-chart photographs. Pad order top-to-bottom: Nitrate, Nitrite, Chlorine, GH, TA, KH, pH. HEX colours remain visual approximations digitised from supplied bottle-chart photographs (including the additional November 2026 images); they are not instrument-calibrated reference standards. Reading times are provisional: NO3/NO2 60 s; other pads 15 s.',
    parameters:[
      {name:'Nitrate (NO₃)',unit:'mg/L',pad:1,readingTimeSeconds:60,levels:[['0','#F5F1E9'],['10','#F0E6DF'],['25','#EACFD2'],['50','#E5AFC0'],['100','#D995B0'],['250','#C77A9D']]},
      {name:'Nitrite (NO₂)',unit:'mg/L',pad:2,readingTimeSeconds:60,levels:[['0','#F2ECE9'],['1','#E7C5CF'],['5','#D88FA9'],['10','#C86D91']]},
      {name:'Chlorine (Cl₂)',unit:'mg/L',pad:3,readingTimeSeconds:15,levels:[['0','#F0EEEA'],['0.8','#E5E1E1'],['1.5','#D3BBCD'],['3.0','#B58EAF']]},
      {name:'Total Hardness (GH)',unit:'mg/L',pad:4,readingTimeSeconds:15,levels:[['0','#F1EFE9'],['25','#B9C9CC'],['75','#A1A9C1'],['150','#8A82AE'],['300','#75659A']]},
      {name:'Total Alkalinity (TA)',unit:'mg/L',pad:5,readingTimeSeconds:15,levels:[['0','#E3C72C'],['40','#B9B82F'],['80','#A4B13A'],['120','#8FA33B'],['180','#769A3B'],['300','#5D873A']]},
      {name:'Carbonate Hardness (KH)',unit:'mg/L',pad:6,readingTimeSeconds:15,levels:[['0','#E2C52B'],['40','#B7C94E'],['80','#83B873'],['120','#55A887'],['180','#339B88'],['300','#238C80']]},
      {name:'pH',unit:'pH',pad:7,readingTimeSeconds:15,levels:[['6.4','#E4BF2D'],['6.8','#F0B43E'],['7.2','#EFA149'],['7.6','#E88E46'],['8.0','#E57940'],['8.4','#D96838']]}
    ]
  };
  function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(v)&&v.length?v:[starter]}catch(e){return [starter]}}
  function save(list){localStorage.setItem(KEY,JSON.stringify(list))}
  window.ChartManager={starter,load,save};
})();
