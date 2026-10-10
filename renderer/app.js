(() => {
const $ = (s, r = document) => r.querySelector(s);
const api = window.azure.invoke;
const S = {
  page: 'home', st: null, versions: null, logs: [], prog: {}, states: {}, err: {},
  mods: { type: 'mod', source: 'modrinth', q: '', sort: 'relevance', results: [], total: 0, offset: 0, loading: false, view: 'browse', installed: [], busy: {} },
  M: null, offlineOpen: false, srv: null, update: null,
  packs: { q: '', sort: 'relevance', results: [], total: 0, offset: 0, loading: false, busy: null },
};
const lang = () => (S.st ? S.st.settings.language : 'ar');
const t = (k, v = {}) => { let s = (I18N[lang()][k] ?? I18N.en[k] ?? k); for (const [a, b] of Object.entries(v)) s = s.replaceAll(`{${a}}`, b); return s; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IC = {
  play: 'M8 5v14l11-7z', inst: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', pack: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', mods: 'M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7', term: 'M4 17l6-6-6-6M12 19h8', plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  dl: 'M12 3v12M7 10l5 5 5-5M4 21h16', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', edit: 'M4 20h4L19 9l-4-4L4 16v4z', stop: 'M7 7h10v10H7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', check: 'M5 12l5 5L20 7', cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
};
const ic = (n, fill) => `<svg viewBox="0 0 24 24"${fill ? ' style="fill:currentColor;stroke:none"' : ''}><path d="${IC[n]}"/></svg>`;
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
const LN = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
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
  const s = S.st.settings;
  document.documentElement.lang = s.language; document.documentElement.dir = s.language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.style.setProperty('--az', s.accent);
  document.body.classList.toggle('mac', window.azure.platform === 'darwin');
}
function avatar(a) {
  const key = a.type === 'microsoft' ? a.uuid : a.name;
  return `<div class="avatar">${esc(a.name[0].toUpperCase())}<img src="https://mc-heads.net/avatar/${encodeURIComponent(key)}/64" alt=""></div>`;
}
const instIcon = (i) => `<div class="inst-ic" style="--h:${i.hue}">${ic('cube')}</div>`;

/* ---------------- shell ---------------- */
function renderNav() {
  const items = [['home', 'play', 'nav_home'], ['instances', 'inst', 'nav_instances'], ['mods', 'mods', 'nav_mods'], ['packs', 'pack', 'nav_packs'], ['accounts', 'user', 'nav_accounts'], ['console', 'term', 'nav_console']];
  $('#nav').innerHTML = items.map(([p, i, k]) => `<button class="nav-btn ${S.page === p ? 'on' : ''}" data-act="nav" data-p="${p}">${ic(i, p === 'home')}<span>${t(k)}</span>${p === 'home' && S.st.running.length ? '<i class="nav-badge"></i>' : ''}</button>`).join('')
    + `<div class="nav-spacer"></div><button class="nav-btn ${S.page === 'settings' ? 'on' : ''}" data-act="nav" data-p="settings">${ic('gear')}<span>${t('nav_settings')}</span></button>`;
}
function render() {
  applyTheme(); renderNav();
  const p = { home: pHome, instances: pInstances, packs: pPacks, mods: pMods, accounts: pAccounts, console: pConsole, settings: pSettings }[S.page]();
  $('#page').innerHTML = `<div id="updBar">${updHTML()}</div>` + p;
  if (S.page === 'console') { const c = $('#con'); if (c) c.scrollTop = c.scrollHeight; }
  if (S.page === 'mods') afterMods();
  if (S.page === 'packs') afterPacks();
  if (S.page === 'home') refreshServer();
  paintProgress();
}

/* ---------------- home ---------------- */
function pHome() {
  const i = inst(), a = acc();
  if (!i) return `<div class="empty"><div class="inst-ic" style="--h:210;width:84px;height:84px;border-radius:24px">${ic('cube')}</div><h3>${t('no_instance')}</h3><p>${t('no_instance_sub')}</p><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>`;
  const stt = stateOf(i.id), ram = i.ram || S.st.settings.maxRam;
  return `<section class="hero">
    <div class="hero-main">
      <div class="chips"><span class="chip">${esc(i.mcVersion)}</span><span class="chip ghost">${LN[i.loader]}${i.loaderVersion ? ' ' + esc(i.loaderVersion) : ''}</span></div>
      <h1>${esc(i.name)}</h1>
      <div class="meta"><span>${ic('clock')} ${i.lastPlayed ? new Date(i.lastPlayed).toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'short' }) : t('never')}</span><span>${ic('play', 1)} ${fmtTime(i.playTime || 0)}</span><span>${ic('mods')} ${gb(ram)}</span></div>
      <div class="play-row"><button id="playBtn" class="play" data-act="play"></button></div>
      <div class="statusline" id="status"></div>
    </div>
    <div class="side-stack">
      <div class="card"><h3>${t('account')}</h3>${a ? `<div class="acc-card">${avatar(a)}<div class="grow"><b>${esc(a.name)}</b><div class="sub">${t(a.type)}</div></div><button class="btn sm" data-act="nav" data-p="accounts">${t('edit')}</button></div>` : `<p class="sub" style="margin-bottom:12px">${t('no_account')}</p><button class="btn primary sm" data-act="nav" data-p="accounts">${ic('plus')} ${t('add_account')}</button>`}</div>
      ${srvCardHTML()}
      <div class="card"><h3>${t('nav_instances')}</h3><select class="select" data-ch="pickInst">${S.st.instances.map((x) => `<option value="${x.id}" ${x.id === i.id ? 'selected' : ''}>${esc(x.name)} — ${esc(x.mcVersion)}</option>`).join('')}</select>
        <div class="row" style="margin-top:12px"><button class="btn sm grow" data-act="nav" data-p="mods">${ic('mods')} ${t('nav_mods')}</button><button class="btn sm grow" data-act="folder">${ic('folder')} ${t('open_folder')}</button></div></div>
    </div></section>`;
}
function paintProgress() {
  const i = inst(); const b = $('#playBtn'); if (!b || !i) return;
  const stt = stateOf(i.id), p = S.prog[i.id], er = S.err[i.id];
  b.className = 'play' + (stt === 'preparing' ? ' busy' : stt === 'running' ? ' stop' : '');
  const lvl = stt === 'preparing' && p ? p.pct : 0;
  b.innerHTML = `<span class="water" style="--lvl:${lvl}"></span>` + (stt === 'running' ? `${ic('stop', 1)}<span>${t('stop')}</span>` : stt === 'preparing' ? `<span class="spin"></span><span>${Math.round(lvl * 100)}%</span>` : `${ic('play', 1)}<span>${t('play')}</span>`);
  let txt = '';
  if (stt === 'preparing' && p) { const L = p.label || {}; txt = t('p_' + L.key, { major: L.major, loader: LN[L.loader] || L.loader, task: L.task, total: L.total }); }
  else if (stt === 'running') txt = `<b>${t('running')}</b>`;
  else if (er) txt = `<span class="err">${esc(er)}</span>`;
  const s = $('#status'); if (s) s.innerHTML = txt;
}

/* ---------------- instances ---------------- */
function pInstances() {
  return `<div class="page-head"><div><h2>${t('instances_title')}</h2><p>${t('instances_sub')}</p></div><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>
  <div class="inst-grid">${S.st.instances.map((i) => `<div class="inst ${i.id === S.st.selectedInstance ? 'sel' : ''}" data-act="selInst" data-id="${i.id}">
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
  const i = inst(), m = S.mods;
  if (!i) return `<div class="empty"><h3>${t('pick_instance_first')}</h3><button class="btn primary" data-act="newInst">${ic('plus')} ${t('new_instance')}</button></div>`;
  const vanillaBlock = m.type === 'mod' && i.loader === 'vanilla';
  return `<div class="page-head"><div><h2>${t('mods_title')}</h2><p>${t('mods_sub')}</p></div>
    <div class="row"><span class="sub">${t('for_instance')}</span><select class="select" style="width:240px" data-ch="pickInst">${S.st.instances.map((x) => `<option value="${x.id}" ${x.id === i.id ? 'selected' : ''}>${esc(x.name)} (${esc(x.mcVersion)} ${LN[x.loader]})</option>`).join('')}</select></div></div>
  <div class="toolbar"><div class="seg">${['mod', 'resourcepack', 'shader'].map((k) => `<button class="${m.type === k ? 'on' : ''}" data-act="modType" data-k="${k}">${t('tab_' + k)}</button>`).join('')}</div>
    <div class="seg"><button class="${m.view === 'browse' ? 'on' : ''}" data-act="modView" data-k="browse">${t('browse')}</button><button class="${m.view === 'installed' ? 'on' : ''}" data-act="modView" data-k="installed">${t('installed')}</button></div>
    ${m.view === 'browse' ? `<div class="seg"><button class="${m.source === 'modrinth' ? 'on' : ''}" data-act="modSrc" data-k="modrinth">Modrinth</button><button class="${m.source === 'curseforge' ? 'on' : ''}" data-act="modSrc" data-k="curseforge">CurseForge</button></div>` : ''}</div>
  <div style="margin-bottom:14px"><button class="btn" data-act="modAddLocal">${ic('plus')} ${t('add_local')}</button></div>
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

/* ---------------- accounts ---------------- */
function pAccounts() {
  return `<div class="page-head"><div><h2>${t('accounts_title')}</h2><p>${t('accounts_sub')}</p></div><div class="row"><button class="btn primary" data-act="addMs">${ic('user')} ${t('add_ms')}</button><button class="btn" data-act="toggleOff">${ic('plus')} ${t('add_off')}</button></div></div>
  ${S.offlineOpen ? `<div class="card" style="margin-bottom:16px"><div class="row"><input class="input" id="offName" maxlength="16" dir="ltr" placeholder="${t('nick')}" style="max-width:300px"><button class="btn primary" data-act="addOff">${t('add')}</button></div><div class="help">${t('off_note')}</div></div>` : ''}
  ${S.st.accounts.length ? S.st.accounts.map((a) => `<div class="acc-row ${a.id === S.st.selectedAccount ? 'sel' : ''}">${avatar(a)}<div class="grow"><b>${esc(a.name)}</b> <span class="chip ${a.type === 'microsoft' ? 'ok' : 'ghost'}">${t(a.type)}</span></div>${a.id === S.st.selectedAccount ? `<span class="chip">${ic('check')} ${t('selected')}</span>` : `<button class="btn sm" data-act="selAcc" data-id="${a.id}">${t('select')}</button>`}<button class="btn sm icon danger" data-act="delAcc" data-id="${a.id}" title="${t('remove')}">${ic('trash')}</button></div>`).join('') : `<div class="empty"><h3>${t('no_account')}</h3></div>`}`;
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
  <div class="card"><h3>${t('game')}</h3>${sw('fullscreen', t('fullscreen'))}${sw('closeOnLaunch', t('minimize_on_launch'))}${sw('showSnapshots', t('show_snapshots'))}${sw('showOld', t('show_old'))}${sw('shareWithServer', t('share_server'))}<div class="help">${t('share_help')}</div>
    ${s.fullscreen ? '' : `<div class="set-line"><span>${t('resolution')}</span><div class="row" dir="ltr"><input class="input" style="width:88px" type="number" value="${s.width}" data-ch="setNum" data-k="width"><span>×</span><input class="input" style="width:88px" type="number" value="${s.height}" data-ch="setNum" data-k="height"></div></div>`}</div>
  <div class="card"><h3>${t('integrations')}</h3><label class="f">${t('cf_key')}</label><input class="input" type="password" dir="ltr" value="${esc(s.curseforgeKey)}" data-ch="setText" data-k="curseforgeKey"><div class="help">${t('cf_key_help')}</div>
    <div class="row" style="margin-top:16px;justify-content:space-between"><button class="btn sm" data-act="openData">${ic('folder')} ${t('open_data')}</button><span class="dim" dir="ltr">${t('about', { v: S.st.version })}</span></div></div></div></div>`;
}
async function setSettings(patch, rerender = true) { try { S.st.settings = await api('settings:set', patch); if (rerender) render(); } catch (e) { fail(e); } }


/* ---------------- server card / updates / packs ---------------- */
function srvCardHTML() {
  const s = S.srv, on = s && s.server && s.server.online;
  return `<div class="card" id="srvCard"><div class="srv-head"><img class="srv-ic" src="../build/icon.png" alt=""><div class="grow"><b>${esc(s ? s.name : 'AzureSMP')}</b><div class="sub dim" dir="ltr">${esc(s ? s.host : 'AzureSMP.asrv.qzz.io')}</div></div><span class="chip ${on ? 'ok' : 'ghost'}">${s ? (on ? t('srv_online') : t('srv_offline')) : t('srv_checking')}</span></div>
  <div class="stat-grid"><div class="stat"><b>${on ? s.server.players.online + '/' + s.server.players.max : '—'}</b><span>${t('srv_players')}</span></div><div class="stat"><b>${s && s.launcher ? s.launcher.open : '—'}</b><span>${t('srv_launcher')}</span></div></div>
  <div class="row" style="margin-top:12px"><button class="btn sm grow" data-act="srvCopy">${t('srv_copy')}</button><button class="btn primary sm grow" data-act="srvJoin">${t('srv_join')}</button></div><div class="help">${t('srv_vip')}</div></div>`;
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
  selAcc: async (el) => { S.st = await api('account:select', el.dataset.id); render(); },
  delAcc: async (el) => { S.st = await api('account:remove', el.dataset.id); render(); },
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
on('log', ({ line, kind }) => { S.logs.push({ line, kind }); if (S.logs.length > 3000) S.logs.splice(0, 500); const c = $('#con'); if (c) { if (c.firstElementChild && !c.firstElementChild.classList.contains('ln')) c.innerHTML = ''; c.insertAdjacentHTML('beforeend', lineHTML({ line, kind })); c.scrollTop = c.scrollHeight; } });
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
