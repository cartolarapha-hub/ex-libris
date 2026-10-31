// IA gratuita (Gemini, plano free do Google AI Studio) + fallback para o motor próprio.
import { findBook, engineRecommend, bookKey, guessGenre } from './books-api.js';

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];

export class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseJSON(text) {
  const t = (text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (e) { /* tenta recortar */ }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { /* cai no erro */ }
  }
  throw new AIError('format', 'A IA respondeu num formato inesperado. Tente de novo.');
}

export async function gemini(key, prompt, { model, temperature = 0.9 } = {}) {
  if (!key) throw new AIError('nokey', 'Nenhuma chave de IA configurada.');
  const list = model ? [model, ...MODELS.filter((m) => m !== model)] : MODELS;
  let lastErr = null;
  for (const m of list) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature },
        }),
      });
    } catch (e) {
      throw new AIError('network', 'Sem conexão com a IA agora.');
    }
    if (res.ok) {
      const j = await res.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) { lastErr = new AIError('empty', 'A IA não respondeu. Tente de novo.'); continue; }
      return { model: m, data: parseJSON(text) };
    }
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || '';
    if (res.status === 429) throw new AIError('quota', 'O limite gratuito da IA acabou por hoje. Usei o motor da estante.');
    if (res.status === 400 && /api key/i.test(msg)) throw new AIError('key', 'A chave da IA parece inválida. Confira em Leitor → IA.');
    if (res.status === 401 || res.status === 403) throw new AIError('key', 'A chave da IA foi recusada. Confira em Leitor → IA.');
    lastErr = new AIError('model', msg || `Erro ${res.status} na IA.`);
    // 404 / modelo indisponível: tenta o próximo
  }
  throw lastErr || new AIError('model', 'Nenhum modelo de IA disponível.');
}

export async function testKey(key) {
  const { model, data } = await gemini(key, 'Responda exatamente com o JSON {"ok": true}', { temperature: 0 });
  if (!data || data.ok !== true) throw new AIError('format', 'A IA respondeu, mas de um jeito estranho.');
  return model;
}

const clip = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function readerContext(books, settings) {
  const done = books.filter((b) => b.status === 'concluido')
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));
  const reading = books.filter((b) => b.status === 'lendo');
  const want = books.filter((b) => b.status === 'quero' || b.status === 'resumo');
  const lines = [];
  if (settings.profile?.perfil) lines.push(`PERFIL DO LEITOR (resumo anterior): ${settings.profile.perfil}`);
  lines.push('LIVROS CONCLUÍDOS (título — autor | gênero | nota de 1 a 5 | o que o leitor escreveu):');
  if (!done.length) lines.push('- (nenhum ainda)');
  done.slice(-40).forEach((b) => lines.push(`- ${b.title} — ${(b.authors || []).join(', ')} | ${b.genre || '?'} | ${b.rating || '?'}/5 | ${clip(b.summary, 280)}`));
  if (reading.length) {
    lines.push('LENDO AGORA:');
    reading.forEach((b) => lines.push(`- ${b.title} — ${(b.authors || []).join(', ')}`));
  }
  if (want.length) {
    lines.push('JÁ ESTÃO NA ESTANTE (não recomende):');
    want.forEach((b) => lines.push(`- ${b.title} — ${(b.authors || []).join(', ')}`));
  }
  const dis = (settings.dislikes || []).slice(-40);
  if (dis.length) {
    lines.push('O LEITOR RECUSOU ESTAS SUGESTÕES (não recomende, e evite livros muito parecidos):');
    dis.forEach((d) => lines.push(`- ${d.title} — ${d.author}`));
  }
  return lines.join('\n');
}

async function aiRecommend(anchor, books, settings) {
  const task = anchor
    ? `TAREFA: o leitor acabou de concluir “${anchor.title}” de ${(anchor.authors || []).join(', ')} (nota ${anchor.rating || '?'}/5). O que ele escreveu: "${clip(anchor.summary, 900)}".
Recomende 3 próximos livros COM BASE PRINCIPALMENTE NESSA LEITURA, usando o resto do histórico para calibrar o gosto. Se a nota foi baixa, recomende algo que corrija o que ele não gostou.`
    : 'TAREFA: recomende 3 livros para o leitor ler a seguir, com base em todo o histórico, notas e resumos. Varie: um certeiro, um que expanda um pouco o gosto dele, e um clássico ou cult do estilo dele.';

  const prompt = `Você é o livreiro de um sebo antigo, culto e caloroso, que conhece cada leitor pelo que ele lê.
${readerContext(books, settings)}

${task}

Regras:
- Apenas livros reais, que existam de verdade, de preferência com edição em português do Brasil (use o título em português quando existir).
- Não repita nenhum livro listado acima.
- "porque": 2 a 3 frases em português do Brasil, falando direto com o leitor ("você"), ligando a sugestão ao que ele escreveu e às notas que deu. Seja específico, nada genérico.
- "gancho": uma frase curta e instigante sobre o livro, sem spoilers.

Responda APENAS com JSON neste formato:
{"recomendacoes":[{"titulo":"","autor":"","genero":"","porque":"","gancho":""}]}`;

  const { data } = await gemini(settings.geminiKey, prompt, { model: settings.model });
  const owned = new Set(books.map((b) => bookKey(b.title, (b.authors || [])[0])));
  const recs = (data.recomendacoes || data.recommendations || [])
    .filter((r) => r && r.titulo && r.autor)
    .filter((r) => !owned.has(bookKey(r.titulo, r.autor)))
    .slice(0, 3);

  const enriched = await Promise.all(recs.map(async (r) => {
    const found = await findBook(r.titulo, r.autor);
    return {
      title: r.titulo,
      author: r.autor,
      why: r.porque || '',
      hook: r.gancho || '',
      genre: r.genero || (found ? guessGenre(found.categories) : ''),
      cover: found?.covers?.[0] || '',
      covers: found?.covers || [],
      pages: found?.pages || 0,
      year: found?.year || '',
      synopsis: found?.synopsis || '',
      categories: found?.categories || [],
      isbn: found?.isbn || '',
    };
  }));
  return enriched;
}

// Tenta a IA; se não houver chave, acabar a cota ou der erro, usa o motor da estante.
export async function getRecommendations({ anchor, books, settings }) {
  let note = '';
  if (settings.geminiKey) {
    try {
      const items = await aiRecommend(anchor, books, settings);
      if (items.length) return { source: 'ia', items, note: '' };
    } catch (e) {
      note = e.message;
    }
  }
  const items = await engineRecommend(anchor, books, settings.dislikes || []);
  return { source: 'motor', items, note };
}

export async function buildProfile(books, settings) {
  const prompt = `Você é o livreiro de um sebo antigo que conhece bem este leitor.
${readerContext(books, settings)}

Escreva o perfil de leitura dele em português do Brasil, falando com ele ("você"), num tom caloroso e perspicaz, como uma dedicatória.
Responda APENAS com JSON:
{"perfil":"3 a 4 frases sobre o gosto, o que ele busca nos livros e como ele lê","tags":["4 a 6 marcas do gosto dele, curtas"],"gosta":["3 elementos que costumam agradar"],"evita":["até 3 coisas que parecem não agradar"],"proximo_passo":"1 frase sugerindo um caminho novo de leitura"}`;
  const { data } = await gemini(settings.geminiKey, prompt, { model: settings.model, temperature: 0.7 });
  return {
    perfil: data.perfil || '',
    tags: (data.tags || []).slice(0, 6),
    gosta: (data.gosta || []).slice(0, 3),
    evita: (data.evita || []).slice(0, 3),
    proximo: data.proximo_passo || '',
  };
}
