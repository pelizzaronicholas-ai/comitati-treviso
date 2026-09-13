// Mappa reale con basemap OpenStreetMap (Leaflet), non piu' una proiezione
// SVG "fatta in casa" su sfondo bianco: qui il territorio si vede per davvero,
// con zoom/pan nativi. I tile OSM li carica il browser di chi visita il sito
// (rete pubblica, nessun limite lato nostro).
(function () {
  const DATA = window.CONTACTS;
  let map = null;
  let activeId = null;
  const markers = {};

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

    DATA.forEach(d => {
      const m = L.marker([d.lat, d.lon], { icon: icon(false) }).addTo(map);
      m.bindTooltip(`<b>${d.city}</b><br>${d.ref || "referente n.d."}`, { direction: "top", offset: [0, -10] });
      m.on("click", () => window.FN_APP.select(d.id));
      markers[d.id] = m;
    });

    const bounds = L.latLngBounds(DATA.map(d => [d.lat, d.lon]));
    map.fitBounds(bounds.pad(0.18));

    // Il container puo' avere dimensioni sbagliate se calcolate mentre il tab
    // non era ancora visibile: ricalcola dopo il primo render.
    setTimeout(() => map.invalidateSize(), 200);
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

  window.FN_MAP = { render, setActive };
})();
