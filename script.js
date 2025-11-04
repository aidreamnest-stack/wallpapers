/* script.js — Final, stable version for WallpaperWorld
   Features:
   - Right sidebar open/close + overlay
   - Theme toggle (persisted)
   - Preloader
   - Gallery loading from images.json (pagination)
   - Search, category filter, shuffle, refresh
   - Favorites (localStorage)
   - Download counts (localStorage) + trending tab
   - Random Wallpaper of the Day
   - Modal preview (close on backdrop, X, ESC)
   - Download from modal & inline
   - Active link highlight (nav & sidebar)
   - Lazy-load fallback (error handler)
   - Dynamic page title
   - Analytics event logging (console) - placeholder for real analytics
   - PWA service worker registration (sw.js)
*/

const IMAGES_JSON = 'images.json';
const PAGE_SIZE = 12;
const LS_FAV = 'wt_favorites_v1';
const LS_COUNTS = 'wt_counts_v1';
const LS_THEME = 'wt_theme_v1';

let allImages = [];
let page = 0;
let showingFavorites = false;
let currentTab = 'all'; // all | trending | random
let modalCurrent = null;

// small helpers
function qs(id){ return document.getElementById(id); }
function qsa(sel){ try { return Array.from(document.querySelectorAll(sel)); } catch(e){ return []; } }
function safe(fn){ try{ fn(); }catch(e){ console.error(e); } }

// ---------------------- PRELOADER ----------------------
function createPreloader(){
  if(qs('preloader')) return;
  const pre = document.createElement('div');
  pre.id = 'preloader';
  pre.innerHTML = '<div class="loader"></div>';
  document.body.appendChild(pre);
  // hide after load or timeout
  window.addEventListener('load', () => {
    pre.classList.add('hidden');
    setTimeout(()=> pre.remove(), 600);
  });
  // fallback removal
  setTimeout(()=> { if(document.body.contains(pre)) pre.remove(); }, 4000);
}

// ---------------------- THEME ----------------------
function applySavedTheme(){
  const t = localStorage.getItem(LS_THEME);
  if(t === 'light') document.documentElement.setAttribute('data-light','1');
  else document.documentElement.removeAttribute('data-light');
}
function toggleTheme(){
  if(document.documentElement.hasAttribute('data-light')){
    document.documentElement.removeAttribute('data-light');
    localStorage.setItem(LS_THEME, 'dark');
  } else {
    document.documentElement.setAttribute('data-light','1');
    localStorage.setItem(LS_THEME, 'light');
  }
}

// ---------------------- SIDEBAR ----------------------
function openSidebar(){
  const sb = qs('sidebar');
  const ov = qs('overlay');
  if(!sb) return;
  sb.classList.add('open');
  if(ov){ ov.style.display = 'block'; ov.hidden = false; }
}
function closeSidebar(){
  const sb = qs('sidebar');
  const ov = qs('overlay');
  if(!sb) return;
  sb.classList.remove('open');
  if(ov){ ov.style.display = 'none'; ov.hidden = true; }
}

// ---------------------- STORAGE HELPERS ----------------------
function loadFavorites(){ try{ return JSON.parse(localStorage.getItem(LS_FAV) || '[]'); }catch(e){ return []; } }
function saveFavorites(arr){ localStorage.setItem(LS_FAV, JSON.stringify(arr)); }

function loadCounts(){ try{ return JSON.parse(localStorage.getItem(LS_COUNTS) || '{}'); }catch(e){ return {}; } }
function saveCounts(obj){ localStorage.setItem(LS_COUNTS, JSON.stringify(obj)); }
function incrementCount(id){ const c = loadCounts(); c[id] = (c[id]||0) + 1; saveCounts(c); }

// ---------------------- ANALYTICS (placeholder) ----------------------
function trackEvent(action, label){
  // Console logging for now; replace with real analytics calls (GA4, Plausible, etc.)
  try { console.info('[Analytics]', action, label || ''); } catch(e){}
}

// ---------------------- FETCH IMAGES ----------------------
async function loadImages(force=false){
  try {
    const res = await fetch(IMAGES_JSON + (force ? ('?t=' + Date.now()) : ''));
    const json = await res.json();
    allImages = Array.isArray(json) ? json : (json.images || []);
    allImages = allImages.map((img, i) => ({ id: img.id || String(i+1), ...img }));
  } catch (err) {
    console.error('Failed to load images.json', err);
    allImages = [];
  }
}

// ---------------------- RENDER & FILTER ----------------------
function renderCategoryOptions(){
  const sel = qs('category');
  if(!sel) return;
  const cats = Array.from(new Set(allImages.map(i => i.category).filter(Boolean)));
  sel.innerHTML = '';
  const allOpt = document.createElement('option'); allOpt.value=''; allOpt.textContent='All'; sel.appendChild(allOpt);
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c; sel.appendChild(o);
  });
}

function resetPageAndLoad(){ const g = qs('gallery'); if(g) g.innerHTML=''; page=0; loadPage(true); }

function filterAndSearch(){
  const q = (qs('search')?.value || '').trim().toLowerCase();
  const cat = qs('category')?.value || '';
  let items = allImages.slice();
  if(currentTab === 'trending'){
    const counts = loadCounts();
    items.sort((a,b) => (counts[b.id]||0) - (counts[a.id]||0));
  }
  if(cat) items = items.filter(i => i.category === cat);
  if(q) items = items.filter(i => ((i.title||'').toLowerCase().includes(q)) || ((i.tags||[]).join(' ').toLowerCase().includes(q)));
  if(showingFavorites){
    const favs = loadFavorites();
    items = items.filter(i => favs.includes(i.id));
  }
  return items;
}

function loadPage(reset=false){
  const gallery = qs('gallery');
  if(!gallery) return;
  if(reset) { gallery.innerHTML=''; page = 0; }
  const items = filterAndSearch();
  if(currentTab === 'random'){
    gallery.innerHTML = '';
    const idx = indexForToday(items.length);
    const pick = items.length ? items[idx % items.length] : null;
    if(pick) renderWallBlock(pick, gallery);
    qs('loadMoreWrap') && (qs('loadMoreWrap').style.display = 'none');
    return;
  }
  const start = page * PAGE_SIZE;
  const chunk = items.slice(start, start + PAGE_SIZE);
  chunk.forEach(it => renderWallBlock(it, gallery));
  page++;
  const more = qs('loadMoreWrap');
  if(more){
    if(start + PAGE_SIZE >= items.length) more.style.display = 'none';
    else more.style.display = 'block';
  }
}

// create a single wall element and append listeners
function renderWallBlock(img, container){
  const div = document.createElement('div');
  div.className = 'wall fade-in';
  // sanitize title for alt text
  const titleSafe = (img.title || '').replace(/"/g, '&quot;');
  div.innerHTML = `
    <img loading="lazy" src="${img.url}" alt="${titleSafe}">
    <div class="card-download"><button class="icon-btn dl-inline" title="Download">⬇</button></div>
    <div class="overlay">
      <div class="title">${escapeHtml(img.title||'')}</div>
      <div class="icons"><button class="icon-btn fav-btn" title="Favorite">❤</button></div>
    </div>
  `;
  // inline download
  const dlBtn = div.querySelector('.dl-inline');
  dlBtn && dlBtn.addEventListener('click', (e) => { e.stopPropagation(); handleDownload(img); });

  // favorite
  const favBtn = div.querySelector('.fav-btn');
  favBtn && favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(img.id); updateWallFavIcon(div, img.id); });

  // open modal on whole card click
  div.addEventListener('click', () => openModalWith(img));

  updateWallFavIcon(div, img.id);
  container.appendChild(div);
}

// update single wall card favorite icon
function updateWallFavIcon(div, id){
  const favBtn = div.querySelector('.fav-btn');
  if(!favBtn) return;
  const favs = loadFavorites();
  const is = favs.includes(id);
  favBtn.textContent = is ? '♥' : '❤';
  favBtn.style.opacity = is ? '1' : '0.7';
}

// ---------------------- MODAL ----------------------
function openModalWith(img){
  modalCurrent = img;
  const modal = qs('modal');
  if(!modal) return;
  qs('modalImg') && (qs('modalImg').src = img.url);
  qs('modalTitle') && (qs('modalTitle').textContent = img.title || '');
  qs('modalTags') && (qs('modalTags').textContent = (img.tags || []).join(', '));
  qs('downloadCount') && (qs('downloadCount').textContent = String(loadCounts()[img.id] || 0));
  const dl = qs('downloadBtn');
  if(dl){ dl.href = img.url; dl.download = (img.title || img.id).replace(/\s+/g,'_') + '.jpg'; }
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  updateModalFav();
}

function closeModal(){
  const modal = qs('modal');
  if(!modal) return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
  modalCurrent = null;
}

function updateModalFav(){
  const btn = qs('favToggle');
  if(!btn || !modalCurrent) return;
  const favs = loadFavorites();
  if(favs.includes(modalCurrent.id)){ btn.textContent = '♥ Favorited'; btn.classList.add('active'); }
  else { btn.textContent = '❤ Favorite'; btn.classList.remove('active'); }
}

// ---------------------- FAVORITES & HANDLERS ----------------------
function toggleFavorite(id){
  const arr = loadFavorites();
  const i = arr.indexOf(id);
  if(i >= 0) arr.splice(i,1); else arr.push(id);
  saveFavorites(arr);
  // update counts or UI
  // update modal/favs
  if(modalCurrent && modalCurrent.id === id) updateModalFav();
  // quick gallery update for icons
  qsa('.wall').forEach(div => {
    const imgEl = div.querySelector('img');
    if(imgEl && imgEl.src && imgEl.src === findImageById(id)?.url) updateWallFavIcon(div, id);
  });
  trackEvent('Favorite', id);
}

function findImageById(id){ return allImages.find(i => String(i.id) === String(id)); }

// ---------------------- DOWNLOADS ----------------------
async function handleDownload(img) {
  try {
    const response = await fetch(img.url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = (img.title || img.id || 'Wallpaper') + '.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    // Count + analytics updates
    incrementCount(img.id);
    updateTrending();
    trackEvent('Download', img.id);

    // Update modal counter if open
    if (modalCurrent && modalCurrent.id === img.id) {
      const countEl = qs('downloadCount');
      if (countEl) countEl.textContent = String(loadCounts()[img.id] || 0);
    }
  } catch (e) {
    console.error('Download failed:', e);
  }
}

// ---------------------- MODAL DOWNLOAD FIX ----------------------
function bindModalDownload() {
  const btn = qs('downloadBtn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!modalCurrent) return;
    await handleDownload(modalCurrent);
  });
}



// ---------------------- RANDOM OF DAY ----------------------
function indexForToday(n){
  if(!n) return 0;
  const d = new Date();
  const num = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  return num % n;
}
function showRandomOfDay(){
  const wrap = qs('randomOfDay');
  if(!wrap) return;
  const list = allImages.slice();
  if(!list.length){ wrap.classList.add('hidden'); return; }
  const idx = indexForToday(list.length);
  const pick = list[idx];
  const c = qs('randomCard');
  if(!c) return;
  c.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'wallpaper-card card';
  card.innerHTML = `
    <div class="thumb"><img loading="lazy" src="${pick.url}" alt="${escapeHtml(pick.title||'')}"></div>
    <div class="info">
      <h3>${escapeHtml(pick.title||'')}</h3>
      <p class="small">${(pick.tags||[]).slice(0,6).join(', ')}</p>
      <div style="margin-top:8px">
        <button class="btn" id="randOpen">Open</button>
        <button class="btn ghost" id="randDL">Download</button>
      </div>
    </div>
  `;
  c.appendChild(card);
  wrap.classList.remove('hidden');
  // attach
  const randOpen = qs('randOpen');
  const randDL = qs('randDL');
  randOpen && randOpen.addEventListener('click', ()=> openModalWith(pick));
  randDL && randDL.addEventListener('click', ()=> handleDownload(pick));
}

// ---------------------- TABS & TRENDING ----------------------
function onTabClick(e){
  const target = e.currentTarget;
  qsa('.tab').forEach(t => t.classList.remove('active'));
  target.classList.add('active');
  currentTab = target.dataset.tab || 'all';
  if(currentTab === 'random'){ qs('randomOfDay') && qs('randomOfDay').classList.remove('hidden'); qs('loadMoreWrap') && (qs('loadMoreWrap').style.display = 'none'); }
  else { qs('randomOfDay') && qs('randomOfDay').classList.add('hidden'); qs('loadMoreWrap') && (qs('loadMoreWrap').style.display = 'block'); }
  qs('gallery') && (qs('gallery').innerHTML = '');
  page = 0;
  loadPage(true);
}
function updateTrending(){ if(currentTab !== 'trending') return; qs('gallery') && (qs('gallery').innerHTML = ''); const items = filterAndSearch(); items.forEach(i => renderWallBlock(i, qs('gallery'))); }

// ---------------------- UTILS ----------------------
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------------------- LAZYLOAD FALLBACK ----------------------
function setupLazyLoadFallback(){
  // when images are inserted, assign an onerror fallback
  qsa('img[loading="lazy"]').forEach(img => {
    img.onerror = () => { img.src = 'fallback.jpg'; };
  });
}

// ---------------------- ACTIVE LINK & DYNAMIC TITLE ----------------------
function highlightActiveLink(){
  const path = window.location.pathname.split('/').pop() || 'index.html';
  qsa('nav a').forEach(a => {
    try {
      const href = a.getAttribute('href') || '';
      if(href === path || (href === 'index.html' && path === '')) a.classList.add('active');
      else a.classList.remove('active');
    } catch(e){}
  });
  // sidebar links
  qsa('.sidebar-nav a').forEach(a=>{
    try{
      const href = a.getAttribute('href') || '';
      if(href === path || (href === 'index.html' && path === '')) a.classList.add('active');
      else a.classList.remove('active');
    }catch(e){}
  });
}

function updateDynamicTitle(){
  const map = { 'index.html':'Home', 'about.html':'About', 'contact.html':'Contact', 'privacy.html':'Privacy Policy', 'terms.html':'Terms' };
  const file = window.location.pathname.split('/').pop() || 'index.html';
  const title = map[file] ? `WallpaperWorld | ${map[file]}` : 'WallpaperWorld';
  document.title = title;
}

// ---------------------- PARALLAX (simple) ----------------------
function setupParallax(){
  const layer = qs('parallaxLayer');
  if(!layer) return;
  window.addEventListener('scroll', ()=> {
    const sc = window.scrollY;
    layer.style.transform = `translateY(${sc * 0.12}px)`;
    layer.style.opacity = String(Math.max(0, 1 - sc/400));
  }, { passive: true });
}

// ---------------------- SERVICE WORKER (PWA) ----------------------
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(()=> {
      console.info('Service worker registered');
    }).catch(err => console.warn('SW register failed', err));
  }
}

// ---------------------- INIT BINDINGS ----------------------
function bindUI(){
  // sidebar hamburger
  qsa('.hamburger').forEach(h => h.addEventListener('click', openSidebar));
  qsa('.close-x').forEach(b => b.addEventListener('click', closeSidebar));
  qsa('#overlay').forEach(o => o.addEventListener('click', closeSidebar));

  // search / category
  qs('search')?.addEventListener('input', ()=> resetPageAndLoad());
  qs('category')?.addEventListener('change', ()=> resetPageAndLoad());

  // buttons
  qs('shuffleBtn')?.addEventListener('click', ()=> { 
    allImages.sort(()=>Math.random()-0.5); 
    resetPageAndLoad(); 
  });
  
  qs('refreshBtn')?.addEventListener('click', async ()=> { 
    await loadImages(true); 
    renderCategoryOptions(); 
    resetPageAndLoad(); 
  });

  qs('favoritesView')?.addEventListener('click', ()=> { 
    showingFavorites = !showingFavorites; 
    qs('favoritesView').textContent = showingFavorites ? 'Showing Favorites' : 'Favorites'; 
    resetPageAndLoad(); 
  });

  // 🌙 THEME TOGGLE (Updated)
  const themeToggleBtn = qs('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
      themeToggleBtn.textContent =
        document.documentElement.hasAttribute('data-light') ? '🌙 Dark' : '☀️ Light';
    });

    // Set initial text correctly
    themeToggleBtn.textContent =
      document.documentElement.hasAttribute('data-light') ? '🌙 Dark' : '☀️ Light';
  }

  qsa('.tab').forEach(t => t.addEventListener('click', onTabClick));
  qs('loadMore')?.addEventListener('click', ()=> loadPage(false));

  // modal close by X/backdrop handled below via IDs
  qs('closeModalBtn')?.addEventListener('click', ()=> closeModal());
  qs('modalBackdrop')?.addEventListener('click', ()=> closeModal());
  window.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeModal(); });

  // modal actions
  qs('favToggle')?.addEventListener('click', ()=> { 
    if(modalCurrent) toggleFavorite(modalCurrent.id); 
    updateModalFav(); 
  });

  qs('downloadBtn')?.addEventListener('click', (e)=> { 
    if(!modalCurrent) return; 
    incrementCount(modalCurrent.id); 
    qs('downloadCount') && (qs('downloadCount').textContent = String(loadCounts()[modalCurrent.id]||0)); 
    trackEvent('Download', modalCurrent.id); 
  });

  qs('setWallpaperBtn')?.addEventListener('click', setAsWallpaper);

  // audio toggle (if present)
  qs('audioToggle')?.addEventListener('click', ()=> {
    const a = qs('ambientAudio'); 
    if(!a) return;
    if(a.paused){ 
      a.play(); 
      qs('audioToggle').textContent = '🔊 Ambient On'; 
    } else { 
      a.pause(); 
      qs('audioToggle').textContent = '🎧 Ambient'; 
    }
  });

  // Close sidebar when clicking nav links
  qsa('.sidebar-nav a').forEach(a => a.addEventListener('click', ()=> closeSidebar()));
}

// ---------- set-as-wallpaper best-effort ----------
async function setAsWallpaper(){
  if(!modalCurrent) return;
  try {
    if(navigator.canShare && navigator.canShare({ files: [] })){
      const res = await fetch(modalCurrent.url);
      const blob = await res.blob();
      const file = new File([blob], (modalCurrent.title||'wall').replace(/\s+/g,'_') + '.jpg', { type: blob.type });
      await navigator.share({ files: [file], title: modalCurrent.title });
      return;
    }
  } catch(e){ console.warn('share failed', e); }
  // fallback open in new tab
  window.open(modalCurrent.url, '_blank');
  alert('Image opened in new tab — long-press (mobile) or right-click to save/set wallpaper.');
}

// ---------------------- BOOTSTRAP ----------------------
async function bootstrap(){
  createPreloader();
  applySavedTheme(); // ✅ Load saved theme
  bindUI();
  bindModalDownload();
  await loadImages();
  renderCategoryOptions();
  showRandomOfDay();
  loadPage(true);
  updateTrending();
  setupParallax();
  setupLazyLoadFallback();
  highlightActiveLink();
  updateDynamicTitle();
  registerServiceWorker();

  // Defensive: hide overlay if any left visible
  try { 
    const ov = qs('overlay'); 
    if(ov){ ov.style.display = 'none'; ov.hidden = true; } 
  } catch(e){}
}

// run
document.addEventListener('DOMContentLoaded', bootstrap);
