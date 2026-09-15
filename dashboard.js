// Dashboard: vista d'insieme calcolata al volo dai dati di comitati.js ed
// eventi.js — nessuna nuova collection, nessun sistema di notifiche
// persistenti (senza login non c'e' un "per chi" segnarle come lette).
(function () {
  function tsToDate(ts) { return (ts && ts.toDate) ? ts.toDate() : null; }

  function checklistDaCompletare(all) {
    return all.filter(e => !["CONCLUSO", "ANNULLATO"].includes(e.stato || "BOZZA") && (e.checklist || []).some(it => !it.done));
  }

  function ultimiEventi(all) {
    return all.slice().sort((a, b) => {
      const da = tsToDate(a.createdAt), db = tsToDate(b.createdAt);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    }).slice(0, 5);
  }

  function notifiche(all) {
    const now = new Date();
    const items = [];
    all.forEach(e => {
      if (["CONCLUSO", "ANNULLATO"].includes(e.stato || "")) return;
      if (!e.date) return;
      const d = new Date(e.date);
      const days = (d - now) / 86400000;
      if (days >= 0 && days <= 7) {
        const incomplete = (e.checklist || []).filter(it => !it.done).length;
        if (incomplete > 0) items.push(`"${e.title}" è tra ${Math.ceil(days)} giorni: checklist con ${incomplete} voci ancora da completare.`);
        if (!(e.partecipazioni || []).length) items.push(`"${e.title}" è tra ${Math.ceil(days)} giorni: nessun comitato ancora coinvolto.`);
      }
    });
    return items;
  }

  function render() {
    const container = document.getElementById("dashboard-content");
    if (!container || !window.FN_COMITATI) return;
    const comitati = window.FN_COMITATI.getAll();
    const all = window.FN_EVENTI ? window.FN_EVENTI.getAll() : [];
    const now = new Date();
    const attivi = comitati.filter(d => d.stato === "attivo").length;
    const programmati = all.filter(e => ["IN_PROGRAMMAZIONE", "CONFERMATO"].includes(e.stato)).length;
    const imminenti = all.filter(e => e.date && new Date(e.date) >= now && (new Date(e.date) - now) <= 14 * 86400000 && e.stato !== "ANNULLATO")
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const conclusi = all.filter(e => e.stato === "CONCLUSO").length;
    const daCompletare = checklistDaCompletare(all);
    const ultimi = ultimiEventi(all);
    const notif = notifiche(all);
    const statoLabel = window.FN_EVENTI ? window.FN_EVENTI.STATO_LABEL : {};

    if (!window.FN_FIREBASE_READY) {
      container.innerHTML = `<div class="notice error">Firebase non configurato: la dashboard mostra solo i comitati (dati statici in sola lettura). Eventi, checklist e notifiche richiedono Firebase — vedi il messaggio nel tab Eventi.</div>` + container.innerHTML;
    }

    container.innerHTML = `
      <div class="dash-grid">
        <div class="dash-card"><div class="dash-num">${comitati.length}</div><div class="dash-label">Comitati totali</div></div>
        <div class="dash-card"><div class="dash-num">${attivi}</div><div class="dash-label">Comitati attivi</div></div>
        <div class="dash-card"><div class="dash-num">${programmati}</div><div class="dash-label">Eventi programmati</div></div>
        <div class="dash-card"><div class="dash-num">${imminenti.length}</div><div class="dash-label">Eventi imminenti (14 gg)</div></div>
        <div class="dash-card"><div class="dash-num">${conclusi}</div><div class="dash-label">Eventi conclusi</div></div>
        <div class="dash-card"><div class="dash-num">${daCompletare.length}</div><div class="dash-label">Da completare</div></div>
      </div>
      <div class="dash-columns">
        <div class="card dash-col">
          <h3 style="margin-top:0;">📅 Prossimi eventi</h3>
          ${imminenti.length ? `<ul class="dash-list">${imminenti.slice(0, 6).map(e => `<li><b>${e.title}</b><br><small>${new Date(e.date).toLocaleDateString("it-IT")} — ${e.comune || e.place || ""}</small></li>`).join("")}</ul>` : '<p class="detail empty">Nessun evento nei prossimi 14 giorni.</p>'}
        </div>
        <div class="card dash-col">
          <h3 style="margin-top:0;">🆕 Ultimi eventi inseriti</h3>
          ${ultimi.length ? `<ul class="dash-list">${ultimi.map(e => `<li><b>${e.title}</b> <span class="stato-badge stato-${(e.stato || "bozza").toLowerCase()}" style="font-size:10px;">${statoLabel[e.stato] || e.stato || "Bozza"}</span></li>`).join("")}</ul>` : '<p class="detail empty">Nessun evento ancora.</p>'}
        </div>
        <div class="card dash-col">
          <h3 style="margin-top:0;">🔔 Da tenere d'occhio</h3>
          ${notif.length ? `<ul class="dash-list">${notif.map(n => `<li>${n}</li>`).join("")}</ul>` : '<p class="detail empty">Nessuna segnalazione al momento.</p>'}
        </div>
      </div>
    `;
  }

  window.FN_DASHBOARD = {
    init() { window.FN_COMITATI.onChange(() => render()); render(); },
    refresh: render
  };
})();
