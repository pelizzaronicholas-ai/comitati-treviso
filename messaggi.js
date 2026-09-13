// Bacheca/messaggistica interna semplice: nessuna autenticazione vera, solo
// un nome scelto ("Sei: ...") salvato in localStorage e usato come autore.
// Persistenza + realtime su Firestore (onSnapshot).
(function () {
  const COLLECTION = "messaggi_treviso";

  function fbNotice(container) {
    if (window.FN_FIREBASE_READY) { container.innerHTML = ""; return false; }
    container.innerHTML = `<div class="notice error">Firebase non configurato: compila <code>firebase-config.js</code> per abilitare la bacheca in tempo reale.</div>`;
    return true;
  }

  function renderMsg(data) {
    const div = document.createElement("div");
    const mine = data.author === window.FN_APP.whoami();
    div.className = "msg" + (mine ? " mine" : "");
    const time = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    div.innerHTML = `<div class="author">${data.author || "anonimo"} · ${time}</div>${(data.text || "").replace(/</g, "&lt;")}`;
    return div;
  }

  function listen() {
    const box = document.getElementById("chat-msgs");
    window.db.collection(COLLECTION).orderBy("createdAt", "asc").limitToLast(200).onSnapshot(snap => {
      box.innerHTML = "";
      snap.forEach(doc => box.appendChild(renderMsg(doc.data())));
      box.scrollTop = box.scrollHeight;
    }, err => {
      box.innerHTML = `<div class="notice error">Errore lettura messaggi: ${err.message}</div>`;
    });
  }

  function send() {
    const input = document.getElementById("chat-text");
    const text = input.value.trim();
    if (!text) return;
    if (!window.FN_APP.whoami()) { alert("Seleziona prima il tuo nome in alto a destra ('Sei: ...')."); return; }
    window.db.collection(COLLECTION).add({
      text,
      author: window.FN_APP.whoami(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => { input.value = ""; });
  }

  window.FN_MESSAGGI = {
    init() {
      const notice = document.getElementById("chat-fb-notice");
      document.getElementById("chat-send").addEventListener("click", send);
      document.getElementById("chat-text").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      if (fbNotice(notice)) {
        document.getElementById("chat-text").disabled = true;
        document.getElementById("chat-send").disabled = true;
        return;
      }
      listen();
    }
  };
})();
