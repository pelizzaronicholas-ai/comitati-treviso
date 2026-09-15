// Calendario generale: vista mensile a griglia + vista agenda (lista
// ordinata), con filtri. Scritto senza librerie esterne — coerente con le
// altre scelte del progetto — perche' per "capire cosa succede e dove" una
// griglia mensile piu' un elenco filtrato bastano, senza il costo di
// mantenere una vista oraria settimanale completa.
(function () {
  let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let viewMode = "mese";
  let filters = { provincia: "", comune: "", comitato: "", responsabile: "", stato: "", tipologia: "" };

  function eventsFiltered() {
    const all = (window.FN_EVENTI ? window.FN_EVENTI.getAll() : []).filter(e => e.date);
    return all.filter(e => {
      if (filters.provincia && e.provincia !== filters.provincia) return false;
      if (filters.comune && e.comune !== filters.comune) return false;
      if (filters.comitato && String(e.comitatoOrganizzatore || "") !== filters.comitato) return false;
      if (filters.responsabile && !(e.responsabile || "").toLowerCase().includes(filters.responsabile.toLowerCase())) return false;
      if (filters.stato && e.stato !== filters.stato) return false;
      if (filters.tipologia && e.tipologia !== filters.tipologia) return false;
      return true;
    });
  }

  function populateFilters() {
    const comitati = window.FN_COMITATI.getAll();
    const provSel = document.getElementById("cal-filter-provincia");
    const comuneSel = document.getElementById("cal-filter-comune");
    const comitatoSel = document.getElementById("cal-filter-comitato");
    const statoSel = document.getElementById("cal-filter-stato");
    const tipoSel = document.getElementById("cal-filter-tipologia");

    if (provSel && !provSel.dataset.filled) {
      window.FN_COMITATI.provinceInUse().forEach(p => provSel.appendChild(new Option(p, p)));
    }
    if (comuneSel) {
      const cur = comuneSel.value;
      comuneSel.innerHTML = '<option value="">Tutti i comuni</option>';
      [...new Set(comitati.map(d => d.city))].sort().forEach(c => comuneSel.appendChild(new Option(c, c)));
      comuneSel.value = cur;
    }
    if (comitatoSel) {
      const cur = comitatoSel.value;
      comitatoSel.innerHTML = '<option value="">Tutti i comitati organizzatori</option>';
      comitati.slice().sort((a, b) => a.city.localeCompare(b.city)).forEach(c => comitatoSel.appendChild(new Option(`${c.city} — ${c.ref || c.name}`, c.id)));
      comitatoSel.value = cur;
    }
    if (statoSel && !statoSel.dataset.filled && window.FN_EVENTI) {
      window.FN_EVENTI.STATI_EVENTO.forEach(s => statoSel.appendChild(new Option(window.FN_EVENTI.STATO_LABEL[s], s)));
      statoSel.dataset.filled = "1";
    }
    if (tipoSel && !tipoSel.dataset.filled && window.FN_EVENTI) {
      window.FN_EVENTI.TIPOLOGIE.forEach(t => tipoSel.appendChild(new Option(t, t)));
      tipoSel.dataset.filled = "1";
    }
  }

  function eventSummaryHtml(e) {
    const statoLabel = (window.FN_EVENTI && window.FN_EVENTI.STATO_LABEL[e.stato]) || e.stato || "Bozza";
    const luogo = [e.comune, e.provincia ? `(${e.provincia})` : ""].filter(Boolean).join(" ");
    return `<div class="cal-event-summary">
      <div class="cal-event-title">${e.title} <span class="stato-badge stato-${(e.stato || "bozza").toLowerCase()}">${statoLabel}</span></div>
      <div class="meta">${new Date(e.date).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}${luogo ? " — " + luogo : ""}${e.tipologia ? " · " + e.tipologia : ""}</div>
      ${e.responsabile ? `<div class="meta">Responsabile: ${e.responsabile}</div>` : ""}
    </div>`;
  }

  function renderMonthGrid() {
    const grid = document.getElementById("calendar-grid");
    const label = document.getElementById("calendar-month-label");
    if (!grid) return;
    label.textContent = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // lunedi' = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = {};
    eventsFiltered().forEach(e => {
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        (byDay[d.getDate()] = byDay[d.getDate()] || []).push(e);
      }
    });
    const today = new Date();
    let cells = "";
    for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const dayEvents = byDay[day] || [];
      cells += `<div class="cal-cell${isToday ? " today" : ""}" data-day="${day}">
        <div class="cal-daynum">${day}</div>
        <div class="cal-dots">${dayEvents.slice(0, 3).map(e => `<span class="cal-dot stato-${(e.stato || "bozza").toLowerCase()}" title="${e.title}"></span>`).join("")}${dayEvents.length > 3 ? `<span class="cal-more">+${dayEvents.length - 3}</span>` : ""}</div>
      </div>`;
    }
    grid.innerHTML = cells;
    grid.querySelectorAll(".cal-cell[data-day]").forEach(cell => {
      cell.addEventListener("click", () => {
        grid.querySelectorAll(".cal-cell").forEach(c => c.classList.remove("selected"));
        cell.classList.add("selected");
        renderDayDetail(byDay[Number(cell.dataset.day)] || []);
      });
    });
  }

  function renderDayDetail(events) {
    const el = document.getElementById("calendar-day-detail");
    if (!el) return;
    el.innerHTML = events.length ? events.map(eventSummaryHtml).join("") : '<p class="detail empty">Clicca un giorno con eventi per vederne i dettagli.</p>';
  }

  function renderAgenda() {
    const el = document.getElementById("calendar-agenda");
    if (!el) return;
    const events = eventsFiltered().sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!events.length) { el.innerHTML = '<p class="detail empty">Nessun evento corrisponde ai filtri.</p>'; return; }
    const groups = {};
    events.forEach(e => {
      const key = new Date(e.date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      (groups[key] = groups[key] || []).push(e);
    });
    el.innerHTML = Object.entries(groups).map(([day, evs]) => `
      <div class="agenda-day">
        <div class="agenda-day-label">${day}</div>
        ${evs.map(eventSummaryHtml).join("")}
      </div>`).join("");
  }

  function renderCurrentView() {
    populateFilters();
    document.getElementById("calendar-month-view").style.display = viewMode === "mese" ? "" : "none";
    document.getElementById("calendar-agenda-view").style.display = viewMode === "agenda" ? "" : "none";
    if (viewMode === "mese") { renderMonthGrid(); renderDayDetail([]); }
    else renderAgenda();
  }

  function wireControls() {
    document.getElementById("cal-view-mese").addEventListener("click", () => { viewMode = "mese"; setViewButtons(); renderCurrentView(); });
    document.getElementById("cal-view-agenda").addEventListener("click", () => { viewMode = "agenda"; setViewButtons(); renderCurrentView(); });
    document.getElementById("cal-prev").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCurrentView(); });
    document.getElementById("cal-next").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCurrentView(); });
    document.getElementById("cal-today").addEventListener("click", () => { currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCurrentView(); });

    ["provincia", "comune", "comitato", "responsabile", "stato", "tipologia"].forEach(key => {
      const el = document.getElementById("cal-filter-" + key);
      if (el) el.addEventListener(key === "responsabile" ? "input" : "change", (e) => { filters[key] = e.target.value; renderCurrentView(); });
    });
  }

  function setViewButtons() {
    document.getElementById("cal-view-mese").classList.toggle("active", viewMode === "mese");
    document.getElementById("cal-view-agenda").classList.toggle("active", viewMode === "agenda");
  }

  window.FN_CALENDARIO = {
    init() {
      wireControls();
      setViewButtons();
      window.FN_COMITATI.onChange(() => renderCurrentView());
      renderCurrentView();
    },
    refresh: renderCurrentView
  };
})();
