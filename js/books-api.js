// Busca de livros e capas. Fonte principal: Open Library (gratuita, sem chave).
// O Google Books entra como reforço quando a cota pública dele está disponível.

export const GENRES = [
  'Romance', 'Fantasia', 'Ficção científica', 'Suspense', 'Policial/Mistério', 'Terror',
  'Clássico', 'Literatura brasileira', 'Ficção literária', 'Jovem adulto', 'Infantil',
  'HQ/Mangá', 'Poesia', 'Biografia/Memórias', 'História', 'Filosofia', 'Psicologia',
  'Autoajuda', 'Negócios/Finanças', 'Ciência', 'Religião/Espiritualidade', 'Não ficção', 'Outro',
];

const FICTION_GENRES = [
  [/fantasy fiction|epic fantasy|^fantasy$|\| fantasy|fantasia|dragons|wizards/i, 'Fantasia'],
  [/science fiction|ficção científica|sci-fi|dystop/i, 'Ficção científica'],
  [/horror|terror|ghost stor/i, 'Terror'],
  [/thriller|suspense/i, 'Suspense'],
  [/mystery|detective|crime|policial|mistério/i, 'Policial/Mistério'],
  [/comics|graphic novel|manga|mangá/i, 'HQ/Mangá'],
  [/young adult|juvenile fiction|juvenil/i, 'Jovem adulto'],
  [/juvenile|children|infantil/i, 'Infantil'],
  [/poetry|poesia/i, 'Poesia'],
  [/brazil|brasil/i, 'Literatura brasileira'],
  [/love stor|romance fiction|romantic/i, 'Romance'],
  [/classic|clássico/i, 'Clássico'],
];
const NONFICTION_GENRES = [
  [/comics|graphic novel|manga/i, 'HQ/Mangá'],
  [/poetry|poesia/i, 'Poesia'],
  [/biography|autobiography|memoir|biografia/i, 'Biografia/Memórias'],
  [/self-help|autoajuda|personal growth|success|desenvolvimento pessoal/i, 'Autoajuda'],
  [/business|economics|finance|negócios|investing|management/i, 'Negócios/Finanças'],
  [/psychology|psicologia/i, 'Psicologia'],
  [/philosophy|filosofia/i, 'Filosofia'],
  [/religion|spiritual|religião|bible|christian/i, 'Religião/Espiritualidade'],
  [/history|história/i, 'História'],
  [/science|ciência|nature|mathematics|technology|physics/i, 'Ciência'],
  [/juvenile|children|infantil/i, 'Infantil'],
];

export function guessGenre(categories = []) {
  const s = categories.slice(0, 14).join(' | ');
  if (!s) return '';
  const fiction = /fiction|ficção|novel|romance|fantasy|stories|literatura/i.test(s);
  for (const [re, g] of (fiction ? FICTION_GENRES : NONFICTION_GENRES)) if (re.test(s)) return g;
  return fiction ? 'Ficção literária' : 'Não ficção';
}

export const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const bookKey = (title, author) => `${norm(title).replace(/^(o|a|os|as|the|um|uma) /, '')}|${norm(author).split(' ').pop() || ''}`;

const stripHtml = (s) => {
  const d = document.createElement('div');
  d.innerHTML = s;
  return (d.textContent || '').trim();
};

/* ---------- Open Library ---------- */
const OL_FIELDS = 'key,title,author_name,cover_i,number_of_pages_median,first_publish_year,subject,isbn,edition_count,ratings_count';

function fromOL(d) {
  return {
    source: 'openlibrary',
    olKey: d.key || '',
    title: d.title || '',
    authors: d.author_name || [],
    pages: d.number_of_pages_median || 0,
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    categories: (d.subject || []).slice(0, 14),
    synopsis: '',
    lang: '',
    isbn: (d.isbn || [])[0] || '',
    covers: d.cover_i ? [`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`] : [],
    popularity: (d.edition_count || 0) + (d.ratings_count || 0),
  };
}

async function olSearch(params) {
  const p = new URLSearchParams({ limit: '20', fields: OL_FIELDS, ...params });
  const r = await fetch(`https://openlibrary.org/search.json?${p}`);
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const j = await r.json();
  return (j.docs || []).map(fromOL).filter((b) => b.title);
}

async function openLibrary(title, author) {
  const params = {};
  if (title) params.title = title;
  if (author) params.author = author;
  let list = await olSearch(params);
  if (!list.length) list = await olSearch({ q: `${title} ${author}`.trim() });
  return list;
}

// Sinopse da obra (o Open Library guarda na “work”, não na busca)
export async function fetchSynopsis(result) {
  if (result.synopsis || !result.olKey) return result.synopsis || '';
  try {
    const r = await fetch(`https://openlibrary.org${result.olKey}.json`);
    if (!r.ok) return '';
    const w = await r.json();
    const d = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
    return d.replace(/\(\[source\]\[\d+\]\)|\[source\]\[\d+\]|-{3,}[\s\S]*$/g, '').trim();
  } catch (e) {
    return '';
  }
}

/* ---------- Google Books (reforço) ---------- */
function fromGoogle(it) {
  const v = it.volumeInfo || {};
  const img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '';
  const cover = img ? img.replace(/^http:/, 'https:').replace('&edge=curl', '') : '';
  const ids = v.industryIdentifiers || [];
  const isbn = (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier || '';
  // fife pede ao Google uma versão maior da capa; a miniatura fica de reserva
  const covers = cover ? [`${cover}&fife=w480-h720`, cover] : [];
  return {
    source: 'google',
    olKey: '',
    title: v.title || '',
    authors: v.authors || [],
    pages: v.pageCount || 0,
    year: (v.publishedDate || '').slice(0, 4),
    categories: v.categories || [],
    synopsis: stripHtml(v.description || ''),
    lang: v.language || '',
    isbn,
    covers,
    popularity: v.ratingsCount || 0,
  };
}

let googleBlockedUntil = 0;
async function google(title, author) {
  if (Date.now() < googleBlockedUntil) return [];
  const parts = [];
  if (title) parts.push(title);
  if (author) parts.push(`inauthor:"${author}"`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(parts.join(' '))}&maxResults=15&printType=books`;
  const r = await fetch(url);
  if (r.status === 429 || r.status === 403) {
    googleBlockedUntil = Date.now() + 30 * 60 * 1000; // cota pública esgotada: pausa por 30 min
    return [];
  }
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items || []).map(fromGoogle).filter((b) => b.title);
}

/* ---------- busca combinada ---------- */
function sameBook(a, b) {
  const ta = norm(a.title).replace(/^(o|a|os|as|the) /, '');
  const tb = norm(b.title).replace(/^(o|a|os|as|the) /, '');
  if (!ta || !tb) return false;
  const titleOk = ta === tb || ta.startsWith(tb) || tb.startsWith(ta);
  const sa = norm((a.authors || [])[0]).split(' ').pop();
  const sb = norm((b.authors || [])[0]).split(' ').pop();
  return titleOk && (!sa || !sb || sa === sb);
}

function absorb(into, from) {
  from.covers.forEach((c) => { if (!into.covers.includes(c)) into.covers.push(c); });
  if (!into.pages && from.pages) into.pages = from.pages;
  if (!into.year && from.year) into.year = from.year;
  if (!into.synopsis && from.synopsis) into.synopsis = from.synopsis;
  if (!into.olKey && from.olKey) into.olKey = from.olKey;
  if (!into.isbn && from.isbn) into.isbn = from.isbn;
  if (from.categories.length > into.categories.length) into.categories = from.categories;
  into.popularity += from.popularity;
}

// Busca por título e autor, junta as fontes e prioriza resultados com capa e mais edições.
export async function searchBooks(title, author) {
  const [o, g] = await Promise.allSettled([openLibrary(title, author), google(title, author)]);
  if (o.status === 'rejected' && (g.status === 'rejected' || !g.value.length)) {
    throw new Error('Sem conexão com os catálogos de livros. Tente de novo em instantes.');
  }
  const raw = [...(o.status === 'fulfilled' ? o.value : []), ...(g.status === 'fulfilled' ? g.value : [])];
  const merged = [];
  for (const r of raw) {
    const twin = merged.find((m) => sameBook(m, r));
    if (twin) absorb(twin, r);
    else merged.push({ ...r, covers: [...r.covers] });
  }
  const want = norm(title);
  return merged
    .map((r) => {
      let score = 0;
      if (r.covers.length) score += 100;
      if (want && norm(r.title).replace(/^(o|a|os|as|the) /, '') === want.replace(/^(o|a|os|as|the) /, '')) score += 30;
      score += Math.log10(1 + r.popularity) * 8;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
    .slice(0, 12);
}

// Encontra a melhor correspondência para um título/autor (usado nas recomendações).
export async function findBook(title, author) {
  try {
    const list = await searchBooks(title, author);
    const target = { title, authors: [author] };
    return list.find((r) => sameBook(r, target)) || list[0] || null;
  } catch (e) {
    return null;
  }
}

/* ---------- motor de recomendação próprio (sem IA) ---------- */
// Transforma categorias do Google ("Fiction / Fantasy / Epic") em assuntos do Open Library
function toSubject(c) {
  const last = c.split('/').pop().trim();
  return last.replace(/\s*\(.*\)$/, '').toLowerCase();
}

const GENERIC_SUBJECTS = new Set(['fiction', 'general', 'novel', 'novels', 'literature', 'english fiction', 'american fiction', 'large type books', 'in library', 'accessible book', 'protected daisy', 'fiction, general', 'ficción']);

function usefulSubjects(b) {
  return [...new Set((b.categories || []).map(toSubject))].filter((s) => s && !GENERIC_SUBJECTS.has(s) && s.length < 40);
}

export async function engineRecommend(anchor, allBooks, dislikes = []) {
  const owned = new Set(allBooks.map((b) => bookKey(b.title, (b.authors || [])[0])));
  const disliked = new Set(dislikes.map((d) => bookKey(d.title, d.author)));
  const done = allBooks.filter((b) => b.status === 'concluido');
  const liked = done.filter((b) => (b.rating || 0) >= 4);

  const subjWeight = {};
  liked.forEach((b) => usefulSubjects(b).slice(0, 4).forEach((s) => {
    subjWeight[s] = (subjWeight[s] || 0) + (b.rating || 3);
  }));
  const topSubjects = Object.entries(subjWeight).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);

  const queries = [];
  if (anchor) {
    usefulSubjects(anchor).slice(0, 2).forEach((s) => queries.push({ q: `subject:"${s}"`, w: 3, why: `segue a mesma linha de “${anchor.title}”` }));
    const a = (anchor.authors || [])[0];
    if (a && (anchor.rating || 0) >= 4) queries.push({ q: `author:"${a}"`, w: 2.5, why: `é de ${a}, e você deu ${anchor.rating} estrelas para “${anchor.title}”` });
  }
  topSubjects.forEach((s) => queries.push({ q: `subject:"${s}"`, w: 2, why: 'combina com os livros que você avaliou melhor' }));
  liked.slice(-3).forEach((b) => {
    const a = (b.authors || [])[0];
    if (a && (!anchor || b.id !== anchor.id)) queries.push({ q: `author:"${a}"`, w: 1.5, why: `é de ${a}, um autor que você aprovou` });
  });
  if (!queries.length) queries.push({ q: 'subject:"fiction"', w: 1, why: 'está entre os mais bem avaliados pelos leitores' });

  const pool = new Map();
  const run = async (extra) => {
    const lists = await Promise.allSettled(queries.slice(0, 5).map((x) => olSearch({ q: `${x.q}${extra}`, sort: 'rating', limit: '25' })));
    lists.forEach((res, qi) => {
      if (res.status !== 'fulfilled') return;
      res.value.forEach((r) => {
        const k = bookKey(r.title, r.authors[0]);
        if (!r.authors.length || owned.has(k) || disliked.has(k)) return;
        const cur = pool.get(k) || { r, score: 0, whys: new Set() };
        cur.score += queries[qi].w + (r.covers.length ? 3 : 0) + Math.log10(1 + r.popularity) * 0.6;
        cur.whys.add(queries[qi].why);
        pool.set(k, cur);
      });
    });
  };
  await run(' language:por');
  if (pool.size < 3) await run('');

  // No máximo um livro por autor, para as sugestões não virarem uma série inteira
  const ranked = [...pool.values()].sort((a, b) => b.score - a.score);
  const seenAuthors = new Set();
  const top = [];
  for (const c of ranked) {
    const a = norm(c.r.authors[0]);
    if (seenAuthors.has(a)) continue;
    seenAuthors.add(a);
    top.push(c);
    if (top.length === 3) break;
  }
  for (const c of ranked) {
    if (top.length >= 3) break;
    if (!top.includes(c)) top.push(c);
  }
  return Promise.all(top.map(async ({ r, whys }) => {
    const synopsis = await fetchSynopsis(r);
    return {
      title: r.title,
      author: r.authors.join(', '),
      why: `Sugerido porque ${[...whys].slice(0, 2).join(' e ')}.`,
      hook: firstSentence(synopsis),
      genre: guessGenre(r.categories),
      cover: r.covers[0] || '',
      covers: r.covers,
      pages: r.pages,
      year: r.year,
      synopsis,
      categories: r.categories,
      isbn: r.isbn,
    };
  }));
}

function firstSentence(s) {
  if (!s) return '';
  const m = s.match(/^(.{20,220}?[.!?])\s/);
  return m ? m[1] : s.slice(0, 180) + (s.length > 180 ? '…' : '');
}
