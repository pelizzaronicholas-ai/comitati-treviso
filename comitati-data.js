// Sorgente dati unica per i comitati: se Firebase e' configurato, i comitati
// vivono su Firestore (collection "comitati_treviso") e sono modificabili da
// interfaccia; altrimenti si legge in sola lettura window.CONTACTS (data.js),
// esattamente come prima. Al primo avvio con Firestore configurato, se la
// collection e' vuota, viene seminata 1:1 con i dati statici esistenti (stesso
// ID, stessi valori: nessuna perdita o alterazione di dati). Tutti gli altri
// moduli (mappa, rubrica, eventi, dashboard, calendario) leggono da qui,
// mai piu' direttamente da window.CONTACTS.
(function () {
  const COLLECTION = "comitati_treviso";
  let cache = [];
  let ready = false;
  const listeners = [];

  function notify() {
    listeners.forEach(fn => { try { fn(cache); } catch (e) { console.error("[FN] Errore in un listener comitati:", e); } });
  }

  // Iscrive fn agli aggiornamenti della lista comitati. Se i dati sono gia'
  // pronti la chiama subito (nessuna gara tra ordine di init dei moduli).
  function onChange(fn) {
    listeners.push(fn);
    if (ready) fn(cache);
  }

  // Riporta un record (statico o Firestore) alla stessa forma estesa, con
  // default sensati per i campi nuovi assenti sui dati storici.
  function normalize(d) {
    return {
      id: String(d.id),
      name: d.name || "",
      city: d.city || "",
      provincia: d.provincia || "Treviso",
      regione: d.regione || "Veneto",
      indirizzo: d.indirizzo || "",
      ref: d.ref || "",
      ref2: d.ref2 || "",
      email: d.email || "",
      tel: d.tel || "",
      stato: d.stato || "attivo", // attivo | inattivo | in_costituzione
      note: d.note || "",
      ruolo: d.ruolo || "", // metadato descrittivo, nessun controllo accessi reale (vedi README)
      lat: (d.lat != null) ? d.lat : null,
      lon: (d.lon != null) ? d.lon : null
    };
  }

  async function seedIfEmpty() {
    const snap = await window.db.collection(COLLECTION).limit(1).get();
    if (!snap.empty) return;
    const batch = window.db.batch();
    window.CONTACTS.forEach(d => {
      const docRef = window.db.collection(COLLECTION).doc(String(d.id));
      batch.set(docRef, normalize(d));
    });
    await batch.commit();
    console.log(`[FN] Comitati: seed iniziale completato (${window.CONTACTS.length} comitati copiati da data.js a Firestore).`);
  }

  function init() {
    if (!window.FN_FIREBASE_READY) {
      // Fallback offline/non configurato: dati statici, sola lettura.
      cache = window.CONTACTS.map(normalize);
      ready = true;
      notify();
      return;
    }
    seedIfEmpty().catch(e => console.error("[FN] Errore seed comitati su Firestore:", e));
    window.db.collection(COLLECTION).onSnapshot(snap => {
      cache = snap.docs.map(doc => normalize({ ...doc.data(), id: doc.id }));
      ready = true;
      notify();
    }, err => {
      console.error("[FN] Errore lettura comitati da Firestore:", err);
      if (!ready) { // se non abbiamo mai ricevuto dati, meglio mostrare lo statico che una lista vuota
        cache = window.CONTACTS.map(normalize);
        ready = true;
        notify();
      }
    });
  }

  function getAll() { return cache.slice(); }
  function getById(id) { return cache.find(d => d.id === String(id)); }

  function isEditable() { return !!window.FN_FIREBASE_READY; }

  function update(id, patch) {
    if (!isEditable()) return Promise.reject(new Error("Firebase non configurato: le modifiche ai comitati non possono essere salvate."));
    return window.db.collection(COLLECTION).doc(String(id)).set(patch, { merge: true });
  }

  function create(data) {
    if (!isEditable()) return Promise.reject(new Error("Firebase non configurato: non e' possibile aggiungere nuovi comitati."));
    const id = data.id ? String(data.id) : window.db.collection(COLLECTION).doc().id;
    return window.db.collection(COLLECTION).doc(id).set(normalize({ ...data, id }));
  }

  // Elenco delle province presenti nei dati attuali, per popolare i filtri.
  // Oggi e' sempre solo "Treviso": la struttura regge comunque la crescita
  // futura (vedi README, sezione struttura territoriale).
  function provinceInUse() {
    return [...new Set(cache.map(d => d.provincia).filter(Boolean))].sort();
  }

  window.FN_COMITATI = { init, onChange, getAll, getById, update, create, isEditable, provinceInUse };
})();
