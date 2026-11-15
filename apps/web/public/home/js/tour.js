/* An account-scoped walkthrough shared by both parts of Guardian. It never saves example health data. */
(function () {
  const HOME='/home/index.html#/dashboard', APP='/#/dashboard', ACTIVE='guardian.tour.active';
  const steps=[
    {page:HOME,target:'#main',title:'Welcome to Guardian',text:'Let’s try the main features together. Use Next to follow along, or Skip to explore on your own.'},
    {page:HOME,target:'[data-action="use-template"][data-id="crew-health"], #main [data-action="add-card"]',title:'Start a reading',text:'This is Log vitals. Next opens a blank card so you can see how it works.'},
    {page:HOME,target:'#cardForm',form:true,title:'Name your card and add readings',text:'Give your card a name. Fill in the readings you have; you can leave the others blank. Units are already included. Tap a circled i for equipment help.'},
    {page:HOME,target:'[type="submit"][form="cardForm"]',form:true,title:'Keep it in your account',text:'Done saves your card. Cancel closes it without saving. You can try this now, or press Next to close the blank example.'},
    {page:'/home/index.html#/cards',target:'#main',title:'Find your saved cards',text:'Your cards live here. Open a card to read it, or use Edit to update its readings.'},
    {page:APP,target:'#vital-choice',title:'Choose a vital',text:'Pick heart rate, blood pressure, sleep or another reading. The graph uses only the cards saved to your account.'},
    {page:APP,target:'.user-vitals-chart, .user-vitals-empty',title:'See what changed',text:'Read the dates from left to right. Each dot is a saved reading. Use “See the exact readings” for a list. An empty graph means no cards contain that vital yet.'},
    {page:'/#/assessment',target:'#main',title:'Check a concern',text:'Triage helps you review readings, explore the body and follow a simple daily routine. It is an educational guide, not a diagnosis.'},
    {page:'/#/space',target:'#main',title:'Learn about space hazards',text:'See the five space hazards and graphs from NASA. Each graph explains what its numbers mean and where the data come from.'},
    {page:'/#/space',target:'#envPill',title:'Choose your location',text:'Use this button to switch between the space station, Moon, Mars and a spacecraft.'},
    {page:'/#/space',target:'[data-nav="app:citations"]',menu:true,title:'Check a source',text:'Open More, then Citations to find the sources for the information, equipment and graphs.'},
    {page:'/#/space',target:'[data-action="search"]',title:'Find something quickly',text:'Use Search to find a page or saved card. You can also press Ctrl + K.'},
    {page:'/#/space',target:'#acct',title:'Your account and settings',text:'Use your account button to manage your account. Open More, then Settings to change how Guardian looks and feels.'},
    {page:'/#/space',target:'[data-action="guide"]',title:'You’re ready',text:'Tap this question mark whenever you want to replay the tour.'}
  ];
  let state=null, tip=null, ring=null, target=null, timer=0, focusBefore=null, userId=null, attempt=0;
  const storage=(area,key,value)=>{try { if(value===undefined)return area.getItem(key);if(value===null)area.removeItem(key);else area.setItem(key,value); } catch(e) {} };
  const persist=()=>storage(sessionStorage,ACTIVE,JSON.stringify(state));
  function clean(){clearTimeout(timer);tip?.remove();ring?.remove();tip=ring=target=null;window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);}
  function finish(){clean();if(state?.user){storage(localStorage,'guardian.tour.done.'+state.user,'1');storage(localStorage,'guardian.tour.pending.'+state.user,null);}state=null;storage(sessionStorage,ACTIVE,null);focusBefore?.focus?.();}
  function position(){if(!tip||!target||!ring)return;const r=target.getBoundingClientRect();const box=tip.getBoundingClientRect();const pad=12;ring.style.cssText=`left:${r.left-5}px;top:${r.top-5}px;width:${r.width+10}px;height:${r.height+10}px;`;const left=Math.max(pad,Math.min(r.left,innerWidth-box.width-pad));let top=r.bottom+14;if(top+box.height>innerHeight-pad)top=r.top-box.height-14;top=Math.max(pad,Math.min(top,innerHeight-box.height-pad));tip.style.left=left+'px';tip.style.top=top+'px';}
  function advance(delta){
    if(delta>0&&state.step===1&&!document.querySelector('[data-action="use-template"][data-id="crew-health"], #main [data-action="add-card"]')){tip.querySelector('p').textContent='Choose your location on this page first. Then press Next to open Log vitals.';return;}
    const form=document.querySelector('#cardForm');
    if(delta>0&&state.step===3&&form){
      if([...form.querySelectorAll('input')].some(el=>state.exampleOpen ? el.value.trim()!==el.defaultValue.trim() : !!el.value.trim())){tip.querySelector('p').textContent='Save your card with Done, or close it with Cancel, before continuing. Your entries stay here.';return;}
      document.querySelector('#modalRoot [data-close]')?.click();
    }
    if(delta<0&&state.step===4){state.step=1;}else state.step+=delta;
    if(state.step>=steps.length){finish();return;}persist();show();
  }
  function show(){
    clean();if(!state)return;
    const step=steps[state.step];const url=new URL(step.page,location.origin);
    if(location.pathname!==url.pathname){persist();location.assign(url.href);return;}
    if(location.hash!==url.hash){location.hash=url.hash;}
    const born=Date.now();
    function locate(){
      if(!state)return;
      if(document.documentElement.classList.contains('intro-active')||(!step.form&&document.querySelector('#main')?.inert)){timer=setTimeout(locate,120);return;}
      if(step.form&&!document.querySelector('#cardForm')){
        if(state.step===3){advance(1);return;}
        const opener=document.querySelector('[data-action="use-template"][data-id="crew-health"], #main [data-action="add-card"]');
        if(opener){state.exampleOpen=true;persist();opener.click();}
      }
      if(step.menu){const menu=document.querySelector('#nav [data-menu="more"]');if(menu)menu.open=true;}
      const needsLocation=state.step===1&&!document.querySelector(step.target);
      const found=document.querySelector(needsLocation?'#main':step.target);
      if(!found||!found.getBoundingClientRect().width){if(Date.now()-born<20000){timer=setTimeout(locate,150);return;}}
      target=found&&found.getBoundingClientRect().width?found:document.querySelector('[data-action="guide"]');
      if(!target){finish();return;}
      target.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});
      ring=document.createElement('div');ring.className='guardian-tour-ring';ring.setAttribute('aria-hidden','true');document.body.appendChild(ring);
      tip=document.createElement('section');tip.className='guardian-tour';tip.setAttribute('role','dialog');tip.setAttribute('aria-label','Guardian quick tour');tip.setAttribute('aria-describedby','guardian-tour-text');
      tip.innerHTML='<div class="guardian-tour-top"><span>QUICK TOUR · '+(state.step+1)+' OF '+steps.length+'</span><button type="button" data-tour="skip" aria-label="Close tour">×</button></div><h2></h2><p id="guardian-tour-text"></p><div class="guardian-tour-actions"><button type="button" data-tour="skip">Skip tour</button><span></span><button type="button" data-tour="back">Back</button><button type="button" data-tour="next" class="guardian-tour-next">'+(state.step===steps.length-1?'Finish':'Next →')+'</button></div>';
      tip.querySelector('h2').textContent=step.title;tip.querySelector('p').textContent=needsLocation?'Choose where you are: the space station, Moon, Mars or a spacecraft. Then press Next to try Log vitals.':step.text;
      tip.querySelector('[data-tour="back"]').hidden=state.step===0||state.step===2||state.step===3;
      tip.addEventListener('click',e=>{const action=e.target.closest('[data-tour]')?.dataset.tour;if(action==='skip')finish();else if(action==='next')advance(1);else if(action==='back')advance(-1);});
      document.body.appendChild(tip);position();tip.querySelector('[data-tour="next"]').focus({preventScroll:true});window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
    }
    timer=setTimeout(locate,120);
  }
  async function start(){
    userId=(await window.GuardianAuth?.user())?.id||null;focusBefore=document.activeElement;
    if(!userId){location.assign('/#/sign-in');return;}
    state={step:document.querySelector('#cardForm')?2:0,user:userId};persist();show();
  }
  async function boot(){
    userId=(await window.GuardianAuth?.user())?.id||null;if(!userId)return;
    const raw=storage(sessionStorage,ACTIVE);try{const saved=JSON.parse(raw||'null');if(saved?.user===userId&&Number.isInteger(saved.step)&&steps[saved.step]){state=saved;show();return;}}catch(e){}
    if(storage(localStorage,'guardian.tour.pending.'+userId)&&!storage(localStorage,'guardian.tour.done.'+userId)){
      if(!document.querySelector('#nav [data-nav]')||document.documentElement.classList.contains('env-wait')){if(attempt++<100)timer=setTimeout(boot,250);return;}
      state={step:0,user:userId};persist();show();
    }
  }
  document.addEventListener('keydown',e=>{if(!state)return;if(e.key==='Escape'){e.preventDefault();finish();}});
  window.GuardianTour={start};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
