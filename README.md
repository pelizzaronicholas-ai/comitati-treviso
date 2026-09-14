# Comitati di TREVISO

App interna per la rete dei comitati Futuro Nazionale della provincia di Treviso: mappa + rubrica, eventi.

## Struttura

```
index.html        shell dell'app, tab Mappa/Eventi, finestra di composizione email
style.css         tema grigio/blu/giallo
data.js           i 27 contatti (referente/comune/email/telefono/coordinate) — dati statici
firebase-config.js  configurazione Firebase — DA COMPILARE (vedi sotto)
emailjs-config.js   configurazione EmailJS — DA COMPILARE (vedi sotto), serve per il mittente fisso
email-sender.js     finestra di composizione email condivisa + invio via EmailJS (o fallback mailto)
map.js            mappa Leaflet con basemap OpenStreetMap
rubrica.js        elenco contatti, ricerca, selezione multipla, azioni bulk (email/WhatsApp)
eventi.js         creazione/lettura eventi su Firestore, notifica via email, locandine, geolocalizzazione
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

## 2. Collegare EmailJS (mittente fisso comitatoroncade@gmail.com)

`mailto:` non permette **mai** di scegliere il mittente: spedisce sempre dall'account di default del dispositivo/client di chi clicca, indipendentemente da cosa scrivi nel codice. Per far partire **tutte** le email dell'app (scrivi a un singolo comitato, email ai selezionati, notifica evento) sempre da `comitatoroncade@gmail.com`, serve un servizio che si autentica con quell'account: qui uso **EmailJS**, gratuito fino a 200 email/mese, senza backend da gestire (coerente con un'app statica su GitHub Pages).

1. Vai su https://www.emailjs.com/ e crea un account gratuito.
2. **Email Services** → **Add New Service** → **Gmail** → accedi con `comitatoroncade@gmail.com` (serve la password/2FA di quell'account: fallo da un dispositivo a cui hai accesso). Copia il **Service ID** (es. `service_xxxxxxx`).
3. **Email Templates** → **Create New Template**. Imposta:
   - **To Email** → `{{to_email}}`
   - **Subject** → `{{subject}}`
   - nel corpo del template scrivi pure quello che vuoi (intestazione, firma del comitato, ecc.), con `{{message}}` nel punto dove deve comparire il testo scritto nell'app.
   Copia il **Template ID** (es. `template_xxxxxxx`).
4. **Account** → **General** → copia la **Public Key**.
5. Incolla i tre valori in `emailjs-config.js` al posto dei placeholder.

**Finché non lo configuri**, l'app resta usabile: i pulsanti email aprono il client di posta di chi clicca (come prima), semplicemente senza garantire il mittente fisso — non c'è nulla da rompere provando prima Eventi/Rubrica senza EmailJS.

**Limite del piano gratuito**: 200 email/mese. Una notifica a tutti i 27 comitati consuma 27 email; con l'uso previsto (eventi + email occasionali) ci stai comodamente, ma se in un mese superi la soglia EmailJS blocca gli invii finché non passi a un loro piano a pagamento (da $7/mese in su — controlla i prezzi aggiornati sul loro sito).

## 3. Sostituire il logo

Metti il tuo file in `assets/` (es. `assets/logo-fn.png`) e cambia in `index.html`:

```html
<img class="logo" id="app-logo" src="assets/logo-fn.png" alt="Logo Futuro Nazionale">
```

## 4. Pubblicare su GitHub Pages

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

## Geolocalizzazione evento, indicazioni stradali e calendario

Nel form "Nuovo evento", sotto il campo "Luogo" (testo libero, resta com'era) c'è una mini-mappa cliccabile per indicare il punto esatto dell'evento:

- **Clic sulla mappa** o **trascinamento del segnaposto** per posizionarlo/spostarlo.
- **Ricerca indirizzo**: campo di testo + pulsante "Cerca" (o Invio), usa il geocoding gratuito di Nominatim/OpenStreetMap (nessuna chiave API, nessun costo). È un uso leggero e saltuario, coerente con la loro policy — se in futuro l'app crescesse molto andrebbe sostituito con un servizio di geocoding dedicato a pagamento.
- Il punto è **facoltativo**: un evento senza punto impostato resta valido, semplicemente non mostra i link di navigazione.
- "Rimuovi punto" azzera la selezione.

Se un evento ha un punto impostato, nella sua scheda compaiono tre link di navigazione ("📍 Google Maps", "📍 Apple Maps", "📍 Waze") che aprono l'app di navigazione con le coordinate come destinazione. Non esiste un unico link universale che funzioni bene su tutti i telefoni/browser, quindi offriamo tutti e tre.

Ogni evento ha anche un pulsante **"📅 Aggiungi al calendario"**: genera al volo un file `.ics` (standard iCalendar) nel browser, nessun server coinvolto. Su iPhone/Safari in genere si apre subito la schermata "Aggiungi a calendario"; su Android/desktop il file viene scaricato e va aperto con un tocco per importarlo. La durata dell'evento nel calendario è fissa a **2 ore** (l'app raccoglie solo l'orario di inizio, non quello di fine).

## Email con mittente fisso (comitatoroncade@gmail.com)

Ogni punto dell'app che manda email — "✉️ Scrivi email" sulla scheda di un singolo contatto, "✉️ Email ai selezionati" in Rubrica, "✉️ Invia notifica ai destinatari" su un evento — apre la stessa finestra di composizione (oggetto + messaggio, precompilata quando ha senso, es. la notifica evento). Da lì:

- **Se EmailJS è configurato** (vedi sezione 2 sopra): l'invio parte davvero, un destinatario alla volta, sempre da `comitatoroncade@gmail.com` — nessun client di posta si apre, vedi lo stato di invio direttamente nella finestra ("Invio in corso… 3/12").
- **Se EmailJS non è ancora configurato**: l'app ricade su `mailto:` (mittente = client di default di chi clicca), cosi' resta utilizzabile anche prima di completare il collegamento.

Non c'è modo di "annullare" un invio già partito: EmailJS manda subito, non c'è una coda o una bozza revisionabile dopo aver premuto Invia.

## Limiti noti (letti prima di usarla in produzione)

- **Invio email**: senza EmailJS configurato, il mittente resta quello di default del dispositivo/client di chi clicca (limite del protocollo `mailto:`, non risolvibile lato codice). Con EmailJS configurato il mittente è fisso ma il piano gratuito ha un tetto di 200 email/mese (vedi sezione 2).
- **WhatsApp bulk**: non esiste un link che apra una chat verso più numeri insieme. Selezionandone più di uno, l'app apre una finestra WhatsApp per contatto, in sequenza — le devi confermare/inviare tu una per una.
- **Messenger/messaggistica interna**: non presente — rimossa perché senza un vero sistema di login non si poteva garantire che solo l'autore di un messaggio potesse cancellarlo. Per parlare con i referenti restano email, telefono e WhatsApp dalla scheda contatto.
- **Chiamate**: link `tel:`, apre il dialer del dispositivo. Non è una chiamata VOIP nel browser.
- **Sicurezza**: nessun vero login. Chiunque abbia l'URL dell'app (e sappia leggere il codice sorgente) può leggere/scrivere su Eventi, e — se conosce la Public Key EmailJS, visibile nel codice sorgente lato client come per qualunque app statica — potrebbe in teoria usare lo stesso servizio EmailJS per mandare email dal tuo account. È un rischio residuo intrinseco a qualunque invio email fatto direttamente dal browser senza un vero backend: adeguato per un gruppo interno fidato e un URL non pubblicizzato, non per un pubblico ampio.
