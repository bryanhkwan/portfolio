const topbar=document.getElementById('topbar');
const menuBtn=document.getElementById('menuBtn');
const mobileNav=document.getElementById('mobileNav');

function updateChrome(){
  if(topbar){
    topbar.classList.toggle('scrolled',(window.scrollY||0)>24);
  }
}
window.addEventListener('scroll',updateChrome,{passive:true});
updateChrome();

if(menuBtn&&mobileNav){
  menuBtn.addEventListener('click',function(){
    const open=mobileNav.classList.toggle('open');
    menuBtn.classList.toggle('open',open);
    menuBtn.setAttribute('aria-expanded',String(open));
    menuBtn.setAttribute('aria-label',open?'Close navigation':'Open navigation');
    mobileNav.setAttribute('aria-hidden',String(!open));
  });
  mobileNav.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click',function(){
      mobileNav.classList.remove('open');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded','false');
      menuBtn.setAttribute('aria-label','Open navigation');
      mobileNav.setAttribute('aria-hidden','true');
    });
  });
}

const revealObserver=new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    if(entry.isIntersecting){
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(function(el){revealObserver.observe(el)});

document.querySelectorAll('.atlas-card').forEach(function(card){
  card.addEventListener('pointermove',function(event){
    if(window.matchMedia('(pointer: coarse)').matches) return;
    const rect=card.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width-.5;
    const y=(event.clientY-rect.top)/rect.height-.5;
    card.style.setProperty('--ry',(x*7).toFixed(2)+'deg');
    card.style.setProperty('--rx',(-y*7).toFixed(2)+'deg');
  });
  card.addEventListener('pointerleave',function(){
    card.style.setProperty('--ry','0deg');
    card.style.setProperty('--rx','0deg');
  });
});

document.querySelectorAll('.filter-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    const filter=btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(function(item){
      item.classList.toggle('active',item===btn);
      item.setAttribute('aria-pressed',String(item===btn));
    });
    document.querySelectorAll('.atlas-card').forEach(function(card){
      const categories=card.dataset.category||'';
      card.classList.toggle('is-hidden',filter!=='all'&&!categories.includes(filter));
    });
  });
});
