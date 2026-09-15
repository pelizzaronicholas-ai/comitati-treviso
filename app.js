// Bootstrap dell'app: tabs, "chi sei", orchestrazione mappa<->rubrica<->dettaglio.
(function () {
  let activeId = null;
  const STATO_LABEL = { attivo: "Attivo", inattivo: "Inattivo", in_costituzione: "In costituzione" };

  function initials(d) {
    const src = (d.ref || d.city || "?").trim();
    const parts = src.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }

  function renderDetail(id) {
    const el = document.getElementById("detail");
    const d = window.FN_COMITATI.getById(id);
    if (!d) { el.classList.add("empty"); el.textContent = "Seleziona un comitato dalla lista o dalla mappa per vedere i dettagli."; return; }
    el.classList.remove("empty");
    const eventi = window.FN_EVENTI ? window.FN_EVENTI.getForComitato(d.id) : [];
    const statoBadge = d.stato && d.stato !== "attivo" ? `<span class="badge-stato ${d.stato}">${STATO_LABEL[d.stato] || d.stato}</span>` : "";
    el.innerHTML = `
      <div class="detail-head">
        <div class="avatar">${initials(d)}</div>
        <div>
          <div class="detail-name">${d.ref || d.name}</div>
          <span class="badge-city">${d.city}${d.provincia ? " (" + d.provincia + ")" : ""}</span>
          ${statoBadge}
        </div>
      </div>
      <div class="detail-rows">
        <div class="detail-row"><span class="drow-label">Comitato</span><span class="drow-value">${d.name}</span></div>
        ${d.indirizzo ? `<div class="detail-row"><span class="drow-label">Indirizzo</span><span class="drow-value">${d.indirizzo}</span></div>` : ""}
        <div class="detail-row"><span class="drow-label">Email</span><span class="drow-value">${d.email}</span></div>
        <div class="detail-row"><span class="drow-label">Telefono</span><a class="drow-value" href="tel:${d.tel}">${d.tel}</a></div>
        ${d.ref2 ? `<div class="detail-row"><span class="drow-label">Secondo ref.</span><span class="drow-value">${d.ref2}</span></div>` : ""}
        ${d.note ? `<div class="detail-row"><span class="drow-label">Note</span><span class="drow-value">${d.note}</span></div>` : ""}
      </div>
      <div class="actions">
        <button class="btn primary" data-action="write-email">✉️ Scrivi email</button>
        <a class="btn" href="tel:${d.tel}">📞 Chiama</a>
        <a class="btn accent" href="${window.FN_UTILS.waLink(d.tel)}" target="_blank">WhatsApp</a>
        <button class="btn" data-action="edit-comitato">✏️ Modifica scheda</button>
      </div>
      ${eventi.length ? `
      <div class="detail-eventi">
        <h4 class="panel-subtitle">Eventi a cui ha partecipato/organizzato (${eventi.length})</h4>
        <ul class="detail-eventi-list">
          ${eventi.map(ev => `<li>${ev.title} <small>${ev.date ? new Date(ev.date).toLocaleDateString("it-IT") : ""}</small></li>`).join("")}
        </ul>
      </div>` : ""}
    `;
    // L'email non è un mailto diretto: passa dalla finestra di composizione
    // condivisa, cosi' anche il messaggio a un singolo comitato parte sempre
    // da comitatoroncade@gmail.com (se EmailJS è configurato, vedi emailjs-config.js).
    el.querySelector('[data-action="write-email"]').addEventListener("click", () => {
      window.FN_EMAIL.open({
        title: `Email a ${d.ref || d.name}`,
        recipients: [d],
        recipientsLabel: `A: ${d.ref || d.name} <${d.email}>`
      });
    });
    el.querySelector('[data-action="edit-comitato"]').addEventListener("click", () => {
      window.FN_RUBRICA.openComitatoModal(d);
    });
  }

  function select(id) {
    activeId = id;
    renderDetail(id);
    window.FN_MAP.setActive(id);
    window.FN_RUBRICA.setActive(id);
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        // Mappa (Comitati) ed evento hanno mini-mappe Leaflet che vivono in tab
        // inizialmente nascoste: dimensioni 0x0 se inizializzate mentre nascoste,
        // quindi le (ri)inizializziamo solo quando il loro tab diventa visibile.
        if (btn.dataset.tab === "comitati" && window.FN_MAP) { window.FN_MAP.render(); if (window.FN_RUBRICA.refreshMap) window.FN_RUBRICA.refreshMap(); }
        if (btn.dataset.tab === "eventi" && window.FN_EVENTI && window.FN_EVENTI.onShow) window.FN_EVENTI.onShow();
        if (btn.dataset.tab === "dashboard" && window.FN_DASHBOARD) window.FN_DASHBOARD.refresh();
        if (btn.dataset.tab === "calendario" && window.FN_CALENDARIO) window.FN_CALENDARIO.refresh();
      });
    });
  }

  function initWhoami() {
    const sel = document.getElementById("whoami-select");
    function rebuild(list) {
      const saved = sel.value || localStorage.getItem("fn_whoami") || "";
      const names = list.filter(d => d.ref).map(d => d.ref).sort((a, b) => a.localeCompare(b));
      sel.innerHTML = '<option value="">Seleziona il tuo nome…</option>' + names.map(n => `<option value="${n}">${n}</option>`).join("");
      if (names.includes(saved)) sel.value = saved;
    }
    window.FN_COMITATI.onChange(rebuild);
    sel.addEventListener("change", () => localStorage.setItem("fn_whoami", sel.value));
  }

  // Ogni modulo si inizializza in modo isolato: se uno fallisce (es. la
  // mappa non riesce a caricare i tile, connessione assente) non deve
  // bloccare il resto dell'app (comitati, eventi, dashboard, calendario
  // restano usabili).
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error(`[FN] Errore inizializzazione "${label}":`, e); }
  }

  document.addEventListener("DOMContentLoaded", () => {
    safe("dati-comitati", () => window.FN_COMITATI.init());
    safe("tabs", initTabs);
    safe("whoami", initWhoami);
    // La mappa (tab "Comitati") non e' piu' il tab visibile di default (lo e'
    // la Dashboard): la inizializziamo solo quando il tab diventa visibile
    // (vedi initTabs), altrimenti Leaflet calcolerebbe dimensioni 0x0.
    safe("eventi", () => window.FN_EVENTI.init());
    safe("dashboard", () => window.FN_DASHBOARD && window.FN_DASHBOARD.init());
    safe("calendario", () => window.FN_CALENDARIO && window.FN_CALENDARIO.init());
  });

  window.FN_APP = {
    select,
    whoami: () => document.getElementById("whoami-select").value
  };
})();
