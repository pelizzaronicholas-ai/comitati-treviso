// Mappa reale con basemap OpenStreetMap (Leaflet). Non possiede piu' i dati:
// li riceve da chi la usa (rubrica.js, che applica anche i filtri) tramite
// renderMarkers(data), cosi' mappa e lista restano sempre sincronizzate sullo
// stesso sottoinsieme filtrato di comitati.
(function () {
  let map = null;
  let activeId = null;
  let markers = {};

  function icon(active) {
    return L.divIcon({
      className: "",
      html: `<div class="fn-marker${active ? " active" : ""}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10]
    });
  }

  function render() {
    if (map) { map.invalidateSize(); return; } // gia' inizializzata

    map = L.map("map", { scrollWheelZoom: true, zoomControl: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Il container puo' avere dimensioni sbagliate se calcolate mentre il tab
    // non era ancora visibile: ricalcola dopo il primo render.
    setTimeout(() => map.invalidateSize(), 200);
  }

  // data: array di comitati (gia' filtrati da chi chiama) con lat/lon.
  function renderMarkers(data) {
    if (!map) return; // il tab Comitati non e' ancora stato mostrato
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};
    const withCoords = data.filter(d => d.lat != null && d.lon != null);
    withCoords.forEach(d => {
      const m = L.marker([d.lat, d.lon], { icon: icon(d.id === activeId) }).addTo(map);
      m.bindTooltip(`<b>${d.city}</b><br>${d.ref || "referente n.d."}`, { direction: "top", offset: [0, -10] });
      m.on("click", () => window.FN_APP.select(d.id));
      markers[d.id] = m;
    });
    if (withCoords.length) {
      const bounds = L.latLngBounds(withCoords.map(d => [d.lat, d.lon]));
      map.fitBounds(bounds.pad(0.18));
    }
  }

  function setActive(id) {
    if (activeId != null && markers[activeId]) markers[activeId].setIcon(icon(false));
    activeId = id;
    if (id != null && markers[id]) {
      markers[id].setIcon(icon(true));
      map.panTo(markers[id].getLatLng(), { animate: true });
      markers[id].openTooltip();
    }
  }

  window.FN_MAP = { render, renderMarkers, setActive };
})();
