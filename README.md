# Comitati di TREVISO

App interna per la rete dei comitati Futuro Nazionale della provincia di Treviso: mappa + rubrica, eventi.

## Struttura

```
index.html        shell dell'app, tab Mappa/Eventi
style.css         tema grigio/blu/giallo
data.js           i 27 contatti (referente/comune/email/telefono/coordinate) — dati statici
firebase-config.js  configurazione Firebase — DA COMPILARE (vedi sotto)
map.js            mappa Leaflet con basemap OpenStreetMap
rubrica.js        elenco contatti, ricerca, selezione multipla, azioni bulk (email/WhatsApp)
eventi.js         creazione/lettura eventi su Firestore, notifica via mailto, locandine
app.js            bootstrap, tabs, scheda dettaglio, "chi sei"
assets/logo-placeholder.svg  logo temporaneo, sostituiscilo con quello ufficiale
```

## 1. Collegare Firebase (necessario per Eventi)

Mappa e Rubrica funzionano subito, dati statici in `data.js`. Eventi richiede un progetto Firebase (piano gratuito Spark, sufficiente per questo uso):

1. Vai su https://console.firebase.google.com/ → crea un progetto.
2. Nel progetto: icona **Web (`</>`)** → registra l'app (basta un nome, es. `comitati-tv`). **Non serve** attivare Firebase Hosting: ospitiamo su GitHub Pages.
3. Copia l'oggetto `firebaseConfig` mostrato e incollalo in `firebase-config.js` al posto dei placeholder.
4. Nel menu laterale → **Firestore Database** → **Crea database** → regione europea (es. `eur3`) → modalità produzione.
5. Vai su **Regole** e incolla quelle qui sotto, poi **Pubblica**.

### Regole Firestore (baseline)

Il tool non ha login: chiunque abbia il link dell'app può leggere/scrivere eventi. Va bene per un gruppo ristretto e un URL non pubblicizzato, ma **non è un sistema con permessi reali**. Regole minime per evitare abusi grossolani (limite dimensione testo, campi obbligatori):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /eventi_treviso/{doc} {
      allow read: if true;
      allow create: if request.resource.data.title is string
                    && request.resource.data.title.size() < 200;
      allow delete: if true;
      allow update: if false;
    }
  }
}
```

Se avevi già pubblicato la regola `messaggi_treviso` (bacheca, ora rimossa dall'app), puoi lasciarla così com'è in Firestore — non fa danni, semplicemente nessuna parte dell'app ci scrive più — oppure toglierla dall'editor delle Regole per pulizia.

Se in futuro vuoi permessi veri (solo i referenti possono scrivere, un admin può eliminare tutto), il prossimo passo è attivare **Firebase Authentication** (es. accesso con email/password o Google) e condizionare le regole su `request.auth != null`. Non l'ho aggiunto ora per restare semplice: dimmelo se vuoi che lo integri.

## 2. Sostituire il logo

Metti il tuo file in `assets/` (es. `assets/logo-fn.png`) e cambia in `index.html`:

```html
<img class="logo" id="app-logo" src="assets/logo-fn.png" alt="Logo Futuro Nazionale">
```

## 3. Pubblicare su GitHub Pages

```bash
git init
git add .
git commit -m "Prima versione app Comitati di TREVISO"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/<tuo-repo>.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**. L'app sarà su `https://<tuo-utente>.github.io/<tuo-repo>/`.

## Nota sulla mappa (Leaflet + OpenStreetMap)

La mappa ora è una vera mappa geografica (libreria Leaflet, tile OpenStreetMap), non più un disegno SVG su sfondo bianco. I tile li scarica il browser di chi visita il sito, quindi serve una connessione internet normale — non ci sono limiti lato nostro. In anteprima locale senza internet la mappa resta grigia: è normale, online funziona.

## Locandine eventi

Nel form "Nuovo evento" puoi allegare un'immagine (JPG/PNG). Viene compressa nel browser e salvata come base64 dentro al documento Firestore (niente Firebase Storage: su Spark richiederebbe comunque il piano a consumo Blaze). Se il file è troppo pesante anche dopo la compressione automatica, l'app te lo segnala: usa un'immagine più leggera o a risoluzione minore.

## Limiti noti (letti prima di usarla in produzione)

- **Email bulk**: il bottone "Email ai selezionati" apre il client di posta con i destinatari in BCC — l'invio lo confermi tu, non è automatico, e **il mittente è quello di default sul dispositivo/client di chi clicca**, non un indirizzo fisso: `mailto:` non permette di specificare un mittente (limite del protocollo, non dell'app). Per garantire che le email partano sempre da un indirizzo fisso (es. comitatoroncade@gmail.com) serve invio automatico lato server con un servizio come EmailJS o la Gmail API — vedi discussione con Nicholas.
- **WhatsApp bulk**: non esiste un link che apra una chat verso più numeri insieme. Selezionandone più di uno, l'app apre una finestra WhatsApp per contatto, in sequenza — le devi confermare/inviare tu una per una.
- **Messenger/messaggistica interna**: non presente — rimossa perché senza un vero sistema di login non si poteva garantire che solo l'autore di un messaggio potesse cancellarlo. Per parlare con i referenti restano email, telefono e WhatsApp dalla scheda contatto.
- **Chiamate**: link `tel:`, apre il dialer del dispositivo. Non è una chiamata VOIP nel browser.
- **Sicurezza**: nessun vero login. Chiunque abbia l'URL dell'app (e sappia leggere il codice sorgente) può leggere/scrivere su Eventi. Adeguato per un gruppo interno fidato, non per un pubblico ampio.
