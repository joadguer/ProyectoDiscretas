// Helpers y estado
const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>[...root.querySelectorAll(q)];
const API = window.API_BASE || "";

const addHabitModal   = document.getElementById('addHabitModal');
const addHabitInput   = document.getElementById('new-habit-name');
const addHabitCreate  = document.getElementById('createHabitBtn');
const addHabitCancel  = document.getElementById('cancelHabitBtn');

const state = { user: null, profile: null, habits: [] };
// === Sesión persistente (TTL) ===
const SESSION_KEY = 'habits_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

let feedRendering = false;

function saveSession(user, profile){
  const payload = { user, profile, t: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function loadSession(){
  const raw = localStorage.getItem(SESSION_KEY);
  if(!raw) return null;
  try{
    const data = JSON.parse(raw);
    if(Date.now() - (data.t || 0) > SESSION_TTL_MS){
      // vencida
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  }catch{ 
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function clearSession(){
  localStorage.removeItem(SESSION_KEY);
}

// Abre el modal para agregar un nuevo hábito
function openAddHabitModal(){
  if(!addHabitModal) return;
  addHabitModal.classList.add('open');
  addHabitModal.setAttribute('aria-hidden','false');
  // limpia y enfoca
  addHabitInput.value = '';
  setTimeout(()=> addHabitInput.focus(), 50);
}

// Cierra el modal
function closeAddHabitModal(){
  if(!addHabitModal) return;
  addHabitModal.classList.remove('open');
  addHabitModal.setAttribute('aria-hidden','true');
}

// Clic afuera para cerrar
addHabitModal?.addEventListener('click', (e)=>{
  if(e.target.id === 'addHabitModal') closeAddHabitModal();
});
addHabitCancel?.addEventListener('click', closeAddHabitModal);

// Crear hábito
async function createHabitFromModal(){
  const name = (addHabitInput.value || '').trim();
  if(!name){
    showToast?.('Escribe un nombre para el hábito','error','Campo requerido');
    addHabitInput.focus();
    return;
  }
  try{
    await api('/habits', {
      method:'POST',
      body: JSON.stringify({ user_id: state.user.id, name })
    });
    showToast?.('Hábito agregado','success');
    closeAddHabitModal();
    listHabits();           // refresca lista
    renderStats();          // refresca stats
  }catch(e){
    showToast?.(e.message,'error','No se pudo agregar');
  }
}
addHabitCreate?.addEventListener('click', createHabitFromModal);

// Enter para confirmar dentro del input
addHabitInput?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){ e.preventDefault(); createHabitFromModal(); }
});

// Navegación
const pages = ['auth','home','habits','stats','friends','posts','profile', 'view'];

function goto(page){
  pages.forEach(p => { const el = document.getElementById(`page-${p}`); if(el) el.hidden = p!==page; });
  $$('#tabs .tab').forEach(t=> t.classList.toggle('active', t.dataset.page===page)); 
}

$('#tabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tab'); if(!btn) return;
  const page = btn.dataset.page;
  if(!state.user && page!=='auth') return;
  goto(page);
  if(page==='home') renderHome();
  if(page==='habits') listHabits();
  if(page==='stats') renderStats();
  if(page==='friends') renderFriendsPage();
  if(page==='profile') renderProfile();
  if(page==='posts') renderPosts();
});

// Crear post
$('#post-create')?.addEventListener('click', async ()=>{
  const content = ($('#post-content')?.value || '').trim();
  const visibility = $('#post-visibility')?.value || 'public';
  if(!content) return showToast?.('Escribe algo','error');
  try{
    await api('/posts', {method:'POST', body: JSON.stringify({
      author_id: state.user.id, content, visibility
    })});
    $('#post-content').value = '';
    showToast?.('Publicado','success');
    feedPage = 1;
    loadFeed(true);
  }catch(e){ showToast?.(e.message,'error'); }
});


/* codigo para ver perfil de alguien que aparecio en recomendados */
// ---- Perfil público (página "view") ----
const viewState = { authorId:null, username:null, page:1, pageSize:6, loading:false };

function openView(){
  goto('view');
}
function closeView(){
  // volver a Inicio (o a la última vista que prefieras)
  goto(state.user ? 'habits' : 'auth');
  // limpia estado de la página
  viewState.authorId = null;
  viewState.username = null;
  viewState.page = 1;
  viewState.loading = false;
  const p = $('#view-posts'); if(p) p.innerHTML = '';
  $('#view-more')?.style && ($('#view-more').style.display = 'none');
}

// Botón “Volver”
$('#viewBackBtn')?.addEventListener('click', closeView);

// Cargar más
$('#view-load')?.addEventListener('click', ()=>{
  viewState.page += 1;
  loadViewPosts();
});

// Clics “Ver” desde recomendaciones/búsquedas (listener global)
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-act="visit"]');
  if(!btn) return;
  const username = btn.dataset.username;
  if(!username) return;
  showProfilePage(username);
});

// Ir a la página de perfil por username
async function showProfilePage(username){
  if(!state.user?.id){ showToast?.('Inicia sesión para ver perfiles','info'); return; }

  // Prepara UI
  openView();
  $('#view-username').textContent = '@' + username;
  $('#view-bio').textContent = 'Cargando…';
  $('#view-meta').textContent = '';
  $('#view-posts').innerHTML = '<div class="muted">Cargando…</div>';
  $('#view-more').style.display = 'none';
  $('#view-summary').textContent = '';

  try{
    const info = await api(`/public/user/${encodeURIComponent(username)}`);
    viewState.username = info?.user?.username || username;
    viewState.authorId = info?.user?.id;
    viewState.page = 1;

    $('#view-username').textContent = '@' + viewState.username;
    $('#view-bio').textContent = info?.user?.bio || '—';

    const s = info?.summary || {};
    $('#view-meta').textContent = `Ventana: ${s.window_days ?? 7} días — Hábitos: ${s.habits_count ?? 0} — Cumplidos: ${s.done_days ?? 0}`;
    $('#view-summary').innerHTML = `
      <div>Hábitos: <strong>${s.habits_count ?? 0}</strong></div>
      <div>Últimos ${s.window_days ?? 7} días cumplidos: <strong>${s.done_days ?? 0}</strong></div>
      <div class="muted" style="margin-top:6px">${(s.range?.start||'—')} → ${(s.range?.end||'—')}</div>
    `;

    // botón agregar amigo
    $('#view-add-friend')?.addEventListener('click', async ()=>{
      try{
        await addFriend(viewState.authorId);
        showToast?.('Amigo agregado','success');
      }catch(e){ showToast?.(e.message,'error'); }
    });

    // carga posts
    $('#view-posts').innerHTML = '';
    await loadViewPosts();

  }catch(e){
    const msg = (e && e.message) ? e.message : '';
    if (/403/.test(msg) || /no es público/i.test(msg)){
      $('#view-bio').textContent = 'Este perfil no es público.';
      $('#view-posts').innerHTML = '<div class="muted">Sin publicaciones visibles.</div>';
    } else if (/404/.test(msg) || /no encontrado/i.test(msg)){
      $('#view-bio').textContent = 'Usuario no encontrado.';
      $('#view-posts').innerHTML = '';
    } else {
      $('#view-bio').textContent = 'Ocurrió un error.';
      showToast?.(msg || 'Error cargando perfil','error');
    }
  }
}

// Cargar posts de la página “view”
async function loadViewPosts(){
  if(!viewState.authorId || viewState.loading) return;
  viewState.loading = true;

  try{
    const url = `/posts/by_user?author_id=${viewState.authorId}&viewer_id=${state.user.id}&page=${viewState.page}&page_size=${viewState.pageSize}`;
    const data = await api(url);
    const items = Array.isArray(data?.items) ? data.items : [];

    if(viewState.page===1 && items.length===0){
      $('#view-posts').innerHTML = '<div class="muted">No hay publicaciones disponibles.</div>';
    }else{
      const wrap = $('#view-posts');
      for(const p of items){
        const el = document.createElement('div');
        el.className = 'card';
        const author = p.username || 'desconocido';
        const dateStr = new Date(p.created_at).toLocaleString();
        el.innerHTML = `
          <div class="row" style="align-items:center;gap:10px">
            <div class="avatar" style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#a2c,#fd6)"></div>
            <div>
              <div class="muted">@${escapeHtml(author)}</div>
              <div class="muted" style="font-size:12px">${escapeHtml(dateStr)}</div>
            </div>
          </div>
          <div style="margin-top:8px">${escapeHtml(p.content || p.body || '')}</div>
          <div class="muted" style="margin-top:8px;font-size:12px">
            ${(p.visibility === 'friends') ? '👥 Solo amigos' : '🌐 Público'} · ❤️ ${p.likes ?? 0} · 💬 ${p.comments ?? 0}
          </div>
        `;
        wrap.appendChild(el);
      }
    }
    // paginación
    $('#view-more').style.display = (items.length === viewState.pageSize) ? 'flex' : 'none';

  }catch(e){
    showToast?.(e.message || 'Error al cargar publicaciones','error');
  }finally{
    viewState.loading = false;
  }
}

/* fin */

// Feed
// let feedPage = 1;
async function loadFeed(clear=false){
  try{
    const res = await api(`/posts/feed?user_id=${state.user.id}&page=${feedPage}&page_size=8`);
    const list = res.items || [];
    const box = $('#feedList'); if(!box) return;
    if(clear) box.innerHTML = '';
    list.forEach(p => drawPostCard(p, box));  // <- aquí (no agrego can delete para evitar que en el feed se borren los posts)
    if(list.length===0 && clear){ box.innerHTML='<div class="muted">Sin publicaciones aún.</div>'; }
    feedPage++;
  }catch(e){ showToast?.(e.message,'error'); }
}

$('#feed-more')?.addEventListener('click', ()=> loadFeed(false));
let loadingPosts = false;
async function loadPosts(clear=false){
  if (loadingPosts) return;
  loadingPosts = true;
  try{
    const res = await api(`/posts/by_user?author_id=${state.user.id}&viewer_id=${state.user.id}&require_owner=1&page=1&page_size=10`);
    const list = res.items || [];
    const box = $('#myPostsFeedList'); if(!box) return;
    if(clear) box.innerHTML = '';
    list.forEach(p => drawPostCard(p, box, { canDelete: true })); // ⬅️ aquí
    if(list.length===0 && clear){ box.innerHTML='<div class="muted">Sin publicaciones aún.</div>'; }
  } catch(e) {
    showToast?.(e.message, 'error');
  } finally {
    loadingPosts = false;
  }
}


$('#myPostsFeedList')?.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-del]');
  const likeBtn = e.target.closest('[data-like]');
  const cmtBtn  = e.target.closest('[data-cmt]');
  const sendBtn = e.target.closest('[data-sendc]');

  if (delBtn) {
    const postId = Number(delBtn.dataset.del);
    const ok = confirm('¿Eliminar esta publicación?');
    if (!ok) return;
    try {
      await api(`/posts/${postId}?user_id=${state.user.id}`, { method: 'DELETE' });
      document.getElementById(`post-${postId}`)?.remove();
      showToast?.('Publicación eliminada','info');
    } catch (err) {
      showToast?.(err.message, 'error');
    }
    return;
  }

  if (likeBtn) {
    const postId = Number(likeBtn.dataset.like);
    await onToggleLike(postId, likeBtn);
    return;
  }

  if (cmtBtn) {
    const postId = Number(cmtBtn.dataset.cmt);
    const box = document.getElementById(`cbox-${postId}`);
    box.style.display = box.style.display==='none' ? 'block' : 'none';
    if(box.style.display==='block'){ loadComments(postId); }
    return;
  }

  if (sendBtn) {
    const postId = Number(sendBtn.dataset.sendc);
    const inp = document.getElementById(`cinput-${postId}`);
    const text = (inp.value||'').trim(); if(!text) return;
    try{
      await api(`/posts/${postId}/comments`, {method:'POST', body: JSON.stringify({user_id: state.user.id, content: text})});
      inp.value=''; loadComments(postId);
    }catch(e){ showToast?.(e.message,'error'); }
  }
});


// Abre el mismo modal
document.addEventListener("DOMContentLoaded", () => {
  const fab1 = document.getElementById("fabNewPost");
  const fab2 = document.getElementById("fabNewPost2");

  if (fab1) fab1.addEventListener("click", openPostModal);
  if (fab2) fab2.addEventListener("click", openPostModal);
});


// Cuando publicas desde el modal, además de refrescar el feed,
// refresca "Mis Posts" si esa pestaña está visible.
$('#post-submit')?.addEventListener('click', async () => {
  const contentEl = $('#post-content');
  const content = contentEl.value.trim();
  const visibility = $('#post-visibility').value;

  if (!content) {
    showToast('Escribe algo', 'error');
    return;
  }

  try {
    await api('/posts', {
      method: 'POST',
      body: JSON.stringify({
        author_id: state.user.id,
        content,
        visibility
      })
    });

    contentEl.value = ''; // limpia el textarea
    closePostModal();
    showToast('Publicado', 'success');
    console.log('Post submitted, refreshing feed and own posts');


    // Solo recargar el feed y la sección de "Mis Posts"
    renderFeed(false); // refresca Home

    if (!$('#page-posts').hidden) {
      const list = $('#myPostsFeedList');
      if (list) list.innerHTML = ''; // limpia la lista
      await loadPosts(true); // recarga "Mis Posts"
    }

  } catch (e) {
    showToast(e.message, 'error');
  }
});




// function drawPostCard(p, targetEl) {
//   const existing = document.getElementById(`post-${p.id}`);
//   if (existing) {
//     console.warn(`❌ Post ${p.id} ya existe, no se dibuja otra vez.`);
//     return;
//   }

//   const card = document.createElement('div');
//   card.id = `post-${p.id}`;
//   card.className = 'card';
//   card.innerHTML = `
//     <div style="display:flex; gap:10px; align-items:flex-start">
//       <div class="avatar" style="width:40px;height:40px;border-radius:10px"></div>
//       <div style="flex:1">
//         <div style="font-weight:700">@${p.username}</div>
//         <div class="muted" style="font-size:.9rem">${new Date(p.created_at).toLocaleString()}</div>
//         <div style="margin-top:6px; white-space:pre-wrap">${p.content}</div>
//         <div style="display:flex; gap:8px; align-items:center; margin-top:8px">
//           <button class="btn" data-like="${p.id}">❤️ ${p.likes ?? 0}</button>
//           <button class="btn ghost" data-cmt="${p.id}">💬 ${p.comments ?? 0}</button>
//         </div>
//         <div id="cbox-${p.id}" style="display:none; margin-top:8px">
//           <div style="display:flex; gap:6px">
//             <input id="cinput-${p.id}" class="input" placeholder="Escribe un comentario..." />
//             <button class="btn" data-sendc="${p.id}">Enviar</button>
//           </div>
//           <div id="clist-${p.id}" style="margin-top:6px"></div>
//         </div>
//       </div>
//     </div>
//   `;
//   targetEl.appendChild(card);
// }

/* postcard */
// ⬇️ reemplaza la firma de la función
function drawPostCard(p, targetEl, opts = {}) {
  const { canDelete = false } = opts;

  const existing = document.getElementById(`post-${p.id}`);
  if (existing) return;

  const isMine =
    canDelete ||
    p.author_id === state.user?.id ||
    (p.username && p.username === state.user?.username);

  const card = document.createElement('div');
  card.id = `post-${p.id}`;
  card.className = 'card';
  card.innerHTML = `
    <div style="display:flex; gap:10px; align-items:flex-start">
      <div class="avatar" style="width:40px;height:40px;border-radius:10px"></div>
      <div style="flex:1">
        <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
          <div>
            <div style="font-weight:700">@${p.username}</div>
            <div class="muted" style="font-size:.9rem">${new Date(p.created_at).toLocaleString()}</div>
          </div>
          ${isMine ? `<button class="btn ghost" data-del="${p.id}">Eliminar</button>` : ''}
        </div>

        <div style="margin-top:6px; white-space:pre-wrap">${p.content}</div>

        <div style="display:flex; gap:8px; align-items:center; margin-top:8px">
          <button class="btn" data-like="${p.id}">❤️ ${p.likes ?? 0}</button>
          <button class="btn ghost" data-cmt="${p.id}">💬 ${p.comments ?? 0}</button>
        </div>

        <div id="cbox-${p.id}" style="display:none; margin-top:8px">
          <div style="display:flex; gap:6px">
            <input id="cinput-${p.id}" class="input" placeholder="Escribe un comentario..." />
            <button class="btn" data-sendc="${p.id}">Enviar</button>
          </div>
          <div id="clist-${p.id}" style="margin-top:6px"></div>
        </div>
      </div>
    </div>
  `;
  targetEl.appendChild(card);
}


async function loadComments(postId){
  try{
    const res = await api(`/posts/${postId}/comments?page=1&page_size=50`);
    const list = res.items || [];
    const wrap = document.getElementById(`clist-${postId}`); wrap.innerHTML='';
    list.forEach(c=>{
      const row = document.createElement('div');
      row.className='hint';
      row.textContent = `@${c.username}: ${c.content}`;
      wrap.appendChild(row);
    });
  }catch(e){ showToast?.(e.message,'error'); }
}

function renderPosts() {
  console.log('🔁 renderPosts triggered');

  // Esperar al DOM para asegurar que el elemento exista
  const el = $('#myPostsFeedList');
  if (!el) {
    console.warn('⚠️ myPostsFeedList no encontrado, reintentando en 100ms...');
    return setTimeout(renderPosts, 100); // volver a intentar pronto
  }

  el.innerHTML = ''; // limpia siempre
  loadPosts(true);
}




// ---- Switch entre Login y Signup ----
function setAuthView(view){ // 'login' | 'signup'
  $('#auth-login').hidden = view !== 'login';
  $('#auth-signup').hidden = view !== 'signup';
  $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authview === view));
}
$('#go-signup')?.addEventListener('click', (e)=>{ e.preventDefault(); setAuthView('signup'); });
$('#go-login')?.addEventListener('click', (e)=>{ e.preventDefault(); setAuthView('login'); });
$('.auth-tabs')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('.auth-tab');
  if(!btn) return;
  setAuthView(btn.dataset.authview);
});
setAuthView('login');



// home version 3 que incluye recomendaciones, ranking y feedPage
async function renderHome(){
  if(!state.user) return;
  await Promise.all([renderRecommendations(), enableRecCarousel(), renderRanking(), renderFeed(false)]);
}

function enableRecCarousel() {
  const vp = document.getElementById('recCarousel');
  if (!vp) return;

  const slides = Array.from(vp.querySelectorAll('.rec-card'));
  if (slides.length <= 3) return; // no hace falta carrusel

  const host = vp.closest('.card');
  if (host && getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  // Crear flechas
  const prev = document.createElement('button');
  prev.textContent = '‹';
  const next = document.createElement('button');
  next.textContent = '›';

  [prev, next].forEach((btn, i) => {
    Object.assign(btn.style, {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      [i === 0 ? 'left' : 'right']: '8px',
      zIndex: '5',
      width: '40px',
      height: '40px',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--bg-soft)',
      color: 'var(--text)',
      boxShadow: 'var(--shadow)',
      cursor: 'pointer',
      display: 'grid',
      placeItems: 'center',
      fontSize: '20px',
      lineHeight: '1'
    });
    host.appendChild(btn);
  });

  let index = 0;
  const pageSize = 3;

  function showPage(i) {
    index = Math.max(0, Math.min(slides.length - pageSize, i));
    slides.forEach(c => (c.style.display = 'none'));
    slides.slice(index, index + pageSize).forEach(c => (c.style.display = 'flex'));
    updateArrows();
  }

  function updateArrows() {
    prev.disabled = index <= 0;
    next.disabled = index >= slides.length - pageSize;
  }

  prev.onclick = () => showPage(index - pageSize);
  next.onclick = () => showPage(index + pageSize);

  showPage(0); // inicializa mostrando los primeros 3
}


// version nueva Recomendaciones → /friends/suggested?user_id=&limit=&window=
async function renderRecommendations() {
  const wrap = $('#recCarousel');
  if (!wrap) return;
  wrap.innerHTML = '<div class="muted">Cargando recomendaciones...</div>';

  try {
    const data = await api(`/friends/suggested?user_id=${state.user.id}&limit=12&window=30`);

    // 1) Detecta el array correcto (users, items o el primer array del objeto)
    let raw = [];
    if (Array.isArray(data?.users)) raw = data.users;
    else if (Array.isArray(data?.items)) raw = data.items;
    else if (Array.isArray(data)) raw = data;               // por si devuelve el array directo
    else {
      const firstArray = Object.values(data || {}).find(v => Array.isArray(v));
      raw = Array.isArray(firstArray) ? firstArray : [];
    }

    // 2) Normaliza llaves para que tu UI sea consistente
    const normalized = raw.map(u => {
      const id = u.id ?? u.user_id ?? u.uid ?? u.candidate ?? null;
      const username = u.username ?? u.user_name ?? u.handle ?? '';
      const full_name = u.full_name ?? u.name ?? u.display_name ?? '';
      const bio = u.bio ?? u.profile?.bio ?? '';
      return id == null ? null : { id, username, full_name, bio };
    }).filter(Boolean);

    // 3) Dedupe por id (si algún id viene como string y otro como número, unifícalo)
    const seen = new Set();
    const users = normalized.filter(u => {
      const key = String(u.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4) Render
    wrap.innerHTML = '';
    if (users.length === 0) {
      wrap.innerHTML = `<div class="muted">No hay sugerencias ahora.</div>`;
      // DEBUG opcional
      console.log('[recs] payload:', data);
      return;
    }

    const frag = document.createDocumentFragment();
    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.innerHTML = `
        <div class="rec-top">
          <div class="rec-ava"></div>
          <div>
            <div class="rec-user">@${u.username}</div>
            <div class="muted">${u.full_name || ''}</div>
          </div>
        </div>
        <div class="rec-bio">${u.bio ? escapeHtml(u.bio) : '—'}</div>
        <div class="rec-actions">
          <button class="btn" data-act="visit" data-username="${u.username}">Ver</button>
          <button class="btn primary" data-act="add" data-id="${u.id}">Agregar</button>
        </div>
      `;
      frag.appendChild(card);
      // Activar botón de agregar amigo
      
      const addBtn = card.querySelector('[data-act="add"]');
      if (addBtn) {
        addBtn.onclick = async () => {
          try {
            await addFriend(Number(addBtn.dataset.id));
            showToast?.('Amigo agregado','success');
            renderHome(); // Refresca la vista de inicio
            } catch(e) {
              showToast?.(e.message,'error');
            }
          };
        }
    });
    wrap.appendChild(frag);
    enableRecCarousel();
  } catch (e) {
    wrap.innerHTML = `<div class="muted">No hay sugerencias ahora.</div>`;
    console.error('[recs] error:', e);
  }
}

// Ranking → /public/rank?window=7&page=1&page_size=12
let rankLoading = false;
let rankAbortCtrl = null;

async function renderRanking() {
  const list = $('#rankList'); if (!list) return;
  if (rankLoading) { try { rankAbortCtrl?.abort(); } catch {} }
  rankLoading = true;
  rankAbortCtrl = new AbortController();

  list.innerHTML = '<div class="muted">Cargando ranking...</div>';

  try {
    const data = await api(`/public/rank?window=7&page=1&page_size=10`, { signal: rankAbortCtrl.signal });
    const raw = Array.isArray(data?.items) ? data.items
               : Array.isArray(data)       ? data
               : [];

    // --- DEDUPE por user-id/username ---------------------------------------
    const seen = new Set();
    const unique = [];
    for (const r of raw) {
      const key = String(r.user_id ?? r.id ?? r.uid ?? r.username); // elige la mejor llave disponible
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    // Si hay menos de 10. Simplemente muestra los que hay.
    const top = unique.slice(0, 10);

    list.innerHTML = '';
    if (top.length === 0) {
      list.innerHTML = `<div class="muted">No disponible.</div>`;
      return;
    }

    top.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'rank-item';
      row.innerHTML = `
        <div class="badge">${i + 1}</div>
        <div class="post-ava"></div>
        <div style="flex:1">
          <div class="post-user">@${r.username}</div>
          <div class="muted">${r.done_days} días cumplidos</div>
        </div>
      `;
      list.appendChild(row);
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    list.innerHTML = `<div class="muted">No disponible.</div>`;
    console.error('[rank] error:', e);
  } finally {
    rankLoading = false;
  }
}





// ===== FEED v2 (Home) =====
let feedPage = 1;
let feedLoading = false;
const renderedIds = new Set();

function formatTs(ts){ try{ return new Date(ts).toLocaleString(); }catch{ return ts } }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

async function renderFeed(loadMore = false) {
  console.log('renderFeed triggered, loadMore=', loadMore);
  if (feedRendering) return;  
  feedRendering = true;

  const list = $('#feedList');
  if (!list) {
    feedRendering = false;
    return;
  }

  if (!loadMore) {
    feedPage = 1;
    list.innerHTML = '';
    renderedIds.clear();
  }
  console.log('🧼 Limpieza: innerHTML y renderedIds.clear() ejecutado');


  // quita “Cargar más” previo
  const oldMore = $('#feedMoreBtn');
  if (oldMore) oldMore.parentElement?.remove();

  try {
    const data = await api(`/posts/feed?user_id=${state.user.id}&page=${feedPage}&page_size=8`);
    const items = Array.isArray(data?.items) ? data.items : [];

    if (items.length === 0 && feedPage === 1) {
      list.innerHTML = `<div class="muted">Aún no hay publicaciones.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    items.forEach(p => {
      console.log('👉 Procesando post id:', p.id);

      if (renderedIds.has(p.id)) return;
      renderedIds.add(p.id);

      const liked = !!p.liked_by_me;                   // si tu backend aún no lo envía, queda en false
      const likeCount = Number(p.likes ?? 0);
      const cmtCount  = Number(p.comments ?? 0);

      const card = document.createElement('article');
      card.className = 'post';
      card.dataset.postId = p.id;
      card.innerHTML = `
        <div class="post-head">
          <div class="post-ava"></div>
          <div>
            <div class="post-user">@${escapeHtml(p.username || p.author || '')}</div>
            <div class="muted">${formatTs(p.created_at)}</div>
          </div>
        </div>

        <div class="post-body" style="margin-top:8px; white-space:pre-wrap;">
          ${escapeHtml(p.content)}
        </div>

        <div class="post-actions" style="display:flex; gap:10px; align-items:center; margin-top:8px">
          <button class="btn btn-like ${liked ? 'is-liked' : ''}" data-like="${p.id}">
            ❤️ <span data-like-count>${likeCount}</span>
          </button>
          <button class="btn ghost btn-cmt" data-cmt="${p.id}">
            💬 <span data-cmt-count>${cmtCount}</span>
          </button>
        </div>

        <div class="cbox" id="cbox-${p.id}" hidden style="margin-top:8px">
          <div style="display:flex; gap:6px">
            <input class="input" id="cinput-${p.id}" maxlength="600" placeholder="Escribe un comentario..." />
            <button class="btn" data-sendc="${p.id}">Enviar</button>
          </div>
          <div class="clist" id="clist-${p.id}" style="margin-top:6px"></div>
        </div>
      `;
      frag.appendChild(card);
    });

    list.appendChild(frag);

    if (items.length === 8) {
      const moreWrap = document.createElement('div');
      moreWrap.style = 'display:flex;justify-content:center;margin-top:8px';
      moreWrap.innerHTML = `<button class="btn" id="feedMoreBtn">Cargar más</button>`;
      list.appendChild(moreWrap);
      $('#feedMoreBtn').onclick = () => {
        if (feedLoading) return;
        moreWrap.remove();
        feedPage++;
        renderFeed(true);
      };
    }
  } catch (e) {
    showToast?.(e.message, 'error');
  } finally {
    feedLoading = false;
    feedRendering = false;
  }
}

// este es el listener que me sirve para like / abrir-comentarios / enviar-comentario
// Delegación en el contenedor del feed
$('#feedList')?.addEventListener('click', async (e) => {
  const likeBtn = e.target.closest('[data-like]');
  const cmtBtn  = e.target.closest('[data-cmt]');
  const sendBtn = e.target.closest('[data-sendc]');
  if (!likeBtn && !cmtBtn && !sendBtn) return;

  // LIKE
  if (likeBtn) {
    const postId = Number(likeBtn.dataset.like);
    await onToggleLike(postId, likeBtn);
    return;
  }

  // ABRIR/OCULTAR COMENTARIOS
  if (cmtBtn) {
    const postId = Number(cmtBtn.dataset.cmt);
    const box = $(`#cbox-${postId}`);
    box.hidden = !box.hidden;
    if (!box.hidden) {
      await loadComments(postId);
    }
    return;
  }

  // ENVIAR COMENTARIO
  if (sendBtn) {
    const postId = Number(sendBtn.dataset.sendc);
    const input = $(`#cinput-${postId}`);
    const text = (input.value || '').trim();
    if (!text) return;

    try {
      await api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ user_id: state.user.id, content: text })
      });
      input.value = '';
      await loadComments(postId);

      // ++ contador visible
      const counter = sendBtn
        .closest('.post')
        .querySelector('[data-cmt-count]');
      counter.textContent = String(Number(counter.textContent || 0) + 1);
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  }
});


async function onToggleLike(postId, btnEl) {
  // UI optimista
  const countEl = btnEl.querySelector('[data-like-count]');
  const wasLiked = btnEl.classList.contains('is-liked');
  const prev = Number(countEl.textContent || 0);
  btnEl.classList.toggle('is-liked');
  countEl.textContent = String(prev + (wasLiked ? -1 : 1));

  try {
    const data = await api(`/posts/${postId}/like?user_id=${state.user.id}`, { method: 'POST' });
    // corrige con el valor real del backend por si hubo carrera
    btnEl.classList.toggle('is-liked', data.status === 'liked');
    countEl.textContent = String(data.like_count ?? 0);
  } catch (e) {
    // revierte en caso de error
    btnEl.classList.toggle('is-liked', wasLiked);
    countEl.textContent = String(prev);
    showToast?.(e.message, 'error');
  }
}

async function loadComments(postId, page=1, page_size=50) {
  try {
    // tu endpoint devuelve LISTA (no {items}), así que úsalo directo
    const comments = await api(`/posts/${postId}/comments?page=${page}&page_size=${page_size}`);
    const listEl = $(`#clist-${postId}`);
    if (!listEl) return;
    listEl.innerHTML = comments.map(c => `
      <div class="comment">
        <b>@${escapeHtml(c.username)}</b>
        <span class="muted" style="margin-left:6px">${formatTs(c.created_at)}</span>
        <div>${escapeHtml(c.content)}</div>
      </div>
    `).join('');
  } catch (e) {
    showToast?.(e.message,'error');
  }
}


function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

/********* Modal nueva publicación **********/
const postModal = $('#postModal');
const openPostModal = ()=>{ postModal.classList.add('open'); postModal.setAttribute('aria-hidden','false'); $('#post-content').value=''; };
const closePostModal = ()=>{ postModal.classList.remove('open'); postModal.setAttribute('aria-hidden','true'); };

// $('#fabNewPost')?.addEventListener('click', openPostModal);
$('#post-cancel')?.addEventListener('click', closePostModal);
postModal?.addEventListener('click', (e)=>{ if(e.target.id==='postModal') closePostModal(); });

const postBtn = $('#post-submit');
if (postBtn) {
  postBtn.replaceWith(postBtn.cloneNode(true));  // limpia eventos previos
  $('#post-submit').addEventListener('click', async () => {
    const contentEl = $('#post-content');
    const content = contentEl.value.trim();
    const visibility = $('#post-visibility').value;

    if (!content) {
      showToast('Escribe algo', 'error');
      return;
    }

    try {
      await api('/posts', {
        method: 'POST',
        body: JSON.stringify({
          author_id: state.user.id,
          content,
          visibility,
        }),
      });

      contentEl.value = '';
      closePostModal();
      showToast('Publicado', 'success');
      console.log('Post submitted, refreshing feed and own posts');

      renderFeed(false);

      if (!$('#page-posts').hidden) {
        const list = $('#myPostsFeedList');
        if (list) list.innerHTML = '';
        await loadPosts(true);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}


/********* Integración con tabs **********/
function showHomeIfNeeded(page){
  if(page==='home'){ renderHome(); }
}
// Hookea tu navegación existente:
const _goto = goto;
goto = function(page){
  _goto(page);
  showHomeIfNeeded(page);
};

// fin de version 3

// visibilidad del perfil
function hydrateVisibilityForm(){
  // Carga los valores actuales (si backend ya envía is_public/bio en profile)
  const p = state.profile || {};
  if($('#isPublic')) $('#isPublic').checked = !!p.is_public;
  if($('#bio')) $('#bio').value = p.bio || '';
}

$('#pv-save')?.addEventListener('click', async ()=>{
  if(!state.user) return;
  const is_public = !!$('#isPublic').checked;
  const bio = ($('#bio').value || '').slice(0,200);
  try{
    const resp = await api('/profile/visibility', {
      method:'PUT',
      body: JSON.stringify({ user_id: state.user.id, is_public, bio })
    });
    state.profile = Object.assign({}, state.profile||{}, resp.profile||{});
    saveSession?.(state.user, state.profile);
    hydrateVisibilityForm();
    const hint = $('#pv-hint'); if(hint){ hint.textContent = 'Guardado'; setTimeout(()=> hint.textContent='', 1800); }
    showToast?.('Preferencias actualizadas','success');
  }catch(e){ showToast?.(e.message,'error'); }
});


function normalizeErrorMessage(raw){
  if(!raw) return 'Ocurrió un error';
  // Intenta leer JSON común del backend: {detail} o {message}
  try{
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return j.detail || j.message || (typeof j === 'string' ? j : JSON.stringify(j));
  }catch(_){
    return String(raw);
  }
}

function showToast(message, type='info', title){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icons = {success:'✅', error:'⚠️', info:'ℹ️'};
  el.innerHTML = `
    <div class="icon">${icons[type] || 'ℹ️'}</div>
    <div class="body">
      ${title ? `<div class="title">${title}</div>` : ''}
      <div class="msg">${message}</div>
    </div>
    <button class="close" aria-label="Cerrar">✕</button>
  `;
  el.querySelector('.close').onclick = () => dismiss();
  wrap.appendChild(el);

  let timer = setTimeout(dismiss, 3500);
  function dismiss(){
    clearTimeout(timer);
    el.style.animation = 'toast-out .16s ease-in forwards';
    setTimeout(()=> el.remove(), 160);
  }
  return {dismiss};
}

// Envuelve fetch para devolver mensajes legibles
async function api(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const res = await fetch((window.API_BASE || '') + path, {...opts, headers});
  if(!res.ok){
    let msg;
    try { msg = normalizeErrorMessage(await res.json()); }
    catch { msg = normalizeErrorMessage(await res.text()); }
    throw new Error(msg || res.statusText);
  }
  return res.json();
}


// Tema
function setTheme(mode){
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('habits-theme', mode);
}
(function initTheme(){
  const saved = localStorage.getItem('habits-theme') || 'light';
  setTheme(saved);
})();
$('#themeBtn').onclick = ()=> setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
$('#themeBtn2').onclick = $('#themeBtn').onclick;



// Control UI según sesión
function updateAuthUI(){
  document.body.setAttribute('data-auth', state.user ? 'user' : 'guest');
  if(state.user){
    renderProfile();
    // v1.0: ir a home
    goto('home');
    renderHome();

  }else{
    goto('auth');
    setAuthView('login');
  }
}


// recomendados 
async function fetchSuggested(limit=12, window=30){
  return api(`/friends/suggested?user_id=${state.user.id}&limit=${limit}&window=${window}`);
}

// friends
async function getFriends(){
  const res = await api(`/friends/list?user_id=${state.user.id}`);
  return res.friends || [];
}
async function addFriend(targetId){
  return api('/friends/add', {method:'POST', body: JSON.stringify({user_id: state.user.id, target_id: targetId})});
}
async function removeFriend(targetId){
  return api(`/friends/remove?user_id=${state.user.id}&target_id=${targetId}`, {method:'DELETE'});
}
async function searchPublicUsers(q, page=1, page_size=20){
  const res = await api(`/public/users?q=${encodeURIComponent(q||'')}&page=${page}&page_size=${page_size}`);
  return res.items || [];
}


function drawFriends(list){
  const wrap = $('#friendsList'); if(!wrap) return;
  wrap.innerHTML = '';
  if(!list.length){
    wrap.innerHTML = '<div class="muted">Aún no tienes amigos. Usa el buscador para encontrar perfiles públicos.</div>';
    return;
  }
  list.forEach(u=>{
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `
      <div class="friend-avatar"></div>
      <div class="friend-meta">
        <div class="friend-name">@${u.username}</div>
        <div class="friend-bio">${(u.bio||'').slice(0,120)}</div>
      </div>
      <div class="friend-actions">
        <button class="btn ghost" data-id="${u.id}">Eliminar</button>
      </div>
    `;
    card.querySelector('button').onclick = async (ev)=>{
      const id = Number(ev.currentTarget.dataset.id);
      try{
        await removeFriend(id);
        showToast?.('Amigo eliminado','info');
        renderFriendsPage();
      }catch(e){ showToast?.(e.message,'error'); }
    };
    wrap.appendChild(card);
  });
}


// contador de pagina principal
async function renderFriendsPage(){
  try{
    // 1) lista actual
    const friends = await getFriends();
    drawFriends(friends);

    // 2) preparar buscador (debounce)
    const myIds = new Set(friends.map(f=>f.id));
    const input = $('#friendsSearch');
    let t = null;
    input.oninput = ()=>{
      clearTimeout(t);
      t = setTimeout(async ()=>{
        const q = input.value.trim();
        if(!q){
          $('#friendsSearchResults').innerHTML = '<div class="muted">Empieza a escribir para buscar perfiles públicos…</div>';
          return;
        }
        try{
          const results = await searchPublicUsers(q, 1, 30);
          // Excluirme y a mis amigos
          const filtered = results.filter(u => u.id !== state.user.id);
          drawSearchResults(filtered, myIds);
        }catch(e){ showToast?.(e.message,'error'); }
      }, 250); // debounce
    };

    // placeholder inicial
    $('#friendsSearchResults').innerHTML = '<div class="muted">Empieza a escribir para buscar perfiles públicos…</div>';
  }catch(e){
    console.error(e);
    showToast?.(e.message,'error','No se pudo cargar Amigos');
  }
}


function drawSearchResults(items, myFriendsIds){
  const wrap = $('#friendsSearchResults'); if(!wrap) return;
  wrap.innerHTML = '';
  if(!items.length){
    wrap.innerHTML = '<div class="muted">Sin resultados.</div>';
    return;
  }
  items.forEach(u=>{
    const isFriend = myFriendsIds.has(u.id);
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `
      <div class="friend-avatar"></div>
      <div class="friend-meta">
        <div class="friend-name">@${u.username}</div>
        <div class="friend-bio">${(u.bio||'').slice(0,120)}</div>
      </div>
      <div class="friend-actions">
        ${isFriend
          ? '<button class="btn ghost" disabled>Ya es amigo</button>'
          : `<button class="btn" data-add="${u.id}">Agregar</button>`}
      </div>
    `;
    const btn = card.querySelector('[data-add]');
    if(btn){
      btn.onclick = async ()=>{
        try{
          await addFriend(Number(btn.dataset.add));
          showToast?.('Amigo agregado','success');
          renderFriendsPage();
        }catch(e){ showToast?.(e.message,'error'); }
      };
    }
    wrap.appendChild(card);
  });
}


// ranking
async function fetchRank(window=7, page=1, page_size=10){
  return api(`/public/rank?window=${window}&page=${page}&page_size=${page_size}`);
}




// Auth
 $('#loginBtn').onclick = async ()=>{
   try{
     const username = $('#login-username').value.trim();
     const password = $('#login-pass').value;
     if(!username || !password) throw new Error('Completa usuario y contraseña');
     const data = await api('/login', {method:'POST', body: JSON.stringify({username, password})});
     state.user = data.user;
     state.profile = data.profile || null;
    saveSession(state.user, state.profile); // guarda sesión persistente
    updateAuthUI();
    showToast('¡Bienvenido!', 'success'); // si usas toasts
   }catch(e){ alert(e.message); /* o showToast(e.message,'error') */ }
 };

 $('#signupBtn').onclick = async () => {
  try {
    const email      = $('#su-email').value.trim();
    const username   = $('#su-username').value.trim();
    const password   = $('#su-pass').value;
    const first_name = $('#su-firstname').value.trim();
    const last_name  = $('#su-lastname').value.trim();
    const birth_date = $('#su-birth').value.trim(); // 'YYYY-MM-DD'
    const gender     = $('#su-gender').value || null;

    // --- Validaciones ---
    if (!email || !username || !password || !first_name || !last_name) {
      showToast?.('Todos los campos obligatorios deben estar completos','error','Campos requeridos');
      return;
    }

    // Email válido
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast?.('Correo electrónico no válido','error');
      return;
    }

    // Username mínimo 3 caracteres
    if (username.length < 3) {
      showToast?.('El usuario debe tener al menos 3 caracteres','error');
      return;
    }

    // Password mínimo 6 caracteres
    if (password.length < 6) {
      showToast?.('La contraseña debe tener al menos 6 caracteres','error');
      return;
    }

    // Fecha de nacimiento válida y lógica
    // Fecha de nacimiento válida y lógica
    if (birth_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(birth_date)) {
        showToast?.('La fecha debe tener el formato YYYY-MM-DD','error');
        return;
      }

      const [y, m, d] = birth_date.split('-').map(Number);
      const date = new Date(y, m - 1, d);

      // Validar que corresponda al mismo año, mes y día (descarta 2023-02-31 por ejemplo)
      if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
        showToast?.('Fecha de nacimiento no válida','error');
        return;
      }

      // Edad mínima
      const today = new Date();
      let age = today.getFullYear() - y;
      if (
        today.getMonth() < m - 1 ||
        (today.getMonth() === m - 1 && today.getDate() < d)
      ) {
        age--;
      }
      if (age < 5) {
        showToast?.('La edad mínima es de 5 años','error');
        return;
      }
    }

    const payload = { email, username, password, first_name, last_name, birth_date: birth_date || null, gender };
    const data = await api('/signup', { method: 'POST', body: JSON.stringify(payload) });

    state.user = data.user;
    state.profile = data.profile || null;
    saveSession(state.user, state.profile);

    updateAuthUI();
    showToast('Cuenta creada','success');
  } catch (e) {
    showToast?.(e.message, 'error', 'Error');
  }
};


$('#logoutBtn').onclick = ()=>{
  state.user = null;
  clearSession();                    // ← limpia la sesión guardada
  showToast('Sesión cerrada', 'info');
  updateAuthUI();
};


$('#ep-save')?.addEventListener('click', async ()=>{
  if(!state.user) return;

  const payload = {
    user_id: state.user.id,
    first_name: ($('#ep-first')?.value || '').trim(),
    last_name:  ($('#ep-last')?.value  || '').trim(),
    gender:     $('#ep-gender')?.value || null,
    birth_date: $('#ep-birth')?.value  || null
  };

  if(!payload.first_name || !payload.last_name){
    showToast?.('Nombre y apellido son requeridos','error','Campos requeridos');
    return;
  }

  try{
    const res = await api('/profile', { method:'PUT', body: JSON.stringify(payload) });
    state.profile = res.profile || state.profile;
    // si usas sesión persistente, actualiza el storage
    if(typeof saveSession === 'function') saveSession(state.user, state.profile);
    renderProfile();
    showToast?.('Perfil actualizado','success');
    const hint = $('#ep-hint'); if(hint){ hint.textContent = 'Cambios guardados.'; setTimeout(()=> hint.textContent='', 2000); }
  }catch(e){
    showToast?.(e.message,'error','No se pudo actualizar');
  }
});


// Hábitos
async function listHabits(){
  const grid = $('#habitGrid'); grid.innerHTML='';
  const data = await api(`/habits?user_id=${state.user.id}`);
  state.habits = data.habits;
  if(state.habits.length===0){
    const empty = document.createElement('div');
    empty.className='card';
    empty.innerHTML = '<h3>No tienes hábitos aún</h3><p class="muted">Toca el botón “+” para agregar tu primer hábito.</p>';
    grid.appendChild(empty);
  }
  state.habits.forEach(h=>{
    const card = document.createElement('div');
    card.className='card habit-row';
    card.innerHTML = `
      <div>
        <div class="habit-name">${h.name}</div>
        <div class="hint">Toque para registrar hoy</div>
      </div>
      <div class="habit-actions">
        <button class="btn" data-act="mark" data-id="${h.id}">✓ Hoy</button>
        <button class="btn ghost" data-act="del" data-id="${h.id}">Eliminar</button>
      </div>`;
    card.addEventListener('click', async (ev)=>{
      const isBtn = ev.target.closest('button');
      const id = (isBtn && isBtn.dataset.id) || h.id;
      const act = isBtn && isBtn.dataset.act;
      if(act==='del'){ await removeHabit(id); return }
      openModal(id);
    });
    grid.appendChild(card);
  });
}

document.getElementById('addHabitBtn')?.addEventListener('click', openAddHabitModal);

async function removeHabit(id){
  await api(`/habits/${id}?user_id=${state.user.id}`, {method:'DELETE'});
  listHabits(); renderStats();
}

// Modal “marcar hoy”
let modalHabitId = null;
function todayStr(){
  const d = new Date(); const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function openModal(habitId){
  modalHabitId = habitId;
  const h = state.habits.find(x=>x.id===habitId);
  $('#modalTitle').textContent = 'Registrar: ' + (h?.name||'Hábito');
  $('#modalDesc').textContent = '¿Cumpliste el hábito hoy ('+todayStr()+')?';
  $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden','false');
}
function closeModal(){ $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden','true') }
$('#closeModal').onclick = closeModal;
$('#modal').addEventListener('click', (e)=>{ if(e.target.id==='modal') closeModal() });
$('#doneBtn').onclick = async ()=>{ await markToday(modalHabitId,1); closeModal() };
$('#skipBtn').onclick = async ()=>{ await markToday(modalHabitId,0); closeModal() };
async function markToday(habitId, value){
  if(!habitId) return;
  await api('/logs/mark_today', {method:'POST', body: JSON.stringify({user_id: state.user.id, habit_id: habitId, value})});
  renderStats();
}

// Estadísticas
function pct(n,d){ return d? Math.round((n/d)*100):0 }
async function renderStats(){
  const grid = $('#statsGrid'); grid.innerHTML='';
  const data = await api(`/stats/weekly?user_id=${state.user.id}`);
  if(data.items.length===0){
    const empty = document.createElement('div');
    empty.className='card';
    empty.innerHTML = '<h3>Sin datos</h3><p class="muted">Agrega hábitos y marca tu progreso para ver estadísticas.</p>';
    grid.appendChild(empty); return;
  }
  data.items.forEach(row=>{
    const percent = pct(row.done, row.total_days);
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <h3>${row.habit_name}</h3>
      <div class="muted" style="margin-bottom:8px">Últimos 7 días: ${row.done}/${row.total_days} cumplidos (${percent}%)</div>
      <div class="progress"><div class="bar" style="width:${percent}%"></div></div>
      <div class="hint" style="margin-top:8px">Hoy: ${data.today} — ${row.today_done? '✅ cumplido' : '—'}</div>
    `;
    grid.appendChild(card);
  });
}

// Perfil
function renderProfile(){
  // Encabezado 
  $('#p-username').textContent = state.user?.username || 'Usuario';
  $('#p-email').textContent    = state.user?.email || 'correo@example.com';

  // Bloque extra
  const p = state.profile || {};
  const extra = $('#profile-extra');
  if(!extra) return;

  // Calcular edad si hay birth_date (YYYY-MM-DD)
  let edad = '-';
  if(p.birth_date){
    try{
      const [y,m,d] = p.birth_date.split('-').map(Number);
      const b = new Date(y, (m||1)-1, d||1);
      const now = new Date();
      edad = now.getFullYear() - b.getFullYear() - ((now.getMonth()<b.getMonth() || (now.getMonth()==b.getMonth() && now.getDate()<b.getDate())) ? 1 : 0);
      if(isNaN(edad)) edad = '-';
    }catch(_){ edad = '-'; }
  }
  hydrateVisibilityForm(); // carga el formulario de visibilidad

  extra.innerHTML = `
    <div class="profile-item">
      <div class="k">Nombre</div>
      <div class="v">${p.first_name || '-'}</div>
    </div>
    <div class="profile-item">
      <div class="k">Apellido</div>
      <div class="v">${p.last_name || '-'}</div>
    </div>
    <div class="profile-item">
      <div class="k">Género</div>
      <div class="v">${p.gender || '-'}</div>
    </div>
    <div class="profile-item">
      <div class="k">Fecha de nacimiento</div>
      <div class="v">${p.birth_date || '-'}</div>
    </div>
    <div class="profile-item">
      <div class="k">Edad</div>
      <div class="v">${edad}</div>
    </div>
  `;
}


/* ver perfiles */


(function tryRestoreSession(){
  const s = loadSession();
  if(s && s.user){
    state.user = s.user;
    state.profile = s.profile || null;
  }
})();
// Init
updateAuthUI();
