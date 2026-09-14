// Bootstrap dell'app: tabs, "chi sei", orchestrazione mappa<->rubrica<->dettaglio.
(function () {
  let activeId = null;

  function initials(d) {
    const src = (d.ref || d.city || "?").trim();
    const parts = src.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }

  function renderDetail(id) {
    const el = document.getElementById("detail");
    const d = window.CONTACTS.find(x => x.id === id);
    if (!d) { el.classList.add("empty"); el.textContent = "Seleziona un comitato dalla lista o dalla mappa per vedere i dettagli."; return; }
    el.classList.remove("empty");
    el.innerHTML = `
      <div class="detail-head">
        <div class="avatar">${initials(d)}</div>
        <div>
          <div class="detail-name">${d.ref || d.name}</div>
          <span class="badge-city">${d.city}</span>
        </div>
      </div>
      <div class="detail-rows">
        <div class="detail-row"><span class="drow-label">Comitato</span><span class="drow-value">${d.name}</span></div>
        <div class="detail-row"><span class="drow-label">Email</span><span class="drow-value">${d.email}</span></div>
        <div class="detail-row"><span class="drow-label">Telefono</span><a class="drow-value" href="tel:${d.tel}">${d.tel}</a></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="write-email">✉️ Scrivi email</button>
        <a class="btn" href="tel:${d.tel}">📞 Chiama</a>
        <a class="btn accent" href="${window.FN_UTILS.waLink(d.tel)}" target="_blank">WhatsApp</a>
      </div>
    `;
    // L'email non è più un mailto diretto: passa dalla finestra di composizione
    // condivisa, cosi' anche il messaggio a un singolo comitato parte sempre
    // da comitatoroncade@gmail.com (se EmailJS è configurato, vedi emailjs-config.js).
    el.querySelector('[data-action="write-email"]').addEventListener("click", () => {
      window.FN_EMAIL.open({
        title: `Email a ${d.ref || d.name}`,
        recipients: [d],
        recipientsLabel: `A: ${d.ref || d.name} <${d.email}>`
      });
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
        // La mini-mappa per il punto evento vive in un tab nascosto all'avvio:
        // Leaflet calcolerebbe dimensioni 0x0 se inizializzata li'. La creiamo
        // (o ne ricalcoliamo le dimensioni) solo quando il tab diventa visibile.
        if (btn.dataset.tab === "eventi" && window.FN_EVENTI && window.FN_EVENTI.onShow) {
          window.FN_EVENTI.onShow();
        }
      });
    });
  }

  function initWhoami() {
    const sel = document.getElementById("whoami-select");
    const names = window.CONTACTS.filter(d => d.ref).map(d => d.ref).sort((a, b) => a.localeCompare(b));
    names.forEach(n => {
      const opt = document.createElement("option");
      opt.value = n; opt.textContent = n;
      sel.appendChild(opt);
    });
    const saved = localStorage.getItem("fn_whoami");
    if (saved) sel.value = saved;
    sel.addEventListener("change", () => localStorage.setItem("fn_whoami", sel.value));
  }

  // Ogni modulo si inizializza in modo isolato: se uno fallisce (es. la
  // mappa non riesce a caricare i tile, connessione assente) non deve
  // bloccare il resto dell'app (rubrica, eventi, messaggi restano usabili).
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error(`[FN] Errore inizializzazione "${label}":`, e); }
  }

  document.addEventListener("DOMContentLoaded", () => {
    safe("tabs", initTabs);
    safe("whoami", initWhoami);
    safe("mappa", () => window.FN_MAP.render());
    safe("rubrica", () => window.FN_RUBRICA.render(""));
    safe("eventi", () => window.FN_EVENTI.init());
  });

  window.FN_APP = {
    select,
    whoami: () => document.getElementById("whoami-select").value
  };
})();
