// Modulo Eventi: creazione, targeting (tutti / un comune / selezione manuale
// dalla Rubrica), notifica via email (finestra di composizione condivisa,
// vedi email-sender.js) ai destinatari del target.
// Persistenza su Firestore -> visibile in tempo reale a chiunque apra l'app.
(function () {
  const COLLECTION = "eventi_treviso";

  function fbNotice(container) {
    if (window.FN_FIREBASE_READY) { container.innerHTML = ""; return false; }
    container.innerHTML = `<div class="notice error">Firebase non configurato: compila <code>firebase-config.js</code> con le chiavi del tuo progetto per creare e vedere gli eventi. La bacheca funziona a livello di codice, manca solo la connessione al tuo progetto Firebase.</div>`;
    return true;
  }

  // Le locandine non vanno su Firebase Storage (su Spark serve comunque
  // agganciare una carta per il piano Blaze): le comprimiamo lato browser e
  // le salviamo come stringa base64 dentro al documento evento, restando
  // ben sotto il limite di 1MB per documento di Firestore.
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
  // Uso leggero (poche ricerche saltuarie) coerente con la loro policy d'uso;
  // se in futuro l'app crescesse molto andrebbe sostituito con un servizio
  // di geocoding dedicato.
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
  // Aggiungi al calendario del telefono: generiamo un file .ics al volo
  // nel browser (nessun server coinvolto). Su iPhone/Safari in genere apre
  // subito la schermata "Aggiungi a calendario"; su Android/desktop scarica
  // il file .ics, che poi si apre con un tap per importarlo.
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
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // durata fissa 2h, non abbiamo un orario di fine
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Comitati di TREVISO//IT", "BEGIN:VEVENT",
      "UID:fn-evento-" + id + "@comitati-treviso",
      "DTSTAMP:" + toICSDate(new Date()),
      "DTSTART:" + toICSDate(start),
      "DTEND:" + toICSDate(end),
      "SUMMARY:" + icsEscape(ev.title)
    ];
    if (ev.place) lines.push("LOCATION:" + icsEscape(ev.place));
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

  function targetContacts(target) {
    const DATA = window.CONTACTS;
    if (target.type === "all") return DATA;
    if (target.type === "city") return DATA.filter(d => d.city === target.value);
    if (target.type === "selection") return DATA.filter(d => (target.value || []).includes(d.id));
    return [];
  }

  function renderEventCard(id, ev) {
    const div = document.createElement("div");
    div.className = "card event-card";
    const dt = ev.date ? new Date(ev.date).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }) : "";
    const targetLabel = ev.target.type === "all" ? "Tutti i comitati"
      : ev.target.type === "city" ? `Comune: ${ev.target.value}`
      : `${(ev.target.value || []).length} comitati selezionati`;
    div.innerHTML = `
      <h3>${ev.title}</h3>
      <div class="meta">${dt}${ev.place ? " — " + ev.place : ""}</div>
      <div><span class="target">${targetLabel}</span></div>
      ${ev.poster ? `<img class="event-poster" src="${ev.poster}" alt="Locandina evento" title="Clicca per ingrandire">` : ""}
      <p style="font-size:13px;">${(ev.description || "").replace(/</g, "&lt;")}</p>
      ${ev.lat != null && ev.lon != null ? `
      <div class="event-directions">
        <a class="btn small" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lon}">📍 Google Maps</a>
        <a class="btn small" target="_blank" href="https://maps.apple.com/?daddr=${ev.lat},${ev.lon}">📍 Apple Maps</a>
        <a class="btn small" target="_blank" href="https://waze.com/ul?ll=${ev.lat},${ev.lon}&navigate=yes">📍 Waze</a>
      </div>` : ""}
      <div class="detail actions">
        <button class="btn primary" data-action="notify">✉️ Invia notifica ai destinatari</button>
        <button class="btn" data-action="calendar">📅 Aggiungi al calendario</button>
        <button class="btn" data-action="delete">Elimina</button>
      </div>
    `;
    if (ev.poster) {
      div.querySelector(".event-poster").addEventListener("click", () => openLightbox(ev.poster));
    }
    div.querySelector('[data-action="calendar"]').addEventListener("click", () => addToCalendar(ev, id));
    div.querySelector('[data-action="notify"]').addEventListener("click", () => {
      const recipients = targetContacts(ev.target);
      if (recipients.length === 0) { alert("Nessun destinatario per questo evento."); return; }
      const subject = `Evento: ${ev.title}`;
      const body = `${ev.title}\n${dt}${ev.place ? "\nLuogo: " + ev.place : ""}\n\n${ev.description || ""}`
        + (ev.poster ? "\n\n(Locandina disponibile nella scheda evento, tab Eventi dell'app.)" : "");
      // Oggetto/testo sono già pronti (generati dai dati evento) ma restano
      // modificabili prima dell'invio. Se EmailJS è configurato (vedi
      // emailjs-config.js) parte sempre da comitatoroncade@gmail.com.
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
      listEl.innerHTML = "";
      if (snap.empty) { listEl.innerHTML = '<p class="detail empty">Nessun evento ancora.</p>'; return; }
      snap.forEach(doc => listEl.appendChild(renderEventCard(doc.id, doc.data())));
    }, err => {
      listEl.innerHTML = `<div class="notice error">Errore lettura eventi: ${err.message}</div>`;
    });
  }

  function initForm() {
    const cityByName = [...new Set(window.CONTACTS.map(d => d.city))].sort();
    const citySelect = document.getElementById("ev-target-city");
    cityByName.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      citySelect.appendChild(opt);
    });
    document.getElementById("ev-target-type").addEventListener("change", (e) => {
      citySelect.style.display = e.target.value === "city" ? "block" : "none";
    });

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

      const ev = {
        title: document.getElementById("ev-title").value,
        date: document.getElementById("ev-date").value,
        place: document.getElementById("ev-place").value,
        lat: evLat, lon: evLon,
        description: document.getElementById("ev-desc").value,
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
    }
  };
})();
