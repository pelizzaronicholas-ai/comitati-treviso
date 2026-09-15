// Comitati (ex "Rubrica"): elenco raggruppato per comune, ricerca, filtri
// (provincia/stato), selezione multipla per azioni bulk (email/WhatsApp),
// riga cliccabile per aprire la scheda dettaglio, modifica/creazione scheda
// comitato. I dati arrivano da comitati-data.js (Firestore o fallback
// statico): questo modulo non li possiede, li visualizza e li filtra.
(function () {
  const rowEls = {};
  const checkboxEls = {};
  const selected = new Set();
  let currentData = [];
  let filters = { q: "", provincia: "", stato: "" };

  const STATO_LABEL = { attivo: "Attivo", inattivo: "Inattivo", in_costituzione: "In costituzione" };

  function initials(d) {
    const src = (d.ref || d.city || "?").trim();
    const parts = src.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }

  function matchesFilter(d) {
    if (filters.provincia && d.provincia !== filters.provincia) return false;
    if (filters.stato && d.stato !== filters.stato) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(d.city.toLowerCase().includes(q) || (d.ref || "").toLowerCase().includes(q) || String(d.id).includes(q))) return false;
    }
    return true;
  }

  function visibleData() { return currentData.filter(matchesFilter); }

  function populateProvinciaFilter() {
    const sel = document.getElementById("filter-provincia");
    if (!sel) return;
    const current = sel.value;
    const province = window.FN_COMITATI.provinceInUse();
    sel.innerHTML = '<option value="">Tutte le province</option>' + province.map(p => `<option value="${p}">${p}</option>`).join("");
    if (province.includes(current)) sel.value = current;
  }

  function renderAll() {
    populateProvinciaFilter();
    const vis = visibleData();
    renderList(vis);
    if (window.FN_MAP) window.FN_MAP.renderMarkers(vis);
    updateCount();
  }

  function renderList(visData) {
    const listEl = document.getElementById("list");
    listEl.innerHTML = "";
    const byCity = window.FN_UTILS.groupByCity(visData);
    Object.entries(byCity).sort((a, b) => a[0].localeCompare(b[0])).forEach(([city, pts]) => {
      const g = document.createElement("div");
      g.className = "city-group";
      const cityCheck = document.createElement("input");
      cityCheck.type = "checkbox";
      cityCheck.title = `Seleziona tutti i comitati di ${city}`;
      cityCheck.addEventListener("change", () => {
        pts.forEach(d => setSelected(d.id, cityCheck.checked));
      });
      g.appendChild(cityCheck);
      const label = document.createElement("span");
      label.textContent = city + (pts.length > 1 ? ` (${pts.length})` : "");
      g.appendChild(label);
      listEl.appendChild(g);

      pts.forEach(d => {
        const row = document.createElement("div");
        row.className = "row";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(d.id);
        cb.addEventListener("click", (e) => e.stopPropagation());
        cb.addEventListener("change", () => setSelected(d.id, cb.checked));
        checkboxEls[d.id] = cb;

        const avatar = document.createElement("div");
        avatar.className = "row-avatar";
        avatar.textContent = initials(d);

        const info = document.createElement("span");
        info.className = "info";
        const statoDot = d.stato && d.stato !== "attivo" ? ` <span class="stato-dot ${d.stato}" title="${STATO_LABEL[d.stato] || d.stato}"></span>` : "";
        info.innerHTML = `${d.ref || "<i>referente n.d.</i>"}${statoDot}<br><span class="id">${d.id}</span>`;

        row.appendChild(cb);
        row.appendChild(avatar);
        row.appendChild(info);
        row.addEventListener("click", () => window.FN_APP.select(d.id));
        listEl.appendChild(row);
        rowEls[d.id] = row;
      });
    });
    if (visData.length === 0) {
      listEl.innerHTML = '<p class="detail empty" style="padding:14px 16px;">Nessun comitato corrisponde ai filtri.</p>';
    }
  }

  function setSelected(id, on) {
    if (on) selected.add(id); else selected.delete(id);
    if (checkboxEls[id]) checkboxEls[id].checked = on;
    updateCount();
  }

  function updateCount() {
    document.getElementById("sel-count").textContent = `${selected.size} selezionati`;
  }

  function getSelectedContacts() {
    return currentData.filter(d => selected.has(d.id));
  }

  // -----------------------------------------------------------------------
  // Modal di modifica/creazione comitato
  // -----------------------------------------------------------------------
  function openComitatoModal(existing) {
    const d = existing || { id: "", name: "", city: "", provincia: "Treviso", regione: "Veneto", indirizzo: "", ref: "", ref2: "", email: "", tel: "", stato: "attivo", note: "", lat: null, lon: null };
    document.getElementById("comitato-modal-title").textContent = existing ? `Modifica: ${d.city}` : "Nuovo comitato";
    document.getElementById("cm-name").value = d.name;
    document.getElementById("cm-city").value = d.city;
    document.getElementById("cm-provincia").value = d.provincia;
    document.getElementById("cm-indirizzo").value = d.indirizzo;
    document.getElementById("cm-ref").value = d.ref;
    document.getElementById("cm-ref2").value = d.ref2;
    document.getElementById("cm-tel").value = d.tel;
    document.getElementById("cm-email").value = d.email;
    document.getElementById("cm-stato").value = d.stato;
    document.getElementById("cm-lat").value = d.lat != null ? d.lat : "";
    document.getElementById("cm-lon").value = d.lon != null ? d.lon : "";
    document.getElementById("cm-note").value = d.note;
    document.getElementById("comitato-modal-status").textContent = "";
    document.getElementById("comitato-form").dataset.editingId = existing ? d.id : "";
    document.getElementById("comitato-modal").style.display = "flex";
    document.getElementById("cm-name").focus();
  }

  function closeComitatoModal() {
    document.getElementById("comitato-modal").style.display = "none";
  }

  function wireComitatoModal() {
    document.getElementById("comitato-modal-cancel").addEventListener("click", closeComitatoModal);
    document.getElementById("comitato-modal").addEventListener("click", (e) => {
      if (e.target.id === "comitato-modal") closeComitatoModal();
    });
    document.getElementById("comitato-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!window.FN_COMITATI.isEditable()) {
        document.getElementById("comitato-modal-status").textContent = "Firebase non configurato: non è possibile salvare modifiche ai comitati (vedi firebase-config.js).";
        return;
      }
      const editingId = e.target.dataset.editingId;
      const num = v => v === "" ? null : Number(v);
      const data = {
        name: document.getElementById("cm-name").value,
        city: document.getElementById("cm-city").value,
        provincia: document.getElementById("cm-provincia").value || "Treviso",
        indirizzo: document.getElementById("cm-indirizzo").value,
        ref: document.getElementById("cm-ref").value,
        ref2: document.getElementById("cm-ref2").value,
        tel: document.getElementById("cm-tel").value,
        email: document.getElementById("cm-email").value,
        stato: document.getElementById("cm-stato").value,
        lat: num(document.getElementById("cm-lat").value),
        lon: num(document.getElementById("cm-lon").value),
        note: document.getElementById("cm-note").value
      };
      const statusEl = document.getElementById("comitato-modal-status");
      statusEl.textContent = "Salvataggio…";
      const op = editingId ? window.FN_COMITATI.update(editingId, data) : window.FN_COMITATI.create(data);
      op.then(() => closeComitatoModal())
        .catch(err => { statusEl.textContent = "Errore: " + err.message; });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("search-box").addEventListener("input", (e) => { filters.q = e.target.value; renderAll(); });
    const filtProvincia = document.getElementById("filter-provincia");
    if (filtProvincia) filtProvincia.addEventListener("change", (e) => { filters.provincia = e.target.value; renderAll(); });
    const filtStato = document.getElementById("filter-stato");
    if (filtStato) filtStato.addEventListener("change", (e) => { filters.stato = e.target.value; renderAll(); });

    // "Seleziona tutti" rispetta i filtri correnti: e' anche cosi' che si
    // preparano le comunicazioni per "tutti i comitati di un comune/provincia"
    // (filtra, poi seleziona tutti, poi Email ai selezionati).
    document.getElementById("sel-all").addEventListener("click", () => { visibleData().forEach(d => selected.add(d.id)); renderAll(); });
    document.getElementById("sel-none").addEventListener("click", () => { selected.clear(); renderAll(); });

    document.getElementById("bulk-email").addEventListener("click", () => {
      const list = getSelectedContacts();
      if (list.length === 0) { alert("Seleziona almeno un comitato."); return; }
      window.FN_EMAIL.open({
        title: `Email a ${list.length} comitati selezionati`,
        recipients: list,
        recipientsLabel: `A: ${list.length} comitati selezionati`
      });
    });

    document.getElementById("bulk-wa").addEventListener("click", () => {
      const list = getSelectedContacts();
      if (list.length === 0) { alert("Seleziona almeno un comitato."); return; }
      if (list.length === 1) {
        window.open(window.FN_UTILS.waLink(list[0].tel), "_blank");
        return;
      }
      if (!confirm(`WhatsApp non permette un invio unico a più numeri: si aprirà una chat per ciascuno dei ${list.length} contatti selezionati, una dopo l'altra. Continuare?`)) return;
      list.forEach((d, i) => setTimeout(() => window.open(window.FN_UTILS.waLink(d.tel), "_blank"), i * 600));
    });

    const newBtn = document.getElementById("comitato-new");
    if (newBtn) newBtn.addEventListener("click", () => openComitatoModal(null));

    wireComitatoModal();

    window.FN_COMITATI.onChange(list => { currentData = list; renderAll(); });
  });

  window.FN_RUBRICA = {
    setActive(id) {
      Object.values(rowEls).forEach(r => r.classList.remove("active"));
      if (id != null && rowEls[id]) {
        rowEls[id].classList.add("active");
        rowEls[id].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    getSelectedContacts, setSelected, openComitatoModal,
    refreshMap() { if (window.FN_MAP) window.FN_MAP.renderMarkers(visibleData()); }
  };
})();
