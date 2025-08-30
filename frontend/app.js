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
const pages = ['auth','home','habits','stats','friends','profile'];

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
});


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

// render home v2 con recomendaciones y ranking
async function renderHome(){
  try{
    const [recs, rankWindow] = await Promise.all([
      fetchSuggested(12, 30),
      Promise.resolve($('#rankWindow')?.value || '7')
    ]);
    renderRecs(recs.items || []);
    const rk = await fetchRank(Number(rankWindow), 1, 12);
    renderRank(rk);
  }catch(e){
    showToast?.(e.message,'error','No se pudo cargar Inicio');
  }
}
$('#rankWindow')?.addEventListener('change', async ()=>{
  try{
    const rk = await fetchRank(Number($('#rankWindow').value), 1, 12);
    renderRank(rk);
  }catch(e){ showToast?.(e.message,'error'); }
});


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

function renderRecs(items){
  const grid = $('#recGrid'); if(!grid) return;
  grid.innerHTML = '';
  if(!items || items.length===0){
    grid.innerHTML = '<div class="muted">No hay recomendaciones por ahora.</div>';
    return;
  }
  items.forEach(u=>{
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <div class="user-avatar"></div>
      <div class="user-meta">
        <div class="user-name">@${u.username}</div>
        <div class="user-bio">${(u.bio||'').slice(0,120)}</div>
      </div>
      <div class="user-actions">
        <button class="btn" data-id="${u.id}">Agregar</button>
      </div>
    `;
    card.querySelector('button').onclick = async (ev)=>{
      const targetId = Number(ev.currentTarget.dataset.id);
      try{
        await api('/friends/add', {method:'POST', body: JSON.stringify({user_id: state.user.id, target_id: targetId})});
        showToast?.('Amigo agregado','success');
        renderHome(); // refresca recomendaciones
      }catch(e){ showToast?.(e.message,'error'); }
    };
    grid.appendChild(card);
  });
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

function renderRank(resp){
  const grid = $('#rankGrid'); if(!grid) return;
  grid.innerHTML = '';
  const items = resp?.items || [];
  if(items.length===0){
    grid.innerHTML = '<div class="muted">Sin datos para esta ventana.</div>'; return;
  }
  items.forEach((r,idx)=>{
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <div class="rank-pos">${idx+1}</div>
      <div class="user-avatar"></div>
      <div style="display:flex; flex-direction:column">
        <div class="user-name">@${r.username}</div>
        <div class="muted">${r.done_days} días cumplidos</div>
      </div>
    `;
    grid.appendChild(row);
  });
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


(function tryRestoreSession(){
  const s = loadSession();
  if(s && s.user){
    state.user = s.user;
    state.profile = s.profile || null;
  }
})();
// Init
updateAuthUI();
