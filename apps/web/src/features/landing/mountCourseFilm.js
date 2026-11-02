/* eslint-disable */
/** Hero film from the English prototype. Motion pauses on prefers-reduced-motion. */
export function mountCourseFilm(root) {
 var stage=root.querySelector('.ae-film-stage'),nodes=Array.from(root.querySelectorAll('[data-film-kind]'));
  if(!stage)return function(){};
 var media=window.matchMedia('(prefers-reduced-motion:reduce)'),animations=[],position=0,playing=false,disposed=false,resizeObserver=null,raf=0,lastLength=-1,lastCaret=-1;
 /* One continuous 12-second sequence: gather, close, reveal, then move forward. */
var FILM_CYCLE_MS=12000;
var FILM_SECONDS=12;
var FILM_QUESTION=['Why do some streets','make us want to stay?'];
function filmEase(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function filmMix(a,b,t){return a+(b-a)*t;}
function filmState(x,y,scale,angle,blur,opacity,layer){return {x:x,y:y,scale:scale,angle:angle,blur:blur,opacity:opacity,layer:layer};}
function filmTween(a,b,v){var r={};Object.keys(a).forEach(function(k){r[k]=filmMix(a[k],b[k],v);});return r;}
function filmTrack(keys,t){
 if(t<=keys[0][0])return keys[0][1];
 // Periodic, shape-preserving Hermite curves share velocity at each waypoint.
 // Only a genuine reversal or deliberate hold slows to zero; intermediate points do not.
 var last=keys.length-1;
 function tangent(n,k){
  var prev=n-1,next=n+1,h0,h1,d0,d1;
  if(n===0||n===last){
   if(keys[0][1][k]!==keys[last][1][k])return 0;
   h0=keys[last][0]-keys[last-1][0];h1=keys[1][0]-keys[0][0];
   d0=(keys[last][1][k]-keys[last-1][1][k])/h0;d1=(keys[1][1][k]-keys[0][1][k])/h1;
  }else{
   h0=keys[n][0]-keys[prev][0];h1=keys[next][0]-keys[n][0];
   d0=(keys[n][1][k]-keys[prev][1][k])/h0;d1=(keys[next][1][k]-keys[n][1][k])/h1;
  }
  if(d0*d1<=0)return 0;
  var w0=2*h1+h0,w1=h1+2*h0;
  return (w0+w1)/(w0/d0+w1/d1);
 }
 for(var n=1;n<keys.length;n++)if(t<=keys[n][0]){
  var h=keys[n][0]-keys[n-1][0],u=(t-keys[n-1][0])/h,u2=u*u,u3=u2*u,r={};
  Object.keys(keys[n][1]).forEach(function(k){
   var a=keys[n-1][1][k],b=keys[n][1][k];
   var v=(2*u3-3*u2+1)*a+(u3-2*u2+u)*h*tangent(n-1,k)+(-2*u3+3*u2)*b+(u3-u2)*h*tangent(n,k);
   r[k]=Math.max(Math.min(a,b),Math.min(Math.max(a,b),v));
  });return r;
 }
 return keys[keys.length-1][1];
}
function filmLayer(kind,i){return kind==='question'?65:kind==='filter'?60:kind==='folder'?55:32+i;}
function filmPose(kind,i,t){
 var S=filmState;
 function track(keys){
  var p=filmTrack(keys,t);p.layer=filmLayer(kind,i);
  if(kind==='folder')p.opacity=filmTrack([[0,{a:.26}],[3.9,{a:.26}],[4.8,{a:1}],[10.8,{a:1}],[12,{a:.26}]],t).a;
  return p;
 }
 if(kind==='question')return track([
  [0,S(-24,4,1.10,-3,0,1,65)],
  [2.45,S(10,-14,1.13,-1,0,1,65)],
  [3.35,S(-280,-184,.55,-10,3.2,.29,65)],
  [7.8,S(-306,-188,.52,-8,3.8,.08,65)],
  [9.65,S(-290,-183,.53,-8,3.6,.28,65)],
  [10.65,S(-278,-181,.54,-8,3.2,.29,65)],
  [12,S(-24,4,1.10,-3,0,1,65)]
 ],t);
 if(kind==='filter')return track([
  [0,S(265,140,.55,10,4,.27,4)],
  [2.35,S(240,115,.58,8,4,.32,4)],
  [3.1,S(8,-8,1.15,1,0,1,45)],
  [4.2,S(8,-12,1.15,1,0,1,45)],
  [5.05,S(296,-184,.56,9,3,.29,4)],
  [7.8,S(304,-180,.54,8,3.8,.1,4)],
  [9.8,S(282,-175,.55,7,3.5,.27,4)],
  [11.35,S(278,112,.55,11,4,.27,4)],
  [12,S(265,140,.55,10,4,.27,4)]
 ],t);
 if(kind==='folder')return track([
  [0,S(220,-145,.46,10,4,.26,5)],
  [3.9,S(235,-155,.47,11,4,.26,5)],
  [4.8,S(-4,110,.85,-4,0,1,20)],
  [7.65,S(0,100,.86,-2,0,1,20)],
  [8.8,S(0,96,.86,-2,0,1,20)],
  [9.65,S(0,12,1.16,-3,0,1,50)],
  [10.45,S(0,8,1.16,-3,0,1,50)],
  [12,S(220,-145,.46,10,4,.26,5)]
 ],t);
 if(kind==='source'){
  var pos=[[-355,-80],[340,160],[85,-245],[-340,285],[-270,-215],[335,-165],[355,290],[-80,-255],[400,25],[-120,315],[220,-250],[-400,35]][i];
  var rest=S(pos[0],pos[1],i<3?.9:.84,(i%2?1:-1)*(8+i*.7),3.3,i<3?.32:.25,filmLayer(kind,i));
  var flight=filmFlight(i),target=filmSourceTarget(i);
  if(t<flight.start)return rest;
  if(t<=flight.end){
   // A single inward arc: no outward enlargement, stopover, or second takeoff.
   var u=(t-flight.start)/(flight.end-flight.start),p=filmEase(u);
   var dx=target.x-rest.x,dy=target.y-rest.y,d=Math.hypot(dx,dy);
   var bow=Math.sin(Math.PI*p)*(i%2?24:-24);
   var a=filmMix(rest.opacity,.98,filmEase(u/.22))*(1-filmEase((u-.72)/.28));
   return S(filmMix(rest.x,target.x,p)-dy/d*bow,filmMix(rest.y,target.y,p)+dx/d*bow,filmMix(rest.scale,.24,p),filmMix(rest.angle,0,p),rest.blur*(1-filmEase(u/.26)),a,rest.layer);
  }
  // Reposition while invisible. The next collection fades into the background
  // as the completed course advances, rather than flying backwards out of it.
  if(t<8.7)return S(target.x,target.y,.24,0,0,0,rest.layer);
  var reentry=filmEase((t-8.7)/1.35);
  return S(rest.x+(1-reentry)*(i%2?16:-16),rest.y+(1-reentry)*12,rest.scale,rest.angle,rest.blur,rest.opacity*reentry,rest.layer);
 }
 return S(0,0,1,0,0,0,0);
}
function filmFlight(i){return {start:4.55+i*.115,end:4.55+i*.115+1.55+(i%3)*.07};}
function filmSourceTarget(i){return {x:(i%3-1)*12,y:92+(i%2)*5};}
function filmCoverAngle(t){return filmTrack([[0,{a:0}],[3.95,{a:0}],[4.75,{a:-67}],[7.65,{a:-67}],[8.35,{a:0}],[12,{a:0}]],t).a;}
function filmPaperLift(t){return filmTrack([[0,{y:0}],[4.75,{y:0}],[6.1,{y:-26}],[7.65,{y:-40}],[8.35,{y:0}],[12,{y:0}]],t).y;}
function filmTitleOpacity(t){return filmTrack([[0,{a:1}],[3.85,{a:1}],[4.25,{a:0}],[8.35,{a:0}],[8.8,{a:1}],[12,{a:1}]],t).a;}
function filmCheck(i,t){return filmEase((t-(3.05+i*.25))/.3)*(1-filmEase((t-10.5)/.5));}
function filmTypedLength(t){
 var count=FILM_QUESTION.join('').length;
 // Reset only while the text is completely invisible, then write across the loop seam.
 if(t>=8.4&&t<11.5)return 0;
 var elapsed=(t+.5)%FILM_SECONDS;
 return Math.max(0,Math.min(count,Math.floor((elapsed+.000001)/.055)));
}
function filmTypingOpacity(t){return filmTrack([[0,{a:1}],[7.7,{a:1}],[8.2,{a:0}],[11.24,{a:0}],[11.52,{a:1}],[12,{a:1}]],t).a;}
function filmCaret(t){var elapsed=(t+.5)%FILM_SECONDS;return elapsed<2.25||t>=11.24?1:elapsed<2.85&&elapsed%.6<.35?1:0;}

 var duration=FILM_CYCLE_MS,stillPosition=duration*9.8/FILM_SECONDS;
 function number(v){return Math.round(v*1000)/1000;}
 function transform(p){return 'translate3d('+number(p.x)+'px,'+number(p.y)+'px,0) rotate('+number(p.angle)+'deg) scale('+number(p.scale)+')';}
 function fit(){var width=stage.getBoundingClientRect().width,viewWidth=parseFloat(getComputedStyle(stage).getPropertyValue('--ae-film-view-width'))||840;if(width>0)stage.style.setProperty('--ae-film-scale',String(width/viewWidth));}
 fit();if('ResizeObserver' in window){resizeObserver=new ResizeObserver(fit);resizeObserver.observe(stage);}else window.addEventListener('resize',fit);
 var type=Array.from(root.querySelectorAll('[data-film-type]')),caret=root.querySelector('.ae-film-caret');
 function typeAt(t){
  if(!type[0]||!type[1]||!caret)return;
  var length=filmTypedLength(t),split=FILM_QUESTION[0].length;
  if(length!==lastLength){
   type[0].textContent=FILM_QUESTION[0].slice(0,length);
   type[1].textContent=FILM_QUESTION[1].slice(0,Math.max(0,length-split));
   type[length>split?1:0].parentNode.appendChild(caret);lastLength=length;
  }
  var visible=filmCaret(t);if(visible!==lastCaret){caret.style.opacity=String(visible);lastCaret=visible;}
 }
 function tick(){if(!playing||disposed)return;typeAt(((Number(animations[0].currentTime)||0)%duration)/duration*FILM_SECONDS);raf=window.requestAnimationFrame(tick);}
 function addAnimation(node,frames){var a=node.animate(frames,{duration:duration,iterations:Infinity,easing:'linear',fill:'both'});a.pause();a.currentTime=0;animations.push(a);}
 function makeFrames(map){var frames=[];for(var i=0;i<=480;i++){var f=map(i*FILM_SECONDS/480);f.offset=i/480;f.easing='linear';frames.push(f);}return frames;}
 if(typeof stage.animate!=='function'){if(resizeObserver)resizeObserver.disconnect();root.dataset.filmStatic='true';return function(){};}
 try{
  nodes.forEach(function(node){
   var kind=node.dataset.filmKind,index=Number(node.dataset.filmIndex);
   // Fixed physical stacking avoids sudden foreground/background swaps mid-flight.
   node.style.zIndex=String(filmLayer(kind,index));
   addAnimation(node,makeFrames(function(t){var p=filmPose(kind,index,t);return {transform:transform(p),opacity:number(p.opacity),filter:'blur('+number(p.blur)+'px)'};}));
  });
  addAnimation(root.querySelector('.ae-film-folder-cover'),makeFrames(function(t){return {transform:'rotateX('+number(filmCoverAngle(t))+'deg)'};}));
  addAnimation(root.querySelector('.ae-film-folder-pages'),makeFrames(function(t){return {transform:'translateY('+number(filmPaperLift(t))+'px)'};}));
  addAnimation(root.querySelector('.ae-film-typing'),makeFrames(function(t){return {opacity:number(filmTypingOpacity(t))};}));
  addAnimation(root.querySelector('[data-film-course-title]'),makeFrames(function(t){var a=filmTitleOpacity(t);return {opacity:number(a),transform:'translateY('+number((1-a)*5)+'px)'};}));
  Array.from(root.querySelectorAll('[data-film-check]')).forEach(function(node){addAnimation(node,makeFrames(function(t){return {opacity:number(filmCheck(Number(node.dataset.filmCheck),t))};}));});
 }catch(error){animations.forEach(function(a){a.cancel();});if(resizeObserver)resizeObserver.disconnect();root.dataset.filmStatic='true';return function(){};}
 function pause(){
  if(playing)position=Number(animations[0].currentTime)||0;
  playing=false;window.cancelAnimationFrame(raf);animations.forEach(function(a){a.pause();a.currentTime=position;});
 }
 function sync(){
  if(disposed)return;
  if(media.matches){pause();position=stillPosition;animations.forEach(function(a){a.currentTime=position;});typeAt(9.8);return;}
  if(document.hidden){pause();return;}
  if(!playing){var now=document.timeline&&document.timeline.currentTime;animations.forEach(function(a){a.currentTime=position;a.play();if(typeof now==='number')a.startTime=now-position;});playing=true;tick();}
 }
 function preference(){pause();position=media.matches?stillPosition:0;sync();}
 function cleanup(){
  if(disposed)return;pause();disposed=true;animations.forEach(function(a){a.cancel();});
  if(resizeObserver)resizeObserver.disconnect();else window.removeEventListener('resize',fit);
  document.removeEventListener('visibilitychange',sync);
  if(media.removeEventListener)media.removeEventListener('change',preference);else if(media.removeListener)media.removeListener(preference);
  window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);window.removeEventListener('ae:routeleave',cleanup);
 }
 function pageHide(event){if(event.persisted)pause();else cleanup();}
 function pageShow(event){if(event.persisted)sync();}
 document.addEventListener('visibilitychange',sync);
 if(media.addEventListener)media.addEventListener('change',preference);else if(media.addListener)media.addListener(preference);
 window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);window.addEventListener('ae:routeleave',cleanup);
 sync();
  return cleanup;
}
