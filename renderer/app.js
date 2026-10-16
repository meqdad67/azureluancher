(() => {
const $ = (s, r = document) => r.querySelector(s);
const api = window.azure.invoke;
const S = {
  page: 'home', st: null, versions: null, logs: [], prog: {}, states: {}, err: {},
  mods: { type: 'mod', source: 'modrinth', q: '', sort: 'relevance', results: [], total: 0, offset: 0, loading: false, view: 'browse', installed: [], busy: {} },
  news: { items: null, loading: false, err: false },
  M: null, offlineOpen: false, srv: null, update: null, tab: 'content', sub: '',
  packs: { q: '', sort: 'relevance', results: [], total: 0, offset: 0, loading: false, busy: null },
};
const lang = () => (S.st ? S.st.settings.language : 'ar');
const t = (k, v = {}) => { let s = (I18N[lang()][k] ?? I18N.en[k] ?? k); for (const [a, b] of Object.entries(v)) s = s.replaceAll(`{${a}}`, b); return s; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IC = {
  back: 'M15 18l-6-6 6-6', world: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18', image: 'M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5M9 9h.01', file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5', news: 'M5 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM8 8h7M8 12h7M8 16h4', ext: 'M7 17L17 7M8 7h9v9',
  play: 'M8 5v14l11-7z', inst: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', pack: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', mods: 'M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7', term: 'M4 17l6-6-6-6M12 19h8', plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  dl: 'M12 3v12M7 10l5 5 5-5M4 21h16', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', edit: 'M4 20h4L19 9l-4-4L4 16v4z', stop: 'M7 7h10v10H7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', check: 'M5 12l5 5L20 7', cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
};
const ic = (n, fill) => `<svg viewBox="0 0 24 24"${fill ? ' style="fill:currentColor;stroke:none"' : ''}><path d="${IC[n]}"/></svg>`;
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge', 'azure'];
const LN = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge', azure: 'Azure Client' };
const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));
const gb = (mb) => (mb / 1024).toFixed(1).replace(/\.0$/, '') + ' GB';
const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}${t('h')} ${m}${t('m')}` : `${m}${t('m')}`; };
const errText = (e) => { const k = 'e_' + String(e.message || e).replace(/^Error: /, ''); return I18N[lang()][k] ? t(k) : String(e.message || e); };
function toast(msg, kind = '') { const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg; $('#toasts').append(d); setTimeout(() => d.remove(), kind === 'err' ? 6000 : 3200); }
const fail = (e) => toast(errText(e), 'err');
const inst = () => S.st.instances.find((i) => i.id === S.st.selectedInstance);
const acc = () => S.st.accounts.find((a) => a.id === S.st.selectedAccount);
const stateOf = (id) => S.states[id] || (S.st.running.includes(id) ? 'running' : 'idle');

function applyTheme() {
  const dc = $('#dcText'); if (dc) dc.textContent = t('discord_join');
  try { if (localStorage.getItem('az-dc')) { const b = $('.dc'); if (b) b.classList.add('seen'); } } catch {}
  const s = S.st.settings;
  document.documentElement.lang = s.language; document.documentElement.dir = s.language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.style.setProperty('--az', s.accent);
  document.body.classList.toggle('mac', window.azure.platform === 'darwin');
  document.body.classList.toggle('perf', s.perfMode !== false);
}
function avatar(a) {
  if (a.skinData) return `<div class="avatar skin" style="background-image:url('${a.skinData}')"></div>`;
  const key = a.type === 'microsoft' ? a.uuid : a.name;
  return `<div class="avatar">${esc(a.name[0].toUpperCase())}<img src="https://mc-heads.net/avatar/${encodeURIComponent(key)}/64" alt=""></div>`;
}
const instIcon = (i) => `<div class="inst-ic" style="--h:${i.hue}">${ic('cube')}</div>`;

/* ---------------- shell ---------------- */
function renderNav() {
  const a = acc();
  const btn = (p, i, k) => `<button class="nav-btn ${S.page === p ? 'on' : ''}" data-act="nav" data-p="${p}" title="${t(k)}">${ic(i)}</button>`;
  $('#nav').innerHTML = `<button class="nav-avatar" data-act="nav" data-p="accounts" title="${t('nav_accounts')}">${a ? avatar(a) : '<div class="avatar">?</div>'}</button><div class="nav-sep"></div>`
    + btn('home', 'grid', 'nav_home') + btn('mods', 'mods', 'nav_mods') + btn('packs', 'pack', 'nav_packs') + btn('instances', 'inst', 'nav_instances') + btn('console', 'term', 'nav_console')
    + `<div class="nav-sep"></div><button class="nav-btn" data-act="newInst" title="${t('new_instance')}">${ic('plus')}</button><div class="nav-sep"></div>`
    + `<div class="nav-insts">${S.st.instances.map((x) => `<button class="nav-inst ${S.page === 'instance' && S.st.selectedInstance === x.id ? 'on' : ''}" data-act="openInst" data-id="${x.id}" title="${esc(x.name)}">${instIcon(x)}${stateOf(x.id) === 'running' ? '<i class="nav-badge"></i>' : ''}</button>`).join('')}</div>`
    + `<div class="nav-spacer"></div><button class="nav-btn ${S.page === 'settings' ? 'on' : ''}" data-act="nav" data-p="settings" title="${t('nav_settings')}">${ic('gear')}</button>`;
}
function render() {
  if (S.page === 'instance' && !inst()) S.page = 'instances';
  applyTheme(); renderNav();
  const p = { home: pHome, instances: pInstances, instance: pInstance, packs: pPacks, mods: pMods, accounts: pAccounts, console: pConsole, settings: pSettings }[S.page]();
  $('#page').innerHTML = `<div id="updBar">${updHTML()}</div>` + p;
  if (S.page === 'console') { const c = $('#con'); if (c) c.scrollTop = c.scrollHeight; }
  if (S.page === 'mods') afterMods();
  if (S.page === 'instance') afterInstance();
  if (S.page === 'packs') afterPacks();
  if (S.page === 'home') refreshServer();
  paintProgress();
  drawNews(); if (!S.news.items && !S.news.loading && !S.news.err) loadNews();
}

/* ---------------- home ---------------- */
function playHTML() {
  const log = S.st.playLog || {}, days = [];
  for (let n = 6; n >= 0; n--) { const d = new Date(); d.setDate(d.getDate() - n); days.push({ n, label: n === 0 ? t('today') : d.toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { weekday: 'short' }), e: log[d.toLocaleDateString('en-CA')] || { s: 0, n: 0, max: 0 } }); }
  const tot = days.reduce((x, d) => x + d.e.s, 0), ses = days.reduce((x, d) => x + d.e.n, 0), peak = Math.max(1, ...days.map((d) => d.e.s));
  return `<div class="card play-card"><div class="pt-big">${fmtTime(tot)}</div><div class="sub">${t('last7')}</div>
    <div class="pt-chart">${tot ? '' : `<span class="pt-empty">${t('no_play')}</span>`}${days.map((d) => `<div class="pt-col"><div class="pt-bar" style="height:${Math.round((d.e.s / peak) * 100)}%"></div><small class="${d.n === 0 ? 'now' : ''}">${d.label}</small></div>`).join('')}</div>
    <div class="pt-stats"><div><b>${fmtTime(ses ? Math.round(tot / ses) : 0)}</b><span>${t('avg_session')}</span></div><div><b>${fmtTime(Math.max(0, ...days.map((d) => d.e.max)))}</b><span>${t('longest')}</span></div><div><b>${days.filter((d) => d.e.s > 0).length} / 7</b><span>${t('days_played')}</span></div></div></div>`;
}
function pHome() {
  const i = inst(), a = acc();
  if (!i) return `<div class="empty"><div class="inst-ic" style="--h:210;width:84px;height:84px;border-radius:24px">${ic('cube')}</div><h3>${t('no_instance')}</h3><p>${t('no_instance_sub')}</p><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>`;
  return `<div class="home-head"><div><h1>${t('greet')}${a ? '، ' + esc(a.name) : ''}</h1><p>${t('greet_sub')}</p></div>
    <button class="browse-btn" data-act="nav" data-p="instances">${ic('inst')}<div><b>${t('browse_lib')}</b><small>${t('browse_lib_sub')}</small></div></button></div>
  <div class="quick"><span class="quick-l">${ic('grid')} ${t('quick_play')}</span><i class="quick-sep"></i><div class="quick-list">${S.st.instances.map((x) => `<button class="quick-i ${x.id === i.id ? 'sel' : ''}" data-act="quickPlay" data-id="${x.id}" title="${esc(x.name)} — ${esc(x.mcVersion)}">${instIcon(x)}</button>`).join('')}</div></div>
  <div id="status" class="statusline" style="margin-top:10px"></div>
  <div class="home-cols"><section><h3 class="sec">${t('srv_title')}</h3>${srvCardHTML()}</section><section><h3 class="sec">${t('playtime')}</h3>${playHTML()}</section></div>`;
}
function paintProgress() {
  const i = inst(); if (!i) return;
  const b = $('#playBtn');
  const stt = stateOf(i.id), p = S.prog[i.id], er = S.err[i.id];
  if (b) {
    b.className = 'play' + (b.dataset.sm ? ' sm' : '') + (stt === 'preparing' ? ' busy' : stt === 'running' ? ' stop' : '');
    const lvl = stt === 'preparing' && p ? p.pct : 0;
    b.innerHTML = `<span class="water" style="--lvl:${lvl}"></span>` + (stt === 'running' ? `${ic('stop', 1)}<span>${t('stop')}</span>` : stt === 'preparing' ? `<span class="spin"></span><span>${Math.round(lvl * 100)}%</span>` : `${ic('play', 1)}<span>${t('play')}</span>`);
  }
  let txt = '';
  if (stt === 'preparing' && p) { const L = p.label || {}; txt = t('p_' + L.key, { major: L.major, loader: LN[L.loader] || L.loader, task: L.task, total: L.total }); }
  else if (stt === 'running') txt = `<b>${t('running')}</b>`;
  else if (er) txt = `<span class="err">${esc(er)}</span>`;
  const s = $('#status'); if (s) s.innerHTML = txt;
}

/* ---------------- instances ---------------- */
function pInstances() {
  return `<div class="page-head"><div><h2>${t('instances_title')}</h2><p>${t('instances_sub')}</p></div><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>
  <div class="inst-grid">${S.st.instances.map((i) => `<div class="inst ${i.id === S.st.selectedInstance ? 'sel' : ''}" data-act="openInst" data-id="${i.id}">
    <div class="inst-top">${instIcon(i)}<div class="grow"><h4>${esc(i.name)}</h4><div class="sub">${esc(i.mcVersion)}</div></div></div>
    <div class="row wrap"><span class="chip ghost">${LN[i.loader]}${i.loaderVersion ? ' ' + esc(i.loaderVersion) : ''}</span>${i.playTime ? `<span class="chip ghost">${fmtTime(i.playTime)}</span>` : ''}</div>
    <div class="inst-act"><button class="btn sm grow" data-act="editInst" data-id="${i.id}">${ic('edit')} ${t('edit')}</button><button class="btn sm icon" data-act="folderOf" data-id="${i.id}" title="${t('open_folder')}">${ic('folder')}</button><button class="btn sm icon danger" data-act="delInst" data-id="${i.id}" title="${t('delete')}">${ic('trash')}</button></div></div>`).join('')}
    <button class="inst add-tile" data-act="newInst">${ic('plus')}<b>${t('new_instance')}</b></button></div>`;
}

/* ---- instance modal ---- */
async function ensureVersions() { if (!S.versions) S.versions = await api('mc:versions'); }
async function openInstModal(id) {
  const s = S.st.settings, e = id ? S.st.instances.find((x) => x.id === id) : null;
  S.M = e ? { mode: 'edit', id, name: e.name, mcVersion: e.mcVersion, mcType: e.mcType, loader: e.loader, loaderVersion: e.loaderVersion, loaderFull: e.loaderFull, ram: e.ram || 0, jvmArgs: e.jvmArgs || '', loaders: [], lloading: false, q: '', f: { release: true, snapshot: s.showSnapshots, old: s.showOld } }
    : { mode: 'create', name: '', mcVersion: '', mcType: 'release', loader: 'vanilla', loaderVersion: '', loaderFull: '', ram: 0, jvmArgs: '', loaders: [], lloading: false, q: '', f: { release: true, snapshot: s.showSnapshots, old: s.showOld } };
  if (e) { const v = null; }
  drawModal();
  try { await ensureVersions(); } catch (er) { fail(er); }
  if (S.M && !S.M.mcVersion && S.versions) { const v = S.versions.find((x) => x.type === 'release'); if (v) setVersion(v.id, 'release', true); }
  drawModal();
  if (S.M && S.M.loader !== 'vanilla') loadLoaders(true);
}
function setVersion(id, type, silent) { S.M.mcVersion = id; S.M.mcType = type === 'snapshot' ? 'snapshot' : 'release'; if (!silent && S.M.loader !== 'vanilla') loadLoaders(); }
async function loadLoaders(keep) {
  const M = S.M; if (!M || M.loader === 'vanilla') return;
  M.lloading = true; M.loaders = []; drawLoaderPart();
  try {
    const list = await api('loader:versions', M.loader, M.mcVersion);
    if (S.M !== M) return;
    M.loaders = list;
    const cur = list.find((x) => x.id === M.loaderVersion);
    const pick = (keep && cur) || list.find((x) => x.stable) || list[0];
    M.loaderVersion = pick ? pick.id : ''; M.loaderFull = pick ? pick.full || '' : '';
  } catch { M.loaders = []; M.loaderVersion = ''; }
  M.lloading = false; drawLoaderPart();
}
const filteredVersions = () => {
  const M = S.M; if (!S.versions) return [];
  const q = M.q.trim().toLowerCase();
  return S.versions.filter((v) => (v.type === 'release' && M.f.release) || (v.type === 'snapshot' && M.f.snapshot) || ((v.type === 'old_beta' || v.type === 'old_alpha') && M.f.old)).filter((v) => !q || v.id.toLowerCase().includes(q)).slice(0, 300);
};
const vlistHTML = () => { if (!S.versions) return `<div class="empty"><span class="spin"></span></div>`; return filteredVersions().map((v) => `<button class="vitem ${v.id === S.M.mcVersion ? 'on' : ''}" data-act="pickVer" data-id="${esc(v.id)}" data-type="${v.type}"><span>${esc(v.id)}</span><small>${v.type === 'release' ? '' : v.type === 'snapshot' ? t('t_snapshot') : t('t_old')}</small></button>`).join(''); };
const loaderPartHTML = () => {
  const M = S.M; if (M.loader === 'vanilla') return '';
  if (M.lloading) return `<div class="help"><span class="spin"></span> ${t('loading')}</div>`;
  if (!M.loaders.length) return `<div class="notice">${t('loader_unavailable')}</div>`;
  return `<label class="f">${t('f_loader_version')}</label><select class="select" data-ch="loaderVer">${M.loaders.map((l, k) => `<option value="${esc(l.id)}" ${l.id === M.loaderVersion ? 'selected' : ''}>${esc(l.id)}${k === 0 ? ' — ' + t('latest') : ''}</option>`).join('')}</select>`;
};
function drawLoaderPart() { const e = $('#loaderPart'); if (e) e.innerHTML = loaderPartHTML(); }
function drawModal() {
  const M = S.M, r = $('#modal-root'); if (!M) { r.innerHTML = ''; return; }
  const tot = S.st.totalRam;
  r.innerHTML = `<div class="backdrop" data-act="backdrop"><div class="modal" role="dialog">
    <h3>${M.mode === 'edit' ? t('edit_instance') : t('create_instance')}</h3>
    <div class="field"><label class="f">${t('f_name')}</label><input class="input" id="mName" maxlength="40" value="${esc(M.name)}" placeholder="Minecraft ${esc(M.mcVersion)}" data-in="mName"></div>
    <div class="field"><label class="f">${t('f_version')}</label>
      <div class="row wrap" style="margin-bottom:10px"><input class="input grow" style="max-width:280px" placeholder="${t('f_search_version')}" value="${esc(M.q)}" data-in="vq">
        ${['release', 'snapshot', 'old'].map((k) => `<label class="row" style="gap:7px;font-size:13.5px;cursor:pointer"><span class="switch"><input type="checkbox" data-ch="vf" data-k="${k}" ${M.f[k] ? 'checked' : ''}><i></i></span>${t('t_' + k)}</label>`).join('')}</div>
      <div class="vlist" id="vlist">${vlistHTML()}</div></div>
    <div class="field"><label class="f">${t('f_loader')}</label><div class="seg">${LOADERS.map((l) => `<button class="${M.loader === l ? 'on' : ''}" data-act="pickLoader" data-l="${l}">${LN[l]}</button>`).join('')}</div><div id="loaderPart" style="margin-top:12px">${loaderPartHTML()}</div></div>
    <div class="field"><label class="f">${t('f_ram')}</label>
      <label class="row" style="gap:10px;margin-bottom:10px;cursor:pointer"><span class="switch"><input type="checkbox" data-ch="ramOn" ${M.ram ? 'checked' : ''}><i></i></span>${t('ram_custom')}</label>
      ${M.ram ? `<div class="row"><input type="range" id="mRam" min="512" max="${tot}" step="256" value="${M.ram}" style="--p:${(M.ram / tot) * 100}%" data-in="mRam"><b id="mRamV" style="min-width:70px">${gb(M.ram)}</b></div>` : `<div class="help">${t('ram_default')} (${gb(S.st.settings.maxRam)})</div>`}</div>
    <div class="field"><label class="f">${t('f_jvm')}</label><input class="input" dir="ltr" value="${esc(M.jvmArgs)}" data-in="mJvm" placeholder="-XX:+UseG1GC"></div>
    <div class="modal-foot"><button class="btn" data-act="closeModal">${t('cancel')}</button><button class="btn primary" data-act="saveInst">${ic('check')} ${M.mode === 'edit' ? t('save') : t('create')}</button></div></div></div>`;
  const on = $('.vitem.on'); if (on) on.scrollIntoView({ block: 'center' });
}
async function saveInst() {
  const M = S.M;
  if (!M.mcVersion) return fail(new Error('missing_version'));
  if (M.loader !== 'vanilla' && !M.loaderVersion) return fail(new Error(t('loader_unavailable')));
  const data = { name: M.name.trim() || `Minecraft ${M.mcVersion}`, mcVersion: M.mcVersion, mcType: M.mcType, loader: M.loader, loaderVersion: M.loaderVersion, loaderFull: M.loaderFull, ram: M.ram, jvmArgs: M.jvmArgs };
  try { S.st = M.mode === 'edit' ? await api('instance:update', M.id, data) : await api('instance:create', data); S.M = null; drawModal(); render(); toast(M.mode === 'edit' ? t('toast_saved') : t('toast_created'), 'ok'); } catch (e) { fail(e); }
}

/* ---------------- mods ---------------- */
function pMods() {
  const i = inst();
  if (!i) return `<div class="empty"><h3>${t('pick_instance_first')}</h3><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>`;
  return `<div class="page-head"><div><h2>${t('mods_title')}</h2><p>${t('mods_sub')}</p></div>
    <div class="row"><span class="sub">${t('for_instance')}</span><select class="select" style="width:240px" data-ch="pickInst">${S.st.instances.map((x) => `<option value="${x.id}" ${x.id === i.id ? 'selected' : ''}>${esc(x.name)} (${esc(x.mcVersion)} ${LN[x.loader]})</option>`).join('')}</select></div></div>` + modsBody(i);
}
function modsBody(i) {
  const m = S.mods;
  const vanillaBlock = m.type === 'mod' && i.loader === 'vanilla';
  return `  <div class="toolbar"><div class="seg chips">${['mod', 'resourcepack', 'shader'].map((k) => `<button class="${m.type === k ? 'on' : ''}" data-act="modType" data-k="${k}">${t('tab_' + k)}</button>`).join('')}</div>
    <div class="seg"><button class="${m.view === 'browse' ? 'on' : ''}" data-act="modView" data-k="browse">${t('browse')}</button><button class="${m.view === 'installed' ? 'on' : ''}" data-act="modView" data-k="installed">${t('installed')}</button></div>
    ${m.view === 'browse' ? `<div class="seg"><button class="${m.source === 'modrinth' ? 'on' : ''}" data-act="modSrc" data-k="modrinth">Modrinth</button><button class="${m.source === 'curseforge' ? 'on' : ''}" data-act="modSrc" data-k="curseforge">CurseForge</button></div>` : ''}
    <span class="grow"></span><button class="btn" data-act="perfMods">${ic('play')} ${t('perf_mods')}</button><button class="btn icon" data-act="modRefresh" title="${t('refresh')}">${ic('refresh')}</button><button class="btn primary" data-act="modAddLocal" title="${t('add_local')}">${ic('plus')} ${t('add')}</button></div>
  ${vanillaBlock ? `<div class="notice">${t('vanilla_hint')}</div>` : ''}
  ${m.view === 'browse' && m.source === 'curseforge' && !S.st.settings.curseforgeKey ? `<div class="notice info">${t('cf_hint')} <button class="btn sm" data-act="nav" data-p="settings">${t('nav_settings')}</button></div>` : ''}
  ${m.view === 'browse' ? `<div class="toolbar"><input class="input grow" id="mq" placeholder="${t('search_ph')}" value="${esc(m.q)}" data-in="mq"><select class="select" style="width:190px" data-ch="msort">${['relevance', 'downloads', 'updated'].map((k) => `<option value="${k}" ${m.sort === k ? 'selected' : ''}>${t('sort_' + k)}</option>`).join('')}</select><button class="btn primary" data-act="doSearch">${ic('search')}</button></div><div id="mres"></div>` : `<div id="mres"></div>`}`;
}
const modRow = (h) => `<div class="mod-row"><div class="mod-ic">${ic('mods')}${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy">` : ''}</div><div class="mod-info"><b>${esc(h.title)}</b> <span class="sub">${t('by')} ${esc(h.author)} · ${fmtNum(h.downloads)} ${t('downloads')}</span><p>${esc(h.description)}</p></div>
  <button class="btn primary sm" data-act="modInstall" data-src="${h.source}" data-id="${esc(h.id)}" data-title="${esc(h.title)}" ${S.mods.busy[h.source + h.id] ? 'disabled' : ''}>${S.mods.busy[h.source + h.id] ? `<span class="spin"></span> ${t('installing')}` : `${ic('dl')} ${t('install')}`}</button></div>`;
function drawMods() {
  const m = S.mods, el = $('#mres'); if (!el) return;
  if (m.view === 'installed') {
    el.innerHTML = m.installed.length ? m.installed.map((f) => `<div class="mod-row ${f.enabled ? '' : 'off'}"><div class="mod-ic">${ic('mods')}${f.icon ? `<img src="${esc(f.icon)}" alt="">` : ''}</div><div class="mod-info"><b>${esc(f.name)}</b> <span class="sub">${esc(f.version)} ${f.source === 'local' ? '· ' + t('local') : '· ' + f.source}</span><p>${esc(f.file)}</p></div><label class="switch"><input type="checkbox" data-ch="modToggle" data-f="${esc(f.file)}" ${f.enabled ? 'checked' : ''}><i></i></label><button class="btn sm icon danger" data-act="modDel" data-f="${esc(f.file)}">${ic('trash')}</button></div>`).join('') : `<div class="empty"><p>${t('none_installed')}</p></div>`;
    return;
  }
  if (m.loading && !m.results.length) { el.innerHTML = `<div class="empty"><span class="spin"></span></div>`; return; }
  el.innerHTML = m.results.length ? m.results.map(modRow).join('') + (m.results.length < m.total ? `<div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-act="moreMods">${m.loading ? '<span class="spin"></span>' : t('load_more')}</button></div>` : '') : `<div class="empty"><p>${t('no_results')}</p></div>`;
}
async function runSearch(more) {
  const i = inst(), m = S.mods; if (!i || (m.type === 'mod' && i.loader === 'vanilla')) { m.results = []; return drawMods(); }
  if (!more) { m.offset = 0; m.results = []; }
  m.loading = true; drawMods();
  try { const r = await api('mods:search', i.id, { source: m.source, type: m.type, query: m.q, offset: m.offset, sort: m.sort }); m.results = m.results.concat(r.hits); m.total = r.total; m.offset = m.results.length; }
  catch (e) { fail(e); m.results = []; }
  m.loading = false; drawMods();
}
async function loadInstalled() { const i = inst(); if (!i) return; try { S.mods.installed = await api('mods:list', i.id, S.mods.type); } catch { S.mods.installed = []; } drawMods(); }
function afterMods() { if (S.mods.view === 'installed') loadInstalled(); else if (!S.mods.results.length && !S.mods.loading) runSearch(); else drawMods(); }


/* ---------------- instance page (like SKLauncher: content / worlds / gallery / files) ---------------- */
function pInstance() {
  const i = inst(); if (!i) return '';
  const stt = stateOf(i.id);
  const last = i.lastPlayed ? new Date(i.lastPlayed).toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'short' }) : t('never');
  const tabs = [['content', 'mods'], ['worlds', 'world'], ['gallery', 'image'], ['files', 'folder']];
  return `<div style="margin-bottom:14px"><button class="back-link" data-act="backInst">${ic('back')} ${t('inst_back')}</button></div>
  <div class="card inst-head"><div class="inst-ic big" style="--h:${i.hue}">${ic('cube')}</div>
    <div class="grow"><div class="row wrap" style="gap:8px;margin-bottom:6px"><span class="chip ghost">${LN[i.loader]}${i.loaderVersion ? ' ' + esc(i.loaderVersion) : ''}</span><span class="chip">MC ${esc(i.mcVersion)}</span></div><h2>${esc(i.name)}</h2></div>
    <button id="playBtn" class="play sm" data-sm="1" data-act="play"></button></div>
  <div class="inst-stats">
    <div class="stat"><b>${stt === 'running' ? t('running') : stt === 'preparing' ? t('preparing') : t('ready')}</b><span>${t('status')}</span></div>
    <div class="stat"><b>${last}</b><span>${t('last_played')}</span></div>
    <div class="stat"><b>${fmtTime(i.playTime || 0)}</b><span>${t('play_time')}</span></div>
    <button class="btn v" data-act="editInst" data-id="${i.id}">${ic('gear')}<span>${t('inst_settings')}</span></button>
    <button class="btn icon" data-act="folderOf" data-id="${i.id}" title="${t('open_folder')}">${ic('folder')}</button>
    <button class="btn icon danger" data-act="delInst" data-id="${i.id}" title="${t('delete')}">${ic('trash')}</button></div>
  <div id="status" class="statusline"></div>
  <div class="utabs">${tabs.map(([k, icn]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="instTab" data-k="${k}">${ic(icn)} ${t('itab_' + k)}</button>`).join('')}</div>
  <div id="itab" style="margin-top:16px">${S.tab === 'content' ? modsBody(i) : '<div class="empty"><span class="spin"></span></div>'}</div>`;
}
const fmtDate = (ms) => new Date(ms).toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
async function afterInstance() {
  const i = inst(); if (!i) return;
  if (S.tab === 'content') return afterMods();
  const tab = S.tab, el = $('#itab'); if (!el) return;
  try {
    let html = '';
    if (tab === 'worlds') {
      const w = await api('inst:worlds', i.id);
      html = `<div class="toolbar"><button class="btn" data-act="instOpen" data-p="saves">${ic('folder')} ${t('open_saves')}</button></div>` + (w.length ? w.map((x) => `<div class="mod-row"><div class="mod-ic">${ic('world')}</div><div class="mod-info"><b>${esc(x.name)}</b><p>${fmtDate(x.mtime)}</p></div><button class="btn sm" data-act="instOpen" data-p="${esc('saves/' + x.name)}">${ic('folder')} ${t('open_folder')}</button></div>`).join('') : `<div class="empty"><p>${t('no_worlds')}</p></div>`);
    } else if (tab === 'gallery') {
      const g = await api('inst:shots', i.id);
      html = `<div class="toolbar"><button class="btn" data-act="instOpen" data-p="screenshots">${ic('folder')} ${t('open_shots')}</button></div>` + (g.length ? `<div class="shots">${g.map((x) => `<img src="${esc(x.url)}" alt="" loading="lazy" data-act="instOpen" data-p="${esc('screenshots/' + x.name)}" title="${esc(x.name)}">`).join('')}</div>` : `<div class="empty"><p>${t('no_shots')}</p></div>`);
    } else {
      const f = await api('inst:files', i.id, S.sub);
      const crumb = S.sub ? S.sub.split('/').slice(0, -1).join('/') : null;
      html = `<div class="toolbar"><button class="btn" data-act="instOpen" data-p="${esc(S.sub)}">${ic('folder')} ${t('open_folder')}</button>${crumb !== null ? `<button class="btn" data-act="filesGo" data-p="${esc(crumb)}">${ic('back')} ${t('up_dir')}</button>` : ''}<span class="sub dim" dir="ltr">/${esc(S.sub)}</span></div>` + (f.length ? f.map((x) => `<div class="mod-row" style="cursor:pointer" data-act="${x.dir ? 'filesGo' : 'instOpen'}" data-p="${esc((S.sub ? S.sub + '/' : '') + x.name)}"><div class="mod-ic">${ic(x.dir ? 'folder' : 'file')}</div><div class="mod-info"><b dir="ltr">${esc(x.name)}</b><p>${x.dir ? '' : fmtSize(x.size) + ' · '}${fmtDate(x.mtime)}</p></div></div>`).join('') : `<div class="empty"><p>${t('none_installed')}</p></div>`);
    }
    if (S.tab === tab && $('#itab')) $('#itab').innerHTML = html;
  } catch (e) { fail(e); }
}

/* ---------------- accounts ---------------- */
function pAccounts() {
  return `<div class="page-head"><div><h2>${t('accounts_title')}</h2><p>${t('accounts_sub')}</p></div><div class="row"><button class="btn primary" data-act="addMs">${ic('user')} ${t('add_ms')}</button><button class="btn" data-act="toggleOff">${ic('plus')} ${t('add_off')}</button></div></div>
  <div class="notice info">${t('skin_hint')}</div>
  ${S.offlineOpen ? `<div class="card" style="margin-bottom:16px"><div class="row"><input class="input" id="offName" maxlength="16" dir="ltr" placeholder="${t('nick')}" style="max-width:300px"><button class="btn primary" data-act="addOff">${t('add')}</button></div><div class="help">${t('off_note')}</div></div>` : ''}
  ${S.st.accounts.length ? S.st.accounts.map((a) => `<div class="acc-row ${a.id === S.st.selectedAccount ? 'sel' : ''}">${avatar(a)}<div class="grow"><b>${esc(a.name)}</b> <span class="chip ${a.type === 'microsoft' ? 'ok' : 'ghost'}">${t(a.type)}</span>${a.skinData ? ` <span class="chip">${t('skin_set')}</span>` : ''}</div><button class="btn sm" data-act="skinPick" data-id="${a.id}">${t('skin_choose')}</button>${a.skinData ? `<button class="btn sm" data-act="skinClear" data-id="${a.id}">${t('skin_clear')}</button>` : ''}${a.id === S.st.selectedAccount ? `<span class="chip">${ic('check')} ${t('selected')}</span>` : `<button class="btn sm" data-act="selAcc" data-id="${a.id}">${t('select')}</button>`}<button class="btn sm icon danger" data-act="delAcc" data-id="${a.id}" title="${t('remove')}">${ic('trash')}</button></div>`).join('') : `<div class="empty"><h3>${t('no_account')}</h3></div>`}`;
}

/* ---------------- console ---------------- */
function pConsole() {
  return `<div class="page-head"><div><h2>${t('console_title')}</h2></div><div class="row"><button class="btn sm" data-act="copyLog">${t('copy_log')}</button><button class="btn sm" data-act="clearLog">${t('clear_log')}</button></div></div>
  <div class="console" id="con">${S.logs.length ? S.logs.map(lineHTML).join('') : `<span class="dim">${t('log_empty')}</span>`}</div>`;
}
const lineHTML = (l) => `<div class="ln ${l.kind}">${esc(l.line)}</div>`;

/* ---------------- settings ---------------- */
function pSettings() {
  const s = S.st.settings, tot = S.st.totalRam, warn = s.maxRam > tot * 0.75;
  const sw = (k, label) => `<div class="set-line"><span>${label}</span><label class="switch"><input type="checkbox" data-ch="setBool" data-k="${k}" ${s[k] ? 'checked' : ''}><i></i></label></div>`;
  return `<div class="page-head"><div><h2>${t('settings_title')}</h2></div></div><div class="set-grid">
  <div class="card"><h3>${t('performance')}</h3>
    <div class="ram-big" id="ramV">${gb(s.maxRam)}<small>${t('sys_ram')}: ${gb(tot)}</small></div><div class="help" style="margin:0 0 10px">${t('ram_max')}</div>
    <input type="range" min="1024" max="${tot}" step="256" value="${s.maxRam}" style="--p:${(s.maxRam / tot) * 100}%" data-in="ramMax" data-ch="ramMax"><div class="notice" id="ramWarn" style="margin-top:12px;${warn ? '' : 'display:none'}">${t('ram_warn')}</div>
    <div class="field" style="margin-top:18px"><label class="f">${t('ram_min')}: <span id="ramMinV">${gb(s.minRam)}</span></label><input type="range" min="256" max="${Math.min(s.maxRam, 4096)}" step="256" value="${Math.min(s.minRam, s.maxRam)}" style="--p:${(Math.min(s.minRam, s.maxRam) / Math.min(s.maxRam, 4096)) * 100}%" data-in="ramMin" data-ch="ramMin"></div>
    <div class="field"><label class="f">${t('java_path')}</label><div class="row"><input class="input" dir="ltr" readonly value="${esc(s.javaPath || '')}" placeholder="${t('java_auto_desc')}"><button class="btn sm" data-act="pickJava">${t('browse_btn')}</button>${s.javaPath ? `<button class="btn sm" data-act="clearJava">${t('clear')}</button>` : ''}</div></div>
    <div class="field"><label class="f">${t('jvm_args')}</label><input class="input" dir="ltr" value="${esc(s.jvmArgs)}" data-ch="setText" data-k="jvmArgs" placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions"></div></div>
  <div class="side-stack"><div class="card"><h3>${t('language')}</h3><div class="seg"><button class="${s.language === 'ar' ? 'on' : ''}" data-act="setLang" data-l="ar">العربية</button><button class="${s.language === 'en' ? 'on' : ''}" data-act="setLang" data-l="en">English</button></div>
    <h3 style="margin-top:20px">${t('accent')}</h3><div class="swatches">${['#2f8bff', '#38e1ff', '#7c6cff', '#3ddc97', '#ff7a59', '#ff5fa2'].map((c) => `<button class="sw ${s.accent === c ? 'on' : ''}" style="background:${c}" data-act="setAccent" data-c="${c}" aria-label="${c}"></button>`).join('')}</div></div>
  <div class="card"><h3>${t('game')}</h3>${sw('fullscreen', t('fullscreen'))}${sw('suspendInGame', t('suspend_in_game'))}${sw('optimizedJvm', t('opt_jvm'))}${sw('highPerfGpu', t('high_gpu'))}${sw('ultraLight', t('ultra_light'))}${sw('showSnapshots', t('show_snapshots'))}${sw('showOld', t('show_old'))}${sw('shareWithServer', t('share_server'))}${sw('closeToTray', t('close_to_tray'))}<div class="help">${t('close_to_tray_help')}</div>${sw('perfMode', t('perf_mode'))}<div class="help">${t('perf_help')}</div>${sw('seeLauncherSkins', t('see_skins'))}<div class="help">${t('see_skins_help')}</div><div class="help">${t('share_help')}</div>
    ${s.fullscreen ? '' : `<div class="set-line"><span>${t('resolution')}</span><div class="row" dir="ltr"><input class="input" style="width:88px" type="number" value="${s.width}" data-ch="setNum" data-k="width"><span>×</span><input class="input" style="width:88px" type="number" value="${s.height}" data-ch="setNum" data-k="height"></div></div>`}</div>
  <div class="card"><h3>${t('integrations')}</h3><label class="f">${t('cf_key')}</label><input class="input" type="password" dir="ltr" value="${esc(s.curseforgeKey)}" data-ch="setText" data-k="curseforgeKey"><div class="help">${t('cf_key_help')}</div>
    <div class="row" style="margin-top:16px;justify-content:space-between"><button class="btn sm" data-act="openData">${ic('folder')} ${t('open_data')}</button><span class="dim" dir="ltr">${t('about', { v: S.st.version })}</span></div></div></div></div>`;
}
async function setSettings(patch, rerender = true) { try { S.st.settings = await api('settings:set', patch); if (rerender) render(); } catch (e) { fail(e); } }


/* ---------------- news panel ---------------- */
function drawNews() {
  const el = $('#newsPanel'); if (!el) return;
  const n = S.news;
  const body = n.loading ? '<div class="empty"><span class="spin"></span></div>' : n.err ? `<div class="empty"><p>${t('news_err')}</p><button class="btn sm" data-act="newsRefresh">${t('news_retry')}</button></div>`
    : (n.items || []).map((x) => `<button class="news-i" data-act="openLink" data-u="${esc(x.link)}"><span class="news-img">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : ''}</span><span class="news-t"><b>${esc(x.title)}</b><small>${x.date ? fmtDate(new Date(x.date).getTime()) : ''}</small></span></button>`).join('');
  const dcSvg = (document.querySelector('.titlebar .dc svg') || { outerHTML: '' }).outerHTML;
  el.innerHTML = `<div class="news-head">${ic('news')}<b>${t('news')}</b><button class="icon-btn" data-act="newsRefresh" title="${t('refresh')}">${ic('refresh')}</button></div>
    <div class="news-list">${body}</div>
    <div class="news-card"><div class="news-card-t"><b>Azure Launcher</b><button class="icon-btn" data-act="discord">${ic('ext')}</button></div><p>${t('azure_card')}</p></div>
    <div class="news-foot"><button class="icon-btn" data-act="discord" title="Discord">${dcSvg}</button><button class="icon-btn" data-act="openSite" title="Website">${ic('world')}</button></div>`;
}
async function loadNews() {
  S.news.loading = true; S.news.err = false; drawNews();
  try { S.news.items = await api('news:get'); } catch { S.news.err = true; S.news.items = null; }
  S.news.loading = false; drawNews();
}

/* ---------------- server card / updates / packs ---------------- */
function srvCardHTML() {
  const s = S.srv, on = s && s.server && s.server.online;
  return `<div class="srv-row" id="srvCard"><img class="srv-ic" src="../build/icon.png" alt=""><div class="grow"><div class="srv-name"><b>${esc(s ? s.name : 'AzureSMP')}</b><span class="chip ${on ? 'ok' : 'ghost'}">${s ? (on ? t('srv_online') : t('srv_offline')) : t('srv_checking')}</span></div>
    <div class="sub dim" dir="ltr">${esc(s ? s.host : 'AzureSMP.asrv.qzz.io')}</div>
    <div class="sub">${on ? s.server.players.online + '/' + s.server.players.max + ' ' + t('srv_players') : ''}${s && s.launcher ? ' · ' + s.launcher.open + ' ' + t('srv_launcher') : ''}</div></div>
    <div class="srv-act"><button class="btn sm" data-act="srvCopy">${t('srv_copy')}</button><button class="btn primary sm" data-act="srvJoin">${t('srv_join')}</button></div></div>`;
}
async function refreshServer() { try { S.srv = await api('server:status'); } catch {} const el = $('#srvCard'); if (el) el.outerHTML = srvCardHTML(); }
setInterval(() => { if (S.page === 'home' && S.st) refreshServer(); }, 30000);

function updHTML() {
  const u = S.update; if (!u || u.forced) return '';
  const pct = Math.round((u.pct || 0) * 100);
  const h = Math.max(1, Math.ceil((u.deadline - Date.now()) / 3600000));
  if (u.state === 'waitGame') return `<div class="banner"><b>${t('upd_available', { v: u.version })}</b><span>${t('upd_wait_game')}</span></div>`;
  const label = u.state === 'installing' ? t('upd_installing') : t('upd_downloading', { p: pct });
  return `<div class="banner"><div class="grow"><b>${t('upd_available', { v: u.version })}</b> · ${label}<div class="bar"><i style="width:${u.state === 'installing' ? 100 : pct}%"></i></div><div class="help">${t('upd_deadline', { h })}</div></div>${u.state === 'installing' ? '' : `<button class="btn sm" data-act="updSkip">${t('upd_skip')}</button>`}</div>`;
}
function drawUpd() { const e = $('#updBar'); if (e) e.innerHTML = updHTML(); }
function drawUpdOverlay() {
  const u = S.update; let el = $('#updOverlay');
  if (!u || !u.forced) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'updOverlay'; document.body.appendChild(el); }
  const pct = u.state === 'installing' ? 100 : Math.round((u.pct || 0) * 100);
  el.innerHTML = `<div class="backdrop" style="z-index:300"><div class="modal" style="max-width:460px;text-align:center"><h3>${t('upd_required_title')}</h3><p class="sub">${t('upd_required_sub', { v: esc(u.version) })}</p><div class="bar" style="margin:18px 0 10px"><i style="width:${u.state === 'error' ? 0 : pct}%"></i></div><p class="help">${u.state === 'installing' ? t('upd_installing') : u.state === 'error' ? t('upd_error') : t('upd_downloading', { p: pct })}</p>${u.state === 'error' ? `<div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="updRetry">${t('upd_retry')}</button><button class="btn" data-act="updManual">${t('upd_manual')}</button></div>` : ''}</div></div>`;
}

function pPacks() {
  const p = S.packs;
  return `<div class="page-head"><div><h2>${t('packs_title')}</h2><p>${t('packs_sub')}</p></div><button class="btn" data-act="packImport">${ic('dl')} ${t('import_pack')}</button></div>
  <div id="pprog"></div>
  <div class="toolbar"><input class="input grow" id="pq" placeholder="${t('search_ph')}" value="${esc(p.q)}" data-in="pq"><select class="select" style="width:190px" data-ch="psort">${['relevance', 'downloads', 'updated'].map((k) => `<option value="${k}" ${p.sort === k ? 'selected' : ''}>${t('sort_' + k)}</option>`).join('')}</select><button class="btn primary" data-act="packSearch">${ic('search')}</button></div><div id="pres"></div>`;
}
const packRow = (h) => `<div class="mod-row"><div class="mod-ic">${ic('inst')}${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy">` : ''}</div><div class="mod-info"><b>${esc(h.title)}</b> <span class="sub">${t('by')} ${esc(h.author)} · ${fmtNum(h.downloads)} ${t('downloads')}</span><p>${esc(h.description)}</p></div><button class="btn primary sm" data-act="packInstall" data-id="${esc(h.id)}" ${S.packs.busy ? 'disabled' : ''}>${S.packs.busy === h.id ? '<span class="spin"></span>' : ic('dl')} ${t('pack_install')}</button></div>`;
function drawPacks() {
  const p = S.packs, el = $('#pres'); if (!el) return;
  if (p.loading && !p.results.length) { el.innerHTML = '<div class="empty"><span class="spin"></span></div>'; return; }
  el.innerHTML = p.results.length ? p.results.map(packRow).join('') + (p.results.length < p.total ? `<div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-act="packMore">${t('load_more')}</button></div>` : '') : `<div class="empty"><p>${t('no_results')}</p></div>`;
}
async function runPackSearch(more) {
  const p = S.packs; if (!more) { p.offset = 0; p.results = []; }
  p.loading = true; drawPacks();
  try { const r = await api('packs:search', { query: p.q, offset: p.offset, sort: p.sort }); p.results = p.results.concat(r.hits); p.total = r.total; p.offset = p.results.length; } catch (e) { fail(e); }
  p.loading = false; drawPacks();
}
function afterPacks() { if (!S.packs.results.length && !S.packs.loading) runPackSearch(); else drawPacks(); }
function packProgress(e) {
  const el = $('#pprog'); if (!el) return;
  el.innerHTML = e ? `<div class="notice info"><div>${t('pp_' + e.key, { task: e.task, total: e.total })}</div><div class="bar"><i style="width:${Math.round((e.pct || 0) * 100)}%"></i></div></div>` : '';
}
async function afterPack(inst) { S.st = await api('state:get'); packProgress(null); S.packs.busy = null; drawPacks(); if (inst) toast(t('pack_done', { name: inst.name }), 'ok'); }

/* ---------------- actions ---------------- */
const A = {
  discord: () => { api('open:url', 'https://discord.gg/25A2MSvBnH'); try { localStorage.setItem('az-dc', '1'); } catch {} const b = $('.dc'); if (b) b.classList.add('seen'); },
  nav: (el) => { S.page = el.dataset.p; render(); },
  winMin: () => api('win:min'), winMax: () => api('win:max'), winClose: () => api('win:close'),
  newInst: () => openInstModal(), editInst: (el, e) => { e.stopPropagation(); openInstModal(el.dataset.id); },
  selInst: async (el) => { await api('instance:select', el.dataset.id); S.st.selectedInstance = el.dataset.id; S.mods.results = []; render(); },
  delInst: async (el, e) => { e.stopPropagation(); const i = S.st.instances.find((x) => x.id === el.dataset.id); if (!confirm(t('confirm_delete', { name: i.name }))) return; try { S.st = await api('instance:delete', i.id); render(); } catch (er) { fail(er); } },
  folder: () => api('instance:folder', inst().id), folderOf: (el, e) => { e.stopPropagation(); api('instance:folder', el.dataset.id); },
  closeModal: () => { S.M = null; drawModal(); }, backdrop: (el, e) => { if (e.target === el) A.closeModal(); },
  pickVer: (el) => { setVersion(el.dataset.id, el.dataset.type); $('#vlist').innerHTML = vlistHTML(); const ph = $('#mName'); if (ph) ph.placeholder = 'Minecraft ' + S.M.mcVersion; },
  pickLoader: (el) => { S.M.loader = el.dataset.l; S.M.loaderVersion = ''; S.M.loaderFull = ''; drawModal(); if (S.M.loader !== 'vanilla') loadLoaders(); },
  saveInst,
  play: async (el, e, opts) => {
    const i = inst(); if (!i) return; const st = stateOf(i.id);
    if (opts && opts.join && !acc()) return toast(t('e_no_account'), 'err');
    if (st === 'running') return api('game:stop', i.id);
    if (st === 'preparing') return;
    S.err[i.id] = ''; S.states[i.id] = 'preparing'; S.prog[i.id] = { label: { key: 'check_java' }, pct: 0.02 }; paintProgress();
    try { await api('game:launch', i.id, opts || {}); } catch (e) { S.states[i.id] = 'idle'; S.err[i.id] = errText(e); paintProgress(); }
  },
  modType: (el) => { S.mods.type = el.dataset.k; S.mods.results = []; render(); }, modView: (el) => { S.mods.view = el.dataset.k; S.mods.results = []; render(); },
  modSrc: (el) => { S.mods.source = el.dataset.k; S.mods.results = []; render(); }, doSearch: () => runSearch(), moreMods: () => runSearch(true),
  modInstall: async (el) => {
    const key = el.dataset.src + el.dataset.id; S.mods.busy[key] = 1; drawMods();
    try { const files = await api('mods:install', inst().id, { source: el.dataset.src, type: S.mods.type, id: el.dataset.id }); toast(t('installed_ok', { names: files.join(', ') }), 'ok'); } catch (e) { fail(e); }
    delete S.mods.busy[key]; drawMods();
  },
  modDel: async (el) => { await api('mods:remove', inst().id, S.mods.type, el.dataset.f); loadInstalled(); },
  addMs: async (el) => { el.disabled = true; try { S.st = await api('account:microsoft'); toast(t('toast_added'), 'ok'); } catch (e) { if (!/closed|cancel/i.test(e.message)) fail(e); } render(); },
  toggleOff: () => { S.offlineOpen = !S.offlineOpen; render(); const n = $('#offName'); if (n) n.focus(); },
  addOff: async () => { const n = $('#offName').value; if (!/^[A-Za-z0-9_]{3,16}$/.test(n.trim())) return toast(t('invalid_name'), 'err'); try { S.st = await api('account:offline', n); S.offlineOpen = false; toast(t('toast_added'), 'ok'); render(); } catch (e) { fail(e); } },
  skinPick: async (el) => { try { S.st = await api('skin:pick', el.dataset.id); render(); } catch (e) { fail(e); } },
  skinClear: async (el) => { try { S.st = await api('skin:clear', el.dataset.id); render(); } catch (e) { fail(e); } },
  selAcc: async (el) => { S.st = await api('account:select', el.dataset.id); render(); },
  delAcc: async (el) => { S.st = await api('account:remove', el.dataset.id); render(); },
  openInst: async (el) => { const id = el.dataset.id; await api('instance:select', id); S.st.selectedInstance = id; S.mods.results = []; S.mods.view = 'installed'; S.mods.q = ''; S.tab = 'content'; S.sub = ''; S.page = 'instance'; render(); },
  backInst: () => { S.page = 'instances'; render(); },
  instTab: (el) => { S.tab = el.dataset.k; S.sub = ''; render(); },
  instOpen: (el, e) => { e.stopPropagation(); const i = inst(); if (i) api('inst:open', i.id, el.dataset.p || ''); },
  filesGo: (el) => { S.sub = el.dataset.p || ''; afterInstance(); },
  quickPlay: async (el, e) => { const id = el.dataset.id; await api('instance:select', id); S.st.selectedInstance = id; render(); A.play(el, e); },
  newsRefresh: () => { S.news.items = null; api('news:get').catch(() => {}); loadNews(); },
  openLink: (el) => { if (el.dataset.u) api('open:url', el.dataset.u); }, openSite: () => api('open:url', 'https://azurelauncher.netlify.app/'),
  perfMods: async (el) => {
    el.disabled = true; toast(t('perf_busy'));
    try {
      const r = await api('mods:perf', inst().id);
      toast(r.installed.length ? t('perf_done', { n: r.installed.length }) + (r.skipped.length ? ' · ' + t('perf_skipped', { names: r.skipped.join(', ') }) : '') : t('perf_none'), r.installed.length ? 'ok' : 'err');
    } catch (e) { fail(e); }
    el.disabled = false; if (S.mods.view === 'installed') loadInstalled();
  },
  modRefresh: () => { if (S.mods.view === 'installed') loadInstalled(); else runSearch(); },
  srvCopy: () => { navigator.clipboard.writeText('AzureSMP.asrv.qzz.io'); toast(t('srv_copied'), 'ok'); },
  srvJoin: (el, e) => A.play(el, e, { join: true }),
  updSkip: async () => { try { await api('update:skip'); S.update = null; drawUpd(); } catch (e) { fail(e); } },
  updRetry: () => api('update:retry'),
  updManual: () => api('open:url', 'https://github.com/meqdad67/azureluancher/releases/latest'),
  modAddLocal: async () => { try { const n = await api('mods:addLocal', inst().id, S.mods.type); if (n) { toast(t('local_added', { n }), 'ok'); if (S.mods.view === 'installed') loadInstalled(); } } catch (e) { fail(e); } },
  packSearch: () => runPackSearch(), packMore: () => runPackSearch(true),
  packInstall: async (el) => { S.packs.busy = el.dataset.id; drawPacks(); try { const i = await api('packs:install', el.dataset.id); await afterPack(i); } catch (e) { fail(e); S.packs.busy = null; packProgress(null); drawPacks(); } },
  packImport: async () => { try { const i = await api('packs:importFile'); await afterPack(i); } catch (e) { fail(e); packProgress(null); } },
  clearLog: () => { S.logs = []; render(); }, copyLog: () => { navigator.clipboard.writeText(S.logs.map((l) => l.line).join('\n')); toast(t('copied'), 'ok'); },
  setLang: (el) => setSettings({ language: el.dataset.l }), setAccent: (el) => setSettings({ accent: el.dataset.c }),
  pickJava: async () => { const p = await api('java:pick'); if (p) setSettings({ javaPath: p }); }, clearJava: () => setSettings({ javaPath: '' }), openData: () => api('data:open'),
};
const C = {
  pickInst: async (el) => { await api('instance:select', el.value); S.st.selectedInstance = el.value; S.mods.results = []; render(); },
  vf: (el) => { S.M.f[el.dataset.k] = el.checked; $('#vlist').innerHTML = vlistHTML(); },
  loaderVer: (el) => { const l = S.M.loaders.find((x) => x.id === el.value); S.M.loaderVersion = el.value; S.M.loaderFull = (l && l.full) || ''; },
  ramOn: (el) => { S.M.ram = el.checked ? Math.min(4096, S.st.totalRam) : 0; drawModal(); },
  psort: (el) => { S.packs.sort = el.value; runPackSearch(); },
  msort: (el) => { S.mods.sort = el.value; runSearch(); },
  modToggle: async (el) => { await api('mods:toggle', inst().id, S.mods.type, el.dataset.f); loadInstalled(); },
  setBool: (el) => setSettings({ [el.dataset.k]: el.checked }), setText: (el) => setSettings({ [el.dataset.k]: el.value }, false), setNum: (el) => setSettings({ [el.dataset.k]: Number(el.value) || 0 }, false),
  ramMax: (el) => setSettings({ maxRam: Number(el.value) }), ramMin: (el) => setSettings({ minRam: Number(el.value) }, false),
};
let mt;
const I = {
  mName: (el) => { S.M.name = el.value; }, mJvm: (el) => { S.M.jvmArgs = el.value; },
  mRam: (el) => { S.M.ram = Number(el.value); el.style.setProperty('--p', (el.value / S.st.totalRam) * 100 + '%'); $('#mRamV').textContent = gb(S.M.ram); },
  vq: (el) => { S.M.q = el.value; $('#vlist').innerHTML = vlistHTML(); },
  pq: (el) => { S.packs.q = el.value; clearTimeout(mt); mt = setTimeout(() => runPackSearch(), 450); },
  mq: (el) => { S.mods.q = el.value; clearTimeout(mt); mt = setTimeout(() => runSearch(), 450); },
  ramMax: (el) => { el.style.setProperty('--p', (el.value / S.st.totalRam) * 100 + '%'); $('#ramV').firstChild.textContent = gb(Number(el.value)); $('#ramWarn').style.display = el.value > S.st.totalRam * 0.75 ? '' : 'none'; },
  ramMin: (el) => { el.style.setProperty('--p', (el.value / el.max) * 100 + '%'); $('#ramMinV').textContent = gb(Number(el.value)); },
};
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el, e); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-ch]'); if (el && C[el.dataset.ch]) C[el.dataset.ch](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-in]'); if (el && I[el.dataset.in]) I[el.dataset.in](el, e); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'mq') runSearch(); if (e.key === 'Enter' && e.target.id === 'offName') A.addOff(); if (e.key === 'Escape' && S.M) A.closeModal(); });
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

/* ---------------- events from main ---------------- */
const on = window.azure.on;
on('logs', (arr) => {
  for (const l of arr) S.logs.push(l);
  if (S.logs.length > 800) S.logs.splice(0, S.logs.length - 800);
  const c = $('#con');
  if (c) {
    if (c.firstElementChild && !c.firstElementChild.classList.contains('ln')) c.innerHTML = '';
    c.insertAdjacentHTML('beforeend', arr.map(lineHTML).join(''));
    while (c.childElementCount > 800) c.firstElementChild.remove();
    c.scrollTop = c.scrollHeight;
  }
});
on('progress', ({ id, label, pct }) => { S.prog[id] = { label, pct }; paintProgress(); });
on('state', ({ id, state }) => { S.states[id] = state; if (state === 'running' && !S.st.running.includes(id)) S.st.running.push(id); if (state === 'idle') S.st.running = S.st.running.filter((x) => x !== id); renderNav(); paintProgress(); });
on('launch-error', ({ id, error }) => { S.err[id] = errText({ message: error }); paintProgress(); });
on('closed', async ({ id, code }) => { if (code !== 0) S.err[id] = t('game_closed', { code }); S.st = await api('state:get'); if (S.page === 'home' || S.page === 'instances') render(); else renderNav(); });
on('win-state', () => {});
on('pack-progress', (e) => packProgress(e));
on('update', (u) => { S.update = u; drawUpd(); drawUpdOverlay(); });

(async () => {
  S.st = await api('state:get');
  render();
})();
})();
