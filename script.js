/* WallpaperSite — main front-end JS
   Features:
   - load images.json
   - category filter + search + shuffle + refresh
   - favorites (localStorage)
   - modal preview with zoom, download, Set-as-Wallpaper best-effort
   - Random of the Day (deterministic by date)
   - Trending (local download counts)
   - ambient audio toggle
*/

const IMAGES_JSON = 'images.json'; // update path if needed
const PAGE_SIZE = 12; // items to load per "page"

let allImages = [];
let displayed = [];
let page = 0;
let showingFavorites = false;
let currentTab = 'all'; // all | trending | random

// localStorage keys
const LS_FAV = 'wt_favorites_v1';
const LS_COUNTS = 'wt_counts_v1';

function qs(id){ return document.getElementById(id) }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)) }

async function init(){
  bindUI();
  await loadImages();
  renderCategoryOptions();
  renderTabs();
  showRandomOfDay();
  loadPage(true);
  updateTrending(); // build trending based on counts
  setupParallax();
}

function bindUI(){
  qs('search').addEventListener('input', () => { page=0; loadPage(true); });
  qs('category').addEventListener('change', () => { page=0; loadPage(true); });
  qs('shuffleBtn').addEventListener('click', () => { shuffleImages(); });
  qs('refreshBtn').addEventListener('click', async () => { await loadImages(true);});
  qs('favoritesView').addEventListener('click', () => toggleFavoritesView());
  qs('themeToggle').addEventListener('click', toggleTheme);
  qsa('.tab').forEach(t => t.addEventListener('click', (e)=> onTabClick(e)));
  qs('loadMore')?.addEventListener('click', () => loadPage(false));
  // modal
  qs('closeModal').addEventListener('click', closeModal);
  qs('favToggle').addEventListener('click', toggleModalFavorite);
  qs('downloadBtn').addEventListener('click', (e)=> { /* handled in openModal */ });
  qs('setWallpaperBtn').addEventListener('click', setAsWallpaper);
  // ambient audio
  qs('audioToggle').addEventListener('click', toggleAudio);
}

async function loadImages(force=false){
  try {
    const res = await fetch(IMAGES_JSON + '?_t=' + (force?Date.now():''));
    allImages = await res.json(); // expect array of {id,title,url,tags,category}
    // ensure each has id; if not create one
    allImages = allImages.map((img, i) => ({ id: img.id || String(i+1), ...img }));
  } catch (err) {
    console.error('Failed to load images.json', err);
    allImages = [];
  }
}

// categories from images array
function getCategories(){
  const cats = new Set();
  allImages.forEach(i => { if(i.category) cats.add(i.category) });
  return ['All', ...Array.from(cats)];
}

function renderCategoryOptions(){
  const sel = qs('category');
  sel.innerHTML = '';
  getCategories().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c === 'All' ? '' : c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function filterAndSearch(){
  const q = qs('search').value.trim().toLowerCase();
  const cat = qs('category').value;
  let items = allImages.slice();

  if(currentTab === 'trending'){
    const counts = loadCounts();
    items.sort((a,b) => (counts[b.id]||0) - (counts[a.id]||0));
  } else if(currentTab === 'random'){
    // random tab will be handled separately
  }

  if(cat){
    items = items.filter(i => i.category === cat);
  }
  if(q){
    items = items.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.tags && i.tags.join(' ').toLowerCase().includes(q)));
  }
  if(showingFavorites){
    const favs = loadFavorites();
    items = items.filter(i => favs.includes(i.id));
  }
  return items;
}

function loadPage(reset=false){
  const gallery = qs('gallery');
  if(reset){ gallery.innerHTML = ''; page=0 }
  const items = filterAndSearch();
  if(currentTab === 'random'){
    gallery.innerHTML = ''; page=0;
    // show Random of Day only (if random tab selected)
    const idx = indexForToday(items.length);
    const pick = items.length ? items[idx % items.length] : null;
    if(pick) renderWallBlock(pick, gallery);
    return;
  }
  const start = page * PAGE_SIZE;
  const chunk = items.slice(start, start + PAGE_SIZE);
  chunk.forEach(it => renderWallBlock(it, gallery));
  page++;
  // hide load more if no more
  const loadMoreWrap = qs('loadMoreWrap') || document.querySelector('.load-more-wrap');
  if(!loadMoreWrap) return;
  if(start + PAGE_SIZE >= items.length) loadMoreWrap.style.display = 'none';
  else loadMoreWrap.style.display = 'block';
}

function renderWallBlock(img, container){
  const div = document.createElement('div');
  div.className = 'wall fade-in';
  div.innerHTML = `
    <img loading="lazy" src="${img.url}" alt="${escapeHtml(img.title||'')}" />
    <div class="overlay">
      <div class="title">${escapeHtml(img.title||'')}</div>
      <div class="icons">
        <button class="icon-btn dl-btn" title="Download">⬇</button>
        <button class="icon-btn fav-btn" title="Favorite">❤</button>
      </div>
    </div>
  `;
  // events
  const imgEl = div.querySelector('img');
  div.addEventListener('click', (e) => {
    if(e.target.classList.contains('dl-btn') || e.target.closest('.dl-btn')) { handleDownload(img); e.stopPropagation(); return; }
    if(e.target.classList.contains('fav-btn') || e.target.closest('.fav-btn')) { toggleFavorite(img.id); updateWallFavIcon(div, img.id); e.stopPropagation(); return; }
    openModalWith(img);
  });
  // set fav icon state
  updateWallFavIcon(div, img.id);
  container.appendChild(div);
}

function updateWallFavIcon(div, id){
  const favBtn = div.querySelector('.fav-btn');
  const favs = loadFavorites();
  favBtn.textContent = favs.includes(id) ? '♥' : '❤';
  favBtn.style.opacity = favs.includes(id) ? '1' : '0.7';
}

// Modal
let modalCurrent = null;
function openModalWith(img){
  modalCurrent = img;
  qs('modalImg').src = img.url;
  qs('modalTitle').textContent = img.title || '';
  qs('modalTags').textContent = (img.tags || []).join(', ');
  qs('downloadCount').textContent = String((loadCounts()[img.id]||0));
  const dl = qs('downloadBtn');
  dl.href = img.url;
  dl.download = (img.title || img.id).replace(/\s+/g,'_') + '.jpg';
  // increment on download click is done elsewhere
  qs('modal').classList.add('open'); qs('modal').setAttribute('aria-hidden','false');
  // attach download increment on the anchor
  dl.onclick = (ev) => {
    // increment count
    incrementCount(img.id);
    qs('downloadCount').textContent = String((loadCounts()[img.id]||0));
    updateTrending();
    // allow default anchor behavior
  };
  // fav button state
  updateModalFav();
}

function closeModal(){
  qs('modal').classList.remove('open'); qs('modal').setAttribute('aria-hidden','true');
  modalCurrent = null;
}

function toggleModalFavorite(){
  if(!modalCurrent) return;
  toggleFavorite(modalCurrent.id);
  updateModalFav();
}

function updateModalFav(){
  const btn = qs('favToggle');
  const favs = loadFavorites();
  if(modalCurrent && favs.includes(modalCurrent.id)){
    btn.textContent = '♥ Favorited';
    btn.classList.add('active');
  } else {
    btn.textContent = '❤ Favorite';
    btn.classList.remove('active');
  }
}

// Favorites storage
function loadFavorites(){ try{ return JSON.parse(localStorage.getItem(LS_FAV) || '[]') }catch(e){return []}}
function saveFavorites(arr){ localStorage.setItem(LS_FAV, JSON.stringify(arr)) }
function toggleFavorite(id){
  const arr = loadFavorites();
  const i = arr.indexOf(id);
  if(i>=0) arr.splice(i,1); else arr.push(id);
  saveFavorites(arr);
  // refresh current view icons
  qs('gallery').querySelectorAll('.wall').forEach(div => {
    // compare by img src
  });
  // update modal
  updateModalFav();
}

// Download counts (for trending)
function loadCounts(){ try{ return JSON.parse(localStorage.getItem(LS_COUNTS) || '{}') }catch(e){ return {} } }
function saveCounts(obj){ localStorage.setItem(LS_COUNTS, JSON.stringify(obj)) }
function incrementCount(id){
  const c = loadCounts(); c[id] = (c[id]||0) + 1; saveCounts(c);
}
function updateTrending(){
  // if trending tab active, reload
  if(currentTab === 'trending') { qs('gallery').innerHTML=''; loadPage(true); }
}

// handle download button outside modal
function handleDownload(img){
  // create anchor and click
  const a = document.createElement('a');
  a.href = img.url;
  a.download = (img.title || img.id).replace(/\s+/g,'_') + '.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  incrementCount(img.id);
  updateTrending();
}

// shuffle
function shuffleImages(){
  allImages.sort(()=>Math.random()-0.5);
  qs('gallery').innerHTML=''; loadPage(true);
}

// theme toggle (light/dark)
function toggleTheme(){
  if(document.documentElement.hasAttribute('data-light')){
    document.documentElement.removeAttribute('data-light');
    // revert colors
    document.documentElement.style.setProperty('--bg','#0f1724');
    document.documentElement.style.setProperty('--card','#021018');
    document.documentElement.style.setProperty('--text','#e6eef8');
  } else {
    document.documentElement.setAttribute('data-light','1');
    document.documentElement.style.setProperty('--bg','#f8fafc');
    document.documentElement.style.setProperty('--card','#ffffff');
    document.documentElement.style.setProperty('--text','#021018');
  }
}

// Favorites view
function toggleFavoritesView(){
  showingFavorites = !showingFavorites;
  qs('favoritesView').textContent = showingFavorites ? 'Showing Favorites' : 'Favorites';
  qs('gallery').innerHTML=''; page=0; loadPage(true);
}

/* Random of the Day */
function indexForToday(n){
  if(!n) return 0;
  const d = new Date();
  // deterministic but changes daily: YMD sum
  const num = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  return num % n;
}
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
    <div class="thumb"><img loading="lazy" src="${pick.url}" alt="${escapeHtml(pick.title||'')}" /></div>
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
  qs('randDL').addEventListener('click', ()=> { handleDownload(pick) });
}

/* Tabs */
function onTabClick(e){
  const tab = e.currentTarget.dataset.tab;
  qsa('.tab').forEach(t => t.classList.remove('active'));
  e.currentTarget.classList.add('active');
  currentTab = tab;
  // adjust UI visibility
  if(tab === 'random') { qs('randomOfDay').classList.remove('hidden'); qs('loadMoreWrap').style.display='none' }
  else { qs('randomOfDay').classList.add('hidden'); qs('loadMoreWrap').style.display='block' }
  qs('gallery').innerHTML=''; page=0; loadPage(true);
}

/* Set as Wallpaper (best-effort for mobile):
   - If Web Share API Level 2 with files is available, try to fetch and share as file.
   - Else open image in new tab (user can long-press and set wallpaper).
*/
async function setAsWallpaper(){
  if(!modalCurrent) return;
  // try web share file (mobile Chrome/Safari may support)
  try {
    if(navigator.canShare && navigator.canShare({ files: [] })){
      const res = await fetch(modalCurrent.url);
      const blob = await res.blob();
      const file = new File([blob], (modalCurrent.title||'wall').replace(/\s+/g,'_') + '.jpg', { type: blob.type });
      await navigator.share({ files: [file], title: modalCurrent.title, text: 'Set as wallpaper' });
      return;
    }
  } catch (err){ console.warn('share failed', err); }
  // fallback: open in new tab
  window.open(modalCurrent.url, '_blank');
  alert('Image opened — long-press (mobile) or right-click to set as wallpaper.');
}

/* Ambient audio */
function toggleAudio(){
  const a = qs('ambientAudio');
  if(a.paused){ a.play(); qs('audioToggle').textContent = '🔊 Ambient On' } else { a.pause(); qs('audioToggle').textContent = '🎧 Ambient' }
}

/* Parallax simple effect */
function setupParallax(){
  const layer = qs('parallaxLayer');
  window.addEventListener('scroll', () => {
    const sc = window.scrollY;
    layer.style.transform = `translateY(${sc * 0.12}px)`;
    layer.style.opacity = String(Math.max(0, 1 - sc/400));
  }, { passive:true });
}

/* Utils */
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }

function loadCountsAndRender(){
  const counts = loadCounts();
  // maybe show anywhere else
  return counts;
}

/* initial fetch + start */
init();

/* small helper to update trending when counts change - simple render override */
function updateTrending(){
  if(currentTab !== 'trending') return;
  qs('gallery').innerHTML = '';
  const items = filterAndSearch(); // filterAndSearch handles trending sort when tab===trending
  items.forEach(i => renderWallBlock(i, qs('gallery')));
}

/* Ensure loadMoreWrap id exists */
document.addEventListener('DOMContentLoaded', ()=>{
  if(!qs('loadMoreWrap')){
    const wrap = document.createElement('div');
    wrap.id='loadMoreWrap';
    wrap.className='load-more-wrap';
    wrap.innerHTML = '<button id="loadMore" class="btn ghost">Load more</button>';
    document.querySelector('main').appendChild(wrap);
    qs('loadMore').addEventListener('click', ()=> loadPage(false));
  }
});
