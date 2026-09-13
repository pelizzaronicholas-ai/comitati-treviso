// Modulo Eventi: creazione, targeting (tutti / un comune / selezione manuale
// dalla Rubrica), notifica via mailto generato sui destinatari del target.
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
      <div class="detail actions">
        <button class="btn primary" data-action="notify">✉️ Invia notifica ai destinatari</button>
        <button class="btn" data-action="delete">Elimina</button>
      </div>
    `;
    if (ev.poster) {
      div.querySelector(".event-poster").addEventListener("click", () => openLightbox(ev.poster));
    }
    div.querySelector('[data-action="notify"]').addEventListener("click", () => {
      const recipients = targetContacts(ev.target);
      if (recipients.length === 0) { alert("Nessun destinatario per questo evento."); return; }
      const bcc = recipients.map(d => d.email).join(",");
      const subject = `Evento: ${ev.title}`;
      const body = `${ev.title}\n${dt}${ev.place ? "\nLuogo: " + ev.place : ""}\n\n${ev.description || ""}`
        + (ev.poster ? "\n\n(Locandina disponibile nella scheda evento, tab Eventi dell'app.)" : "");
      window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    }
  };
})();
