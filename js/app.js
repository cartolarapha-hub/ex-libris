import { Store, cloudAvailable } from './store.js';
import { searchBooks, fetchSynopsis, GENRES, guessGenre, bookKey } from './books-api.js';
import { getRecommendations, buildProfile, testKey } from './ai.js';

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const fmtDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (s ? parseYmd(s).toLocaleDateString('pt-BR', opts) : '—');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hashStr = (s) => { let h = 7; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const authorsOf = (b) => (b.authors || []).join(', ');
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CLOTHS = ['#c8401c', '#2348c4', '#0f6e52', '#d79a00', '#6a2fc0', '#1c1c1c', '#b3195a', '#21798c', '#5b4636'];
const MIN_SUMMARY = 40;
const CROP = 260;
// SHA-256 do e-mail da dona do site: só essa conta vê a parte da IA. O e-mail em si não fica no código público.
const OWNER_HASH = 'a4b94414cce6c351b7119ced1c2e734b12060551f8f7eed1b30d90ad0aac62db';

const STATUS = { quero: 'Quero ler', lendo: 'Lendo', resumo: 'Falta o resumo', concluido: 'Lido' };
const SHELVES = { resumo: 'Falta o resumo', lendo: 'Lendo', concluido: 'Lidos', quero: 'Quero ler', busca: 'Resultado da busca' };

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v9H4zM13 4h7v9h-7zM4 15h7v5H4zM13 15h7v5h-7z"/></svg>',
  spines: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h3v15H4zM9 8h3v12H9zM14 4h3v16h-3zM19 9h2v11h-2z"/></svg>',
};

/* ================= estado ================= */
const today = () => ymd();
const now = new Date();
const S = {
  books: {}, logs: {}, settings: {}, mode: 'local', user: null, ready: false, authKnown: false, authError: '',
  view: 'estante',
  filter: 'todos', search: '', genre: '', sort: 'recentes',
  shelfMode: readPref('shelfMode', 'capas'),
  cal: { y: now.getFullYear(), m: now.getMonth(), sel: ymd(now), just: '' },
  modal: null,
  busy: {},
  keyStatus: null,
  profileTried: false,
  // sem nuvem o site é de uma pessoa só, então a IA fica liberada
  isOwner: !cloudAvailable,
  ownerChecked: '',
};

function readPref(k, d) { try { return localStorage.getItem(`exlibris:${k}`) || d; } catch (e) { return d; } }
function writePref(k, v) { try { localStorage.setItem(`exlibris:${k}`, v); } catch (e) { /* ignora */ } }

const allBooks = () => Object.values(S.books);
const logsOf = (id) => Object.values(S.logs).filter((l) => l.bookId === id).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
// Com a nuvem ligada, só quem entrou na conta mexe na estante.
const needsLogin = () => cloudAvailable && !S.user;

/* ================= capas ================= */
window.__coverErr = (img) => {
  const alts = (img.dataset.alts || '').split('|').filter(Boolean);
  if (alts.length) {
    img.dataset.alts = alts.slice(1).join('|');
    img.src = alts[0];
  } else {
    img.parentNode.classList.add('cover-fallback');
    img.remove();
  }
};
window.__coverLoad = (img) => { if (img.naturalWidth && img.naturalWidth < 40) window.__coverErr(img); };

function coverHTML(b, extra = '') {
  const color = CLOTHS[hashStr(b.title + authorsOf(b)) % CLOTHS.length];
  const plain = `<span class="plain" style="--c:${color}"><span class="plain-title">${esc(b.title)}</span><span class="plain-author">${esc((b.authors || [])[0] || '')}</span></span>`;
  if (!b.cover) return `<span class="cover cover-fallback ${extra}">${plain}</span>`;
  const alts = (b.coverAlts || []).filter((c) => c && c !== b.cover).join('|');
  return `<span class="cover ${extra}"><img src="${esc(b.cover)}" data-alts="${esc(alts)}" alt="Capa de ${esc(b.title)}" loading="lazy" referrerpolicy="no-referrer" onload="__coverLoad(this)" onerror="__coverErr(this)">${plain}</span>`;
}

function stars(n, cls = 'stars') {
  const r = Math.round(n || 0);
  return `<span class="${cls}" aria-label="${r} de 5 estrelas">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
}

function callNumber(b) {
  const codes = {
    'Literatura brasileira': 'B869.3', Clássico: '808.8', Poesia: '869.1', História: '900', Filosofia: '100',
    Psicologia: '150', 'Religião/Espiritualidade': '200', Ciência: '500', 'Negócios/Finanças': '650',
    Autoajuda: '158.1', 'Biografia/Memórias': '920', 'HQ/Mangá': '741.5', Infantil: '028.5', 'Não ficção': '001',
  };
  const code = codes[b.genre] || '823';
  const sur = ((b.authors || [])[0] || 'Anon').trim().split(/\s+/).pop().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
  const t = (b.title || '').replace(/^(o|a|os|as|the|um|uma)\s+/i, '').charAt(0).toLowerCase();
  return `${code} ${sur} ${t}`;
}

function avatarHTML(cls = '') {
  const src = S.settings.photo || (S.user && S.user.photo) || '';
  if (src) return `<span class="avatar ${cls}"><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></span>`;
  const n = readerName() || (S.user && S.user.email) || '?';
  const ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return `<span class="avatar initials ${cls}">${esc(ini)}</span>`;
}

/* ================= ritmo, sequência ================= */
function dayTotals() {
  const m = {};
  Object.values(S.logs).forEach((l) => { m[l.date] = (m[l.date] || 0) + (l.pages || 0); });
  return m;
}

function streaks(t) {
  let cur = 0;
  let d = new Date();
  if (!t[ymd(d)]) d = addDays(d, -1);
  while (t[ymd(d)] > 0) { cur++; d = addDays(d, -1); }
  const dates = Object.keys(t).filter((k) => t[k] > 0).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  dates.forEach((k) => {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  });
  return { cur, best: Math.max(best, cur) };
}

function rhythm(b) {
  const ls = logsOf(b.id);
  if (!ls.length) return null;
  const total = ls.reduce((s, l) => s + l.pages, 0);
  const first = ls.map((l) => l.date).sort()[0];
  const days = Math.max(1, daysBetween(first, today()) + 1);
  const perDay = total / days;
  const left = (b.pages || 0) - (b.pagesRead || 0);
  if (!b.pages || left <= 0 || perDay <= 0) return { perDay };
  const daysLeft = Math.ceil(left / perDay);
  return { perDay, daysLeft, eta: ymd(addDays(new Date(), daysLeft)) };
}

const pct = (b) => (b.pages ? Math.min(100, Math.round(((b.pagesRead || 0) / b.pages) * 100)) : 0);
const level = (p, goal) => (!p ? 0 : p < goal * 0.5 ? 1 : p < goal ? 2 : p < goal * 1.5 ? 3 : 4);

/* ================= store ================= */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function checkOwner() {
  if (!cloudAvailable) return;
  const email = ((S.user && S.user.email) || '').trim().toLowerCase();
  if (email === S.ownerChecked) return;
  S.ownerChecked = email;
  if (!email) { S.isOwner = false; return; }
  sha256(email).then((h) => {
    if (S.ownerChecked !== email) return;
    S.isOwner = h === OWNER_HASH;
    if (S.isOwner) renderView();
  }).catch(() => { S.isOwner = false; });
}

const store = new Store((st) => {
  Object.assign(S, st);
  checkOwner();
  if (needsLogin() && S.modal) S.modal = null;
  renderChrome();
  renderView();
  if (S.modal && S.modal.type === 'book' && !fieldFocused()) renderModal();
  if (!S.modal) renderModal();
});

function fieldFocused() {
  const a = document.activeElement;
  return !!(a && $('#modal-root').contains(a) && a.matches('input, textarea, select'));
}

/* ================= moldura ================= */
function readerName() {
  return (S.settings.readerName || (S.user && S.user.name) || '').trim();
}

function renderChrome() {
  const gated = !S.authKnown || needsLogin();
  document.body.classList.toggle('gated', gated);
  $$('#nav a').forEach((a) => {
    const on = a.dataset.view === S.view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  let end = '';
  if (!S.authKnown) end = '';
  else if (needsLogin()) end = '<button type="button" class="btn btn-ink btn-sm" data-action="login">Entrar</button>';
  else end = `<button type="button" class="btn btn-accent btn-add" data-action="add-book" title="Adicionar livro (atalho: N)">${ICON.plus}<span>Adicionar livro</span></button><a class="me" href="#leitor" aria-label="Seu perfil">${avatarHTML('sm')}</a>`;
  $('#topbar-end').innerHTML = end;
}

const VIEWS = ['estante', 'calendario', 'descobrir', 'leitor'];
function route() {
  const h = location.hash.slice(1);
  const next = VIEWS.includes(h) ? h : 'estante';
  const changed = next !== S.view;
  S.view = next;
  renderChrome();
  renderView();
  if (changed) window.scrollTo(0, 0);
}

function renderView() {
  const v = $('#view');
  const a = document.activeElement;
  const keepId = a && a.id && v.contains(a) ? a.id : null;
  const caret = keepId && typeof a.selectionStart === 'number' ? a.selectionStart : null;
  if (!S.authKnown) { v.innerHTML = loadingHTML(); return; }
  if (needsLogin()) { v.innerHTML = viewLanding(); return; }
  if (!S.ready) { v.innerHTML = loadingHTML(); return; }
  const fn = { estante: viewEstante, calendario: viewCalendario, descobrir: viewDescobrir, leitor: viewLeitor }[S.view];
  v.innerHTML = fn();
  if (keepId) {
    const n = document.getElementById(keepId);
    if (n) {
      n.focus();
      if (caret !== null) { try { n.setSelectionRange(caret, caret); } catch (e) { /* ignora */ } }
    }
  }
  if (S.view === 'leitor') maybeAutoProfile();
}

function loadingHTML(msg = '') {
  return `<div class="loading"><span class="flip" aria-hidden="true"><i></i><i></i><i></i></span>${msg ? `<p>${esc(msg)}</p>` : ''}</div>`;
}

function bannersHTML() {
  return S.authError ? `<p class="notice">${esc(S.authError)}</p>` : '';
}

/* ================= ENTRADA (sem login) ================= */
function viewLanding() {
  const demo = [
    ['Grande Sertão: Veredas', 230], ['Torto Arado', 170], ['A Hora da Estrela', 120], ['Cem Anos de Solidão', 210],
    ['Dom Casmurro', 160], ['O Avesso da Pele', 180], ['Vidas Secas', 130], ['Ensaio sobre a Cegueira', 200],
    ['Quarto de Despejo', 150], ['Capitães da Areia', 175], ['Memórias Póstumas', 190],
  ];
  const spines = demo.map(([t, h], i) => `<span class="spine demo" style="--c:${CLOTHS[i % CLOTHS.length]};--w:${30 + (hashStr(t) % 22)}px;--h:${h}px"><span>${esc(t)}</span></span>`).join('');
  return `<section class="landing">
    <div class="landing-copy">
      <h1>ex libris<span class="wm-dot">.</span></h1>
      <p class="landing-lead">Quer dizer <mark>“dos livros de”</mark>. É o carimbo que se põe no livro pra dizer de quem ele é.</p>
      <p>Aqui fica a sua estante: o que você está lendo, quantas páginas leu por dia, o resumo de cada livro que terminou e o que ler depois.</p>
      <div class="landing-cta">
        <button type="button" class="btn btn-ink btn-lg" data-action="login">Entrar com Google</button>
        <span class="small">Cada conta vê só a própria estante.</span>
      </div>
      ${bannersHTML()}
    </div>
    <div class="landing-shelf" aria-hidden="true"><div class="spine-row">${spines}</div></div>
  </section>`;
}

/* ================= ESTANTE ================= */
function greeting() {
  const h = new Date().getHours();
  const hi = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const name = readerName().split(' ')[0];
  return name ? `${hi}, ${esc(name.charAt(0).toUpperCase() + name.slice(1))}.` : `${hi}.`;
}

function viewEstante() {
  const all = allBooks();
  const c = (st) => all.filter((b) => b.status === st).length;
  const year = String(new Date().getFullYear());
  const doneYear = all.filter((b) => b.status === 'concluido' && (b.endDate || '').startsWith(year)).length;
  const bits = [];
  if (c('lendo')) bits.push(`<b>${c('lendo')}</b> lendo`);
  bits.push(`<b>${doneYear}</b> ${doneYear === 1 ? 'lido' : 'lidos'} em ${year}`);
  if (c('quero')) bits.push(`<b>${c('quero')}</b> na fila`);
  if (c('resumo')) bits.push(`<b class="hl">${c('resumo')}</b> sem resumo`);
  const head = `<header class="hello"><h1>${greeting()}</h1>${all.length ? `<p class="tally">${bits.join('<span class="sep">/</span>')}</p>` : ''}</header>`;
  if (!all.length) {
    const ghosts = Array.from({ length: 5 }, () => '<span class="ghost-book" aria-hidden="true"></span>').join('');
    return `${head}${bannersHTML()}
      <p class="lead-empty">Sua estante está vazia. Comece pelo livro que está na sua cabeceira.</p>
      <div class="cover-grid empty-grid"><button type="button" class="ghost-book add" data-action="add-book">${ICON.plus}<span>Adicionar o primeiro livro</span></button>${ghosts}</div>`;
  }
  const reading = all.filter((b) => b.status === 'lendo').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const mesa = reading.length
    ? `<section class="block"><h2 class="h2">Lendo agora</h2><div class="now">${reading.map(readingCard).join('')}</div></section>`
    : '';
  return `${head}${bannersHTML()}${mesa}<section class="block">${toolbarHTML(all)}<div id="shelves">${shelvesHTML()}</div></section>`;
}

function readingCard(b) {
  const p = pct(b);
  const r = rhythm(b);
  const eta = r && r.eta ? `termina lá por ${fmtDate(r.eta, { day: 'numeric', month: 'short' })}` : (r ? `${Math.round(r.perDay)} pág. por dia` : '');
  const slider = b.pages
    ? `<label class="page-slider" style="--p:${p}%">
        <span class="ps-read"><output id="pg-${b.id}">${b.pagesRead || 0}</output> <span>de ${b.pages}</span></span>
        <input type="range" min="0" max="${b.pages}" step="1" value="${b.pagesRead || 0}" data-range="${b.id}" aria-label="Página onde você parou em ${esc(b.title)}">
      </label>
      <span class="ps-hint">arraste até a página onde parou${eta ? ` · ${eta}` : ''}</span>`
    : `<button type="button" class="link" data-action="open-book" data-id="${b.id}" data-tab="progresso">Quantas páginas ele tem?</button>`;
  return `<article class="now-card">
    <button type="button" class="now-cover" data-action="open-book" data-id="${b.id}" aria-label="Abrir ${esc(b.title)}">${coverHTML(b)}</button>
    <div class="now-info">
      <h3>${esc(b.title)}</h3>
      <span class="by">${esc(authorsOf(b))}</span>
      ${slider}
      <div class="row">
        <button type="button" class="btn btn-sm" data-action="open-log" data-id="${b.id}">${ICON.plus}<span>Páginas de outro dia</span></button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="open-book" data-id="${b.id}" data-tab="resumo">Terminei</button>
      </div>
    </div>
  </article>`;
}

function toolbarHTML(all) {
  const count = (st) => all.filter((b) => b.status === st).length;
  const tabs = [['todos', 'Tudo', all.length], ['lendo', 'Lendo', count('lendo')], ['resumo', 'Falta resumo', count('resumo')], ['concluido', 'Lidos', count('concluido')], ['quero', 'Quero ler', count('quero')]]
    .filter(([k, , n]) => k === 'todos' || n)
    .map(([k, label, n]) => `<button type="button" class="ftab ${S.filter === k ? 'on' : ''}" data-action="filter" data-f="${k}">${label}<sup>${n}</sup></button>`)
    .join('');
  const genres = [...new Set(all.map((b) => b.genre).filter(Boolean))].sort();
  return `<div class="toolbar">
    <div class="ftabs" role="group" aria-label="Filtrar por situação">${tabs}</div>
    <div class="tools">
      <label class="search">${ICON.search}<input id="shelf-search" type="search" placeholder="Buscar título ou autor" value="${esc(S.search)}" data-input="search" aria-label="Buscar na estante"></label>
      ${genres.length > 1 ? `<select class="select" data-change="genre" aria-label="Gênero"><option value="">Gênero</option>${genres.map((g) => `<option ${S.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
      <select class="select" data-change="sort" aria-label="Ordenar">
        ${[['recentes', 'Recentes'], ['titulo', 'Título'], ['autor', 'Autor'], ['nota', 'Nota'], ['paginas', 'Páginas']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <div class="toggle" role="group" aria-label="Como mostrar">
        <button type="button" class="${S.shelfMode === 'capas' ? 'on' : ''}" data-action="shelf-mode" data-m="capas" aria-label="Capas" title="Capas">${ICON.grid}</button>
        <button type="button" class="${S.shelfMode === 'lombadas' ? 'on' : ''}" data-action="shelf-mode" data-m="lombadas" aria-label="Lombadas" title="Lombadas">${ICON.spines}</button>
      </div>
    </div>
  </div>`;
}

function filteredBooks() {
  const q = S.search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let list = allBooks();
  if (S.filter !== 'todos') list = list.filter((b) => b.status === S.filter);
  if (S.genre) list = list.filter((b) => b.genre === S.genre);
  if (q) list = list.filter((b) => `${b.title} ${authorsOf(b)}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  const cmp = {
    recentes: (a, b) => (b.endDate || '').localeCompare(a.endDate || '') || (b.updatedAt || 0) - (a.updatedAt || 0),
    titulo: (a, b) => a.title.localeCompare(b.title, 'pt'),
    autor: (a, b) => authorsOf(a).localeCompare(authorsOf(b), 'pt'),
    nota: (a, b) => (b.rating || 0) - (a.rating || 0),
    paginas: (a, b) => (b.pages || 0) - (a.pages || 0),
  }[S.sort];
  return list.sort(cmp);
}

function shelvesHTML() {
  const list = filteredBooks();
  if (!list.length) return '<p class="muted pad">Nada por aqui com esse filtro.</p>';
  let groups;
  if (S.filter === 'todos' && !S.search && !S.genre) {
    groups = ['resumo', 'concluido', 'quero'].map((st) => [st, list.filter((b) => b.status === st)]).filter(([, l]) => l.length);
    if (!groups.length) groups = [['lendo', list]];
  } else if (S.filter === 'todos') {
    groups = [['busca', list]];
  } else {
    groups = [[S.filter, list]];
  }
  const single = groups.length === 1 && S.filter !== 'todos';
  return groups.map(([st, l]) => shelfHTML(st, l, single)).join('');
}

function shelfHTML(st, list, noHead) {
  const head = noHead ? '' : `<h3 class="shelf-title">${SHELVES[st] || 'Livros'} <span>${list.length}</span></h3>`;
  if (S.shelfMode === 'lombadas') {
    return `<div class="shelf">${head}<div class="spine-row">${list.map(spineHTML).join('')}</div></div>`;
  }
  return `<div class="shelf">${head}<div class="cover-grid">${list.map(tileHTML).join('')}</div></div>`;
}

function tileHTML(b) {
  let extra = '';
  if (b.status === 'lendo') extra = `<span class="mini-bar"><i style="width:${pct(b)}%"></i></span>`;
  if (b.status === 'concluido' && b.rating) extra = stars(b.rating);
  if (b.status === 'resumo') extra = '<span class="tag-hl">escrever resumo</span>';
  return `<button type="button" class="tile" data-action="open-book" data-id="${b.id}">
    ${coverHTML(b)}
    <span class="tile-title">${esc(b.title)}</span>
    <span class="tile-author">${esc(authorsOf(b))}</span>
    ${extra}
  </button>`;
}

function spineHTML(b) {
  const h = hashStr(b.id);
  const color = CLOTHS[hashStr(b.title + authorsOf(b)) % CLOTHS.length];
  const width = Math.max(30, Math.min(60, Math.round((b.pages || 250) / 9)));
  const height = 150 + (h % 50);
  return `<button type="button" class="spine" style="--c:${color};--w:${width}px;--h:${height}px" data-action="open-book" data-id="${b.id}" title="${esc(b.title)} — ${esc(authorsOf(b))}"><span>${esc(b.title)}</span></button>`;
}

/* ================= FICHA DO LIVRO ================= */
function openBook(id, tab) {
  const b = S.books[id];
  if (!b) return;
  S.modal = { type: 'book', id, tab: tab || defaultTab(b), confirmDelete: false, editing: false, form: null, synOpen: false };
  if (S.modal.tab === 'resumo' && b.status === 'quero') S.modal.tab = 'ficha';
  renderModal();
  maybeAutoRecs();
}

function defaultTab(b) {
  return { quero: 'ficha', lendo: 'progresso', resumo: 'resumo', concluido: 'resumo' }[b.status] || 'ficha';
}

function tabsFor(b) {
  if (b.status === 'quero') return [['ficha', 'Ficha']];
  if (b.status === 'lendo') return [['progresso', 'Progresso'], ['resumo', 'Terminar'], ['ficha', 'Ficha']];
  if (b.status === 'resumo') return [['resumo', 'Resumo'], ['ficha', 'Ficha']];
  return [['resumo', 'Meu resumo'], ['sugestao', 'Ler depois'], ['ficha', 'Ficha']];
}

function maybeAutoRecs() {
  const m = S.modal;
  if (!m || m.type !== 'book' || m.tab !== 'sugestao') return;
  const b = S.books[m.id];
  if (b && b.status === 'concluido' && !b.recs && !S.busy[b.id]) requestRecs(b.id);
}

function statusSwitch(b) {
  const cur = b.status === 'resumo' || b.status === 'concluido' ? 'lido' : b.status;
  return `<div class="status-switch" role="group" aria-label="Situação do livro">${[['quero', 'Quero ler'], ['lendo', 'Lendo'], ['lido', 'Lido']]
    .map(([k, l]) => `<button type="button" class="${cur === k ? 'on' : ''}" data-action="status-set" data-s="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
}

function bookModalHTML() {
  const m = S.modal;
  const b = S.books[m.id];
  if (!b) return '';
  const tabs = tabsFor(b);
  if (!tabs.some(([k]) => k === m.tab)) m.tab = tabs[0][0];
  let meta = '';
  if (b.status === 'lendo' && b.pages) meta = `<span class="meta-line">página ${b.pagesRead || 0} de ${b.pages} · ${pct(b)}%</span>`;
  else if (b.status === 'concluido') {
    const d = b.startDate && b.endDate ? daysBetween(b.startDate, b.endDate) + 1 : null;
    meta = `<span class="meta-line">${stars(b.rating)} lido em ${fmtDate(b.endDate)}${d ? ` · ${plural(d, 'dia', 'dias')}` : ''}</span>`;
  } else if (b.status === 'resumo') meta = '<span class="meta-line"><span class="tag-hl">falta o resumo</span></span>';
  const pane = { ficha: fichaPane, progresso: progressPane, resumo: resumoPane, sugestao: sugestaoPane }[m.tab](b);
  return `<div class="book-head">
      <div class="book-cover" data-tilt>${coverHTML(b)}</div>
      <div class="book-id">
        <h2>${esc(b.title)}</h2>
        <p class="by">${esc(authorsOf(b))}${b.year ? `, ${esc(b.year)}` : ''}</p>
        ${meta}
        ${statusSwitch(b)}
      </div>
    </div>
    ${tabs.length > 1 ? `<div class="utabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" aria-selected="${m.tab === k}" class="${m.tab === k ? 'on' : ''}" data-action="book-tab" data-tab="${k}">${label}</button>`).join('')}</div>` : ''}
    <div class="pane">${pane}</div>`;
}

function fichaPane(b) {
  const m = S.modal;
  if (m.editing) return editPane(b);
  const rows = [
    ['Autor', authorsOf(b) || '—'],
    ['Publicação', b.year || '—'],
    ['Páginas', b.pages || '—'],
    ['Gênero', b.genre || '—'],
    ['Na estante desde', fmtDate(ymd(new Date(b.addedAt || Date.now())))],
  ];
  if (b.startDate) rows.push(['Começou', fmtDate(b.startDate)]);
  if (b.endDate && b.status === 'concluido') rows.push(['Terminou', fmtDate(b.endDate)]);
  const card = `<div class="index-card"><span class="callno">${esc(callNumber(b))}</span><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`;
  const syn = b.synopsis
    ? `<div class="synopsis-wrap"><p class="synopsis ${m.synOpen ? '' : 'clamp'}">${esc(b.synopsis)}</p>${b.synopsis.length > 320 ? `<button type="button" class="link" data-action="toggle-syn">${m.synOpen ? 'menos' : 'ler a sinopse toda'}</button>` : ''}</div>`
    : '';
  const acts = [];
  if (b.status === 'lendo') acts.push(`<button type="button" class="btn" data-action="open-log" data-id="${b.id}">Registrar páginas</button>`);
  acts.push('<button type="button" class="btn btn-ghost" data-action="edit-book">Editar dados e capa</button>');
  acts.push(`<button type="button" class="btn btn-ghost danger" data-action="ask-delete">${ICON.trash}<span>Tirar da estante</span></button>`);
  const confirm = m.confirmDelete
    ? `<div class="confirm"><p>Tirar “${esc(b.title)}” da estante? O resumo e as páginas registradas dele somem junto.</p><div class="row"><button type="button" class="btn btn-danger" data-action="confirm-delete">Tirar</button><button type="button" class="btn btn-ghost" data-action="cancel-delete">Deixa</button></div></div>`
    : '';
  return `${card}${syn}<div class="row">${acts.join('')}</div>${confirm}`;
}

function editPane(b) {
  const covers = [...new Set([b.cover, ...(b.coverAlts || [])].filter(Boolean))];
  const picks = covers.map((c) => `<button type="button" class="cover-pick ${c === b.cover ? 'on' : ''}" data-action="pick-cover" data-url="${esc(c)}" aria-label="Usar esta capa">${coverHTML({ ...b, cover: c, coverAlts: [] })}</button>`).join('');
  return `<form class="form" data-submit="save-edit">
    <div class="fgrid">
      <label class="field"><span>Título</span><input id="ed-title" value="${esc(b.title)}" required></label>
      <label class="field"><span>Autor(es)</span><input id="ed-author" value="${esc(authorsOf(b))}" placeholder="separe por vírgula"></label>
      <label class="field"><span>Páginas</span><input id="ed-pages" type="number" min="0" inputmode="numeric" value="${b.pages || ''}"></label>
      <label class="field"><span>Gênero</span><select id="ed-genre"><option value="">—</option>${GENRES.map((g) => `<option ${b.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    </div>
    <div class="field"><span>Capa</span>
      <div class="cover-picks">${picks}<button type="button" class="cover-pick ${!b.cover ? 'on' : ''}" data-action="pick-cover" data-url="" aria-label="Sem foto de capa">${coverHTML({ ...b, cover: '' })}</button></div>
      <button type="button" class="link" data-action="more-covers" ${S.busy.covers ? 'disabled' : ''}>${S.busy.covers ? 'procurando…' : 'procurar outras capas'}</button>
    </div>
    <div class="row"><button type="submit" class="btn btn-ink">Salvar</button><button type="button" class="btn btn-ghost" data-action="cancel-edit">Cancelar</button></div>
  </form>`;
}

function progressPane(b) {
  const r = rhythm(b);
  const ls = logsOf(b.id);
  const nums = `<dl class="numbers">
    <div><dt>página</dt><dd>${b.pagesRead || 0}<small>/${b.pages || '?'}</small></dd></div>
    <div><dt>por dia</dt><dd>${r ? Math.round(r.perDay) : '—'}</dd></div>
    <div><dt>termina</dt><dd class="sm">${r && r.eta ? fmtDate(r.eta, { day: 'numeric', month: 'short' }) : '—'}</dd></div>
  </dl>`;
  const totalField = !b.pages
    ? `<form class="form inline" data-submit="set-total"><label class="field"><span>Quantas páginas o livro tem?</span><input id="pp-total" type="number" min="1" inputmode="numeric" required></label><button class="btn btn-ink" type="submit">Salvar</button></form>`
    : '';
  const quick = `<form class="form inline" data-submit="quick-page">
    <label class="field"><span>Parei na página</span><input id="pp-page" type="number" min="0" ${b.pages ? `max="${b.pages}"` : ''} inputmode="numeric" placeholder="${b.pagesRead || 0}"></label>
    <button class="btn btn-ink" type="submit">Atualizar</button>
  </form>
  <p class="small muted">Conta como leitura de hoje. Pra outro dia, use <button type="button" class="link" data-action="open-log" data-id="${b.id}">registrar em outra data</button>.</p>`;
  const hist = ls.length
    ? `<h4 class="h4">Dias em que você leu este livro</h4><ul class="log-list">${ls.slice(0, 30).map((l) => `<li><span class="d">${l.date === today() ? 'hoje' : fmtDate(l.date, { day: '2-digit', month: 'short' })}</span><span class="t">${fmtDate(l.date, { weekday: 'long' })}</span><span class="n">+${l.pages}</span><button type="button" class="x" data-action="log-delete" data-id="${l.id}" aria-label="Apagar registro">${ICON.trash}</button></li>`).join('')}</ul>`
    : '<p class="muted">Nenhuma página registrada ainda.</p>';
  return `${nums}${totalField}${quick}${hist}`;
}

function resumoPane(b) {
  const m = S.modal;
  if (b.status === 'concluido' && !m.editing) {
    const d = b.startDate && b.endDate ? daysBetween(b.startDate, b.endDate) + 1 : null;
    return `<blockquote class="note">${esc(b.summary)}</blockquote>
      <p class="small muted">${[`de ${fmtDate(b.startDate)} a ${fmtDate(b.endDate)}`, d ? plural(d, 'dia', 'dias') : '', b.genre].filter(Boolean).join(' · ')}</p>
      <div class="row"><button type="button" class="btn btn-ink" data-action="book-tab" data-tab="sugestao">O que ler depois?</button><button type="button" class="btn btn-ghost" data-action="edit-summary">Editar resumo</button></div>`;
  }
  if (!m.form) {
    m.form = {
      rating: b.rating || 0,
      genre: b.genre || '',
      start: b.startDate || '',
      end: b.endDate || today(),
      summary: b.summary || '',
      error: '',
    };
  }
  const f = m.form;
  const labels = ['', 'não gostei', 'mais ou menos', 'bom', 'muito bom', 'favorito'];
  const n = f.summary.trim().length;
  const intro = b.status === 'concluido'
    ? ''
    : '<p class="muted">O livro só vai pra “Lidos” depois do resumo. Duas ou três frases bastam: do que trata e o que ficou com você.</p>';
  return `${intro}<form class="form" data-submit="save-summary">
    <div class="field"><span>Nota</span><div class="rate" data-rate-wrap>${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= f.rating ? 'on' : ''}" data-action="rate" data-n="${i}" aria-label="${i} estrela${i > 1 ? 's' : ''}">★</button>`).join('')}<span class="rate-lbl">${labels[f.rating] || ''}</span></div></div>
    <label class="field"><span>Resumo</span><textarea id="sum-text" data-form="summary" rows="7" placeholder="Do que se trata, o que te marcou, se você indicaria…">${esc(f.summary)}</textarea><span id="sum-counter" class="counter ${n >= MIN_SUMMARY ? 'ok' : ''}">${n >= MIN_SUMMARY ? 'pode salvar' : `${n}/${MIN_SUMMARY}`}</span></label>
    <div class="fgrid three">
      <label class="field"><span>Gênero</span><select id="sum-genre" data-form="genre"><option value="">—</option>${GENRES.map((g) => `<option ${f.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span>Comecei</span><input id="sum-start" type="date" max="${today()}" value="${esc(f.start)}" data-form="start"></label>
      <label class="field"><span>Terminei</span><input id="sum-end" type="date" max="${today()}" value="${esc(f.end)}" data-form="end"></label>
    </div>
    ${f.error ? `<p class="err">${esc(f.error)}</p>` : ''}
    <div class="row"><button type="submit" class="btn btn-accent">${b.status === 'concluido' ? 'Salvar resumo' : 'Salvar e marcar como lido'}</button>${b.status === 'concluido' ? '<button type="button" class="btn btn-ghost" data-action="cancel-summary">Cancelar</button>' : ''}</div>
  </form>`;
}

function sugestaoPane(b) {
  if (S.busy[b.id]) return loadingHTML(`Procurando o que combina com “${b.title}”`);
  if (!b.recs) {
    return `<p>A sugestão leva em conta sua nota, seu resumo e o resto da estante.</p><div class="row"><button type="button" class="btn btn-ink" data-action="rec-request" data-id="${b.id}">Sugerir o próximo</button></div>`;
  }
  return recsHTML(b.recs, b.id, '');
}

function recsHTML(r, owner, title) {
  const items = r.items || [];
  if (!items.length) {
    return `<p class="muted">Não achei nada bom dessa vez.</p><div class="row"><button type="button" class="btn" data-action="rec-request" data-id="${owner}">${ICON.refresh}<span>Tentar de novo</span></button></div>`;
  }
  const src = r.source === 'ia' ? 'escolhido pela IA' : 'escolhido pelo histórico da estante';
  const [main, ...alts] = items;
  const actionsFor = (it, i) => {
    if (it.state === 'quero') return '<span class="state">✓ na fila de Quero ler</span>';
    if (it.state === 'lido') return '<span class="state">✓ na estante, falta o resumo</span>';
    if (it.state === 'descartado') return '<span class="state no">descartado</span>';
    return `<div class="row">
      <button type="button" class="btn btn-sm btn-ink" data-action="rec-quero" data-owner="${owner}" data-i="${i}">Quero ler</button>
      <button type="button" class="btn btn-sm btn-ghost" data-action="rec-read" data-owner="${owner}" data-i="${i}">Já li</button>
      <button type="button" class="btn btn-sm btn-ghost" data-action="rec-no" data-owner="${owner}" data-i="${i}">Não</button>
    </div>`;
  };
  const asBook = (it) => ({ title: it.title, authors: [it.author], cover: it.cover, coverAlts: it.covers || [] });
  const meta = (it) => [it.genre, it.year, it.pages ? `${it.pages} págs.` : ''].filter(Boolean).join(' · ');
  return `${title ? `<h3 class="h3">${esc(title)}</h3>` : ''}
    <p class="small muted">${src}${r.note ? ` · ${esc(r.note)}` : ''}</p>
    <article class="rec ${main.state === 'descartado' ? 'dim' : ''}">
      ${coverHTML(asBook(main))}
      <div class="rec-body">
        <h4>${esc(main.title)}</h4>
        <span class="by">${esc(main.author)}</span>
        ${main.hook ? `<p class="hook">${esc(main.hook)}</p>` : ''}
        <p>${esc(main.why)}</p>
        ${meta(main) ? `<span class="small muted">${esc(meta(main))}</span>` : ''}
        ${actionsFor(main, 0)}
      </div>
    </article>
    ${alts.length ? `<div class="rec-alts">${alts.map((it, j) => `<article class="rec small-rec ${it.state === 'descartado' ? 'dim' : ''}">${coverHTML(asBook(it))}<div class="rec-body"><h5>${esc(it.title)}</h5><span class="by">${esc(it.author)}</span><p>${esc(it.why)}</p>${actionsFor(it, j + 1)}</div></article>`).join('')}</div>` : ''}
    <button type="button" class="link" data-action="rec-request" data-id="${owner}">${ICON.refresh}<span>outras sugestões</span></button>`;
}

/* ================= ADICIONAR LIVRO ================= */
function openAdd() {
  if (needsLogin()) { askLogin(); return; }
  S.modal = { type: 'add', step: 'busca', title: '', author: '', results: null, loading: false, error: '', pick: null, draft: null, coverIdx: 0, status: 'quero', pageAt: '', start: today(), dupWarn: false, q: '' };
  renderModal();
  setTimeout(() => { const i = $('#add-title'); if (i) i.focus(); }, 60);
}

function addModalHTML() {
  const m = S.modal;
  if (m.step === 'confirmar') return addConfirmHTML();
  let results = '';
  if (m.loading) results = loadingHTML();
  else if (m.error) results = `<p class="err">${esc(m.error)}</p>`;
  else if (m.results && !m.results.length) results = '<p class="muted">Não achei esse. Confira a grafia ou <button type="button" class="link" data-action="add-manual">cadastre sem busca</button>.</p>';
  else if (m.results) {
    results = `<ul class="results">${m.results.map((r, i) => `<li><button type="button" class="result" data-action="add-pick" data-i="${i}">${coverHTML({ title: r.title, authors: r.authors, cover: r.covers[0], coverAlts: r.covers })}<span class="r-t">${esc(r.title)}</span><span class="r-a">${esc(r.authors.join(', '))}</span><span class="r-m">${[r.year, r.pages ? `${r.pages} págs.` : ''].filter(Boolean).join(' · ')}</span></button></li>`).join('')}</ul>`;
  } else {
    results = '<p class="small muted">A busca começa sozinha enquanto você digita. Capa, páginas e sinopse vêm junto.</p>';
  }
  return `<h2 class="sheet-title">Adicionar livro</h2>
    <form class="form" data-submit="add-search">
      <label class="field big"><span>Título</span><input id="add-title" value="${esc(m.title)}" data-bind="title" data-live="1" autocomplete="off" placeholder="Torto Arado"></label>
      <label class="field"><span>Autor <em>(ajuda a achar)</em></span><input id="add-author" value="${esc(m.author)}" data-bind="author" data-live="1" autocomplete="off" placeholder="Itamar Vieira Junior"></label>
      <div class="row"><button type="submit" class="btn btn-ink" ${m.loading ? 'disabled' : ''}>${ICON.search}<span>Buscar</span></button><button type="button" class="link" data-action="add-manual">cadastrar sem buscar</button></div>
    </form>
    <div class="results-wrap">${results}</div>`;
}

function addConfirmHTML() {
  const m = S.modal;
  const d = m.draft;
  const covers = m.pick ? m.pick.covers : [];
  const cover = covers[m.coverIdx] || '';
  const preview = { title: d.title || 'Sem título', authors: [d.author], cover, coverAlts: covers.slice(m.coverIdx + 1) };
  const picks = covers.length > 1
    ? `<div class="cover-picks">${covers.map((c, i) => `<button type="button" class="cover-pick ${i === m.coverIdx ? 'on' : ''}" data-action="add-cover" data-i="${i}" aria-label="Capa ${i + 1}">${coverHTML({ ...preview, cover: c, coverAlts: [] })}</button>`).join('')}</div>`
    : '';
  const st = m.status;
  const extra = st === 'lendo'
    ? `<div class="fgrid"><label class="field"><span>Estou na página</span><input type="number" min="0" inputmode="numeric" value="${esc(m.pageAt)}" data-bind="pageAt" placeholder="0"></label><label class="field"><span>Comecei em</span><input type="date" max="${today()}" value="${esc(m.start)}" data-bind="start"></label></div>`
    : st === 'lido'
      ? '<p class="small muted">Na próxima tela você escreve o resumo.</p>'
      : '';
  return `<button type="button" class="link back" data-action="add-back">${ICON.left}<span>voltar pra busca</span></button>
    <div class="book-head">
      <div class="book-cover" data-tilt>${coverHTML(preview)}</div>
      <div class="book-id">${picks ? `<span class="small muted">Escolha a capa</span>${picks}` : ''}</div>
    </div>
    <form class="form" data-submit="add-save">
      <div class="fgrid">
        <label class="field"><span>Título</span><input value="${esc(d.title)}" data-bind="draft.title" required></label>
        <label class="field"><span>Autor(es)</span><input value="${esc(d.author)}" data-bind="draft.author"></label>
        <label class="field"><span>Páginas</span><input type="number" min="0" inputmode="numeric" value="${esc(d.pages)}" data-bind="draft.pages"></label>
        <label class="field"><span>Gênero</span><select data-bind="draft.genre"><option value="">—</option>${GENRES.map((g) => `<option ${d.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>
      <div class="field"><span>Situação</span>
        <div class="status-switch wide">
          <button type="button" class="${st === 'quero' ? 'on' : ''}" data-action="add-status" data-s="quero">Quero ler</button>
          <button type="button" class="${st === 'lendo' ? 'on' : ''}" data-action="add-status" data-s="lendo">Lendo</button>
          <button type="button" class="${st === 'lido' ? 'on' : ''}" data-action="add-status" data-s="lido">Já li</button>
        </div>
      </div>
      ${extra}
      ${m.dupWarn ? '<div class="confirm"><p>Esse livro já está na sua estante. Adicionar de novo?</p><button type="submit" class="btn btn-sm btn-ink">Adicionar mesmo assim</button></div>' : ''}
      ${m.error ? `<p class="err">${esc(m.error)}</p>` : ''}
      <div class="row"><button type="submit" class="btn btn-accent">Adicionar à estante</button></div>
    </form>`;
}

let liveT;
function liveSearch() {
  const m = S.modal;
  if (!m || m.type !== 'add' || m.step !== 'busca') return;
  clearTimeout(liveT);
  const q = `${(m.title || '').trim()}|${(m.author || '').trim()}`;
  if ((m.title || '').trim().length < 3 || q === m.q) return;
  liveT = setTimeout(() => { if (S.modal === m) { m.q = q; ACTIONS['add-search'](); } }, 550);
}

/* ================= REGISTRAR LEITURA ================= */
function openLog({ bookId, date } = {}) {
  const reading = allBooks().filter((b) => b.status === 'lendo').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  S.modal = { type: 'log', date: date || today(), bookId: bookId || (reading[0] && reading[0].id) || null, mode: 'qtd', value: '', error: '' };
  renderModal();
  setTimeout(() => { const i = $('#log-value'); if (i) i.focus(); }, 60);
}

function logModalHTML() {
  const m = S.modal;
  const reading = allBooks().filter((b) => b.status === 'lendo').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const isToday = m.date === today();
  const head = `<h2 class="sheet-title">Leitura de ${isToday ? 'hoje' : fmtDate(m.date, { day: 'numeric', month: 'long' })}</h2>`;
  if (!reading.length) {
    return `${head}<p class="muted">Nenhum livro está em “Lendo”. Abra um livro da fila e mude pra Lendo.</p><div class="row"><button type="button" class="btn btn-ink" data-action="close-go" data-to="estante">Ir pra estante</button></div>`;
  }
  const b = S.books[m.bookId];
  const hint = b ? `Você estava na página ${b.pagesRead || 0}${b.pages ? ` de ${b.pages}` : ''}.` : '';
  return `${head}<form class="form" data-submit="log-save">
    ${reading.length > 1 ? `<div class="pick-row">${reading.map((r) => `<button type="button" class="${r.id === m.bookId ? 'on' : ''}" data-action="log-book" data-id="${r.id}" title="${esc(r.title)}">${coverHTML(r)}</button>`).join('')}</div>` : ''}
    <p class="pick-name">${b ? esc(b.title) : ''}</p>
    <div class="status-switch wide"><button type="button" class="${m.mode === 'qtd' ? 'on' : ''}" data-action="log-mode" data-m="qtd">Li tantas páginas</button><button type="button" class="${m.mode === 'pagina' ? 'on' : ''}" data-action="log-mode" data-m="pagina">Parei na página</button></div>
    <div class="big-number"><input id="log-value" type="number" min="1" inputmode="numeric" value="${esc(m.value)}" data-bind="value" placeholder="0" aria-label="${m.mode === 'qtd' ? 'Páginas lidas' : 'Página onde parei'}"><span>${m.mode === 'qtd' ? 'páginas' : 'é onde parei'}</span></div>
    ${m.mode === 'qtd' ? `<div class="quick">${[5, 10, 20, 30, 50].map((n) => `<button type="button" data-action="log-quick" data-n="${n}">+${n}</button>`).join('')}</div>` : ''}
    <p class="small muted">${esc(hint)}</p>
    <label class="field narrow"><span>Dia</span><input type="date" max="${today()}" value="${esc(m.date)}" data-bind="date"></label>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ''}
    <div class="row"><button type="submit" class="btn btn-accent">Salvar</button></div>
  </form>`;
}

/* ================= FOTO DE PERFIL ================= */
function openPhoto(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Escolha uma imagem.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      S.modal = { type: 'photo', src: reader.result, w: img.naturalWidth, h: img.naturalHeight, zoom: 1, x: 0, y: 0, img };
      renderModal();
      applyCrop();
    };
    img.onerror = () => toast('Não consegui abrir essa imagem.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function photoModalHTML() {
  const m = S.modal;
  return `<h2 class="sheet-title">Sua foto</h2>
    <p class="small muted">Arraste pra enquadrar. Use a barra pra aproximar.</p>
    <div class="crop" id="crop"><img id="crop-img" src="${m.src}" alt="" draggable="false"></div>
    <label class="zoom">${ICON.search}<input type="range" min="1" max="3" step="0.01" value="${m.zoom}" data-crop-zoom aria-label="Aproximar"></label>
    <div class="row"><button type="button" class="btn btn-accent" data-action="photo-save">Usar esta foto</button><button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button></div>`;
}

function cropGeom() {
  const m = S.modal;
  const s = (CROP / Math.min(m.w, m.h)) * m.zoom;
  const w = m.w * s;
  const h = m.h * s;
  const mx = (w - CROP) / 2;
  const my = (h - CROP) / 2;
  m.x = Math.max(-mx, Math.min(mx, m.x));
  m.y = Math.max(-my, Math.min(my, m.y));
  return { w, h, left: CROP / 2 + m.x - w / 2, top: CROP / 2 + m.y - h / 2 };
}

function applyCrop() {
  const img = $('#crop-img');
  if (!img || !S.modal || S.modal.type !== 'photo') return;
  const g = cropGeom();
  img.style.width = `${g.w}px`;
  img.style.height = `${g.h}px`;
  img.style.left = `${g.left}px`;
  img.style.top = `${g.top}px`;
}

function exportCrop() {
  const m = S.modal;
  const out = 360;
  const f = out / CROP;
  const g = cropGeom();
  const c = document.createElement('canvas');
  c.width = out;
  c.height = out;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(m.img, g.left * f, g.top * f, g.w * f, g.h * f);
  let q = 0.85;
  let data = c.toDataURL('image/jpeg', q);
  while (data.length > 180000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
  return data;
}

/* ================= folha (sheet) genérica ================= */
function renderModal() {
  const root = $('#modal-root');
  if (!S.modal) {
    root.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  const a = document.activeElement;
  const keepId = a && a.id && root.contains(a) ? a.id : null;
  const caret = keepId && typeof a.selectionStart === 'number' ? a.selectionStart : null;
  const old = root.querySelector('.sheet');
  const scroll = old ? old.scrollTop : 0;
  const html = { book: bookModalHTML, add: addModalHTML, log: logModalHTML, photo: photoModalHTML }[S.modal.type]();
  if (!S.modal) { root.innerHTML = ''; return; }
  const narrow = S.modal.type === 'log' || S.modal.type === 'photo' ? 'narrow' : '';
  const label = { book: 'Livro', add: 'Adicionar livro', log: 'Registrar leitura', photo: 'Foto de perfil' }[S.modal.type];
  root.innerHTML = `<div class="sheet-backdrop" data-action="backdrop"><div class="sheet ${narrow}" role="dialog" aria-modal="true" aria-label="${label}"><button type="button" class="icon-btn sheet-close" data-action="close-modal" aria-label="Fechar">${ICON.close}</button>${html}</div></div>`;
  const sheet = root.querySelector('.sheet');
  if (old) {
    sheet.style.animation = 'none';
    root.querySelector('.sheet-backdrop').style.animation = 'none';
    sheet.scrollTop = scroll;
  }
  if (keepId) {
    const n = document.getElementById(keepId);
    if (n) {
      n.focus();
      if (caret !== null) { try { n.setSelectionRange(caret, caret); } catch (e) { /* ignora */ } }
    }
  }
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  S.modal = null;
  renderModal();
}

/* ================= CALENDÁRIO ================= */
function viewCalendario() {
  const totals = dayTotals();
  const goal = S.settings.goal || 20;
  const { cur, best } = streaks(totals);
  const t = today();
  const todayPages = totals[t] || 0;
  const { y, m } = S.cal;
  const monthKey = `${y}-${pad(m + 1)}`;
  const monthDays = Object.keys(totals).filter((k) => k.startsWith(monthKey) && totals[k] > 0);
  const monthPages = monthDays.reduce((s, k) => s + totals[k], 0);
  const metDays = monthDays.filter((k) => totals[k] >= goal).length;

  const nums = `<dl class="numbers wide">
    <div><dt>dias seguidos</dt><dd>${cur}</dd><span class="small muted">recorde ${best}</span></div>
    <div><dt>hoje</dt><dd>${todayPages}<small>/${goal}</small></dd><span class="small muted">${todayPages >= goal ? 'meta batida' : `faltam ${goal - todayPages}`}</span></div>
    <div><dt>meta diária</dt><dd class="goal"><button type="button" data-action="goal" data-d="-5" aria-label="Diminuir meta">−</button>${goal}<button type="button" data-action="goal" data-d="5" aria-label="Aumentar meta">+</button></dd><span class="small muted">páginas</span></div>
    <div><dt>em ${MONTHS[m]}</dt><dd>${monthPages}</dd><span class="small muted">${plural(monthDays.length, 'dia', 'dias')}, ${metDays} na meta</span></div>
  </dl>`;

  const first = new Date(y, m, 1).getDay();
  const nDays = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="day out" aria-hidden="true"></span>');
  for (let d = 1; d <= nDays; d++) {
    const key = `${monthKey}-${pad(d)}`;
    const p = totals[key] || 0;
    const future = key > t;
    const sc = p ? Math.min(1, 0.3 + (0.7 * p) / goal) : 0;
    const cls = [p >= goal ? 'met' : p ? 'some' : '', key === t ? 'today' : '', key === S.cal.sel ? 'sel' : '', key === S.cal.just ? 'just' : ''].join(' ');
    cells.push(`<button type="button" class="day ${cls}" style="--s:${sc.toFixed(2)}" data-action="cal-day" data-date="${key}" ${future ? 'disabled' : ''} aria-label="${d} de ${MONTHS[m]}: ${p} páginas"><span class="dn">${d}</span>${p ? `<span class="dot"><b>${p}</b></span>` : ''}</button>`);
  }
  S.cal.just = '';
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const cal = `<div class="month">
    <div class="month-head"><h2 class="h2">${MONTHS[m]} <span>${y}</span></h2>
      <div class="month-nav"><button type="button" class="icon-btn" data-action="cal-move" data-d="-1" aria-label="Mês anterior">${ICON.left}</button>${!isCurrent ? '<button type="button" class="link" data-action="cal-today">hoje</button>' : ''}<button type="button" class="icon-btn" data-action="cal-move" data-d="1" aria-label="Próximo mês" ${isCurrent ? 'disabled' : ''}>${ICON.right}</button></div>
    </div>
    <div class="cal">${DOW.map((d) => `<span class="dow">${d}</span>`).join('')}${cells.join('')}</div>
  </div>`;

  return `<header class="page-top"><h1>Calendário</h1><button type="button" class="btn btn-accent" data-action="open-log">${ICON.plus}<span>Registrar leitura</span></button></header>
    ${nums}
    <div class="cal-layout">${cal}<aside class="side">${dayPanelHTML(totals)}${bookMonthHTML(monthKey)}</aside></div>
    ${heatHTML(totals, goal)}`;
}

function dayPanelHTML(totals) {
  const sel = S.cal.sel;
  const ls = Object.values(S.logs).filter((l) => l.date === sel).sort((a, b) => (b.at || 0) - (a.at || 0));
  const isFuture = sel > today();
  const list = ls.length
    ? `<ul class="log-list">${ls.map((l) => {
      const b = S.books[l.bookId];
      return `<li>${b ? coverHTML(b, 'xs') : '<span></span>'}<span class="t">${esc(b ? b.title : 'Livro removido')}</span><span class="n">${l.pages}</span><button type="button" class="x" data-action="log-delete" data-id="${l.id}" aria-label="Apagar registro">${ICON.trash}</button></li>`;
    }).join('')}</ul>`
    : '<p class="muted">Nada registrado nesse dia.</p>';
  return `<div class="side-box">
    <h3 class="h3">${sel === today() ? 'Hoje' : fmtDate(sel, { weekday: 'long', day: 'numeric', month: 'long' })}${totals[sel] ? ` <span class="muted">· ${totals[sel]} págs.</span>` : ''}</h3>
    ${list}
    ${isFuture ? '' : `<button type="button" class="btn btn-sm" data-action="open-log" data-date="${sel}">${ICON.plus}<span>Registrar ${sel === today() ? 'hoje' : 'nesse dia'}</span></button>`}
  </div>`;
}

function bookMonthHTML(monthKey) {
  const per = {};
  Object.values(S.logs).forEach((l) => { if (l.date.startsWith(monthKey)) per[l.bookId] = (per[l.bookId] || 0) + l.pages; });
  const rows = Object.entries(per).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<div class="side-box"><h3 class="h3">Páginas por livro no mês</h3><div class="bars">${rows.map(([id, n]) => `<div class="bar-row"><span class="bl">${esc(S.books[id] ? S.books[id].title : 'Livro removido')}</span><span class="bn">${n}</span><span class="bt"><i style="width:${Math.round((n / max) * 100)}%"></i></span></div>`).join('')}</div></div>`;
}

function heatHTML(totals, goal) {
  const end = new Date();
  const start = addDays(end, -364 - end.getDay());
  const cells = [];
  const months = [];
  let d = new Date(start);
  let col = 0;
  let lastMonth = d.getMonth();
  let lastLabelCol = -10;
  let daysRead = 0;
  while (d <= end || d.getDay() !== 0) {
    if (d.getDay() === 0) {
      const mm = d.getMonth();
      // rótulo só quando o mês muda e há espaço desde o último
      const label = mm !== lastMonth && col - lastLabelCol >= 3;
      months.push(label ? `<span>${MONTHS_SHORT[mm]}</span>` : '<span></span>');
      if (label) lastLabelCol = col;
      lastMonth = mm;
      col++;
    }
    const k = ymd(d);
    if (d > end) {
      cells.push('<i class="blank"></i>');
    } else {
      const p = totals[k] || 0;
      if (p) daysRead++;
      cells.push(`<i class="l${level(p, goal)}" data-action="heat" data-d="${k}" data-p="${p}" title="${fmtDate(k, { day: 'numeric', month: 'short' })}: ${p} páginas"></i>`);
    }
    d = addDays(d, 1);
  }
  return `<section class="block">
    <h2 class="h2">Últimos 12 meses <span class="muted">${plural(daysRead, 'dia com leitura', 'dias com leitura')}</span></h2>
    <div class="heat-scroll" id="heat-scroll"><div class="heat-months">${months.join('')}</div><div class="heat">${cells.join('')}</div></div>
    <p class="small muted" id="heat-cap">Passe o dedo ou o mouse nos quadradinhos.</p>
  </section>`;
}

/* ================= DESCOBRIR ================= */
function viewDescobrir() {
  const done = allBooks().filter((b) => b.status === 'concluido').sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
  const hasKey = !!S.settings.geminiKey;
  const top = `<header class="page-top"><h1>O que ler depois</h1><button type="button" class="btn btn-ink" data-action="rec-request" data-id="geral" ${S.busy.geral ? 'disabled' : ''}>${ICON.refresh}<span>Sugerir olhando a estante toda</span></button></header>
    ${!hasKey && S.isOwner ? '<p class="notice">Sem a chave da IA, as sugestões vêm do histórico da sua estante. <a href="#leitor">Ligar a IA</a></p>' : ''}`;
  let general = '';
  if (S.busy.geral) general = `<section class="block">${loadingHTML('Olhando a estante inteira')}</section>`;
  else if (S.settings.generalRecs) general = `<section class="block">${recsHTML(S.settings.generalRecs, 'geral', 'Pra você, olhando tudo')}</section>`;

  const withRecs = done.filter((b) => b.recs || S.busy[b.id]);
  const without = done.filter((b) => !b.recs && !S.busy[b.id]);
  const per = withRecs.map((b) => `<section class="block">
      <div class="because">${coverHTML(b, 'xs')}<h3 class="h3">Porque você leu ${esc(b.title)}</h3></div>
      ${S.busy[b.id] ? loadingHTML() : recsHTML(b.recs, b.id, '')}
    </section>`).join('');
  const pending = without.length
    ? `<section class="block"><h3 class="h3">Lidos sem sugestão ainda</h3><div class="pill-row">${without.map((b) => `<button type="button" class="pill" data-action="open-book" data-id="${b.id}" data-tab="sugestao">${esc(b.title)}</button>`).join('')}</div></section>`
    : '';
  const empty = !done.length && !S.settings.generalRecs && !S.busy.geral
    ? '<p class="lead-empty">Quando você terminar um livro e escrever o resumo, as sugestões aparecem aqui. Dá pra pedir uma olhando a estante toda no botão lá em cima.</p>'
    : '';
  return `${top}${general}${pending}${per}${empty}`;
}

/* ================= PERFIL ================= */
function viewLeitor() {
  const books = allBooks();
  const done = books.filter((b) => b.status === 'concluido');
  const year = String(new Date().getFullYear());
  const doneYear = done.filter((b) => (b.endDate || '').startsWith(year));
  const pagesRead = books.reduce((s, b) => s + (b.status === 'concluido' ? (b.pages || b.pagesRead || 0) : (b.pagesRead || 0)), 0);
  const avg = done.length ? (done.reduce((s, b) => s + (b.rating || 0), 0) / done.length).toFixed(1).replace('.', ',') : '—';
  const durs = done.filter((b) => b.startDate && b.endDate).map((b) => daysBetween(b.startDate, b.endDate) + 1);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  const { best } = streaks(dayTotals());
  const since = books.length ? Math.min(...books.map((b) => b.addedAt || Date.now())) : Date.now();
  const p = S.settings.profile;

  const head = `<header class="profile">
    <label class="avatar-edit" title="Trocar foto">${avatarHTML('lg')}<span class="cam">${ICON.camera}</span><input type="file" accept="image/*" data-change="photo-file" hidden></label>
    <div class="profile-id">
      <input id="name-input" class="name-input" value="${esc(readerName())}" placeholder="Seu nome" data-change="name-change" aria-label="Seu nome" maxlength="40">
      <p class="small muted">${S.user ? esc(S.user.email) : ''}${S.user ? ' · ' : ''}na estante desde ${new Date(since).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
      <div class="row">
        <label class="btn btn-sm btn-ghost">${ICON.camera}<span>${S.settings.photo ? 'Trocar foto' : 'Pôr uma foto'}</span><input type="file" accept="image/*" data-change="photo-file" hidden></label>
        ${S.settings.photo ? '<button type="button" class="link" data-action="photo-remove">tirar foto</button>' : ''}
      </div>
    </div>
  </header>`;

  const nums = `<dl class="numbers wide">
    <div><dt>lidos</dt><dd>${done.length}</dd><span class="small muted">${doneYear.length} em ${year}</span></div>
    <div><dt>páginas</dt><dd>${pagesRead.toLocaleString('pt-BR')}</dd></div>
    <div><dt>nota média</dt><dd>${avg}</dd></div>
    <div><dt>recorde</dt><dd>${best}<small> dias</small></dd></div>
    <div><dt>por livro</dt><dd>${avgDur ?? '—'}<small>${avgDur ? ' dias' : ''}</small></dd></div>
  </dl>`;

  let perfil;
  if (S.busy.profile) perfil = loadingHTML('Lendo seus resumos');
  else if (p && p.perfil) {
    perfil = `<p class="perfil">${esc(p.perfil)}</p>
      ${p.tags && p.tags.length ? `<div class="pill-row">${p.tags.map((t) => `<span class="pill static">${esc(t)}</span>`).join('')}</div>` : ''}
      ${(p.gosta && p.gosta.length) || (p.evita && p.evita.length) ? `<div class="likes"><div><h4 class="h4">Costuma gostar</h4><ul>${(p.gosta || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h4 class="h4">Costuma evitar</h4><ul>${(p.evita || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      ${p.proximo ? `<p class="muted">${esc(p.proximo)}</p>` : ''}
      <button type="button" class="link" data-action="profile-refresh">${ICON.refresh}<span>reescrever</span></button>`;
  } else if (!done.length) {
    perfil = '<p class="muted">Aparece depois do primeiro livro com resumo.</p>';
  } else if (!S.settings.geminiKey) {
    perfil = '<p class="muted">Precisa da IA ligada (lá embaixo, em Ajustes).</p>';
  } else {
    perfil = '<button type="button" class="btn btn-ink" data-action="profile-refresh">Escrever meu perfil de leitor</button>';
  }

  const gcount = {};
  done.forEach((b) => { const g = b.genre || 'Sem gênero'; gcount[g] = (gcount[g] || 0) + 1; });
  const grows = Object.entries(gcount).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const gmax = grows.length ? grows[0][1] : 1;
  const genres = grows.length
    ? `<div><h3 class="h3">Gêneros</h3><div class="bars">${grows.map(([g, n]) => `<div class="bar-row"><span class="bl">${esc(g)}</span><span class="bn">${n}</span><span class="bt"><i style="width:${Math.round((n / gmax) * 100)}%"></i></span></div>`).join('')}</div></div>`
    : '';

  return `${head}${nums}
    <div class="two-col">
      ${S.isOwner || (p && p.perfil) ? `<section class="block"><h2 class="h2">Que leitor você é</h2>${perfil}</section>` : ''}
      <section class="block"><h2 class="h2">Terminados em ${year}</h2><div class="chart">${monthChart(done, year)}</div>${genres}</section>
    </div>
    ${settingsHTML()}`;
}

function monthChart(done, year) {
  const counts = Array(12).fill(0);
  done.forEach((b) => { if ((b.endDate || '').startsWith(year)) counts[Number(b.endDate.slice(5, 7)) - 1]++; });
  const max = Math.max(1, ...counts);
  const W = 360;
  const H = 140;
  const top = 18;
  const bottom = 20;
  const bw = (W - 24) / 12;
  const bars = counts.map((c, i) => {
    const h = Math.round(((H - top - bottom) * c) / max);
    const x = 12 + i * bw + 5;
    const y = H - bottom - h;
    return `${c ? `<rect x="${x}" y="${y}" width="${bw - 10}" height="${h}" class="c-bar"/><text x="${x + (bw - 10) / 2}" y="${y - 5}" text-anchor="middle" class="c-val">${c}</text>` : ''}<text x="${x + (bw - 10) / 2}" y="${H - 5}" text-anchor="middle" class="c-lbl">${MONTHS_SHORT[i].charAt(0)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Livros terminados por mês em ${year}"><line x1="12" x2="${W - 12}" y1="${H - bottom}" y2="${H - bottom}" class="c-axis"/>${bars}</svg>`;
}

function settingsHTML() {
  const s = S.settings;
  const ks = S.keyStatus;
  const keyState = ks && ks.state === 'testing'
    ? '<p class="muted">Testando a chave…</p>'
    : ks && ks.state === 'err'
      ? `<p class="err">${esc(ks.msg)}</p>`
      : s.geminiKey
        ? `<p class="ok">IA ligada${s.model ? ` (${esc(s.model)})` : ''}.</p>`
        : '';
  const sync = !cloudAvailable
    ? '<p>Os dados ficam só neste navegador. Baixe um backup de vez em quando.</p>'
    : `<p>Conectado como <b>${esc(S.user ? (S.user.email || S.user.name) : '')}</b>. O que você muda aqui aparece no celular e no computador.</p><button type="button" class="btn btn-sm btn-ghost" data-action="logout">Sair da conta</button>`;
  const theme = readPref('theme', 'auto');
  return `<section class="block settings">
    <h2 class="h2">Ajustes</h2>
    <div class="set"><h3 class="h4">Meta diária</h3>
      <div class="stepper"><button type="button" data-action="goal" data-d="-5" aria-label="Diminuir meta">−</button><span>${s.goal || 20} páginas</span><button type="button" data-action="goal" data-d="5" aria-label="Aumentar meta">+</button></div>
    </div>
    ${S.isOwner ? `<div class="set"><h3 class="h4">IA (Gemini, do Google)</h3>
      <p>É ela que lê seus resumos e escolhe o próximo livro. O plano gratuito não pede cartão.</p>
      ${s.geminiKey ? '' : '<p class="small muted">Pegue a chave em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (botão “Create API key”) e cole aqui.</p>'}
      <form class="form inline" data-submit="save-key"><input id="set-key" type="password" autocomplete="off" placeholder="${s.geminiKey ? 'cole outra chave pra trocar' : 'cole a chave aqui'}" aria-label="Chave da IA"><button class="btn btn-sm btn-ink" type="submit" ${ks && ks.state === 'testing' ? 'disabled' : ''}>Salvar e testar</button>${s.geminiKey ? '<button type="button" class="btn btn-sm btn-ghost danger" data-action="remove-key">Remover</button>' : ''}</form>
      ${keyState}
      <p class="small muted">A chave fica ${cloudAvailable ? 'na sua conta, que só você acessa' : 'só neste navegador'}. Ela não vai pro código do site.</p>
    </div>` : ''}
    <div class="set"><h3 class="h4">Conta</h3>${sync}</div>
    <div class="set"><h3 class="h4">Tema</h3>
      <div class="status-switch">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button type="button" class="${theme === k ? 'on' : ''}" data-action="theme" data-t="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="set"><h3 class="h4">Backup</h3>
      <p>Um arquivo com todos os livros, resumos e registros.</p>
      <div class="row"><button type="button" class="btn btn-sm btn-ghost" data-action="export">Baixar backup</button><label class="btn btn-sm btn-ghost">Restaurar backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
    </div>
  </section>`;
}

function maybeAutoProfile() {
  const done = allBooks().filter((b) => b.status === 'concluido').length;
  const p = S.settings.profile;
  if (S.profileTried || !S.settings.geminiKey || !done || S.busy.profile) return;
  if (p && p.basedOn === done) return;
  S.profileTried = true;
  refreshProfile();
}

/* ================= ações ================= */
async function requestRecs(owner) {
  if (S.busy[owner]) return;
  S.busy[owner] = true;
  rerenderAll();
  try {
    const anchor = owner === 'geral' ? null : S.books[owner];
    const res = await getRecommendations({ anchor, books: allBooks(), settings: S.settings });
    const payload = { at: Date.now(), source: res.source, note: res.note || '', items: res.items.map((i) => ({ ...i, state: 'novo' })) };
    if (owner === 'geral') store.saveSettings({ generalRecs: payload });
    else if (S.books[owner]) store.saveBook({ ...S.books[owner], recs: payload });
    if (!res.items.length) toast('Não achei sugestões agora. Tente de novo daqui a pouco.');
  } catch (e) {
    toast(`Não consegui buscar sugestões: ${e.message}`);
  } finally {
    delete S.busy[owner];
    rerenderAll();
  }
}

function rerenderAll() {
  renderView();
  if (S.modal && S.modal.type === 'book') renderModal();
}

function recRef(owner) {
  return owner === 'geral' ? S.settings.generalRecs : (S.books[owner] && S.books[owner].recs);
}

function setRecState(owner, i, state) {
  const r = recRef(owner);
  if (!r) return;
  const nr = { ...r, items: r.items.map((x, j) => (j === i ? { ...x, state } : x)) };
  if (owner === 'geral') store.saveSettings({ generalRecs: nr });
  else store.saveBook({ ...S.books[owner], recs: nr });
}

function bookFromData(d, status) {
  const t = Date.now();
  return {
    id: uid(),
    title: d.title,
    authors: d.authors,
    cover: d.cover || '',
    coverAlts: d.coverAlts || [],
    pages: Number(d.pages) || 0,
    pagesRead: 0,
    year: d.year || '',
    categories: d.categories || [],
    genre: d.genre || guessGenre(d.categories || []),
    synopsis: d.synopsis || '',
    isbn: d.isbn || '',
    status,
    startDate: '',
    endDate: '',
    rating: 0,
    summary: '',
    recs: null,
    addedAt: t,
    updatedAt: t,
  };
}

function bookFromRec(it, status) {
  return bookFromData({
    title: it.title,
    authors: it.author.split(/\s*,\s*/).filter(Boolean),
    cover: it.cover,
    coverAlts: it.covers || [],
    pages: it.pages,
    year: it.year,
    categories: it.categories,
    genre: it.genre,
    synopsis: it.synopsis,
    isbn: it.isbn,
  }, status);
}

function hasBook(title, author) {
  const k = bookKey(title, author);
  return allBooks().find((b) => bookKey(b.title, (b.authors || [])[0]) === k);
}

async function refreshProfile() {
  if (!S.settings.geminiKey) { toast('Ligue a IA pra eu escrever seu perfil.'); return; }
  const done = allBooks().filter((b) => b.status === 'concluido').length;
  if (!done) { toast('Termine pelo menos um livro com resumo primeiro.'); return; }
  S.busy.profile = true;
  renderView();
  try {
    const p = await buildProfile(allBooks(), S.settings);
    store.saveSettings({ profile: { ...p, basedOn: done, at: Date.now() } });
  } catch (e) {
    toast(e.message);
  } finally {
    delete S.busy.profile;
    renderView();
  }
}

// Carimbo de biblioteca quando um livro vira "lido"
function celebrate(title) {
  const el = document.createElement('div');
  el.className = 'stamp-overlay';
  const d = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
  el.innerHTML = `<div class="stamp"><span class="stamp-big">lido</span><span class="stamp-date">${esc(d)}</span></div><p>${esc(title)}</p>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1600);
  setTimeout(() => el.remove(), 2100);
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<p>${esc(msg)}</p>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (action) el.querySelector('button').addEventListener('click', () => { kill(); action.run(); });
  $('#toasts').appendChild(el);
  setTimeout(kill, action ? 7000 : 3600);
}

function askLogin() {
  toast('Entre com sua conta pra mexer na estante.', { label: 'Entrar', run: () => ACTIONS.login() });
}

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function setPath(o, path, v) {
  const ks = path.split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  t[ks[ks.length - 1]] = v;
}

function saveLogEntry({ bookId, date, pages }) {
  const b = S.books[bookId];
  const pagesRead = b.pages ? Math.min(b.pages, (b.pagesRead || 0) + pages) : (b.pagesRead || 0) + pages;
  store.saveLog({ id: uid(), bookId, date, pages, at: Date.now() });
  store.saveBook({ ...b, pagesRead, startDate: b.startDate && b.startDate <= date ? b.startDate : date, updatedAt: Date.now() });
  const goal = S.settings.goal || 20;
  const dayTotal = dayTotals()[date] || 0;
  if (dayTotal >= goal && dayTotal - pages < goal) S.cal.just = date;
  S.cal.sel = date;
  const finished = b.pages && pagesRead >= b.pages;
  if (finished) {
    toast(`Última página de “${b.title}”. Agora é o resumo.`, { label: 'Escrever', run: () => openBook(bookId, 'resumo') });
  } else {
    toast(`+${pages} páginas${dayTotal >= goal ? '. Meta do dia batida.' : '.'}`);
  }
  renderView();
}

// Página escolhida no controle deslizante do "Lendo agora"
function commitPage(id, page) {
  const b = S.books[id];
  if (!b) return;
  const target = b.pages ? Math.min(page, b.pages) : page;
  const diff = target - (b.pagesRead || 0);
  if (diff > 0) saveLogEntry({ bookId: id, date: today(), pages: diff });
  else if (diff < 0) {
    store.saveBook({ ...b, pagesRead: target, updatedAt: Date.now() });
    toast(`Voltou pra página ${target}.`);
  }
}

const ACTIONS = {
  backdrop: () => closeModal(),
  'close-modal': () => closeModal(),
  'close-go': (el) => { closeModal(); location.hash = el.dataset.to; },
  go: (el) => { location.hash = el.dataset.to; },
  'add-book': () => openAdd(),
  login: async () => {
    try { await store.signIn(); } catch (e) { toast(`Não deu pra entrar: ${e.message}`); }
  },
  logout: async () => { await store.signOut(); location.hash = 'estante'; toast('Você saiu da conta.'); },

  /* estante */
  filter: (el) => { S.filter = el.dataset.f; renderView(); },
  'shelf-mode': (el) => { S.shelfMode = el.dataset.m; writePref('shelfMode', S.shelfMode); renderView(); },
  genre: (el) => { S.genre = el.value; $('#shelves').innerHTML = shelvesHTML(); },
  sort: (el) => { S.sort = el.value; $('#shelves').innerHTML = shelvesHTML(); },

  /* ficha */
  'open-book': (el) => openBook(el.dataset.id, el.dataset.tab),
  'book-tab': (el) => {
    S.modal.tab = el.dataset.tab;
    S.modal.editing = false;
    S.modal.confirmDelete = false;
    renderModal();
    maybeAutoRecs();
  },
  'status-set': (el) => {
    const b = S.books[S.modal.id];
    const to = el.dataset.s;
    const t = Date.now();
    if (to === 'quero' && b.status !== 'quero') {
      store.saveBook({ ...b, status: 'quero', updatedAt: t });
      S.modal.tab = 'ficha';
    } else if (to === 'lendo' && b.status !== 'lendo') {
      store.saveBook({ ...b, status: 'lendo', startDate: b.startDate || today(), updatedAt: t });
      S.modal.tab = 'progresso';
      toast(`“${b.title}” foi pra Lendo agora.`);
    } else if (to === 'lido' && b.status !== 'concluido' && b.status !== 'resumo') {
      store.saveBook({ ...b, status: 'resumo', pagesRead: b.pages || b.pagesRead || 0, updatedAt: t });
      S.modal.tab = 'resumo';
    } else return;
    S.modal.form = null;
    S.modal.editing = false;
    renderModal();
  },
  'toggle-syn': () => { S.modal.synOpen = !S.modal.synOpen; renderModal(); },
  'ask-delete': () => { S.modal.confirmDelete = true; renderModal(); },
  'cancel-delete': () => { S.modal.confirmDelete = false; renderModal(); },
  'confirm-delete': () => {
    const b = S.books[S.modal.id];
    closeModal();
    store.deleteBook(b.id);
    toast(`“${b.title}” saiu da estante.`);
  },
  'edit-book': () => { S.modal.editing = true; S.modal.tab = 'ficha'; renderModal(); },
  'cancel-edit': () => { S.modal.editing = false; renderModal(); },
  'save-edit': () => {
    const b = S.books[S.modal.id];
    const title = $('#ed-title').value.trim();
    if (!title) return;
    const pages = Number($('#ed-pages').value) || 0;
    store.saveBook({
      ...b,
      title,
      authors: $('#ed-author').value.split(',').map((x) => x.trim()).filter(Boolean),
      pages,
      pagesRead: pages ? Math.min(b.pagesRead || 0, pages) : b.pagesRead,
      genre: $('#ed-genre').value,
      updatedAt: Date.now(),
    });
    S.modal.editing = false;
    renderModal();
    toast('Salvo.');
  },
  'pick-cover': (el) => {
    const b = S.books[S.modal.id];
    const url = el.dataset.url;
    const alts = [...new Set([b.cover, ...(b.coverAlts || [])].filter(Boolean))];
    store.saveBook({ ...b, cover: url, coverAlts: alts, updatedAt: Date.now() });
    renderModal();
  },
  'more-covers': async () => {
    const b = S.books[S.modal.id];
    S.busy.covers = true;
    renderModal();
    try {
      const res = await searchBooks(b.title, (b.authors || [])[0] || '');
      const found = res.flatMap((r) => r.covers);
      const alts = [...new Set([...(b.coverAlts || []), ...found])].filter((c) => c !== b.cover).slice(0, 16);
      store.saveBook({ ...S.books[b.id], coverAlts: alts });
      if (!found.length) toast('Não achei outras capas pra esse título.');
    } catch (e) {
      toast(e.message);
    } finally {
      delete S.busy.covers;
      if (S.modal && S.modal.type === 'book') renderModal();
    }
  },

  /* progresso */
  'quick-page': () => {
    const v = $('#pp-page').value;
    const page = Number(v);
    if (!v || Number.isNaN(page) || page < 0) return;
    commitPage(S.modal.id, page);
    renderModal();
  },
  'set-total': () => {
    const n = Number($('#pp-total').value);
    if (!n) return;
    const b = S.books[S.modal.id];
    store.saveBook({ ...b, pages: n, updatedAt: Date.now() });
    renderModal();
  },
  'log-delete': (el) => {
    const l = S.logs[el.dataset.id];
    if (!l) return;
    const b = S.books[l.bookId];
    store.deleteLog(l.id);
    if (b) store.saveBook({ ...b, pagesRead: Math.max(0, (b.pagesRead || 0) - l.pages), updatedAt: Date.now() });
    toast(`Registro de ${l.pages} páginas apagado.`);
    renderView();
    if (S.modal && S.modal.type === 'book') renderModal();
  },

  /* resumo */
  rate: (el) => {
    S.modal.form.rating = Number(el.dataset.n);
    S.modal.form.error = '';
    renderModal();
  },
  'edit-summary': () => { S.modal.editing = true; S.modal.form = null; renderModal(); },
  'cancel-summary': () => { S.modal.editing = false; S.modal.form = null; renderModal(); },
  'save-summary': () => {
    const m = S.modal;
    const f = m.form;
    const b = S.books[m.id];
    const fail = (msg) => { f.error = msg; renderModal(); };
    if (!f.rating) return fail('Dê uma nota de 1 a 5.');
    if (f.summary.trim().length < MIN_SUMMARY) return fail(`Escreva pelo menos ${MIN_SUMMARY} caracteres. Duas frases bastam.`);
    if (f.start && f.end && f.start > f.end) return fail('A data de início está depois da de término.');
    const wasDone = b.status === 'concluido';
    store.saveBook({
      ...b,
      rating: f.rating,
      genre: f.genre,
      startDate: f.start,
      endDate: f.end || today(),
      summary: f.summary.trim(),
      status: 'concluido',
      pagesRead: b.pages || b.pagesRead || 0,
      updatedAt: Date.now(),
    });
    m.form = null;
    m.editing = false;
    if (wasDone) {
      m.tab = 'resumo';
      renderModal();
      toast('Resumo salvo.');
    } else {
      celebrate(b.title);
      m.tab = 'sugestao';
      renderModal();
      requestRecs(b.id);
    }
  },

  /* recomendações */
  'rec-request': (el) => requestRecs(el.dataset.id),
  'rec-quero': (el) => {
    const owner = el.dataset.owner;
    const i = Number(el.dataset.i);
    const it = recRef(owner).items[i];
    if (!hasBook(it.title, it.author)) store.saveBook(bookFromRec(it, 'quero'));
    setRecState(owner, i, 'quero');
    toast(`“${it.title}” foi pra Quero ler.`);
    rerenderAll();
  },
  'rec-read': (el) => {
    const owner = el.dataset.owner;
    const i = Number(el.dataset.i);
    const it = recRef(owner).items[i];
    let b = hasBook(it.title, it.author);
    if (!b) { b = bookFromRec(it, 'resumo'); store.saveBook(b); }
    setRecState(owner, i, 'lido');
    openBook(b.id, 'resumo');
  },
  'rec-no': (el) => {
    const owner = el.dataset.owner;
    const i = Number(el.dataset.i);
    const it = recRef(owner).items[i];
    const dislikes = [...(S.settings.dislikes || []), { title: it.title, author: it.author, at: Date.now() }].slice(-80);
    store.saveSettings({ dislikes });
    setRecState(owner, i, 'descartado');
    toast('Anotado. Não sugiro mais esse nem parecidos.');
    rerenderAll();
  },

  /* adicionar */
  'add-search': async () => {
    const m = S.modal;
    const title = (m.title || '').trim();
    const author = (m.author || '').trim();
    if (!title && !author) { m.error = 'Digite pelo menos o título.'; renderModal(); return; }
    m.q = `${title}|${author}`;
    m.loading = true;
    m.error = '';
    m.results = null;
    renderModal();
    try {
      const res = await searchBooks(title, author);
      if (S.modal !== m) return;
      m.results = res;
    } catch (e) {
      m.error = e.message;
    }
    m.loading = false;
    if (S.modal === m) renderModal();
  },
  'add-pick': (el) => {
    const m = S.modal;
    const r = m.results[Number(el.dataset.i)];
    m.pick = r;
    m.coverIdx = 0;
    m.draft = { title: r.title, author: r.authors.join(', '), pages: r.pages || '', genre: guessGenre(r.categories) };
    m.step = 'confirmar';
    m.dupWarn = false;
    m.error = '';
    renderModal();
    if (!r.synopsis) fetchSynopsis(r).then((s) => { if (s) r.synopsis = s; });
  },
  'add-manual': () => {
    const m = S.modal;
    m.pick = { covers: [], categories: [], synopsis: '', year: '', isbn: '' };
    m.coverIdx = 0;
    m.draft = { title: m.title || '', author: m.author || '', pages: '', genre: '' };
    m.step = 'confirmar';
    renderModal();
  },
  'add-back': () => { S.modal.step = 'busca'; S.modal.dupWarn = false; renderModal(); },
  'add-cover': (el) => { S.modal.coverIdx = Number(el.dataset.i); renderModal(); },
  'add-status': (el) => { S.modal.status = el.dataset.s; renderModal(); },
  'add-save': () => {
    const m = S.modal;
    const d = m.draft;
    if (!d.title.trim()) { m.error = 'O livro precisa de um título.'; renderModal(); return; }
    const authors = d.author.split(',').map((x) => x.trim()).filter(Boolean);
    if (!m.dupWarn && hasBook(d.title, authors[0])) { m.dupWarn = true; renderModal(); return; }
    const covers = m.pick.covers || [];
    const status = m.status === 'lido' ? 'resumo' : m.status;
    const b = bookFromData({
      title: d.title.trim(),
      authors,
      cover: covers[m.coverIdx] || '',
      coverAlts: covers.filter((_, i) => i !== m.coverIdx),
      pages: d.pages,
      year: m.pick.year,
      categories: m.pick.categories,
      genre: d.genre,
      synopsis: m.pick.synopsis,
      isbn: m.pick.isbn,
    }, status);
    if (status === 'lendo') {
      const at = Number(m.pageAt) || 0;
      b.pagesRead = b.pages ? Math.min(at, b.pages) : at;
      b.startDate = m.start || today();
    }
    store.saveBook(b);
    if (status === 'resumo') {
      openBook(b.id, 'resumo');
    } else {
      closeModal();
      toast(`“${b.title}” entrou em ${STATUS[status]}.`);
      if (S.view !== 'estante') location.hash = 'estante';
    }
  },

  /* registrar leitura */
  'open-log': (el) => openLog({ bookId: el.dataset.id, date: el.dataset.date }),
  'log-book': (el) => { S.modal.bookId = el.dataset.id; S.modal.error = ''; renderModal(); },
  'log-mode': (el) => { S.modal.mode = el.dataset.m; S.modal.value = ''; renderModal(); },
  'log-quick': (el) => { S.modal.value = String((Number(S.modal.value) || 0) + Number(el.dataset.n)); renderModal(); },
  'log-save': () => {
    const m = S.modal;
    const b = S.books[m.bookId];
    if (!b) { m.error = 'Escolha o livro.'; renderModal(); return; }
    const v = Number(m.value);
    if (!m.value || Number.isNaN(v) || v <= 0) { m.error = 'Quantas páginas?'; renderModal(); return; }
    if (!m.date || m.date > today()) { m.error = 'Escolha um dia até hoje.'; renderModal(); return; }
    let pages = v;
    if (m.mode === 'pagina') {
      pages = (b.pages ? Math.min(v, b.pages) : v) - (b.pagesRead || 0);
      if (pages <= 0) { m.error = `Você já estava na página ${b.pagesRead || 0}. Informe uma página maior.`; renderModal(); return; }
    }
    closeModal();
    saveLogEntry({ bookId: b.id, date: m.date, pages });
  },

  /* calendário */
  'cal-move': (el) => {
    const d = new Date(S.cal.y, S.cal.m + Number(el.dataset.d), 1);
    S.cal.y = d.getFullYear();
    S.cal.m = d.getMonth();
    renderView();
  },
  'cal-today': () => { S.cal.y = now.getFullYear(); S.cal.m = now.getMonth(); S.cal.sel = today(); renderView(); },
  'cal-day': (el) => { S.cal.sel = el.dataset.date; renderView(); },
  goal: (el) => {
    const g = Math.max(5, Math.min(500, (S.settings.goal || 20) + Number(el.dataset.d)));
    store.saveSettings({ goal: g });
  },
  heat: (el) => {
    const cap = $('#heat-cap');
    if (cap) cap.textContent = `${fmtDate(el.dataset.d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${plural(Number(el.dataset.p), 'página', 'páginas')}`;
  },

  /* perfil */
  'profile-refresh': () => refreshProfile(),
  'name-change': (el) => {
    const v = el.value.trim();
    if (v === (S.settings.readerName || '')) return;
    store.saveSettings({ readerName: v });
    toast('Nome salvo.');
  },
  'photo-file': (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    openPhoto(file);
  },
  'photo-save': () => {
    const data = exportCrop();
    closeModal();
    store.saveSettings({ photo: data });
    toast('Foto salva.');
  },
  'photo-remove': () => { store.saveSettings({ photo: '' }); toast('Foto removida.'); },
  'save-key': async () => {
    const v = $('#set-key').value.trim();
    if (!v) return;
    S.keyStatus = { state: 'testing' };
    renderView();
    try {
      const model = await testKey(v);
      store.saveSettings({ geminiKey: v, model });
      S.keyStatus = null;
      S.profileTried = false;
      toast('IA ligada.');
    } catch (e) {
      S.keyStatus = { state: 'err', msg: e.message };
    }
    renderView();
  },
  'remove-key': () => { store.saveSettings({ geminiKey: '', model: '' }); S.keyStatus = null; toast('Chave removida.'); },
  theme: (el) => { writePref('theme', el.dataset.t); applyTheme(el.dataset.t); renderView(); },
  export: () => {
    const settings = { ...S.settings, geminiKey: '' };
    const data = { app: 'ex-libris', version: 1, exportedAt: new Date().toISOString(), books: S.books, logs: S.logs, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ex-libris-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  import: async (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.books !== 'object') throw new Error('Esse arquivo não parece um backup do Ex Libris.');
      const settings = { ...(data.settings || {}) };
      delete settings.geminiKey;
      await store.importAll({ books: data.books, logs: data.logs || {}, settings });
      toast(`Backup restaurado: ${plural(Object.keys(data.books).length, 'livro', 'livros')}.`);
    } catch (e) {
      toast(e.message || 'Não consegui ler esse arquivo.');
    }
  },
};

/* ================= eventos ================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'backdrop' && e.target !== el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  const fn = ACTIONS[f.dataset.submit];
  if (fn) fn(f, e);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.bind && S.modal) {
    setPath(S.modal, t.dataset.bind, t.value);
    if (t.dataset.live) liveSearch();
  }
  if (t.dataset.form && S.modal && S.modal.form) {
    S.modal.form[t.dataset.form] = t.value;
    if (t.dataset.form === 'summary') {
      const c = $('#sum-counter');
      const n = t.value.trim().length;
      if (c) {
        c.textContent = n >= MIN_SUMMARY ? 'pode salvar' : `${n}/${MIN_SUMMARY}`;
        c.classList.toggle('ok', n >= MIN_SUMMARY);
      }
    }
  }
  if (t.dataset.input === 'search') {
    S.search = t.value;
    const box = $('#shelves');
    if (box) box.innerHTML = shelvesHTML();
  }
  if (t.dataset.range) {
    const out = document.getElementById(`pg-${t.dataset.range}`);
    if (out) out.textContent = t.value;
    t.closest('.page-slider').style.setProperty('--p', `${(t.value / t.max) * 100}%`);
  }
  if (t.dataset.cropZoom !== undefined && S.modal && S.modal.type === 'photo') {
    S.modal.zoom = Number(t.value);
    applyCrop();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.range) { commitPage(t.dataset.range, Number(t.value)); return; }
  if (t.dataset.change && ACTIONS[t.dataset.change]) ACTIONS[t.dataset.change](t, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { closeModal(); return; }
  if (e.key === 'Enter' && e.target.id === 'name-input') { e.target.blur(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
  // atalho N para adicionar livro, fora de campos de texto
  if ((e.key === 'n' || e.key === 'N') && !S.modal && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input, textarea, select')) {
    e.preventDefault();
    openAdd();
  }
});

// Enquadrar a foto arrastando
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const crop = e.target.closest('#crop');
  if (!crop || !S.modal || S.modal.type !== 'photo') return;
  drag = { x: e.clientX, y: e.clientY, ox: S.modal.x, oy: S.modal.y };
  crop.setPointerCapture(e.pointerId);
  crop.classList.add('grabbing');
});
document.addEventListener('pointermove', (e) => {
  if (drag && S.modal && S.modal.type === 'photo') {
    S.modal.x = drag.ox + (e.clientX - drag.x);
    S.modal.y = drag.oy + (e.clientY - drag.y);
    applyCrop();
    return;
  }
  // capa inclinando com o mouse
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('[data-tilt]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--ry', `${(x * 18).toFixed(1)}deg`);
  el.style.setProperty('--rx', `${(-y * 12).toFixed(1)}deg`);
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  const c = $('#crop');
  if (c) c.classList.remove('grabbing');
});
document.addEventListener('pointerout', (e) => {
  const el = e.target.closest && e.target.closest('[data-tilt]');
  if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); }
});
document.addEventListener('wheel', (e) => {
  if (!S.modal || S.modal.type !== 'photo' || !e.target.closest('#crop')) return;
  e.preventDefault();
  S.modal.zoom = Math.max(1, Math.min(3, S.modal.zoom - e.deltaY * 0.002));
  const z = $('[data-crop-zoom]');
  if (z) z.value = S.modal.zoom;
  applyCrop();
}, { passive: false });

// No mapa do ano, passar o dedo também mostra o dia
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest && e.target.closest('.heat i[data-d]');
  if (el) ACTIONS.heat(el);
});

window.addEventListener('hashchange', route);

/* ================= início ================= */
applyTheme(readPref('theme', 'auto'));
route();
store.init();
