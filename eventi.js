// Modulo Eventi: creazione, targeting (tutti / un comune / selezione manuale
// dalla Rubrica), notifica via email (finestra di composizione condivisa,
// vedi email-sender.js) ai destinatari del target. Include: geolocalizzazione
// evento con indicazioni stradali e aggiunta al calendario telefono,
// workflow di stato, checklist operativa, budget, comitati vicini con
// gestione partecipazione, report post-evento.
// Persistenza su Firestore -> visibile in tempo reale a chiunque apra l'app.
(function () {
  const COLLECTION = "eventi_treviso";

  // Cache dell'ultima lista eventi ricevuta da Firestore: la usano anche
  // dashboard.js e calendario.js (window.FN_EVENTI.getAll()) senza dover
  // aprire una seconda lettura.
  let allEvents = [];

  const STATI_EVENTO = ["BOZZA", "IN_PROGRAMMAZIONE", "CONFERMATO", "IN_CORSO", "CONCLUSO", "ANNULLATO"];
  const STATO_LABEL = {
    BOZZA: "Bozza", IN_PROGRAMMAZIONE: "In programmazione", CONFERMATO: "Confermato",
    IN_CORSO: "In corso", CONCLUSO: "Concluso", ANNULLATO: "Annullato"
  };
  const TIPOLOGIE = ["Presidio", "Banchetto/Gazebo", "Convegno/Dibattito", "Formazione", "Raccolta firme", "Cena sociale", "Volantinaggio", "Altro"];
  const ATTIVITA_OPTIONS = ["Supporto organizzativo", "Volantinaggio", "Presenza all'evento", "Accoglienza", "Gestione materiale", "Comunicazione", "Altro"];
  const PARTECIPAZIONE_STATI = ["DA_INVITARE", "INVITATO", "CONFERMATO", "NON_DISPONIBILE"];
  const PARTECIPAZIONE_LABEL = { DA_INVITARE: "Da invitare", INVITATO: "Invitato", CONFERMATO: "Confermato", NON_DISPONIBILE: "Non disponibile" };
  const CHECKLIST_DEFAULT = () => ["Location confermata", "Data confermata", "Relatori confermati", "Materiale preparato",
    "Comunicazione preparata", "Comitati coinvolti", "Inviti inviati", "Volontari/referenti assegnati",
    "Evento svolto", "Report compilato"].map(label => ({ label, done: false }));

  // Ricorda quali pannelli <details> sono aperti (per id-evento + nome
  // pannello): senza questo, ogni scrittura su Firestore (spunta una
  // checklist, ecc.) causa un re-render che richiuderebbe tutto.
  const openPanels = new Set();

  function fbNotice(container) {
    if (window.FN_FIREBASE_READY) { container.innerHTML = ""; return false; }
    container.innerHTML = `<div class="notice error">Firebase non configurato: compila <code>firebase-config.js</code> con le chiavi del tuo progetto per creare e vedere gli eventi. La bacheca funziona a livello di codice, manca solo la connessione al tuo progetto Firebase.</div>`;
    return true;
  }

  // ---------------------------------------------------------------------
  // Locandine: compressione lato browser, salvate come base64 nel documento
  // (niente Firebase Storage, restiamo sul piano gratuito).
  // ---------------------------------------------------------------------
  function readAsDataUrl(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function compressForFirestore(file) {
    const attempts = [[1000, 0.75], [1000, 0.55], [800, 0.5], [640, 0.45], [480, 0.4]];
    for (const [w, q] of attempts) {
      const dataUrl = await readAsDataUrl(file, w, q);
      if (dataUrl.length < 650000) return dataUrl;
    }
    return null;
  }

  function openLightbox(src) {
    const ov = document.createElement("div");
    ov.className = "fn-lightbox";
    ov.innerHTML = `<img src="${src}" alt="Locandina evento">`;
    ov.addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }

  // ---------------------------------------------------------------------
  // Punto evento sulla mappa: mini-mappa Leaflet cliccabile + ricerca
  // indirizzo via Nominatim (OpenStreetMap, gratuito, nessuna chiave API).
  // ---------------------------------------------------------------------
  let pickerMap = null;
  let pickerMarker = null;
  let evLat = null, evLon = null;

  function updateGeoStatus() {
    const el = document.getElementById("ev-geo-status");
    const clearBtn = document.getElementById("ev-geo-clear");
    if (evLat != null && evLon != null) {
      el.textContent = `📍 Punto impostato: ${evLat.toFixed(5)}, ${evLon.toFixed(5)}`;
      el.classList.add("set");
      clearBtn.style.display = "inline-flex";
    } else {
      el.textContent = "Nessun punto impostato — clicca sulla mappa o cerca un indirizzo.";
      el.classList.remove("set");
      clearBtn.style.display = "none";
    }
  }

  function setPickerPoint(lat, lon, recenter) {
    evLat = lat; evLon = lon;
    if (!pickerMarker) {
      pickerMarker = L.marker([lat, lon], { draggable: true }).addTo(pickerMap);
      pickerMarker.on("dragend", () => {
        const p = pickerMarker.getLatLng();
        evLat = p.lat; evLon = p.lng;
        updateGeoStatus();
      });
    } else {
      pickerMarker.setLatLng([lat, lon]);
    }
    if (recenter) pickerMap.setView([lat, lon], Math.max(pickerMap.getZoom(), 13));
    updateGeoStatus();
  }

  function clearPickerPoint() {
    evLat = null; evLon = null;
    if (pickerMarker) { pickerMap.removeLayer(pickerMarker); pickerMarker = null; }
    updateGeoStatus();
  }

  function initPickerMap() {
    if (pickerMap) { pickerMap.invalidateSize(); return; }
    pickerMap = L.map("ev-map-picker", { scrollWheelZoom: false }).setView([45.75, 12.25], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(pickerMap);
    pickerMap.on("click", (e) => setPickerPoint(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => pickerMap.invalidateSize(), 200);

    document.getElementById("ev-geo-clear").addEventListener("click", clearPickerPoint);

    async function geocode() {
      const q = document.getElementById("ev-geo-search").value.trim();
      if (!q) return;
      const statusEl = document.getElementById("ev-geo-status");
      statusEl.textContent = "Ricerca in corso…";
      try {
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=" + encodeURIComponent(q);
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        const results = await res.json();
        if (!results.length) {
          alert("Nessun risultato per questo indirizzo. Prova a essere più specifico (es. con la città) o clicca direttamente sulla mappa.");
          updateGeoStatus();
          return;
        }
        setPickerPoint(parseFloat(results[0].lat), parseFloat(results[0].lon), true);
      } catch (err) {
        alert("Ricerca indirizzo non riuscita (problema di rete). Puoi comunque cliccare direttamente sulla mappa per indicare il punto.");
        updateGeoStatus();
      }
    }
    document.getElementById("ev-geo-search-btn").addEventListener("click", geocode);
    document.getElementById("ev-geo-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); geocode(); }
    });
  }

  function resetPicker() {
    document.getElementById("ev-geo-search").value = "";
    clearPickerPoint();
  }

  // ---------------------------------------------------------------------
  // Aggiungi al calendario del telefono: file .ics generato al volo nel
  // browser. Se c'e' un'ora di fine usiamo quella, altrimenti +2h di default.
  // ---------------------------------------------------------------------
  function icsEscape(s) {
    return String(s || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  }
  function toICSDate(d) {
    const p = n => String(n).padStart(2, "0");
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z";
  }
  function buildICS(ev, id) {
    const start = new Date(ev.date);
    let end;
    if (ev.oraFine) {
      const [h, m] = ev.oraFine.split(":").map(Number);
      end = new Date(start);
      end.setHours(h, m, 0, 0);
      if (end <= start) end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // ora di fine incoerente -> fallback
    } else {
      end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // durata di default, non abbiamo un'ora di fine
    }
    const luogoCompleto = [ev.place, ev.indirizzo, ev.comune].filter(Boolean).join(", ");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Comitati di TREVISO//IT", "BEGIN:VEVENT",
      "UID:fn-evento-" + id + "@comitati-treviso",
      "DTSTAMP:" + toICSDate(new Date()),
      "DTSTART:" + toICSDate(start),
      "DTEND:" + toICSDate(end),
      "SUMMARY:" + icsEscape(ev.title)
    ];
    if (luogoCompleto) lines.push("LOCATION:" + icsEscape(luogoCompleto));
    if (ev.description) lines.push("DESCRIPTION:" + icsEscape(ev.description));
    if (ev.lat != null && ev.lon != null) lines.push(`GEO:${ev.lat};${ev.lon}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }
  function addToCalendar(ev, id) {
    const ics = buildICS(ev, id);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evento-" + (ev.title || "evento").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------------------------------------------------------------------
  // Destinatari del target evento (tutti / un comune / selezione manuale).
  // Confronto id con String() da entrambi i lati: eventi creati prima della
  // migrazione a Firestore potrebbero avere id numerici salvati nell'array.
  // ---------------------------------------------------------------------
  function targetContacts(target) {
    const DATA = window.FN_COMITATI.getAll();
    if (target.type === "all") return DATA;
    if (target.type === "city") return DATA.filter(d => d.city === target.value);
    if (target.type === "selection") {
      const ids = (target.value || []).map(String);
      return DATA.filter(d => ids.includes(String(d.id)));
    }
    return [];
  }

  function fmtDate(ev) {
    if (!ev.date) return "";
    const start = new Date(ev.date).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
    return ev.oraFine ? `${start} – ${ev.oraFine}` : start;
  }

  function luogoLabel(ev) {
    return [ev.place, ev.comune && ev.provincia ? `${ev.comune} (${ev.provincia})` : ev.comune].filter(Boolean).join(" — ");
  }

  // ---------------------------------------------------------------------
  // Checklist
  // ---------------------------------------------------------------------
  function renderChecklist(ev, id) {
    const items = (ev.checklist && ev.checklist.length) ? ev.checklist : CHECKLIST_DEFAULT();
    const rows = items.map((it, i) => `
      <label class="checklist-item">
        <input type="checkbox" data-idx="${i}" ${it.done ? "checked" : ""}>
        <span${it.done ? ' class="done"' : ""}>${it.label}</span>
      </label>`).join("");
    return `
      <div class="panel-body checklist" data-event="${id}">
        ${rows}
        <div class="checklist-add">
          <input type="text" class="checklist-new-label" placeholder="Aggiungi voce…">
          <button type="button" class="btn small checklist-add-btn">+ Aggiungi</button>
        </div>
      </div>`;
  }

  function wireChecklist(div, ev, id) {
    const panel = div.querySelector(`.checklist[data-event="${id}"]`);
    if (!panel) return;
    const items = (ev.checklist && ev.checklist.length) ? ev.checklist.slice() : CHECKLIST_DEFAULT();
    function save(newItems) {
      window.db.collection(COLLECTION).doc(id).set({ checklist: newItems }, { merge: true });
    }
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = Number(cb.dataset.idx);
        items[idx].done = cb.checked;
        save(items);
      });
    });
    const addBtn = panel.querySelector(".checklist-add-btn");
    const addInput = panel.querySelector(".checklist-new-label");
    addBtn.addEventListener("click", () => {
      const label = addInput.value.trim();
      if (!label) return;
      items.push({ label, done: false });
      save(items);
    });
  }

  // ---------------------------------------------------------------------
  // Budget
  // ---------------------------------------------------------------------
  function renderBudget(ev, id) {
    const b = ev.budget || {};
    const num = v => (v == null ? "" : v);
    return `
      <div class="panel-body budget-grid" data-event="${id}">
        <label>Budget richiesto (€)<input type="number" step="0.01" class="bg-previsto" value="${num(b.previsto)}"></label>
        <label>Budget approvato (€)<input type="number" step="0.01" class="bg-approvato" value="${num(b.approvato)}"></label>
        <label>Budget disponibile (€)<input type="number" step="0.01" class="bg-disponibile" value="${num(b.disponibile)}"></label>
        <label>Spese effettive (€)<input type="number" step="0.01" class="bg-spese" value="${num(b.speseEffettive)}"></label>
        <label style="grid-column:1/-1;">Note budget<textarea rows="2" class="bg-note">${b.note || ""}</textarea></label>
        <button type="button" class="btn primary small budget-save" style="grid-column:1/-1;">💾 Salva budget</button>
      </div>`;
  }

  function wireBudget(div, ev, id) {
    const panel = div.querySelector(`.budget-grid[data-event="${id}"]`);
    if (!panel) return;
    panel.querySelector(".budget-save").addEventListener("click", () => {
      const n = v => v === "" ? null : Number(v);
      const budget = {
        previsto: n(panel.querySelector(".bg-previsto").value),
        approvato: n(panel.querySelector(".bg-approvato").value),
        disponibile: n(panel.querySelector(".bg-disponibile").value),
        speseEffettive: n(panel.querySelector(".bg-spese").value),
        note: panel.querySelector(".bg-note").value
      };
      window.db.collection(COLLECTION).doc(id).set({ budget }, { merge: true });
    });
  }

  // ---------------------------------------------------------------------
  // Comitati coinvolti: vicini all'evento (per distanza) + gestione stato
  // di partecipazione e attivita' assegnata di chi e' gia' stato coinvolto.
  // ---------------------------------------------------------------------
  function renderCoinvolti(ev, id) {
    const partecipazioni = ev.partecipazioni || [];
    const coinvoltiIds = new Set(partecipazioni.map(p => String(p.comitatoId)));

    let viciniHtml;
    if (ev.lat == null || ev.lon == null) {
      viciniHtml = `<p class="detail empty" style="margin:0 0 10px;">Imposta un punto sulla mappa per questo evento (sopra, nel form) per vedere i comitati vicini.</p>`;
    } else {
      viciniHtml = `
        <div class="vicini-filters">
          <button type="button" class="btn small vicini-filter" data-km="10">Entro 10 km</button>
          <button type="button" class="btn small vicini-filter active" data-km="25">Entro 25 km</button>
          <button type="button" class="btn small vicini-filter" data-km="50">Entro 50 km</button>
          <button type="button" class="btn small vicini-filter" data-km="provincia">Tutta la provincia</button>
        </div>
        <div class="vicini-list"></div>
        <button type="button" class="btn primary small vicini-invita" style="margin-top:8px;">+ Invita selezionati</button>
      `;
    }

    const partRows = partecipazioni.map((p, i) => {
      const c = window.FN_COMITATI.getById(p.comitatoId);
      const nome = c ? (c.ref || c.name) : `Comitato ${p.comitatoId}`;
      return `
        <div class="part-row" data-idx="${i}">
          <span class="part-name">${nome}${c ? ` <small>(${c.city})</small>` : ""}</span>
          <select class="part-stato">${PARTECIPAZIONE_STATI.map(s => `<option value="${s}" ${p.stato === s ? "selected" : ""}>${PARTECIPAZIONE_LABEL[s]}</option>`).join("")}</select>
          <select class="part-attivita">
            <option value="">— attività —</option>
            ${ATTIVITA_OPTIONS.map(a => `<option value="${a}" ${p.attivita === a ? "selected" : ""}>${a}</option>`).join("")}
          </select>
          <button type="button" class="btn small part-remove" title="Rimuovi">✕</button>
        </div>`;
    }).join("");

    return `
      <div class="panel-body coinvolti" data-event="${id}">
        ${viciniHtml}
        <h4 class="panel-subtitle">Comitati coinvolti (${partecipazioni.length})</h4>
        <div class="part-list">${partRows || '<p class="detail empty" style="margin:0;">Nessun comitato coinvolto ancora.</p>'}</div>
        ${partecipazioni.length ? '<button type="button" class="btn small coinvolti-email">✉️ Email ai comitati coinvolti</button>' : ""}
      </div>`;
  }

  function wireCoinvolti(div, ev, id) {
    const panel = div.querySelector(`.coinvolti[data-event="${id}"]`);
    if (!panel) return;
    let partecipazioni = (ev.partecipazioni || []).slice();

    function save(newPart) {
      window.db.collection(COLLECTION).doc(id).set({ partecipazioni: newPart }, { merge: true });
    }

    function renderVicini(km) {
      const listEl = panel.querySelector(".vicini-list");
      if (!listEl) return;
      const all = window.FN_COMITATI.getAll();
      let candidates = window.FN_PROSSIMITA.nearestTo(ev.lat, ev.lon, all);
      if (km === "provincia") {
        candidates = candidates.filter(d => d.provincia === (ev.provincia || "Treviso"));
      } else {
        candidates = candidates.filter(d => d.distanceKm <= km);
      }
      const coinvoltiIds = new Set(partecipazioni.map(p => String(p.comitatoId)));
      if (!candidates.length) {
        listEl.innerHTML = '<p class="detail empty" style="margin:0;">Nessun comitato in questo raggio.</p>';
        return;
      }
      listEl.innerHTML = candidates.map(d => `
        <label class="vicino-row">
          <input type="checkbox" value="${d.id}" ${coinvoltiIds.has(String(d.id)) ? "checked disabled" : ""}>
          <span>${d.ref || d.name} <small>(${d.city} — ${d.distanceKm.toFixed(1)} km)</small></span>
        </label>`).join("");
    }

    if (ev.lat != null && ev.lon != null) {
      renderVicini(25);
      panel.querySelectorAll(".vicini-filter").forEach(btn => {
        btn.addEventListener("click", () => {
          panel.querySelectorAll(".vicini-filter").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const km = btn.dataset.km === "provincia" ? "provincia" : Number(btn.dataset.km);
          renderVicini(km);
        });
      });
      panel.querySelector(".vicini-invita").addEventListener("click", () => {
        const checked = [...panel.querySelectorAll('.vicini-list input[type="checkbox"]:checked:not(:disabled)')].map(cb => cb.value);
        if (!checked.length) { alert("Seleziona almeno un comitato da invitare."); return; }
        checked.forEach(cid => partecipazioni.push({ comitatoId: cid, stato: "DA_INVITARE", attivita: "" }));
        save(partecipazioni);
      });
    }

    panel.querySelectorAll(".part-row").forEach(row => {
      const idx = Number(row.dataset.idx);
      row.querySelector(".part-stato").addEventListener("change", (e) => { partecipazioni[idx].stato = e.target.value; save(partecipazioni); });
      row.querySelector(".part-attivita").addEventListener("change", (e) => { partecipazioni[idx].attivita = e.target.value; save(partecipazioni); });
      row.querySelector(".part-remove").addEventListener("click", () => { partecipazioni.splice(idx, 1); save(partecipazioni); });
    });

    const emailBtn = panel.querySelector(".coinvolti-email");
    if (emailBtn) {
      emailBtn.addEventListener("click", () => {
        const recipients = partecipazioni.map(p => window.FN_COMITATI.getById(p.comitatoId)).filter(Boolean);
        window.FN_EMAIL.open({
          title: `Email ai comitati coinvolti — ${ev.title}`,
          recipients,
          recipientsLabel: `A: ${recipients.length} comitati coinvolti nell'evento`,
          subject: `Evento: ${ev.title}`,
          body: `${ev.title}\n${fmtDate(ev)}${luogoLabel(ev) ? "\n" + luogoLabel(ev) : ""}\n\n${ev.description || ""}`
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Report post-evento
  // ---------------------------------------------------------------------
  function renderReport(ev, id) {
    const r = ev.report || {};
    return `
      <div class="panel-body report-grid" data-event="${id}">
        <label>Partecipanti effettivi<input type="number" class="rp-partecipanti" value="${r.partecipantiEffettivi ?? ""}"></label>
        <label>Comitati presenti<input type="text" class="rp-comitati" value="${r.comitatiPresenti || ""}" placeholder="es. Roncade, Preganziol…"></label>
        <label>Ospiti presenti<input type="text" class="rp-ospiti" value="${r.ospitiPresenti || ""}"></label>
        <label style="grid-column:1/-1;">Risultato dell'evento<textarea rows="2" class="rp-risultato">${r.risultato || ""}</textarea></label>
        <label style="grid-column:1/-1;">Problemi riscontrati<textarea rows="2" class="rp-problemi">${r.problemi || ""}</textarea></label>
        <label style="grid-column:1/-1;">Nuovi contatti raccolti<textarea rows="2" class="rp-contatti">${r.nuoviContatti || ""}</textarea></label>
        <label style="grid-column:1/-1;">Attività successive da fare<textarea rows="2" class="rp-successive">${r.attivitaSuccessive || ""}</textarea></label>
        <label style="grid-column:1/-1;">Note<textarea rows="2" class="rp-note">${r.note || ""}</textarea></label>
        <button type="button" class="btn primary small report-save" style="grid-column:1/-1;">💾 Salva report</button>
      </div>`;
  }

  function wireReport(div, ev, id) {
    const panel = div.querySelector(`.report-grid[data-event="${id}"]`);
    if (!panel) return;
    panel.querySelector(".report-save").addEventListener("click", () => {
      const report = {
        partecipantiEffettivi: panel.querySelector(".rp-partecipanti").value === "" ? null : Number(panel.querySelector(".rp-partecipanti").value),
        comitatiPresenti: panel.querySelector(".rp-comitati").value,
        ospitiPresenti: panel.querySelector(".rp-ospiti").value,
        risultato: panel.querySelector(".rp-risultato").value,
        problemi: panel.querySelector(".rp-problemi").value,
        nuoviContatti: panel.querySelector(".rp-contatti").value,
        attivitaSuccessive: panel.querySelector(".rp-successive").value,
        note: panel.querySelector(".rp-note").value
      };
      window.db.collection(COLLECTION).doc(id).set({ report }, { merge: true });
    });
  }

  // ---------------------------------------------------------------------
  // Scheda evento
  // ---------------------------------------------------------------------
  function statoClass(stato) { return "stato-" + (stato || "bozza").toLowerCase(); }

  function renderEventCard(id, ev) {
    const div = document.createElement("div");
    div.className = "card event-card";
    const stato = ev.stato || "BOZZA";
    const targetLabel = ev.target.type === "all" ? "Tutti i comitati"
      : ev.target.type === "city" ? `Comune: ${ev.target.value}`
      : `${(ev.target.value || []).length} comitati selezionati`;

    const panels = [
      { key: "checklist", label: "📋 Checklist", render: renderChecklist, wire: wireChecklist },
      { key: "budget", label: "💰 Budget", render: renderBudget, wire: wireBudget },
      { key: "coinvolti", label: "🧑‍🤝‍🧑 Comitati coinvolti", render: renderCoinvolti, wire: wireCoinvolti },
      { key: "report", label: "📝 Report evento", render: renderReport, wire: wireReport }
    ];

    div.innerHTML = `
      <div class="event-head">
        <h3>${ev.title}</h3>
        <span class="stato-badge ${statoClass(stato)}">${STATO_LABEL[stato] || stato}</span>
      </div>
      <div class="meta">${fmtDate(ev)}${luogoLabel(ev) ? " — " + luogoLabel(ev) : ""}${ev.tipologia ? " · " + ev.tipologia : ""}</div>
      <div><span class="target">${targetLabel}</span>${ev.responsabile ? `<span class="target">Resp: ${ev.responsabile}</span>` : ""}</div>
      ${ev.poster ? `<img class="event-poster" src="${ev.poster}" alt="Locandina evento" title="Clicca per ingrandire">` : ""}
      <p style="font-size:13px;">${(ev.description || "").replace(/</g, "&lt;")}</p>
      ${ev.lat != null && ev.lon != null ? `
      <div class="event-directions">
        <a class="btn small" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lon}">📍 Google Maps</a>
        <a class="btn small" target="_blank" href="https://maps.apple.com/?daddr=${ev.lat},${ev.lon}">📍 Apple Maps</a>
        <a class="btn small" target="_blank" href="https://waze.com/ul?ll=${ev.lat},${ev.lon}&navigate=yes">📍 Waze</a>
      </div>` : ""}
      <div class="event-stato-change">
        <label>Stato:</label>
        <select class="ev-stato-select">${STATI_EVENTO.map(s => `<option value="${s}" ${s === stato ? "selected" : ""}>${STATO_LABEL[s]}</option>`).join("")}</select>
      </div>
      ${panels.map(p => `
        <details class="event-panel" data-panel="${p.key}">
          <summary>${p.label}</summary>
          ${p.render(ev, id)}
        </details>
      `).join("")}
      <div class="detail actions">
        <button class="btn primary" data-action="notify">✉️ Invia notifica ai destinatari</button>
        <button class="btn" data-action="calendar">📅 Aggiungi al calendario</button>
        <button class="btn" data-action="delete">Elimina</button>
      </div>
    `;

    // Ripristina lo stato aperto/chiuso dei pannelli e lo memorizza al toggle.
    div.querySelectorAll(".event-panel").forEach(details => {
      const key = `${id}:${details.dataset.panel}`;
      if (openPanels.has(key)) details.open = true;
      details.addEventListener("toggle", () => {
        if (details.open) openPanels.add(key); else openPanels.delete(key);
      });
    });
    panels.forEach(p => p.wire(div, ev, id));

    div.querySelector(".ev-stato-select").addEventListener("change", (e) => {
      window.db.collection(COLLECTION).doc(id).set({ stato: e.target.value }, { merge: true });
    });

    if (ev.poster) {
      div.querySelector(".event-poster").addEventListener("click", () => openLightbox(ev.poster));
    }
    div.querySelector('[data-action="calendar"]').addEventListener("click", () => addToCalendar(ev, id));
    div.querySelector('[data-action="notify"]').addEventListener("click", () => {
      const recipients = targetContacts(ev.target);
      if (recipients.length === 0) { alert("Nessun destinatario per questo evento."); return; }
      const subject = `Evento: ${ev.title}`;
      const body = `${ev.title}\n${fmtDate(ev)}${luogoLabel(ev) ? "\nLuogo: " + luogoLabel(ev) : ""}\n\n${ev.description || ""}`
        + (ev.poster ? "\n\n(Locandina disponibile nella scheda evento, tab Eventi dell'app.)" : "");
      window.FN_EMAIL.open({
        title: `Notifica evento: ${ev.title}`,
        recipients,
        recipientsLabel: `A: ${recipients.length} comitati (${targetLabel})`,
        subject,
        body
      });
    });
    div.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (confirm("Eliminare questo evento?")) window.db.collection(COLLECTION).doc(id).delete();
    });
    return div;
  }

  function listenEvents() {
    const listEl = document.getElementById("events-list");
    window.db.collection(COLLECTION).orderBy("date", "asc").onSnapshot(snap => {
      allEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      listEl.innerHTML = "";
      if (snap.empty) { listEl.innerHTML = '<p class="detail empty">Nessun evento ancora.</p>'; }
      else snap.forEach(doc => listEl.appendChild(renderEventCard(doc.id, doc.data())));
      if (window.FN_DASHBOARD) window.FN_DASHBOARD.refresh();
      if (window.FN_CALENDARIO) window.FN_CALENDARIO.refresh();
    }, err => {
      listEl.innerHTML = `<div class="notice error">Errore lettura eventi: ${err.message}</div>`;
    });
  }

  function populateSelectOptions() {
    const tipoSel = document.getElementById("ev-tipologia");
    if (tipoSel && !tipoSel.dataset.filled) {
      TIPOLOGIE.forEach(t => { const o = document.createElement("option"); o.value = t; o.textContent = t; tipoSel.appendChild(o); });
      tipoSel.dataset.filled = "1";
    }
    const statoSel = document.getElementById("ev-stato-iniziale");
    if (statoSel && !statoSel.dataset.filled) {
      STATI_EVENTO.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = STATO_LABEL[s]; statoSel.appendChild(o); });
      statoSel.dataset.filled = "1";
    }
    const orgSel = document.getElementById("ev-organizzatore");
    if (orgSel) {
      const current = orgSel.value;
      orgSel.innerHTML = '<option value="">— nessuno specifico —</option>';
      window.FN_COMITATI.getAll().slice().sort((a, b) => a.city.localeCompare(b.city)).forEach(c => {
        const o = document.createElement("option");
        o.value = c.id; o.textContent = `${c.city} — ${c.ref || c.name}`;
        orgSel.appendChild(o);
      });
      if (current) orgSel.value = current;
    }
    // Il comune per il target "un comune specifico" dipende dai comitati
    // caricati: su Firestore arrivano in modo asincrono, quindi questa
    // funzione va richiamata a ogni aggiornamento dati (vedi onChange sotto),
    // non solo una volta al bootstrap.
    const citySelect = document.getElementById("ev-target-city");
    if (citySelect) {
      const current = citySelect.value;
      citySelect.innerHTML = "";
      [...new Set(window.FN_COMITATI.getAll().map(d => d.city))].sort().forEach(c => {
        const o = document.createElement("option"); o.value = c; o.textContent = c; citySelect.appendChild(o);
      });
      if (current) citySelect.value = current;
    }
  }

  function initForm() {
    const citySelect = document.getElementById("ev-target-city");
    document.getElementById("ev-target-type").addEventListener("change", (e) => {
      citySelect.style.display = e.target.value === "city" ? "block" : "none";
    });

    populateSelectOptions();
    window.FN_COMITATI.onChange(populateSelectOptions);

    let posterData = null;
    const posterInput = document.getElementById("ev-poster");
    const posterPreview = document.getElementById("ev-poster-preview");
    posterInput.addEventListener("change", async () => {
      const file = posterInput.files[0];
      posterPreview.style.display = "none";
      posterData = null;
      if (!file) return;
      posterData = await compressForFirestore(file);
      if (!posterData) {
        alert("Immagine troppo pesante anche dopo la compressione: prova un file più leggero o una risoluzione minore.");
        posterInput.value = "";
        return;
      }
      posterPreview.src = posterData;
      posterPreview.style.display = "block";
    });

    document.getElementById("event-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!window.FN_FIREBASE_READY) { alert("Firebase non configurato: vedi il messaggio in alto."); return; }
      const targetType = document.getElementById("ev-target-type").value;
      const target = targetType === "city"
        ? { type: "city", value: document.getElementById("ev-target-city").value }
        : targetType === "selection"
        ? { type: "selection", value: window.FN_RUBRICA.getSelectedContacts().map(d => d.id) }
        : { type: "all" };

      const numOrNull = v => v === "" ? null : Number(v);
      const ev = {
        title: document.getElementById("ev-title").value,
        tipologia: document.getElementById("ev-tipologia").value,
        date: document.getElementById("ev-date").value,
        oraFine: document.getElementById("ev-ora-fine").value || null,
        place: document.getElementById("ev-place").value,
        indirizzo: document.getElementById("ev-indirizzo").value,
        comune: document.getElementById("ev-comune").value,
        provincia: document.getElementById("ev-provincia").value || "Treviso",
        lat: evLat, lon: evLon,
        description: document.getElementById("ev-desc").value,
        responsabile: document.getElementById("ev-responsabile").value,
        comitatoOrganizzatore: document.getElementById("ev-organizzatore").value || null,
        budget: {
          previsto: numOrNull(document.getElementById("ev-budget-previsto").value),
          approvato: null, disponibile: null, speseEffettive: null, note: ""
        },
        ospiti: document.getElementById("ev-ospiti").value,
        partecipantiPrevisti: numOrNull(document.getElementById("ev-partecipanti-previsti").value),
        materiali: document.getElementById("ev-materiali").value,
        note: document.getElementById("ev-note").value,
        stato: document.getElementById("ev-stato-iniziale").value || "BOZZA",
        checklist: CHECKLIST_DEFAULT(),
        partecipazioni: [],
        report: null,
        poster: posterData || null,
        target,
        createdBy: window.FN_APP.whoami() || "anonimo",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      window.db.collection(COLLECTION).add(ev).then(() => {
        e.target.reset();
        posterData = null;
        posterPreview.style.display = "none";
        resetPicker();
      });
    });
  }

  window.FN_EVENTI = {
    init() {
      const notice = document.getElementById("eventi-fb-notice");
      initForm();
      if (fbNotice(notice)) {
        document.getElementById("event-form").querySelectorAll("input,textarea,select,button").forEach(el => el.disabled = true);
        return;
      }
      listenEvents();
    },
    // Chiamato da app.js quando il tab "Eventi" diventa visibile: la mini-mappa
    // non puo' inizializzarsi correttamente mentre e' nascosta (dimensioni 0x0).
    onShow() {
      try { initPickerMap(); } catch (e) { console.error("[FN] Errore mappa punto evento:", e); }
    },
    getAll() { return allEvents.slice(); },
    getForComitato(comitatoId) {
      const cid = String(comitatoId);
      return allEvents.filter(ev =>
        String(ev.comitatoOrganizzatore) === cid ||
        (ev.partecipazioni || []).some(p => String(p.comitatoId) === cid) ||
        (ev.target && ev.target.type === "selection" && (ev.target.value || []).map(String).includes(cid))
      );
    },
    STATI_EVENTO, STATO_LABEL, TIPOLOGIE
  };
})();
