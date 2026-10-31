// Camada de dados: guarda livros, registros de leitura e configurações.
// Modo local (localStorage) por padrão; modo nuvem (Firestore) quando há login.
import { firebaseConfig } from './firebase-config.js';

const LS_KEY = 'exlibris:data:v1';
const MIGRATED_KEY = 'exlibris:migrated';
const FB_VERSION = '10.12.2';

export const DEFAULT_SETTINGS = {
  goal: 20,
  geminiKey: '',
  model: '',
  dislikes: [],
  profile: null,
  generalRecs: null,
  readerName: '',
};

export const cloudAvailable = !!(firebaseConfig && firebaseConfig.apiKey);

function emptyData() {
  return { books: {}, logs: {}, settings: { ...DEFAULT_SETTINGS } };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        books: d.books || {},
        logs: d.logs || {},
        settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      };
    }
  } catch (e) { /* armazenamento indisponível */ }
  return emptyData();
}

function writeLocal(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* ignora */ }
}

// Firestore não aceita undefined
const clean = (o) => JSON.parse(JSON.stringify(o));

export class Store {
  constructor(onChange) {
    this.onChange = onChange;
    this.data = readLocal();
    this.mode = 'local';
    this.user = null;
    this.fb = null;
    this.unsubs = [];
    this.loaded = { books: true, logs: true, settings: true };
    this.authError = '';
  }

  emit() {
    const ready = this.loaded.books && this.loaded.logs && this.loaded.settings;
    this.onChange({
      books: this.data.books,
      logs: this.data.logs,
      settings: this.data.settings,
      mode: this.mode,
      user: this.user ? { name: this.user.displayName || '', email: this.user.email || '', photo: this.user.photoURL || '' } : null,
      ready,
      authError: this.authError,
    });
  }

  async init() {
    this.emit();
    if (!cloudAvailable) return;
    try {
      await this.initFirebase();
    } catch (e) {
      console.error(e);
      this.authError = 'Não foi possível conectar à nuvem agora. Seus dados continuam neste aparelho.';
      this.emit();
    }
  }

  async initFirebase() {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
    const [appM, authM, fsM] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    let db;
    try {
      db = fsM.initializeFirestore(app, {
        localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
      });
    } catch (e) {
      db = fsM.getFirestore(app);
    }
    const auth = authM.getAuth(app);
    auth.languageCode = 'pt';
    this.fb = { app, db, auth, authM, fsM };
    authM.onAuthStateChanged(auth, (user) => this.onUser(user));
    try { await authM.getRedirectResult(auth); } catch (e) { console.warn(e); }
  }

  onUser(user) {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.user = user;
    if (!user) {
      this.mode = 'local';
      this.data = readLocal();
      this.loaded = { books: true, logs: true, settings: true };
      this.emit();
      return;
    }
    this.mode = 'cloud';
    this.data = emptyData();
    this.loaded = { books: false, logs: false, settings: false };
    this.emit();

    const { db, fsM } = this.fb;
    const uid = user.uid;
    const onErr = (err) => {
      console.error(err);
      this.authError = 'A nuvem recusou o acesso. Confira as regras do Firestore (veja o LEIA-ME).';
      this.loaded = { books: true, logs: true, settings: true };
      this.emit();
    };

    this.unsubs.push(fsM.onSnapshot(fsM.collection(db, 'users', uid, 'books'), { includeMetadataChanges: false }, (snap) => {
      const o = {};
      snap.forEach((d) => { o[d.id] = d.data(); });
      this.data.books = o;
      this.loaded.books = true;
      if (!snap.metadata.fromCache) this.maybeMigrate(snap.size);
      this.emit();
    }, onErr));

    this.unsubs.push(fsM.onSnapshot(fsM.collection(db, 'users', uid, 'logs'), (snap) => {
      const o = {};
      snap.forEach((d) => { o[d.id] = d.data(); });
      this.data.logs = o;
      this.loaded.logs = true;
      this.emit();
    }, onErr));

    this.unsubs.push(fsM.onSnapshot(fsM.doc(db, 'users', uid, 'meta', 'settings'), (snap) => {
      this.data.settings = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
      this.loaded.settings = true;
      this.emit();
    }, onErr));
  }

  // Primeiro login: leva para a nuvem o que já estava salvo neste aparelho.
  async maybeMigrate(cloudCount) {
    if (this.migrating) return;
    let done = false;
    try { done = localStorage.getItem(MIGRATED_KEY) === '1'; } catch (e) { /* ignora */ }
    if (done || cloudCount > 0) return;
    const local = readLocal();
    if (!Object.keys(local.books).length && !Object.keys(local.logs).length) return;
    this.migrating = true;
    try {
      await this.importAll(local, { merge: true });
      try { localStorage.setItem(MIGRATED_KEY, '1'); } catch (e) { /* ignora */ }
    } finally {
      this.migrating = false;
    }
  }

  ref(...path) {
    const { db, fsM } = this.fb;
    return fsM.doc(db, 'users', this.user.uid, ...path);
  }

  saveBook(book) {
    this.data.books = { ...this.data.books, [book.id]: book };
    if (this.mode === 'cloud') {
      this.fb.fsM.setDoc(this.ref('books', book.id), clean(book)).catch((e) => this.writeFailed(e));
    } else {
      writeLocal(this.data);
    }
    this.emit();
  }

  deleteBook(id) {
    const books = { ...this.data.books };
    delete books[id];
    this.data.books = books;
    const logIds = Object.values(this.data.logs).filter((l) => l.bookId === id).map((l) => l.id);
    logIds.forEach((lid) => this.deleteLog(lid, true));
    if (this.mode === 'cloud') {
      this.fb.fsM.deleteDoc(this.ref('books', id)).catch((e) => this.writeFailed(e));
    } else {
      writeLocal(this.data);
    }
    this.emit();
  }

  saveLog(log) {
    this.data.logs = { ...this.data.logs, [log.id]: log };
    if (this.mode === 'cloud') {
      this.fb.fsM.setDoc(this.ref('logs', log.id), clean(log)).catch((e) => this.writeFailed(e));
    } else {
      writeLocal(this.data);
    }
    this.emit();
  }

  deleteLog(id, silent) {
    const logs = { ...this.data.logs };
    delete logs[id];
    this.data.logs = logs;
    if (this.mode === 'cloud') {
      this.fb.fsM.deleteDoc(this.ref('logs', id)).catch((e) => this.writeFailed(e));
    } else {
      writeLocal(this.data);
    }
    if (!silent) this.emit();
  }

  saveSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    if (this.mode === 'cloud') {
      this.fb.fsM.setDoc(this.ref('meta', 'settings'), clean(patch), { merge: true }).catch((e) => this.writeFailed(e));
    } else {
      writeLocal(this.data);
    }
    this.emit();
  }

  async importAll(data, { merge = true } = {}) {
    const books = data.books || {};
    const logs = data.logs || {};
    const settings = data.settings || {};
    if (this.mode === 'cloud') {
      const { db, fsM } = this.fb;
      const ops = [
        ...Object.values(books).map((b) => [this.ref('books', b.id), b]),
        ...Object.values(logs).map((l) => [this.ref('logs', l.id), l]),
      ];
      for (let i = 0; i < ops.length; i += 400) {
        const batch = fsM.writeBatch(db);
        ops.slice(i, i + 400).forEach(([r, v]) => batch.set(r, clean(v)));
        await batch.commit();
      }
      const s = { ...settings };
      if (Object.keys(s).length) {
        await fsM.setDoc(this.ref('meta', 'settings'), clean(s), { merge: true });
      }
    } else {
      this.data = {
        books: merge ? { ...this.data.books, ...books } : books,
        logs: merge ? { ...this.data.logs, ...logs } : logs,
        settings: { ...this.data.settings, ...settings },
      };
      writeLocal(this.data);
      this.emit();
    }
  }

  writeFailed(e) {
    console.error(e);
    this.authError = 'Uma alteração não foi salva na nuvem. Verifique sua conexão.';
    this.emit();
  }

  async signIn() {
    if (!this.fb) throw new Error('Nuvem não configurada');
    const { auth, authM } = this.fb;
    const provider = new authM.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await authM.signInWithPopup(auth, provider);
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await authM.signInWithRedirect(auth, provider);
      } else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        throw e;
      }
    }
  }

  async signOut() {
    if (!this.fb) return;
    await this.fb.authM.signOut(this.fb.auth);
  }
}
