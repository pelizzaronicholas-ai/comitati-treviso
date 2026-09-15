# Comitati di TREVISO → Piattaforma di coordinamento — Analisi e roadmap

Data: 15/09/2026. Base di partenza: https://pelizzaronicholas-ai.github.io/comitati-treviso/

## A) Analisi dell'applicazione attuale

**Stack**: sito statico su GitHub Pages (HTML/CSS/JS vanilla, nessun framework, nessun build step). Mappa con Leaflet + tile OpenStreetMap. Persistenza degli eventi su Firebase Firestore (piano gratuito Spark, SDK compat via CDN). Email in uscita via EmailJS (mittente fisso comitatoroncade@gmail.com), con fallback su `mailto:` se EmailJS non è configurato.

**Dati**: i 27 comitati sono un array statico in `data.js` (`window.CONTACTS`), non modificabile da interfaccia — è un file JS che vive nel repository. Gli eventi invece sono documenti Firestore nella collection `eventi_treviso`, quindi già "vivi" (creabili, leggibili in tempo reale, cancellabili da chiunque abbia il link, senza vera autenticazione).

**Moduli JS**, ciascuno con responsabilità isolata e un pattern di init difensivo (`safe()` in `app.js`, cosi' se un modulo fallisce — es. mappa senza connessione — gli altri restano usabili):
- `map.js` — mappa Leaflet dei 27 comitati, marker cliccabili, sincronizzata con la selezione in rubrica.
- `rubrica.js` — elenco comitati raggruppato per comune, ricerca testuale, selezione multipla per azioni bulk.
- `eventi.js` — creazione/lettura eventi, locandina (immagine compressa e salvata come base64 nel documento Firestore, per restare sul piano gratuito senza Firebase Storage), punto geografico opzionale sulla mappa (Leaflet + geocoding Nominatim), link di navigazione (Google/Apple Maps, Waze), esportazione `.ics` per il calendario del telefono.
- `email-sender.js` + `emailjs-config.js` — finestra di composizione email condivisa, usata da tutti i punti che mandano email (scheda contatto, bulk rubrica, notifica evento).
- `app.js` — bootstrap, tab, scheda dettaglio contatto, "chi sono".

**Interfaccia**: due tab ("Mappa & Rubrica", "Eventi"), tema grigio/blu/giallo coerente col brand, responsive fino a 420px, PWA installabile su home screen (manifest + icone).

**Punto chiave per tutto quello che segue**: l'unica fonte dati davvero "viva" e modificabile da chi usa l'app è Firestore. `data.js` è un file di codice, non un database: per rendere i comitati modificabili da interfaccia (come richiesto) devono spostarsi anche loro su Firestore. Lo tratto in dettaglio al punto D.

## B) Funzionalità già presenti

- Mappa geografica reale con i 27 comitati, marker sincronizzati con la selezione.
- Rubrica con ricerca, raggruppamento per comune, selezione multipla.
- Scheda di dettaglio per singolo comitato (nome, comune, referente, email, telefono).
- Azioni di contatto: email (finestra di composizione, invio reale via EmailJS o fallback mailto), chiamata (`tel:`), WhatsApp (`wa.me`), sia singole che bulk.
- Creazione eventi con titolo, data/ora, luogo, descrizione, targeting destinatari (tutti / un comune / selezione manuale), locandina.
- Punto geografico opzionale sull'evento con ricerca indirizzo, link di navigazione verso 3 app di mappe, esportazione `.ics`.
- Notifica evento via email agli destinatari del target.
- Eliminazione evento.
- PWA installabile con icona corretta su home screen.
- Ottimizzazione mobile (breakpoint 720px/420px).

## C) Funzionalità da aggiungere (dalla tua richiesta)

- Dashboard con contatori (comitati totali/attivi, eventi programmati/imminenti/conclusi), mini calendario, ultimi eventi, notifiche derivate.
- Anagrafica comitati estesa (provincia, indirizzo/zona, secondo referente, stato attivo/inattivo/in costituzione, note) e **modificabile da interfaccia**.
- Filtri sulla mappa/rubrica per provincia, comune, stato.
- Schema evento esteso: tipologia, ora fine, comune/provincia, responsabile, comitato organizzatore, budget, ospiti, partecipanti previsti, materiali, stato con workflow a 6 valori.
- Individuazione automatica dei comitati vicini a un evento (per distanza, con soglie 10/25/50 km o tutta la provincia) e gestione degli invitati con stato di partecipazione e attività assegnata.
- Calendario generale (mensile + agenda) con filtri.
- Sezione budget per evento (previsto/approvato/disponibile/speso).
- Checklist operativa personalizzabile per evento.
- Report post-evento.
- Targeting comunicazioni esteso (comune, provincia, comitati vicini a un evento).
- Struttura territoriale gerarchica (nazionale→regione→provincia→comitato→evento) predisposta ma non popolata oltre Treviso.
- Concetto di ruoli (amministratore, coordinamento nazionale/regionale/provinciale, referente, collaboratore) come metadato, senza autenticazione reale.

## D) Problemi tecnici e decisioni che comportano un compromesso

1. **I comitati devono spostarsi su Firestore per essere modificabili.** Propongo una nuova collection `comitati_treviso`, con seed automatico e idempotente dei 27 comitati esistenti (stesso ID, stessi dati — **zero perdita o alterazione dati**) al primo avvio se la collection è vuota. `data.js` resta nel progetto come fallback: se Firebase non è configurato, l'app continua a mostrare i 27 comitati in sola lettura, esattamente come oggi. Nessun dato esistente viene toccato, solo spostato/duplicato nella fonte "viva".
2. **Nessuna vera autenticazione.** Come già oggi per gli eventi, chi ha il link dell'app può leggere/scrivere. Aggiungere ruoli "veri" (che impediscano azioni) richiede Firebase Authentication — è esplicitamente Fase 3 nella tua stessa roadmap, quindi per ora il campo "ruolo" è solo descrittivo.
3. **Calendario**: costruisco una vista mensile a griglia e una vista ad agenda (lista ordinata), scritte da zero in JS senza librerie esterne (coerente con "evita dipendenze inutili" — e con l'unico precedente di questo progetto, che ha sempre preferito codice proprio a librerie pesanti). Una vista "settimana" a griglia oraria è un lavoro via a sé; la copro con l'agenda filtrata per settimana, che dà la stessa informazione ("cosa succede e dove") con molto meno codice da mantenere. Se in futuro serve davvero la griglia oraria settimanale, è un'aggiunta successiva isolata.
4. **Notifiche in dashboard**: le implemento come lista *derivata* al volo dai dati esistenti (es. "3 eventi nei prossimi 7 giorni con checklist incompleta"), non come un nuovo sistema di notifiche persistenti — altrimenti serve un'altra collection, altre regole Firestore, e un modello di "letto/non letto" che oggi non ha nessun consumatore reale (niente login = non si sa "per chi" è letta una notifica).
5. **Regole Firestore**: con `comitati_treviso` scrivibile da chiunque abbia il link, vale lo stesso compromesso di sicurezza già accettato per gli eventi. Aggiungo regole minime (campi obbligatori, niente scritture anonime di spazzatura) coerenti con quelle già in uso.
6. **EmailJS**: resta con il limite di 200 email/mese del piano gratuito, invariato da quanto già configurato.
7. **Scala dei dati**: a 27 comitati e poche decine di eventi/anno, tengo i dati di partecipazione (comitati invitati a un evento, con stato e attività) **dentro il documento evento** come array, non in una collection separata — molto più semplice da leggere/scrivere e ben dentro il limite di 1 MB per documento di Firestore. Se in futuro il numero di comitati/eventi crescesse di ordini di grandezza (Fase 3, scala nazionale), quello è il punto naturale in cui normalizzare in collection separate.

## E) Proposta di struttura finale

**Tab dell'app** (da 2 a 5): Dashboard (nuova, iniziale) · Comitati (ex "Mappa & Rubrica", stessa UX + filtri/modifica) · Eventi (schema esteso + prossimità + checklist + budget + report) · Calendario (nuova) · le comunicazioni restano azioni contestuali (scheda comitato, rubrica, evento), non una tab a sé, com'è oggi.

**Dati — comitati** (Firestore `comitati_treviso`, seed da `data.js`): tutti i campi attuali (nome, comune, referente, email, telefono, coordinate) + `provincia`, `regione`, `indirizzo`, `ref2`, `stato` (attivo/inattivo/in_costituzione), `note`, `ruolo` (metadato, vedi D.2).

**Dati — eventi** (Firestore `eventi_treviso`, schema esteso in modo retrocompatibile: i campi vecchi restano, i nuovi hanno default sensati sui documenti già esistenti): titolo, tipologia, data+ora inizio, ora fine, luogo, indirizzo, comune, provincia, punto mappa (già esistente), descrizione, responsabile, comitato organizzatore, budget {previsto, approvato, disponibile, speseEffettive}, ospiti, partecipanti previsti, materiali, note, stato (BOZZA/IN_PROGRAMMAZIONE/CONFERMATO/IN_CORSO/CONCLUSO/ANNULLATO), checklist (array personalizzabile), partecipazioni (array {comitatoId, stato, attività} — i "comitati vicini" selezionati finiscono qui), report (compilabile quando l'evento è concluso).

**Gerarchia territoriale**: modellata oggi come campi piatti (`comune`, `provincia`, `regione`) su comitati ed eventi, non come alberi annidati — è la scelta più semplice che regge sia l'uso attuale (tutto Treviso) sia i filtri richiesti, ed è compatibile con una futura normalizzazione in collection `regioni`/`province` quando servirà davvero (Fase 3).

## F) Roadmap

**Fase 1 (questa sessione)**: dashboard, comitati su Firestore con anagrafica estesa/modificabile e filtri, evento con schema esteso e workflow di stato, comitati vicini con inviti, checklist, budget, report, calendario mensile+agenda, comunicazioni con targeting esteso. Tutto quello che è già live oggi resta funzionante e i dati esistenti non vengono toccati.

**Fase 2 (non in questa sessione, richiede altre decisioni)**: ruoli con permessi reali (serve Firebase Authentication → decisione tua su come i referenti fanno login), notifiche persistenti vere, statistiche aggregate nel tempo, gestione avanzata multi-provincia.

**Fase 3 (riscrittura architetturale, non incrementale)**: piattaforma multi-tenant nazionale/regionale/provinciale con account referenti, sincronizzazione, statistiche generali — a quel punto Firestore "piatto" con regole aperte non basta più, serve un vero backend con autorizzazioni per ruolo.

Procedo ora con la Fase 1.
