/**
 * Generates minimal tracking snippet (Google Analytics style)
 * This is what users paste into their HTML - only ~150 bytes
 */
export const generateMinimalSnippet = ({ apiKey, baseUrl, autoTrack, customEvents }) => {
  // Ultra-minimal snippet that loads the full library asynchronously
  // Similar to Google Analytics' gtag.js approach
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'start':Date.now()});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='${baseUrl}/api/v1/tracker.js?k=${encodeURIComponent(apiKey)}&a=${autoTrack ? '1' : '0'}&c=${customEvents ? '1' : '0'}';f.parentNode.insertBefore(j,f);})(window,document,'script','metricsTracker');`;
};

/**
 * Generates the full tracking library code
 * This is served by the tracker.js route and loaded dynamically
 */
export const generateLibraryCode = ({ apiKey, endpoint, metrics, autoTrack, customEvents }) => {
  // Compact, minified library code with all tracking functionality
  return `(function(){
var c={k:'${apiKey.replace(/'/g, "\\'")}',e:'${endpoint.replace(/'/g, "\\'")}',m:${JSON.stringify(metrics)},a:${autoTrack},x:${customEvents}},q=[],b=[],s=10,t=5e3,bt,st=Date.now(),rt=[1e3,2e3,4e3],mxr=3;
function sm(m,r){if(!m||!m.length)return;var p={metrics:m.map(function(item){return{name:item.n,type:item.t,value:item.v,labels:item.l||{}};})};var op={method:'POST',headers:{'Content-Type':'application/json','X-API-Key':c.k},body:JSON.stringify(p),keepalive:true};fetch(c.e,op).then(function(resp){if(resp.ok){return resp.json();}throw new Error('HTTP '+resp.status);}).catch(function(e){if(r<mxr){setTimeout(function(){sm(m,r+1);},rt[r]);}else{if(q.length<100){q.push(...m);}}})}
function pb(){if(b.length){var m=[...b];b=[];sm(m,0)}}
function am(m){b.push(m);b.length>=s?pb():(clearTimeout(bt),bt=setTimeout(pb,t))}
function tm(n,v,l={}){var m=c.m[n];if(!m)return false;var val=typeof v==='number'?v:parseFloat(v)||0;if(isNaN(val)||!isFinite(val))return false;am({n:n,t:m.t,v:val,l:Object.assign({},m.l,l)});return true}
function inc(n,a=1,l={}){return tm(n,a,l)}
function dec(n,a=1,l={}){var m=c.m[n];if(!m||m.t!=='gauge')return false;return tm(n,-Math.abs(a),l)}
if(c.a&&typeof window!=='undefined'){
var w=window,d=document,perf=w.performance;
if(w.addEventListener){
w.addEventListener('load',function(){var nav=perf&&perf.timing;if(nav){var ttfb=nav.responseStart-nav.navigationStart,dcl=nav.domContentLoadedEventEnd-nav.navigationStart,load=nav.loadEventEnd-nav.navigationStart;tm('page_load_time',load,{page:location.pathname});tm('ttfb',ttfb,{page:location.pathname});tm('dom_content_loaded',dcl,{page:location.pathname})}tm('page_views',1,{page:location.pathname,referrer:d.referrer||'',url:location.href})});
var st=Date.now();
w.addEventListener('beforeunload',function(){var top=Math.round((Date.now()-st)/1e3);tm('time_on_page',top,{page:location.pathname});if(navigator.sendBeacon&&b.length){var p=JSON.stringify({metrics:b.map(function(item){return{name:item.n,type:item.t,value:item.v,labels:item.l||{}};})});navigator.sendBeacon(c.e,new Blob([p],{type:'application/json'}));}else{pb();}});
if(perf&&perf.getEntriesByType){
setTimeout(function(){var entries=perf.getEntriesByType('navigation');if(entries&&entries[0]){var e=entries[0];tm('dns_lookup_time',e.domainLookupEnd-e.domainLookupStart,{page:location.pathname});tm('tcp_connect_time',e.connectEnd-e.connectStart,{page:location.pathname});tm('server_response_time',e.responseStart-e.requestStart,{page:location.pathname});tm('page_download_time',e.responseEnd-e.responseStart,{page:location.pathname})}},1000)}
if('PerformanceObserver' in w){
try{var po=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){if(e.entryType==='paint'){if(e.name==='first-contentful-paint')tm('fcp',Math.round(e.startTime),{page:location.pathname})}else if(e.entryType==='largest-contentful-paint'){tm('lcp',Math.round(e.renderTime||e.loadTime),{page:location.pathname})}else if(e.entryType==='first-input'){tm('fid',Math.round(e.processingStart-e.startTime),{page:location.pathname})}})});po.observe({entryTypes:['paint','largest-contentful-paint','first-input']})}catch(e){}
try{var cls=0,clsO=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){if(!e.hadRecentInput)cls+=e.value;});});clsO.observe({type:'layout-shift',buffered:true});w.addEventListener('beforeunload',function(){tm('cls',Math.round(cls*1e3),{page:location.pathname});});}catch(e){}
}
if('onerror' in w){
w.onerror=function(msg,src,line,col,err){tm('javascript_errors',1,{page:location.pathname,message:String(msg).substring(0,100),source:String(src).substring(0,200),line:line||0})}
w.addEventListener('unhandledrejection',function(e){tm('promise_rejections',1,{page:location.pathname,reason:String(e.reason).substring(0,100)})})
}
}
}
if(c.x&&typeof window!=='undefined'){
w.trackMetric=tm;w.incrementMetric=inc;w.decrementMetric=dec;
if(d.addEventListener){
d.addEventListener('click',function(e){var el=e.target.closest('[data-track]');if(el){var n=el.getAttribute('data-track'),v=parseFloat(el.getAttribute('data-value'))||1,l={};Array.from(el.attributes).forEach(function(a){if(a.name.startsWith('data-label-'))l[a.name.slice(11)]=a.value});tm(n,v,l)}},true);
d.addEventListener('submit',function(e){var el=e.target.closest('form');if(el&&el.hasAttribute('data-track')){var n=el.getAttribute('data-track'),v=parseFloat(el.getAttribute('data-value'))||1,l={};Array.from(el.attributes).forEach(function(a){if(a.name.startsWith('data-label-'))l[a.name.slice(11)]=a.value});tm(n,v,l)}},true)
}
}
if(typeof window!=='undefined'&&w.addEventListener){
w.addEventListener('online',function(){if(q.length){var m=q.splice(0,s);sm(m,0)}});
w.addEventListener('visibilitychange',function(){if(d.hidden){pb()}})
}
if(typeof window!=='undefined'){
w.MetricsTracker={track:tm,increment:inc,decrement:dec,flush:pb,getQueueSize:function(){return q.length},getBatchSize:function(){return b.length}}
}
if(typeof window!=='undefined'&&window.metricsTracker){
window.metricsTracker.forEach(function(cmd){if(cmd[0]==='track')tm(cmd[1],cmd[2],cmd[3]||{});else if(cmd[0]==='increment')inc(cmd[1],cmd[2],cmd[3]||{});else if(cmd[0]==='decrement')dec(cmd[1],cmd[2],cmd[3]||{});});
}
})();`;
};

// Keep the old function for backward compatibility (can be removed later)
export const generateTrackingCode = generateMinimalSnippet;