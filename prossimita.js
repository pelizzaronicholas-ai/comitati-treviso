// Calcolo distanze tra punti geografici (formula haversine) e ordinamento dei
// comitati per vicinanza a un punto. Modulo puro, nessuna dipendenza dal DOM:
// lo usano eventi.js (comitati vicini a un evento) e, in futuro, qualunque
// altra funzione che debba ragionare per prossimita' territoriale.
(function () {
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // raggio medio della Terra in km
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Ritorna i comitati con coordinate note, ordinati per distanza crescente
  // da (lat, lon), ciascuno con la proprieta' aggiuntiva distanceKm.
  function nearestTo(lat, lon, comitati) {
    return comitati
      .filter(d => d.lat != null && d.lon != null)
      .map(d => ({ ...d, distanceKm: haversineKm(lat, lon, d.lat, d.lon) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  window.FN_PROSSIMITA = { haversineKm, nearestTo };
})();
