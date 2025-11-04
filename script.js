/* script.js — updated with modal close, download, and hamburger sidebar */

const IMAGES_JSON = 'images.json';
const PAGE_SIZE = 12;

let allImages = [];
let page = 0;
let showingFavorites = false;
let currentTab = 'all';
let modalCurrent = null;

const LS_FAV = 'wt_favorites_v1';
const LS_COUNTS = 'wt_counts_v1';

function qs(id){ return document.getElementById(id) }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)) }

document.addEventListener('DOMContentLoaded', () => {
  bindUI();
  init();
});

function bindUI(){
  // basic UI
  qs('hamburger').addEventListener('click', openSidebar);
  qs('closeSidebar').addEventListener('click', closeSidebar);
  qs('overlay').addEventListener('click', closeSidebar);

  qs('search').addEventListener('input', () => { resetPageAndLoad(); });
  qs('category').addEventListener('change', () => { resetPageAndLoad(); });
  qs('shuffleBtn').addEventListener('click', () => { shuffleImages(); });
  qs('refreshBtn').addEventListener('click', async ()=> { await loadImages(true); });
  qs('favoritesView').addEventListener('click', ()=> { toggleFavoritesView(); });
  qs('themeToggle').addEventListener('click', toggleTheme);
  qsa('.tab').forEach(t => t.addEventListener('click', onTabClick));
  qs('loadMore')?.addEventListener('click', ()=> loadPage(false));

  // modal controls
  qs('closeModalBtn').addEventListener('click', closeModal);
  qs('modalBackdrop').addEventListener('click', closeModal);
  window.addEventListener('keydown', (e)=> { if(e.key==='Escape') closeModal(); });

  qs('favToggle').addEventListener('click', ()=> { if(modalCurrent) toggleFavorite(modalCurrent.id); updateModalFav(); });
  qs('downloadBtn').addEventListener('click', (e) => {
    if(!modalCurrent) return;
    incrementCount(modalCurrent.id);
    qs('downloadCount').textContent = String((loadCounts()[modalCurrent.id]||0));
    // anchor will download by default
  });

  // ambient audio
  qs('audioToggle').addEventListener('click', toggleAudio);
}

async function init(){
  await loadImages();
  renderCategoryOptions();
  showRandomOfDay();
  loadPage(true);
  updateTrending();
  setupParallax();
}

async function loadImages(force=false){
  try {
    const res = await fetch(IMAGES_JSON + (force?('?t='+Date.now()):''));
    const json = await res.json();
    // Expect array of items
    allImages = Array.isArray(json) ? json : (json.images || []);
    allImages = allImages.map((img, i) => ({ id: img.id || String(i+1), ...img }));
  } catch (err) {
    console.error('Failed to load images.json', err);
    allImages = [];
  }
}

function renderCategoryOptions(){
  const sel = qs('category');
  sel.innerHTML = '';
  const cats = Array.from(new Set(allImages.map(i => i.category).filter(Boolean)));
  const optAll = document.createElement('option'); optAll.value=''; optAll.textContent='All'; sel.appendChild(optAll);
  cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
}

function resetPageAndLoad(){ qs('gallery').innerHTML=''; page=0; loadPage(true); }

function filterAndSearch(){
  const q = qs('search').value.trim().toLowerCase();
  const cat = qs('category').value;
  let items = allImages.slice();
  if(currentTab === 'trending'){
    const counts = loadCounts();
    items.sort((a,b) => (counts[b.id]||0) - (counts[a.id]||0));
  }
  if(cat) items = items.filter(i=>i.category === cat);
  if(q) items = items.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.tags && i.tags.join(' ').toLowerCase().includes(q)));
  if(showingFavorites){
    const favs = loadFavorites();
    items = items.filter(i => favs.includes(i.id));
  }
  return items;
}

function loadPage(reset=false){
  const gallery = qs('gallery');
  if(!gallery) return;
  if(reset){ gallery.innerHTML = ''; page = 0; }
  const items = filterAndSearch();
  if(currentTab === 'random'){
    gallery.innerHTML = '';
    const idx = indexForToday(items.length);
    const pick = items.length ? items[idx % items.length] : null;
    if(pick) renderWallBlock(pick, gallery);
    qs('loadMoreWrap').style.display = 'none';
    return;
  }
  const start = page * PAGE_SIZE;
  const chunk = items.slice(start, start + PAGE_SIZE);
  chunk.forEach(it => renderWallBlock(it, gallery));
  page++;
  // show/hide load more
  const more = qs('loadMoreWrap');
  if(!more) return;
  if(start + PAGE_SIZE >= items.length) more.style.display = 'none'; else more.style.display = 'block';
}

function renderWallBlock(img, container){
  const div = document.createElement('div');
  div.className = 'wall fade-in';
  div.innerHTML = `
    <img loading="lazy" src="${img.url}" alt="${escapeHtml(img.title||'')}" />
    <div class="card-download"><button class="icon-btn dl-inline">⬇</button></div>
    <div class="overlay">
      <div class="title">${escapeHtml(img.title||'')}</div>
      <div class="icons">
        <button class="icon-btn fav-btn" title="Favorite">❤</button>
      </div>
    </div>
  `;
  // events
  div.querySelector('.dl-inline').addEventListener('click', (e)=> { e.stopPropagation(); handleDownload(img); });
  div.querySelector('.fav-btn').addEventListener('click', (e)=> { e.stopPropagation(); toggleFavorite(img.id); updateWallFavIcon(div,img.id); });
  div.addEventListener('click', ()=> openModalWith(img));
  updateWallFavIcon(div, img.id);
  container.appendChild(div);
}

function updateWallFavIcon(div, id){
  const favBtn = div.querySelector('.fav-btn');
  const favs = loadFavorites();
  favBtn.textContent = favs.includes(id) ? '♥' : '❤';
  favBtn.style.opacity = favs.includes(id) ? '1' : '0.7';
}

// Modal handling
function openModalWith(img){
  modalCurrent = img;
  qs('modalImg').src = img.url;
  qs('modalTitle').textContent = img.title || '';
  qs('modalTags').textContent = (img.tags || []).join(', ');
  qs('downloadCount').textContent = String((loadCounts()[img.id]||0));
  const dl = qs('downloadBtn');
  dl.href = img.url;
  dl.download = (img.title || img.id).replace(/\s+/g,'_') + '.jpg';
  qs('modal').classList.add('open'); qs('modal').setAttribute('aria-hidden','false');
  updateModalFav();
}

function closeModal(){
  qs('modal').classList.remove('open'); qs('modal').setAttribute('aria-hidden','true');
  modalCurrent = null;
}

// Favorites
function loadFavorites(){ try { return JSON.parse(localStorage.getItem(LS_FAV) || '[]') } catch(e){ return [] } }
function saveFavorites(arr){ localStorage.setItem(LS_FAV, JSON.stringify(arr)); }
function toggleFavorite(id){
  const arr = loadFavorites();
  const idx = arr.indexOf(id);
  if(idx >= 0) arr.splice(idx,1); else arr.push(id);
  saveFavorites(arr);
  // refresh gallery icons
  qs('gallery').querySelectorAll('.wall').forEach(div => {
    // compare by image src or title if needed — easier: we update specific ones only on action
  });
  updateModalFav();
}
function updateModalFav(){
  const btn = qs('favToggle');
  if(!modalCurrent) return;
  const favs = loadFavorites();
  if(favs.includes(modalCurrent.id)){ btn.textContent = '♥ Favorited'; btn.classList.add('active'); } else { btn.textContent = '❤ Favorite'; btn.classList.remove('active'); }
}

// Downloads tracking
function loadCounts(){ try { return JSON.parse(localStorage.getItem(LS_COUNTS) || '{}') } catch(e){ return {} } }
function saveCounts(obj){ localStorage.setItem(LS_COUNTS, JSON.stringify(obj)); }
function incrementCount(id){ const c = loadCounts(); c[id] = (c[id]||0) + 1; saveCounts(c); }

function handleDownload(img){
  const a = document.createElement('a');
  a.href = img.url;
  a.download = (img.title || img.id).replace(/\s+/g,'_') + '.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  incrementCount(img.id);
  updateTrending();
}

// Shuffle and theme
function shuffleImages(){ allImages.sort(()=>Math.random()-0.5); qs('gallery').innerHTML=''; page=0; loadPage(true); }
function toggleTheme(){
  if(document.documentElement.hasAttribute('data-light')){ document.documentElement.removeAttribute('data-light'); document.documentElement.style.setProperty('--bg','#0f1724'); document.documentElement.style.setProperty('--card','#021018'); document.documentElement.style.setProperty('--text','#e6eef8'); }
  else { document.documentElement.setAttribute('data-light','1'); document.documentElement.style.setProperty('--bg','#f8fafc'); document.documentElement.style.setProperty('--card','#ffffff'); document.documentElement.style.setProperty('--text','#021018'); }
}

// Favorites view
function toggleFavoritesView(){ showingFavorites = !showingFavorites; qs('favoritesView').textContent = showingFavorites ? 'Showing Favorites' : 'Favorites'; qs('gallery').innerHTML=''; page=0; loadPage(true); }

// Random of the day
function indexForToday(n){ if(!n) return 0; const d = new Date(); const num = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate(); return num % n; }
function showRandomOfDay(){
  const wrap = qs('randomOfDay');
  const list = allImages.slice();
  if(!list.length){ wrap.classList.add('hidden'); return; }
  const idx = indexForToday(list.length);
  const pick = list[idx];
  const c = qs('randomCard');
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
  qs('randOpen').addEventListener('click', ()=> openModalWith(pick));
  qs('randDL').addEventListener('click', ()=> handleDownload(pick));
}

// Tabs
function onTabClick(e){
  qsa('.tab').forEach(t => t.classList.remove('active'));
  e.currentTarget.classList.add('active');
  currentTab = e.currentTarget.dataset.tab;
  if(currentTab === 'random'){ qs('randomOfDay').classList.remove('hidden'); qs('loadMoreWrap').style.display = 'none'; }
  else { qs('randomOfDay').classList.add('hidden'); qs('loadMoreWrap').style.display = 'block'; }
  qs('gallery').innerHTML = ''; page = 0; loadPage(true);
}

// Trending
function updateTrending(){ if(currentTab !== 'trending') return; qs('gallery').innerHTML=''; const items = filterAndSearch(); items.forEach(i => renderWallBlock(i, qs('gallery'))); }

// Sidebar
function openSidebar(){ qs('sidebar').classList.add('open'); qs('overlay').hidden = false; qs('overlay').style.display = 'block'; }
function closeSidebar(){ qs('sidebar').classList.remove('open'); qs('overlay').hidden = true; qs('overlay').style.display = 'none'; }

// Parallax
function setupParallax(){
  const layer = qs('parallaxLayer');
  if(!layer) return;
  window.addEventListener('scroll', () => {
    const sc = window.scrollY;
    layer.style.transform = `translateY(${sc * 0.12}px)`;
    layer.style.opacity = String(Math.max(0, 1 - sc/400));
  }, { passive:true });
}

// Utils
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function loadFavorites(){ try{ return JSON.parse(localStorage.getItem(LS_FAV) || '[]') }catch(e){ return [] } }
function loadCounts(){ try{ return JSON.parse(localStorage.getItem(LS_COUNTS) || '{}') }catch(e){ return {} } }

// initial load + helpers
function filterAndSearch(){
  const q = qs('search').value.trim().toLowerCase();
  const cat = qs('category').value;
  let items = allImages.slice();
  if(currentTab === 'trending'){ const counts = loadCounts(); items.sort((a,b)=> (counts[b.id]||0) - (counts[a.id]||0)); }
  if(cat) items = items.filter(i=>i.category === cat);
  if(q) items = items.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.tags && i.tags.join(' ').toLowerCase().includes(q)));
  if(showingFavorites){ const favs = loadFavorites(); items = items.filter(i=>favs.includes(i.id)); }
  return items;
}

function loadPage(reset=false){
  const gallery = qs('gallery');
  if(!gallery) return;
  if(reset){ gallery.innerHTML=''; page=0; }
  const items = filterAndSearch();
  if(currentTab === 'random'){ gallery.innerHTML=''; const idx = indexForToday(items.length); const pick = items[idx]; if(pick) renderWallBlock(pick, gallery); qs('loadMoreWrap').style.display='none'; return; }
  const start = page * PAGE_SIZE;
  const chunk = items.slice(start, start + PAGE_SIZE);
  chunk.forEach(it => renderWallBlock(it, gallery));
  page++;
  const more = qs('loadMoreWrap');
  if(!more) return;
  if(start + PAGE_SIZE >= items.length) more.style.display='none'; else more.style.display='block';
}

function renderWallBlock(img, container){
  const div = document.createElement('div');
  div.className = 'wall fade-in';
  div.innerHTML = `
    <img loading="lazy" src="${img.url}" alt="${escapeHtml(img.title||'')}">
    <div class="card-download"><button class="icon-btn dl-inline">⬇</button></div>
    <div class="overlay">
      <div class="title">${escapeHtml(img.title||'')}</div>
      <div class="icons">
        <button class="icon-btn fav-btn">❤</button>
      </div>
    </div>
  `;
  div.querySelector('.dl-inline').addEventListener('click', (e)=> { e.stopPropagation(); handleDownload(img); });
  div.querySelector('.fav-btn').addEventListener('click', (e)=> { e.stopPropagation(); toggleFavorite(img.id); updateWallFavIcon(div,img.id); });
  div.addEventListener('click', ()=> openModalWith(img));
  updateWallFavIcon(div, img.id);
  container.appendChild(div);
}

function updateWallFavIcon(div, id){
  const favBtn = div.querySelector('.fav-btn');
  const favs = loadFavorites();
  favBtn.textContent = favs.includes(id) ? '♥' : '❤';
  favBtn.style.opacity = favs.includes(id) ? '1' : '0.7';
}

async function init(){
  try {
    const res = await fetch(IMAGES_JSON);
    const json = await res.json();
    allImages = Array.isArray(json) ? json : (json.images || []);
    allImages = allImages.map((img,i) => ({ id: img.id || String(i+1), ...img }));
  } catch(e) { allImages = []; console.error('load error', e); }
  renderCategoryOptions();
  showRandomOfDay();
  loadPage(true);
  updateTrending();
}

// simple audio toggle
function toggleAudio(){
  const a = qs('ambientAudio');
  if(!a) return;
  if(a.paused){ a.play(); qs('audioToggle').textContent = '🔊 Ambient On'; } else { a.pause(); qs('audioToggle').textContent = '🎧 Ambient'; }
}
