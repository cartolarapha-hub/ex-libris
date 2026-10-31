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
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const CLOTHS = ['#6b2232', '#1f3a4d', '#2f4a2c', '#7a5520', '#4a2848', '#3a3631', '#5b2a1a', '#24443f', '#2b2f52'];
const MIN_SUMMARY = 40;

const STATUS = { quero: 'Quero ler', lendo: 'Lendo', resumo: 'Falta o resumo', concluido: 'Lido' };
const SHELVES = {
  resumo: { title: 'Falta o resumo', hint: 'só contam como lidos depois do resumo' },
  lendo: { title: 'Lendo', hint: 'na mesa de leitura' },
  concluido: { title: 'Lidos', hint: 'toque na capa para reler seu resumo' },
  quero: { title: 'Quero ler', hint: 'a fila de espera' },
};

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  flame: '<svg class="flame-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c1.2 4.3 5.5 5.8 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.7 1.6-4.3 2.7-5.4.3 2.1 1.4 3.2 2.7 3.2 0-3.2-1.1-5.3.1-8.4z" style="fill:currentColor;fill-opacity:.18"/></svg>',
  quill: '<svg class="quill" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5C13 4.5 8 9.5 6.5 17.5M20.5 3.5c-1.5 6-5.5 10-11 11.5M6.5 17.5L4 21M9.5 12.5l3 1"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

const WAX_PATH = 'M32 3c4 3 7 1 10 4s2 6 6 8 6 3 6 8-3 5-2 9 3 6 0 10-6 3-8 6-3 7-8 7-6-3-9-3-6 3-10 1-3-6-6-8-6-3-6-8 3-6 2-10-3-6 0-10 6-3 8-6 3-6 9-6 4 0 8-2z';

/* ================= estado ================= */
const today = () => ymd();
const now = new Date();
const S = {
  books: {}, logs: {}, settings: {}, mode: 'local', user: null, ready: false, authError: '',
  view: 'estante',
  filter: 'todos', search: '', genre: '', sort: 'recentes',
  shelfMode: readPref('shelfMode', 'capas'),
  cal: { y: now.getFullYear(), m: now.getMonth(), sel: ymd(now), just: '' },
  modal: null,
  busy: {},
  keyStatus: null,
  profileTried: false,
};

function readPref(k, d) { try { return localStorage.getItem(`exlibris:${k}`) || d; } catch (e) { return d; } }
function writePref(k, v) { try { localStorage.setItem(`exlibris:${k}`, v); } catch (e) { /* ignora */ } }

const allBooks = () => Object.values(S.books);
const logsOf = (id) => Object.values(S.logs).filter((l) => l.bookId === id).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));

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
  const cloth = `<span class="cloth" style="--cloth:${color}"><span class="cloth-title">${esc(b.title)}</span><span class="cloth-rule"></span><span class="cloth-author">${esc((b.authors || [])[0] || '')}</span></span>`;
  if (!b.cover) return `<span class="cover cover-fallback ${extra}">${cloth}</span>`;
  const alts = (b.coverAlts || []).filter((c) => c && c !== b.cover).join('|');
  return `<span class="cover ${extra}"><img src="${esc(b.cover)}" data-alts="${esc(alts)}" alt="Capa de ${esc(b.title)}" loading="lazy" referrerpolicy="no-referrer" onload="__coverLoad(this)" onerror="__coverErr(this)">${cloth}</span>`;
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
const store = new Store((st) => {
  Object.assign(S, st);
  renderChrome();
  renderView();
  if (S.modal && S.modal.type === 'book' && !fieldFocused()) renderModal();
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
  $$('.tabs a').forEach((a) => {
    const on = a.dataset.view === S.view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const name = readerName().split(' ')[0];
  $('#brand-sub').textContent = name ? `biblioteca de ${name}` : 'biblioteca particular';
  const chip = $('#sync-chip');
  chip.hidden = false;
  if (!cloudAvailable) {
    chip.outerHTML = '<span id="sync-chip" class="sync-chip" title="Os dados ficam salvos neste navegador">só neste aparelho</span>';
  } else if (S.user) {
    chip.outerHTML = '<span id="sync-chip" class="sync-chip" title="Sincronizado com sua conta Google">sincronizado</span>';
  } else {
    chip.outerHTML = '<button id="sync-chip" class="sync-chip" type="button" data-action="login">entrar para sincronizar</button>';
  }
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
  if (!S.ready) {
    v.innerHTML = loadingHTML('Abrindo a biblioteca…');
    return;
  }
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

function loadingHTML(msg) {
  return `<div class="loading-box">${ICON.quill}<p>${esc(msg)}</p></div>`;
}

function bannersHTML() {
  const out = [];
  if (S.authError) out.push(`<div class="banner warn"><p>${esc(S.authError)}</p></div>`);
  if (cloudAvailable && !S.user) {
    out.push('<div class="banner"><p>Entre com sua conta Google para abrir esta mesma estante no celular e no computador.</p><button class="btn btn-sm btn-ink" data-action="login">Entrar com Google</button></div>');
  }
  return out.join('');
}

/* ================= ESTANTE ================= */
function perRow() {
  const w = Math.min(window.innerWidth, 1180);
  if (w >= 1100) return 8;
  if (w >= 900) return 6;
  if (w >= 680) return 5;
  if (w >= 470) return 4;
  return 3;
}

function viewEstante() {
  const all = allBooks();
  const c = (st) => all.filter((b) => b.status === st).length;
  const lede = all.length
    ? `${plural(c('concluido'), 'lido', 'lidos')}, ${plural(c('lendo'), 'na mesa', 'na mesa')} e ${plural(c('quero'), 'esperando a vez', 'esperando a vez')}.${c('resumo') ? ` ${plural(c('resumo'), 'resumo pendente', 'resumos pendentes')}.` : ''}`
    : 'Cada livro que você lê ganha uma ficha, um resumo e uma sugestão do que ler depois.';
  const head = `<div class="page-head"><div><span class="eyebrow">Acervo particular · ${plural(all.length, 'volume', 'volumes')}</span><h1>A <em>estante</em></h1><p class="lede">${lede}</p></div></div>`;
  if (!all.length) {
    return `${head}${bannersHTML()}<div class="empty">${ICON.quill}<h3>Uma estante esperando o primeiro volume</h3><p>Digite o título e o autor: a capa, o número de páginas e a sinopse vêm sozinhos. Depois é só ler, registrar as páginas no calendário e escrever o resumo.</p><button class="btn btn-gold" data-action="add-book">Catalogar o primeiro livro</button></div>`;
  }
  const reading = all.filter((b) => b.status === 'lendo').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const mesa = reading.length
    ? `<h2 class="section-title">Na mesa de leitura <small>${reading.length}</small></h2><div class="now-reading">${reading.map(readingCard).join('')}</div>`
    : '';
  return `${head}${bannersHTML()}${mesa}${toolbarHTML(all)}<div id="shelves">${shelvesHTML()}</div>`;
}

function readingCard(b) {
  const p = pct(b);
  const r = rhythm(b);
  const eta = r && r.eta ? `<span class="muted" style="font-size:.92rem;font-style:italic">No seu ritmo, termina por volta de ${fmtDate(r.eta, { day: 'numeric', month: 'long' })}.</span>` : '';
  return `<article class="reading-card">
    <div role="button" tabindex="0" data-action="open-book" data-id="${b.id}" aria-label="Abrir ${esc(b.title)}">${coverHTML(b)}</div>
    <div class="info">
      <h3>${esc(b.title)}</h3>
      <span class="author">${esc(authorsOf(b))}</span>
      <div class="progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>
      <div class="progress-meta"><span>pág. ${b.pagesRead || 0} de ${b.pages || '?'}</span><span>${p}%</span></div>
      ${eta}
      <div class="row">
        <button class="btn btn-sm btn-ink" type="button" data-action="open-log" data-id="${b.id}">${ICON.plus}<span>Páginas</span></button>
        <button class="btn btn-sm btn-ghost" type="button" data-action="open-book" data-id="${b.id}" data-tab="resumo">Concluir</button>
      </div>
    </div>
  </article>`;
}

function toolbarHTML(all) {
  const count = (st) => all.filter((b) => b.status === st).length;
  const chips = [['todos', 'Todos', all.length], ['lendo', 'Lendo', count('lendo')], ['resumo', 'Falta o resumo', count('resumo')], ['concluido', 'Lidos', count('concluido')], ['quero', 'Quero ler', count('quero')]]
    .filter(([k, , n]) => k !== 'resumo' || n)
    .map(([k, label, n]) => `<button type="button" class="chip ${S.filter === k ? 'on' : ''}" data-action="filter" data-f="${k}">${label}<span class="n">${n}</span></button>`)
    .join('');
  const genres = [...new Set(all.map((b) => b.genre).filter(Boolean))].sort();
  return `<div class="toolbar">
    <label class="search">${ICON.search}<input id="shelf-search" type="search" placeholder="Procurar por título ou autor" value="${esc(S.search)}" data-input="search" aria-label="Procurar na estante"></label>
    <div class="chips">${chips}</div>
    <select class="select" data-change="genre" aria-label="Filtrar por gênero"><option value="">Todos os gêneros</option>${genres.map((g) => `<option ${S.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
    <select class="select" data-change="sort" aria-label="Ordenar">
      ${[['recentes', 'Mais recentes'], ['titulo', 'Título'], ['autor', 'Autor'], ['nota', 'Nota'], ['paginas', 'Páginas']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <div class="seg" role="group" aria-label="Modo da estante">
      <button type="button" class="${S.shelfMode === 'capas' ? 'on' : ''}" data-action="shelf-mode" data-m="capas">Capas</button>
      <button type="button" class="${S.shelfMode === 'lombadas' ? 'on' : ''}" data-action="shelf-mode" data-m="lombadas">Lombadas</button>
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
  if (!list.length) return '<div class="empty"><h3>Nada nesta prateleira</h3><p>Nenhum livro combina com essa busca ou filtro.</p></div>';
  let groups;
  if (S.filter === 'todos' && !S.search && !S.genre) {
    groups = ['resumo', 'concluido', 'quero'].map((st) => [st, list.filter((b) => b.status === st)]).filter(([, l]) => l.length);
    if (!groups.length) groups = [['lendo', list]];
  } else if (S.filter === 'todos') {
    groups = [['busca', list]];
  } else {
    groups = [[S.filter, list]];
  }
  return groups.map(([st, l]) => shelfHTML(st, l)).join('');
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function shelfHTML(st, list) {
  const meta = SHELVES[st] || { title: 'Resultados', hint: '' };
  const head = `<header class="shelf-head"><h2>${meta.title}</h2><span class="label-plate">${list.length}</span><span class="hint">${meta.hint}</span></header>`;
  if (S.shelfMode === 'lombadas') {
    const per = Math.max(8, Math.floor((Math.min(window.innerWidth, 1180) - 60) / 40));
    return `<section class="shelf">${head}${chunk(list, per).map((row) => `<div class="spine-row">${row.map(spineHTML).join('')}</div><div class="plank"></div>`).join('')}</section>`;
  }
  const n = perRow();
  return `<section class="shelf">${head}${chunk(list, n).map((row) => `<div class="shelf-row" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${row.map(tileHTML).join('')}</div><div class="plank"></div>`).join('')}</section>`;
}

function tileHTML(b) {
  let extra = '';
  if (b.status === 'lendo') extra = `<span class="mini-progress"><i style="width:${pct(b)}%"></i></span>`;
  if (b.status === 'concluido') extra = stars(b.rating);
  return `<button type="button" class="book-tile" data-action="open-book" data-id="${b.id}">
    ${b.status === 'resumo' ? '<span class="tile-flag">resumo</span>' : ''}
    ${coverHTML(b)}
    <span class="tile-cap"><span class="tile-title">${esc(b.title)}</span><span class="tile-author">${esc(authorsOf(b))}</span>${extra}</span>
  </button>`;
}

function spineHTML(b, i) {
  const h = hashStr(b.id);
  const color = CLOTHS[hashStr(b.title + authorsOf(b)) % CLOTHS.length];
  const width = Math.max(26, Math.min(56, Math.round((b.pages || 250) / 14)));
  const height = 150 + (h % 46);
  const tilt = i > 0 && h % 9 === 0 ? 'tilt-l' : '';
  return `<button type="button" class="spine ${tilt}" style="--c:${color};--w:${width}px;--h:${height}px" data-action="open-book" data-id="${b.id}" title="${esc(b.title)} — ${esc(authorsOf(b))}"><span>${esc(b.title)}</span></button>`;
}

/* ================= MODAL: ficha do livro ================= */
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
  if (b.status === 'lendo') return [['progresso', 'Progresso'], ['resumo', 'Concluir'], ['ficha', 'Ficha']];
  if (b.status === 'resumo') return [['resumo', 'Escrever resumo'], ['ficha', 'Ficha']];
  return [['resumo', 'Meu resumo'], ['sugestao', 'Com base nessa leitura', 'special'], ['ficha', 'Ficha']];
}

function maybeAutoRecs() {
  const m = S.modal;
  if (!m || m.type !== 'book' || m.tab !== 'sugestao') return;
  const b = S.books[m.id];
  if (b && b.status === 'concluido' && !b.recs && !S.busy[b.id]) requestRecs(b.id);
}

function bookModalHTML() {
  const m = S.modal;
  const b = S.books[m.id];
  if (!b) return '';
  const tabs = tabsFor(b);
  if (!tabs.some(([k]) => k === m.tab)) m.tab = tabs[0][0];
  let side = '';
  if (b.status === 'lendo') {
    side = `<div class="progress"><i style="width:${pct(b)}%"></i></div><div class="progress-meta"><span>pág. ${b.pagesRead || 0}/${b.pages || '?'}</span><span>${pct(b)}%</span></div>`;
  } else if (b.status === 'concluido') {
    const d = b.startDate && b.endDate ? daysBetween(b.startDate, b.endDate) + 1 : null;
    side = `${stars(b.rating, 'big-stars')}<span class="type muted" style="font-size:.8rem">lido em ${fmtDate(b.endDate)}${d ? ` · ${plural(d, 'dia', 'dias')}` : ''}</span>`;
  }
  const pane = { ficha: fichaPane, progresso: progressPane, resumo: resumoPane, sugestao: sugestaoPane }[m.tab](b);
  return `<div class="ficha">
    <div class="ficha-side"><div class="cover-wrap tilt" data-tilt>${coverHTML(b)}</div><div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1">${side}</div></div>
    <div class="ficha-body">
      <span class="status-pill st-${b.status}">${STATUS[b.status]}</span>
      <h2>${esc(b.title)}</h2>
      <p class="by">${esc(authorsOf(b))}${b.year ? `, ${esc(b.year)}` : ''}</p>
      <div class="mtabs" role="tablist">${tabs.map(([k, label, cls]) => `<button type="button" role="tab" aria-selected="${m.tab === k}" class="${m.tab === k ? 'on' : ''} ${cls || ''}" data-action="book-tab" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="tabpane">${pane}</div>
    </div>
  </div>`;
}

function fichaPane(b) {
  const m = S.modal;
  if (m.editing) return editPane(b);
  const rows = [
    ['Autor', authorsOf(b) || '—'],
    ['Título', b.title],
    ['Publicação', b.year || '—'],
    ['Páginas', b.pages || '—'],
    ['Gênero', b.genre || '—'],
    ['Catalogado em', fmtDate(ymd(new Date(b.addedAt || Date.now())))],
  ];
  if (b.startDate) rows.push(['Início', fmtDate(b.startDate)]);
  if (b.endDate && b.status === 'concluido') rows.push(['Término', fmtDate(b.endDate)]);
  const card = `<div class="catalog-card"><span class="callno">${esc(callNumber(b))}</span><dl style="margin:0">${rows.map(([k, v]) => `<div class="cc-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`;
  const syn = b.synopsis
    ? `<div><p class="synopsis ${m.synOpen ? '' : 'clamp'}">${esc(b.synopsis)}</p>${b.synopsis.length > 320 ? `<button type="button" class="btn-link" data-action="toggle-syn">${m.synOpen ? 'recolher' : 'ler a sinopse inteira'}</button>` : ''}</div>`
    : '';
  const acts = [];
  if (b.status === 'quero') acts.push('<button type="button" class="btn btn-ink" data-action="start-reading">Começar a ler</button>');
  if (b.status === 'lendo') {
    acts.push(`<button type="button" class="btn btn-ink" data-action="open-log" data-id="${b.id}">Registrar páginas</button>`);
    acts.push('<button type="button" class="btn btn-ghost" data-action="book-tab" data-tab="resumo">Concluir leitura</button>');
    acts.push('<button type="button" class="btn btn-ghost" data-action="back-to-quero">Voltar para Quero ler</button>');
  }
  if (b.status === 'resumo') acts.push('<button type="button" class="btn btn-ink" data-action="book-tab" data-tab="resumo">Escrever o resumo</button>');
  acts.push('<button type="button" class="btn btn-ghost" data-action="edit-book">Editar dados e capa</button>');
  acts.push(`<button type="button" class="btn btn-danger" data-action="ask-delete">${ICON.trash}<span>Excluir</span></button>`);
  const confirm = m.confirmDelete
    ? `<div class="confirm-box"><p style="flex:1 1 220px">Excluir “${esc(b.title)}” e todos os registros de leitura dele? Isso não tem volta.</p><button type="button" class="btn btn-danger solid" data-action="confirm-delete">Excluir</button><button type="button" class="btn btn-ghost" data-action="cancel-delete">Cancelar</button></div>`
    : '';
  return `${card}${syn}<div class="actions">${acts.join('')}</div>${confirm}`;
}

function editPane(b) {
  const covers = [...new Set([b.cover, ...(b.coverAlts || [])].filter(Boolean))];
  const picks = covers.map((c) => `<button type="button" class="cover-pick ${c === b.cover ? 'on' : ''}" data-action="pick-cover" data-url="${esc(c)}" aria-label="Usar esta capa">${coverHTML({ ...b, cover: c, coverAlts: [] })}</button>`).join('');
  return `<form class="form" data-submit="save-edit">
    <div class="form-grid">
      <label class="field"><span>Título</span><input id="ed-title" value="${esc(b.title)}" required></label>
      <label class="field"><span>Autor(es)</span><input id="ed-author" value="${esc(authorsOf(b))}" placeholder="separe por vírgula"></label>
      <label class="field"><span>Páginas</span><input id="ed-pages" type="number" min="0" inputmode="numeric" value="${b.pages || ''}"></label>
      <label class="field"><span>Gênero</span><select id="ed-genre"><option value="">—</option>${GENRES.map((g) => `<option ${b.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    </div>
    <div class="field"><span>Capa</span>
      <div class="cover-picks">${picks}<button type="button" class="cover-pick ${!b.cover ? 'on' : ''}" data-action="pick-cover" data-url="" aria-label="Usar encadernação">${coverHTML({ ...b, cover: '' })}</button></div>
      <div class="actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-ghost" data-action="more-covers" ${S.busy.covers ? 'disabled' : ''}>${S.busy.covers ? 'Procurando…' : 'Procurar outras capas'}</button></div>
    </div>
    <div class="actions"><button type="submit" class="btn btn-ink">Salvar</button><button type="button" class="btn btn-ghost" data-action="cancel-edit">Cancelar</button></div>
  </form>`;
}

function progressPane(b) {
  const r = rhythm(b);
  const ls = logsOf(b.id);
  const stats = `<div class="stats-grid">
    <div class="stat"><span class="k">Página</span><span class="v">${b.pagesRead || 0}<small> de ${b.pages || '?'}</small></span></div>
    <div class="stat"><span class="k">Ritmo</span><span class="v">${r ? Math.round(r.perDay) : '—'}<small> pág/dia</small></span></div>
    <div class="stat"><span class="k">Previsão</span><span class="v" style="font-size:1.5rem">${r && r.eta ? fmtDate(r.eta, { day: 'numeric', month: 'short' }) : '—'}</span></div>
  </div>`;
  const totalField = !b.pages
    ? `<form class="form" data-submit="set-total"><label class="field"><span>Quantas páginas o livro tem?</span><input id="pp-total" type="number" min="1" inputmode="numeric" required></label><div class="actions"><button class="btn btn-sm btn-ink" type="submit">Salvar</button></div></form>`
    : '';
  const quick = `<form class="form" data-submit="quick-page">
    <div class="pages-input"><span class="muted" style="font-style:italic">Parei na página</span><input id="pp-page" type="number" min="0" ${b.pages ? `max="${b.pages}"` : ''} inputmode="numeric" placeholder="${b.pagesRead || 0}" aria-label="Página onde parei"><button class="btn btn-ink" type="submit">Atualizar</button></div>
    <p class="muted" style="font-size:.9rem;font-style:italic">A diferença entra no calendário de hoje. Para outro dia, use o <button type="button" class="btn-link" data-action="open-log" data-id="${b.id}">registro detalhado</button>.</p>
  </form>`;
  const hist = ls.length
    ? `<h3 style="font-size:1.2rem">Diário deste livro</h3><ul class="log-list">${ls.slice(0, 30).map((l) => `<li><span class="type muted" style="font-size:.78rem">${fmtDate(l.date, { day: '2-digit', month: 'short' })}</span><span class="t">${l.date === today() ? 'hoje' : fmtDate(l.date, { weekday: 'long' })}</span><span class="n">+${l.pages}</span><button type="button" class="x" data-action="log-delete" data-id="${l.id}" aria-label="Apagar registro">${ICON.trash}</button></li>`).join('')}</ul>`
    : '<p class="muted" style="font-style:italic">Nenhuma página registrada ainda. Cada registro alimenta seu calendário e sua sequência de dias.</p>';
  return `${stats}${totalField}${quick}${hist}`;
}

function resumoPane(b) {
  const m = S.modal;
  if (b.status === 'concluido' && !m.editing) {
    const d = b.startDate && b.endDate ? daysBetween(b.startDate, b.endDate) + 1 : null;
    return `<div class="note-meta"><span>Nota ${stars(b.rating)}</span><span>Início <b>${fmtDate(b.startDate)}</b></span><span>Término <b>${fmtDate(b.endDate)}</b></span>${d ? `<span>Leitura de <b>${plural(d, 'dia', 'dias')}</b></span>` : ''}<span>Gênero <b>${esc(b.genre || '—')}</b></span></div>
      <div class="note-card">${esc(b.summary)}</div>
      <div class="actions"><button type="button" class="btn btn-leather" data-action="book-tab" data-tab="sugestao">O que ler depois?</button><button type="button" class="btn btn-ghost" data-action="edit-summary">Editar resumo</button></div>`;
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
    : '<p class="muted" style="font-style:italic">O livro só entra para os lidos depois do resumo. Não precisa ser longo: do que se trata, o que você sentiu, o que fica com você.</p>';
  return `${intro}<form class="form" data-submit="save-summary">
    <div class="field"><span>Sua nota</span><div class="rating-input">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= f.rating ? 'on' : ''}" data-action="rate" data-n="${i}" aria-label="${i} estrela${i > 1 ? 's' : ''}">★</button>`).join('')}<span class="lbl">${labels[f.rating] || 'toque nas estrelas'}</span></div></div>
    <div class="form-grid">
      <label class="field"><span>Gênero</span><select id="sum-genre" data-form="genre"><option value="">—</option>${GENRES.map((g) => `<option ${f.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span>Comecei em</span><input id="sum-start" type="date" max="${today()}" value="${esc(f.start)}" data-form="start"></label>
      <label class="field"><span>Terminei em</span><input id="sum-end" type="date" max="${today()}" value="${esc(f.end)}" data-form="end"></label>
    </div>
    <label class="field"><span>Meu resumo</span><textarea id="sum-text" data-form="summary" placeholder="Do que se trata, o que te marcou, se recomendaria…">${esc(f.summary)}</textarea><span id="sum-counter" class="counter ${n >= MIN_SUMMARY ? 'ok' : ''}">${n >= MIN_SUMMARY ? 'pronto para arquivar' : `${n}/${MIN_SUMMARY} caracteres`}</span></label>
    ${f.error ? `<p class="err">${esc(f.error)}</p>` : ''}
    <div class="actions"><button type="submit" class="btn btn-leather">${b.status === 'concluido' ? 'Salvar resumo' : 'Arquivar como lido'}</button>${b.status === 'concluido' ? '<button type="button" class="btn btn-ghost" data-action="cancel-summary">Cancelar</button>' : ''}</div>
  </form>`;
}

function sugestaoPane(b) {
  if (S.busy[b.id]) return loadingHTML(`Procurando o próximo livro com base em “${b.title}”…`);
  if (!b.recs) {
    return `<p>Com base na sua nota, no seu resumo e em tudo que você já leu, a estante sugere o que ler depois.</p><div class="actions"><button type="button" class="btn btn-leather" data-action="rec-request" data-id="${b.id}">Sugerir o próximo livro</button></div>`;
  }
  return recsHTML(b.recs, b.id, `O que ler depois de “${b.title}”`);
}

function recsHTML(r, owner, title) {
  const items = r.items || [];
  if (!items.length) {
    return `<p class="muted" style="font-style:italic">Não encontrei boas sugestões dessa vez.</p><div class="actions"><button type="button" class="btn btn-leather" data-action="rec-request" data-id="${owner}">${ICON.refresh}<span>Tentar de novo</span></button></div>`;
  }
  const badge = r.source === 'ia' ? '<span class="source-badge ia">escolha da IA</span>' : '<span class="source-badge motor">motor da estante</span>';
  const [main, ...alts] = items;
  const actionsFor = (it, i) => {
    if (it.state === 'quero') return '<span class="rec-state">Na sua fila de Quero ler</span>';
    if (it.state === 'lido') return '<span class="rec-state">Na estante, esperando o resumo</span>';
    if (it.state === 'descartado') return '<span class="rec-state no">Descartado</span>';
    return `<div class="actions">
      <button type="button" class="btn btn-sm btn-ink" data-action="rec-quero" data-owner="${owner}" data-i="${i}">Quero ler</button>
      <button type="button" class="btn btn-sm btn-ghost" data-action="rec-read" data-owner="${owner}" data-i="${i}">Já li</button>
      <button type="button" class="btn btn-sm btn-ghost" data-action="rec-no" data-owner="${owner}" data-i="${i}">Não me interessa</button>
    </div>`;
  };
  const asBook = (it) => ({ title: it.title, authors: [it.author], cover: it.cover, coverAlts: it.covers || [] });
  const meta = (it) => [it.genre, it.year, it.pages ? `${it.pages} págs.` : ''].filter(Boolean).join(' · ');
  return `<div class="rec-head"><h3>${esc(title)}</h3>${badge}</div>
    ${r.note ? `<p class="muted" style="font-style:italic;font-size:.92rem">${esc(r.note)}</p>` : ''}
    <article class="rec-main ${main.state === 'descartado' ? 'dimmed' : ''}">
      <span class="ribbon">1ª escolha</span>
      ${coverHTML(asBook(main))}
      <div class="rec-body">
        <h4>${esc(main.title)}</h4>
        <span class="by">${esc(main.author)}</span>
        ${main.hook ? `<p class="hook">${esc(main.hook)}</p>` : ''}
        <p class="why">${esc(main.why)}</p>
        ${meta(main) ? `<span class="meta">${esc(meta(main))}</span>` : ''}
        ${actionsFor(main, 0)}
      </div>
    </article>
    ${alts.length ? `<div class="rec-alts">${alts.map((it, j) => `<article class="rec-alt ${it.state === 'descartado' ? 'dimmed' : ''}">${coverHTML(asBook(it))}<div style="min-width:0;display:flex;flex-direction:column;gap:4px"><h5>${esc(it.title)}</h5><span class="by" style="font-style:italic;font-size:.9rem">${esc(it.author)}</span><p class="why">${esc(it.why)}</p>${actionsFor(it, j + 1)}</div></article>`).join('')}</div>` : ''}
    <div class="actions"><button type="button" class="btn btn-ghost" data-action="rec-request" data-id="${owner}">${ICON.refresh}<span>Outras sugestões</span></button></div>`;
}

/* ================= MODAL: catalogar ================= */
function openAdd() {
  S.modal = { type: 'add', step: 'busca', title: '', author: '', results: null, loading: false, error: '', pick: null, draft: null, coverIdx: 0, status: 'quero', pageAt: '', start: today(), dupWarn: false };
  renderModal();
  setTimeout(() => { const i = $('#add-title'); if (i) i.focus(); }, 60);
}

function addModalHTML() {
  const m = S.modal;
  if (m.step === 'confirmar') return addConfirmHTML();
  let results = '';
  if (m.loading) results = loadingHTML('Procurando nos catálogos…');
  else if (m.error) results = `<p class="err">${esc(m.error)}</p>`;
  else if (m.results && !m.results.length) results = '<p class="muted" style="font-style:italic">Não encontrei esse livro. Confira a grafia ou cadastre sem buscar.</p>';
  else if (m.results) {
    results = `<p class="muted" style="font-style:italic">Toque na edição certa:</p><div class="results">${m.results.map((r, i) => `<button type="button" class="result" data-action="add-pick" data-i="${i}">${coverHTML({ title: r.title, authors: r.authors, cover: r.covers[0], coverAlts: r.covers })}<span class="t">${esc(r.title)}</span><span class="a">${esc(r.authors.join(', '))}</span><span class="m">${[r.year, r.pages ? `${r.pages} p.` : ''].filter(Boolean).join(' · ')}</span></button>`).join('')}</div>`;
  }
  return `<span class="eyebrow">Novo volume</span><h2 style="font-size:var(--step-3);margin-bottom:14px">Catalogar livro</h2>
    <form class="form" data-submit="add-search">
      <div class="form-grid">
        <label class="field"><span>Título</span><input id="add-title" value="${esc(m.title)}" data-bind="title" autocomplete="off" placeholder="Ex.: Dom Casmurro"></label>
        <label class="field"><span>Autor</span><input id="add-author" value="${esc(m.author)}" data-bind="author" autocomplete="off" placeholder="Ex.: Machado de Assis"></label>
      </div>
      <div class="actions"><button type="submit" class="btn btn-ink" ${m.loading ? 'disabled' : ''}>${ICON.search}<span>Buscar capa e dados</span></button><button type="button" class="btn-link" data-action="add-manual">cadastrar sem buscar</button></div>
    </form>
    <div style="margin-top:18px">${results}</div>`;
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
    ? `<div class="form-grid"><label class="field"><span>Já estou na página</span><input type="number" min="0" inputmode="numeric" value="${esc(m.pageAt)}" data-bind="pageAt" placeholder="0"></label><label class="field"><span>Comecei em</span><input type="date" max="${today()}" value="${esc(m.start)}" data-bind="start"></label></div>`
    : st === 'lido'
      ? '<p class="muted" style="font-style:italic">Em seguida você escreve o resumo. Até lá, o livro fica na prateleira “Falta o resumo”.</p>'
      : '';
  return `<button type="button" class="btn-link" data-action="add-back">← voltar à busca</button>
    <div class="ficha" style="margin-top:12px">
      <div class="ficha-side"><div class="cover-wrap tilt" data-tilt>${coverHTML(preview)}</div>${picks}</div>
      <form class="ficha-body form" data-submit="add-save">
        <span class="eyebrow">Confira a ficha</span>
        <div class="form-grid">
          <label class="field"><span>Título</span><input value="${esc(d.title)}" data-bind="draft.title" required></label>
          <label class="field"><span>Autor(es)</span><input value="${esc(d.author)}" data-bind="draft.author"></label>
          <label class="field"><span>Páginas</span><input type="number" min="0" inputmode="numeric" value="${esc(d.pages)}" data-bind="draft.pages"></label>
          <label class="field"><span>Gênero</span><select data-bind="draft.genre"><option value="">—</option>${GENRES.map((g) => `<option ${d.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>
        <div class="field"><span>Onde ele entra?</span>
          <div class="status-choice">
            <button type="button" class="${st === 'quero' ? 'on' : ''}" data-action="add-status" data-s="quero">Quero ler<small>para a fila</small></button>
            <button type="button" class="${st === 'lendo' ? 'on' : ''}" data-action="add-status" data-s="lendo">Lendo<small>na mesa agora</small></button>
            <button type="button" class="${st === 'lido' ? 'on' : ''}" data-action="add-status" data-s="lido">Já li<small>escrevo o resumo</small></button>
          </div>
        </div>
        ${extra}
        ${m.dupWarn ? '<div class="confirm-box"><p style="flex:1 1 200px">Esse livro já está na sua estante. Quer catalogar outra vez mesmo assim?</p><button type="submit" class="btn btn-sm btn-ink">Sim, catalogar</button></div>' : ''}
        ${m.error ? `<p class="err">${esc(m.error)}</p>` : ''}
        <div class="actions"><button type="submit" class="btn btn-gold">Pôr na estante</button></div>
      </form>
    </div>`;
}

/* ================= MODAL: registrar leitura ================= */
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
  const head = `<span class="eyebrow">Registro de leitura</span><h2 style="font-size:var(--step-3);margin-bottom:14px">O que você leu ${isToday ? 'hoje' : `em ${fmtDate(m.date, { day: 'numeric', month: 'long' })}`}?</h2>`;
  if (!reading.length) {
    return `${head}<p class="muted" style="font-style:italic">Nenhum livro está marcado como “Lendo”. Abra um livro da fila e toque em “Começar a ler”.</p><div class="actions" style="margin-top:12px"><button type="button" class="btn btn-ink" data-action="close-go" data-to="estante">Ir para a estante</button></div>`;
  }
  const b = S.books[m.bookId];
  const hint = b ? `Você estava na página ${b.pagesRead || 0}${b.pages ? ` de ${b.pages}` : ''}.` : '';
  return `${head}<form class="form" data-submit="log-save">
    <div class="field"><span>Qual livro?</span><div class="book-pick">${reading.map((r) => `<button type="button" class="${r.id === m.bookId ? 'on' : ''}" data-action="log-book" data-id="${r.id}">${coverHTML(r)}<span class="t">${esc(r.title)}</span></button>`).join('')}</div></div>
    <div class="seg" role="group" aria-label="Como registrar"><button type="button" class="${m.mode === 'qtd' ? 'on' : ''}" data-action="log-mode" data-m="qtd">Li X páginas</button><button type="button" class="${m.mode === 'pagina' ? 'on' : ''}" data-action="log-mode" data-m="pagina">Parei na página</button></div>
    <div class="pages-input"><input id="log-value" type="number" min="1" inputmode="numeric" value="${esc(m.value)}" data-bind="value" aria-label="${m.mode === 'qtd' ? 'Páginas lidas' : 'Página onde parei'}"><span class="muted" style="font-style:italic">${m.mode === 'qtd' ? 'páginas' : 'é onde parei'}</span></div>
    ${m.mode === 'qtd' ? `<div class="quick">${[5, 10, 20, 30, 50].map((n) => `<button type="button" class="chip" data-action="log-quick" data-n="${n}">+${n}</button>`).join('')}</div>` : ''}
    <p class="muted" style="font-size:.92rem">${esc(hint)}</p>
    <label class="field" style="max-width:220px"><span>Dia</span><input type="date" max="${today()}" value="${esc(m.date)}" data-bind="date"></label>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ''}
    <div class="actions"><button type="submit" class="btn btn-gold">Carimbar no calendário</button></div>
  </form>`;
}

/* ================= modal genérico ================= */
function renderModal() {
  const root = $('#modal-root');
  if (!S.modal) {
    root.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  const old = root.querySelector('.modal');
  const scroll = old ? old.scrollTop : 0;
  const html = { book: bookModalHTML, add: addModalHTML, log: logModalHTML }[S.modal.type]();
  if (!S.modal) { root.innerHTML = ''; return; }
  const narrow = S.modal.type === 'log' ? 'narrow' : '';
  const label = { book: 'Ficha do livro', add: 'Catalogar livro', log: 'Registrar leitura' }[S.modal.type];
  root.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><div class="modal ${narrow}" role="dialog" aria-modal="true" aria-label="${label}"><button type="button" class="icon-btn modal-close" data-action="close-modal" aria-label="Fechar">${ICON.close}</button>${html}</div></div>`;
  const modal = root.querySelector('.modal');
  if (old) {
    modal.style.animation = 'none';
    root.querySelector('.modal-backdrop').style.animation = 'none';
    modal.scrollTop = scroll;
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
  const todayPct = Math.min(100, Math.round((todayPages / goal) * 100));

  const board = `<div class="streak-board">
    <div class="stat flame"><span class="k">Sequência</span><span class="v">${ICON.flame}${cur}<small>${cur === 1 ? 'dia' : 'dias'}</small></span><span class="muted" style="font-size:.86rem">recorde: ${plural(best, 'dia', 'dias')}</span></div>
    <div class="stat"><span class="k">Hoje</span><span class="v">${todayPages}<small>/ ${goal} pág.</small></span><div class="progress" style="margin-top:6px"><i style="width:${todayPct}%"></i></div></div>
    <div class="stat"><span class="k">Meta diária</span><div class="goal-ctl"><button type="button" data-action="goal" data-d="-5" aria-label="Diminuir meta">−</button><span class="v">${goal}</span><button type="button" data-action="goal" data-d="5" aria-label="Aumentar meta">+</button></div><span class="muted" style="font-size:.86rem">páginas por dia</span></div>
    <div class="stat"><span class="k">Em ${MONTHS[m]}</span><span class="v">${monthPages}<small> pág.</small></span><span class="muted" style="font-size:.86rem">${plural(monthDays.length, 'dia', 'dias')} de leitura · ${metDays} na meta</span></div>
  </div>`;

  const first = new Date(y, m, 1).getDay();
  const nDays = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="cal-day out" aria-hidden="true"></span>');
  for (let d = 1; d <= nDays; d++) {
    const key = `${monthKey}-${pad(d)}`;
    const p = totals[key] || 0;
    const future = key > t;
    const cls = [`lvl${level(p, goal)}`, key === t ? 'today' : '', key === S.cal.sel ? 'sel' : '', key === S.cal.just ? 'just' : ''].join(' ');
    cells.push(`<button type="button" class="cal-day ${cls}" data-action="cal-day" data-date="${key}" ${future ? 'disabled' : ''} aria-label="${d} de ${MONTHS[m]}: ${p} páginas"><span class="d">${d}</span>${p ? `<span class="p">${p}</span>` : ''}${p >= goal ? '<span class="stamp">meta</span>' : ''}</button>`);
  }
  S.cal.just = '';
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const loan = `<div class="loan-card">
    <div class="loan-head"><div><span class="eyebrow">Cartão de leitura</span><h2>${MONTHS[m].charAt(0).toUpperCase()}${MONTHS[m].slice(1)} de ${y}</h2></div>
      <div class="loan-nav"><button type="button" class="icon-btn" data-action="cal-move" data-d="-1" aria-label="Mês anterior">${ICON.left}</button>${!isCurrent ? '<button type="button" class="btn btn-sm btn-ghost" data-action="cal-today">Hoje</button>' : ''}<button type="button" class="icon-btn" data-action="cal-move" data-d="1" aria-label="Próximo mês" ${isCurrent ? 'disabled' : ''}>${ICON.right}</button></div>
    </div>
    <div class="cal-grid">${DOW.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells.join('')}</div>
  </div>`;

  return `<div class="page-head"><div><span class="eyebrow">Constância</span><h1>O <em>calendário</em></h1><p class="lede">Toque num dia, escolha o livro e quantas páginas leu. O progresso do livro se atualiza sozinho.</p></div><button type="button" class="btn btn-gold" data-action="open-log">${ICON.plus}<span>Registrar leitura de hoje</span></button></div>
    ${board}
    <div class="cal-layout">${loan}<div class="side-stack">${dayPanelHTML(totals)}${bookMonthHTML(monthKey)}</div></div>
    ${heatHTML(totals, goal)}`;
}

function dayPanelHTML(totals) {
  const sel = S.cal.sel;
  const ls = Object.values(S.logs).filter((l) => l.date === sel).sort((a, b) => (b.at || 0) - (a.at || 0));
  const isFuture = sel > today();
  const list = ls.length
    ? `<ul class="log-list">${ls.map((l) => {
      const b = S.books[l.bookId];
      return `<li>${b ? coverHTML(b) : '<span></span>'}<span class="t">${esc(b ? b.title : 'Livro removido')}</span><span class="n">${l.pages} p.</span><button type="button" class="x" data-action="log-delete" data-id="${l.id}" aria-label="Apagar registro">${ICON.trash}</button></li>`;
    }).join('')}</ul>`
    : '<p class="muted" style="font-style:italic">Nenhuma leitura registrada neste dia.</p>';
  return `<div class="day-panel">
    <div><span class="eyebrow">${fmtDate(sel, { weekday: 'long' })}</span><h3>${fmtDate(sel, { day: 'numeric', month: 'long', year: 'numeric' })}</h3></div>
    ${totals[sel] ? `<p class="type" style="font-size:.9rem">${totals[sel]} páginas no total</p>` : ''}
    ${list}
    ${isFuture ? '' : `<button type="button" class="btn btn-ink" data-action="open-log" data-date="${sel}">${ICON.plus}<span>Registrar leitura${sel === today() ? ' de hoje' : ' neste dia'}</span></button>`}
  </div>`;
}

function bookMonthHTML(monthKey) {
  const per = {};
  Object.values(S.logs).forEach((l) => { if (l.date.startsWith(monthKey)) per[l.bookId] = (per[l.bookId] || 0) + l.pages; });
  const rows = Object.entries(per).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<div class="day-panel"><h3>Páginas por livro no mês</h3><div class="book-month">${rows.map(([id, n]) => `<div class="bm-row"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.books[id] ? S.books[id].title : 'Livro removido')}</span><span class="n">${n} p.</span><span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span></div>`).join('')}</div></div>`;
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
  return `<div class="heat-card">
    <h2 class="section-title">O ano em páginas <small>${plural(daysRead, 'dia lido', 'dias lidos')} nos últimos 12 meses</small></h2>
    <div class="heat-scroll" id="heat-scroll"><div class="heat-months">${months.join('')}</div><div class="heat">${cells.join('')}</div></div>
    <div class="legend"><span>menos</span><i style="background:color-mix(in srgb,var(--ink) 8%,transparent)"></i><i class="l1" style="background:color-mix(in srgb,var(--moss) 30%,var(--paper-2))"></i><i style="background:color-mix(in srgb,var(--moss) 55%,var(--paper-2))"></i><i style="background:color-mix(in srgb,var(--moss) 78%,var(--paper-2))"></i><i style="background:var(--moss)"></i><span>mais</span></div>
    <p class="heat-cap" id="heat-cap">Toque num quadradinho para ver o dia.</p>
  </div>`;
}

/* ================= DESCOBRIR ================= */
function viewDescobrir() {
  const done = allBooks().filter((b) => b.status === 'concluido').sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
  const hasKey = !!S.settings.geminiKey;
  const hero = `<div class="discover-hero">
    <div><span class="eyebrow" style="color:var(--gold-bright)">Sugestões da casa</span><h2>O que ler depois?</h2><p>As sugestões aprendem com suas notas, seus resumos e com o que você recusa. Quanto mais livros você arquiva, mais certeiras elas ficam.</p></div>
    <button type="button" class="btn btn-gold" data-action="rec-request" data-id="geral" ${S.busy.geral ? 'disabled' : ''}>${ICON.refresh}<span>Sugestão olhando a estante toda</span></button>
  </div>`;
  const keyBanner = !hasKey
    ? '<div class="banner"><p>A IA gratuita ainda não está ligada. Enquanto isso, quem sugere é o motor da estante. Leva 2 minutos para ativar.</p><button type="button" class="btn btn-sm btn-ink" data-action="go" data-to="leitor">Ativar a IA</button></div>'
    : '';
  let general = '';
  if (S.busy.geral) general = `<section class="rec-section">${loadingHTML('Percorrendo a estante inteira…')}</section>`;
  else if (S.settings.generalRecs) general = `<section class="rec-section">${recsHTML(S.settings.generalRecs, 'geral', 'Para você, olhando a estante toda')}</section>`;

  const withRecs = done.filter((b) => b.recs || S.busy[b.id]);
  const without = done.filter((b) => !b.recs && !S.busy[b.id]);
  const per = withRecs.map((b) => `<section class="rec-section">
      <div class="anchor">${coverHTML(b)}<h3>Porque você leu <em>${esc(b.title)}</em></h3></div>
      ${S.busy[b.id] ? loadingHTML('Pensando…') : recsHTML(b.recs, b.id, '')}
    </section>`).join('');
  const pending = without.length
    ? `<div class="panel" style="margin-bottom:24px"><h3>Lidos que ainda não geraram sugestão</h3><div class="chips">${without.map((b) => `<button type="button" class="chip" data-action="open-book" data-id="${b.id}" data-tab="sugestao">${esc(b.title)}</button>`).join('')}</div></div>`
    : '';
  const empty = !done.length && !S.settings.generalRecs && !S.busy.geral
    ? '<div class="empty"><h3>As sugestões nascem dos seus resumos</h3><p>Conclua um livro com resumo e nota para receber recomendações baseadas nele. Ou peça uma sugestão olhando a estante toda.</p></div>'
    : '';
  return `<div class="page-head"><div><span class="eyebrow">Descobrir</span><h1>Próximas <em>leituras</em></h1></div></div>${keyBanner}${hero}${general}${pending}${per}${empty}`;
}

/* ================= LEITOR ================= */
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
  const name = readerName();
  const p = S.settings.profile;

  let perfil;
  if (S.busy.profile) perfil = loadingHTML('Lendo sua estante…');
  else if (p && p.perfil) {
    perfil = `<p class="perfil">${esc(p.perfil)}</p>
      ${p.tags && p.tags.length ? `<div class="taglist">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${(p.gosta && p.gosta.length) || (p.evita && p.evita.length) ? `<div class="likes"><div><h4>Costuma gostar</h4><ul>${(p.gosta || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h4>Costuma evitar</h4><ul>${(p.evita || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      ${p.proximo ? `<p class="muted" style="font-style:italic">${esc(p.proximo)}</p>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-action="profile-refresh">${ICON.refresh}<span>Atualizar perfil</span></button>`;
  } else if (!done.length) {
    perfil = '<p class="perfil">Seu perfil de leitor aparece aqui depois do primeiro livro arquivado com resumo.</p>';
  } else if (!S.settings.geminiKey) {
    perfil = '<p class="perfil">Ative a IA gratuita ao lado e eu escrevo seu perfil de leitor a partir dos seus resumos.</p>';
  } else {
    perfil = '<button type="button" class="btn btn-leather" data-action="profile-refresh">Escrever meu perfil de leitor</button>';
  }

  const plate = `<div class="bookplate">
    <svg class="orn" viewBox="0 0 140 24" aria-hidden="true"><path d="M2 12h44M94 12h44M50 12c6-10 14-10 20 0 6 10 14 10 20 0M50 12c6 10 14 10 20 0 6-10 14-10 20 0"/><circle cx="70" cy="12" r="2.4" style="fill:currentColor"/></svg>
    <span class="exl">Ex Libris</span>
    <span class="who">${esc(name || 'do leitor')}</span>
    ${perfil}
  </div>`;

  const stats = `<div class="stats-grid">
    <div class="stat"><span class="k">Lidos</span><span class="v">${done.length}</span><span class="muted" style="font-size:.86rem">${doneYear.length} em ${year}</span></div>
    <div class="stat"><span class="k">Páginas</span><span class="v">${pagesRead.toLocaleString('pt-BR')}</span></div>
    <div class="stat"><span class="k">Nota média</span><span class="v">${avg}</span></div>
    <div class="stat"><span class="k">Recorde</span><span class="v">${best}<small> dias</small></span></div>
    <div class="stat"><span class="k">Por livro</span><span class="v">${avgDur ?? '—'}<small>${avgDur ? ' dias' : ''}</small></span></div>
  </div>`;

  const gcount = {};
  done.forEach((b) => { const g = b.genre || 'Sem gênero'; gcount[g] = (gcount[g] || 0) + 1; });
  const grows = Object.entries(gcount).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const gmax = grows.length ? grows[0][1] : 1;
  const genres = grows.length
    ? `<div class="panel"><h3>Gêneros mais lidos</h3><div class="genre-bars">${grows.map(([g, n]) => `<div class="bm-row"><span>${esc(g)}</span><span class="n">${n}</span><span class="bar"><i style="width:${Math.round((n / gmax) * 100)}%"></i></span></div>`).join('')}</div></div>`
    : '';

  return `<div class="page-head"><div><span class="eyebrow">Leitor</span><h1>Seu <em>ex-libris</em></h1><p class="lede">Quem você é como leitor, em números e em palavras. E os ajustes da casa.</p></div></div>
    <div class="leitor-grid">
      <div class="side-stack">${plate}${stats}<div class="panel"><h3>Livros terminados em ${year}</h3><div class="chart-wrap">${monthChart(done, year)}</div></div>${genres}</div>
      <div class="side-stack">${settingsHTML()}</div>
    </div>`;
}

function monthChart(done, year) {
  const counts = Array(12).fill(0);
  done.forEach((b) => { if ((b.endDate || '').startsWith(year)) counts[Number(b.endDate.slice(5, 7)) - 1]++; });
  const max = Math.max(1, ...counts);
  const W = 360;
  const H = 150;
  const top = 18;
  const bottom = 22;
  const bw = (W - 24) / 12;
  const bars = counts.map((c, i) => {
    const h = Math.round(((H - top - bottom) * c) / max);
    const x = 12 + i * bw + 4;
    const y = H - bottom - h;
    return `${c ? `<rect x="${x}" y="${y}" width="${bw - 8}" height="${h}" rx="2" style="fill:var(--leather)"/><text x="${x + (bw - 8) / 2}" y="${y - 5}" text-anchor="middle" style="fill:var(--ink);font:700 11px var(--f-type)">${c}</text>` : `<rect x="${x}" y="${H - bottom - 2}" width="${bw - 8}" height="2" style="fill:var(--rule)"/>`}<text x="${x + (bw - 8) / 2}" y="${H - 6}" text-anchor="middle" style="fill:var(--ink-soft);font:11px var(--f-type)">${MONTHS_SHORT[i]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Livros terminados por mês em ${year}" style="stroke:none"><line x1="12" x2="${W - 12}" y1="${H - bottom}" y2="${H - bottom}" style="stroke:var(--rule)"/>${bars}</svg>`;
}

function settingsHTML() {
  const s = S.settings;
  const ks = S.keyStatus;
  const keyState = ks && ks.state === 'testing'
    ? '<p class="muted" style="font-style:italic">Testando a chave…</p>'
    : ks && ks.state === 'err'
      ? `<p class="err">${esc(ks.msg)}</p>`
      : s.geminiKey
        ? `<p class="ok-line">IA ativa${s.model ? ` (${esc(s.model)})` : ''}. As sugestões e o seu perfil já usam ela.</p>`
        : '';
  const sync = !cloudAvailable
    ? '<p>Por enquanto, a estante fica salva só neste navegador. A sincronização entre celular e computador entra assim que o Firebase for configurado (veja o LEIA-ME). Até lá, exporte um backup de vez em quando.</p>'
    : S.user
      ? `<p>Conectado como <b>${esc(S.user.email || S.user.name)}</b>. Tudo que você faz aqui aparece no celular e no computador.</p><button type="button" class="btn btn-sm btn-ghost" data-action="logout">Sair da conta</button>`
      : '<p>Entre com sua conta Google para usar a mesma estante no celular e no computador. O que já está neste aparelho vai junto.</p><button type="button" class="btn btn-sm btn-ink" data-action="login">Entrar com Google</button>';
  const theme = readPref('theme', 'auto');
  return `<div class="panel settings-list">
    <h3>Ajustes da casa</h3>
    <div class="setting"><h4>Seu nome no ex-libris</h4>
      <form class="key-row" data-submit="save-name"><input id="set-name" value="${esc(s.readerName || '')}" placeholder="${esc((S.user && S.user.name) || 'Como quer ser chamado')}" aria-label="Seu nome"><button class="btn btn-sm btn-ink" type="submit">Salvar</button></form>
    </div>
    <div class="setting"><h4>Meta diária de leitura</h4>
      <div class="goal-ctl"><button type="button" data-action="goal" data-d="-5" aria-label="Diminuir meta">−</button><span class="type" style="font-size:1.3rem">${s.goal || 20} páginas</span><button type="button" data-action="goal" data-d="5" aria-label="Aumentar meta">+</button></div>
    </div>
    <div class="setting"><h4>IA gratuita (Gemini, do Google)</h4>
      <p>É ela que lê seus resumos e escolhe o próximo livro. O plano gratuito do Google não pede cartão.</p>
      ${s.geminiKey ? '' : `<ol>
        <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e entre com sua conta Google.</li>
        <li>Toque em <b>Create API key</b> (Criar chave de API).</li>
        <li>Copie a chave e cole aqui embaixo.</li>
      </ol>`}
      <form class="key-row" data-submit="save-key"><input id="set-key" type="password" autocomplete="off" placeholder="${s.geminiKey ? 'chave salva: cole outra para trocar' : 'cole a chave aqui'}" aria-label="Chave da IA"><button class="btn btn-sm btn-ink" type="submit" ${ks && ks.state === 'testing' ? 'disabled' : ''}>Salvar e testar</button>${s.geminiKey ? '<button type="button" class="btn btn-sm btn-danger" data-action="remove-key">Remover</button>' : ''}</form>
      ${keyState}
      <p style="font-size:.86rem;margin-top:6px">A chave fica guardada ${cloudAvailable ? 'no seu espaço privado da nuvem, que só a sua conta acessa' : 'só neste navegador'}. Ela nunca vai para o código do site.</p>
    </div>
    <div class="setting"><h4>Sincronização</h4>${sync}</div>
    <div class="setting"><h4>Aparência</h4>
      <div class="seg" role="group" aria-label="Tema">${[['auto', 'Automático'], ['light', 'Dia no sebo'], ['dark', 'Noite no sebo']].map(([k, l]) => `<button type="button" class="${theme === k ? 'on' : ''}" data-action="theme" data-t="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="setting"><h4>Backup</h4>
      <p>Uma cópia de todos os livros, resumos e registros num arquivo.</p>
      <div class="actions"><button type="button" class="btn btn-sm btn-ghost" data-action="export">Baixar backup</button><label class="btn btn-sm btn-ghost">Restaurar backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
    </div>
  </div>`;
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
    if (!res.items.length) toast('Não encontrei sugestões agora. Tente de novo em instantes.');
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
  if (!S.settings.geminiKey) { toast('Ative a IA para eu escrever seu perfil.'); return; }
  const done = allBooks().filter((b) => b.status === 'concluido').length;
  if (!done) { toast('Arquive pelo menos um livro com resumo primeiro.'); return; }
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

function celebrate(title) {
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="wax"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="${WAX_PATH}" style="fill:#8f2a36"/><circle cx="32" cy="32" r="19" style="fill:none;stroke:#f0d9a2;stroke-width:1.2;opacity:.7"/><text x="32" y="36.5" text-anchor="middle" style="fill:#f3dfae;font:italic 12px 'IM Fell English', Georgia, serif;letter-spacing:.5px">Lido</text></svg><p>“${esc(title)}” entrou para os lidos</p></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1700);
  setTimeout(() => el.remove(), 2250);
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<p>${esc(msg)}</p>${action ? `<button type="button" class="btn btn-sm">${esc(action.label)}</button>` : ''}`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (action) el.querySelector('button').addEventListener('click', () => { kill(); action.run(); });
  $('#toasts').appendChild(el);
  setTimeout(kill, action ? 7000 : 3800);
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
    toast(`Você chegou à última página de “${b.title}”. Escreva o resumo para arquivar.`, { label: 'Escrever', run: () => openBook(bookId, 'resumo') });
  } else {
    toast(`+${pages} páginas carimbadas${dayTotal >= goal ? '. Meta do dia cumprida!' : '.'}`);
  }
  renderView();
}

const ACTIONS = {
  backdrop: () => closeModal(),
  'close-modal': () => closeModal(),
  'close-go': (el) => { closeModal(); location.hash = el.dataset.to; },
  go: (el) => { location.hash = el.dataset.to; },
  'add-book': () => openAdd(),
  login: async () => {
    try { await store.signIn(); } catch (e) { toast(`Não foi possível entrar: ${e.message}`); }
  },
  logout: async () => { await store.signOut(); toast('Você saiu da conta.'); },

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
  'toggle-syn': () => { S.modal.synOpen = !S.modal.synOpen; renderModal(); },
  'start-reading': () => {
    const b = S.books[S.modal.id];
    store.saveBook({ ...b, status: 'lendo', startDate: b.startDate || today(), updatedAt: Date.now() });
    S.modal.tab = 'progresso';
    renderModal();
    toast(`“${b.title}” foi para a mesa de leitura.`);
  },
  'back-to-quero': () => {
    const b = S.books[S.modal.id];
    store.saveBook({ ...b, status: 'quero', updatedAt: Date.now() });
    S.modal.tab = 'ficha';
    renderModal();
  },
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
    toast('Ficha atualizada.');
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
      if (!found.length) toast('Não achei outras capas para esse título.');
    } catch (e) {
      toast(e.message);
    } finally {
      delete S.busy.covers;
      if (S.modal && S.modal.type === 'book') renderModal();
    }
  },

  /* progresso */
  'quick-page': () => {
    const b = S.books[S.modal.id];
    const page = Number($('#pp-page').value);
    if (!$('#pp-page').value || Number.isNaN(page) || page < 0) return;
    const target = b.pages ? Math.min(page, b.pages) : page;
    const diff = target - (b.pagesRead || 0);
    if (diff > 0) {
      saveLogEntry({ bookId: b.id, date: today(), pages: diff });
    } else if (diff < 0) {
      store.saveBook({ ...b, pagesRead: target, updatedAt: Date.now() });
      toast(`Progresso corrigido para a página ${target}.`);
    }
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
    if (!f.rating) return fail('Dê uma nota de 1 a 5 estrelas.');
    if (f.summary.trim().length < MIN_SUMMARY) return fail(`Escreva pelo menos umas duas frases (${MIN_SUMMARY} caracteres). Não precisa caprichar.`);
    if (f.start && f.end && f.start > f.end) return fail('A data de início está depois da data de término.');
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
      toast('Resumo atualizado.');
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
    toast(`“${it.title}” foi para Quero ler.`);
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

  /* catalogar */
  'add-search': async () => {
    const m = S.modal;
    const title = (m.title || '').trim();
    const author = (m.author || '').trim();
    if (!title && !author) { m.error = 'Digite pelo menos o título.'; renderModal(); return; }
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
      toast('Agora o resumo: é ele que arquiva o livro como lido.');
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

  /* leitor */
  'profile-refresh': () => refreshProfile(),
  'save-name': () => { store.saveSettings({ readerName: $('#set-name').value.trim() }); toast('Nome salvo no ex-libris.'); },
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
      toast('IA ativada. Daqui pra frente ela escolhe suas sugestões.');
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
  if (t.dataset.bind && S.modal) setPath(S.modal, t.dataset.bind, t.value);
  if (t.dataset.form && S.modal && S.modal.form) {
    S.modal.form[t.dataset.form] = t.value;
    if (t.dataset.form === 'summary') {
      const c = $('#sum-counter');
      const n = t.value.trim().length;
      if (c) {
        c.textContent = n >= MIN_SUMMARY ? 'pronto para arquivar' : `${n}/${MIN_SUMMARY} caracteres`;
        c.classList.toggle('ok', n >= MIN_SUMMARY);
      }
    }
  }
  if (t.dataset.input === 'search') {
    S.search = t.value;
    const box = $('#shelves');
    if (box) box.innerHTML = shelvesHTML();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.change && ACTIONS[t.dataset.change]) ACTIONS[t.dataset.change](t, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { closeModal(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

// Capa inclinando com o mouse (só em telas com ponteiro fino)
if (window.matchMedia('(pointer: fine)').matches) {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest('[data-tilt]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 16).toFixed(1)}deg`);
    el.style.setProperty('--rx', `${(-y * 12).toFixed(1)}deg`);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('[data-tilt]');
    if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); }
  });
}

let lastPerRow = perRow();
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const n = perRow();
    if (n !== lastPerRow && S.view === 'estante') {
      lastPerRow = n;
      const box = $('#shelves');
      if (box) box.innerHTML = shelvesHTML();
    }
  }, 150);
});

window.addEventListener('hashchange', route);

/* ================= início ================= */
applyTheme(readPref('theme', 'auto'));
route();
store.init();
