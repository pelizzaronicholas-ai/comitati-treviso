// Rubrica: elenco raggruppato per comune, ricerca, selezione multipla per
// azioni bulk (email/WhatsApp), riga cliccabile per aprire la scheda dettaglio.
(function () {
  const DATA = window.CONTACTS;
  const rowEls = {};
  const checkboxEls = {};
  const selected = new Set();

  function matchesFilter(d, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return d.city.toLowerCase().includes(q) || (d.ref || "").toLowerCase().includes(q) || String(d.id).includes(q);
  }

  function initials(d) {
    const src = (d.ref || d.city || "?").trim();
    const parts = src.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }

  function render(filterText) {
    const listEl = document.getElementById("list");
    listEl.innerHTML = "";
    const byCity = window.FN_UTILS.groupByCity(DATA);
    Object.entries(byCity).sort((a, b) => a[0].localeCompare(b[0])).forEach(([city, pts]) => {
      const visiblePts = pts.filter(d => matchesFilter(d, filterText));
      if (visiblePts.length === 0) return;

      const g = document.createElement("div");
      g.className = "city-group";
      const cityCheck = document.createElement("input");
      cityCheck.type = "checkbox";
      cityCheck.title = `Seleziona tutti i comitati di ${city}`;
      cityCheck.addEventListener("change", () => {
        visiblePts.forEach(d => setSelected(d.id, cityCheck.checked));
      });
      g.appendChild(cityCheck);
      const label = document.createElement("span");
      label.textContent = city + (pts.length > 1 ? ` (${pts.length})` : "");
      g.appendChild(label);
      listEl.appendChild(g);

      visiblePts.forEach(d => {
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
        info.innerHTML = `${d.ref || "<i>referente n.d.</i>"}<br><span class="id">${d.id}</span>`;

        row.appendChild(cb);
        row.appendChild(avatar);
        row.appendChild(info);
        row.addEventListener("click", () => window.FN_APP.select(d.id));
        listEl.appendChild(row);
        rowEls[d.id] = row;
      });
    });
    updateCount();
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
    return DATA.filter(d => selected.has(d.id));
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("search-box").addEventListener("input", (e) => render(e.target.value));
    document.getElementById("sel-all").addEventListener("click", () => { DATA.forEach(d => selected.add(d.id)); render(document.getElementById("search-box").value); });
    document.getElementById("sel-none").addEventListener("click", () => { selected.clear(); render(document.getElementById("search-box").value); });

    document.getElementById("bulk-email").addEventListener("click", () => {
      const list = getSelectedContacts();
      if (list.length === 0) { alert("Seleziona almeno un comitato."); return; }
      // Passa dalla finestra di composizione condivisa: se EmailJS è configurato
      // (vedi emailjs-config.js) parte sempre da comitatoroncade@gmail.com,
      // un destinatario alla volta.
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
      // WhatsApp non supporta un vero invio massivo via link: apriamo una
      // finestra per contatto, una alla volta, con piccolo ritardo.
      if (!confirm(`WhatsApp non permette un invio unico a più numeri: si aprirà una chat per ciascuno dei ${list.length} contatti selezionati, una dopo l'altra. Continuare?`)) return;
      list.forEach((d, i) => setTimeout(() => window.open(window.FN_UTILS.waLink(d.tel), "_blank"), i * 600));
    });
  });

  window.FN_RUBRICA = { render, rowEls, setActive(id) {
    Object.values(rowEls).forEach(r => r.classList.remove("active"));
    if (id != null && rowEls[id]) {
      rowEls[id].classList.add("active");
      rowEls[id].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, getSelectedContacts, setSelected };
})();
