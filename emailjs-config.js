// ============================================================================
// CONFIGURAZIONE EMAILJS — DA COMPILARE
// ============================================================================
// mailto: non permette MAI di scegliere il mittente: è sempre l'account di
// default del dispositivo/client di chi clicca a spedire. Per far partire
// TUTTE le email dell'app (scrivi a un singolo comitato, email ai selezionati,
// notifica evento) sempre da comitatoroncade@gmail.com serve un servizio che
// si autentica con quell'account. Qui usiamo EmailJS: gratuito, nessun
// backend/server da gestire, coerente con un'app statica su GitHub Pages.
//
// 1. Vai su https://www.emailjs.com/ e crea un account gratuito.
// 2. "Email Services" -> "Add New Service" -> Gmail -> accedi con
//    comitatoroncade@gmail.com (serve la password/2FA di quell'account: fallo
//    da un dispositivo a cui hai accesso). Copia il "Service ID" (es. service_xxxxxxx).
// 3. "Email Templates" -> "Create New Template". Imposta:
//      - "To Email"  -> {{to_email}}
//      - "Subject"   -> {{subject}}
//      - nel corpo del template scrivi pure quello che vuoi, con {{message}}
//        dove deve comparire il testo scritto nell'app.
//    Copia il "Template ID" (es. template_xxxxxxx).
// 4. "Account" -> "General" -> copia la "Public Key".
// 5. Incolla i tre valori qui sotto.
//
// Piano gratuito EmailJS: 200 email/mese. Un invio a tutti i 27 comitati
// consuma 27 email; con l'uso previsto (eventi + email occasionali) ci stai
// comodamente, ma se in un mese superi la soglia EmailJS blocca gli invii
// finché non passi a un loro piano a pagamento (da $7/mese in su — controlla
// i prezzi aggiornati sul loro sito).
//
// Finché non compili questa configurazione, l'app resta usabile: i pulsanti
// email aprono il client di posta di chi clicca (comportamento precedente),
// semplicemente senza garantire il mittente fisso.
// ============================================================================

window.EMAILJS_CONFIG = {
  publicKey: "INCOLLA_LA_TUA_PUBLIC_KEY",
  serviceId: "INCOLLA_IL_TUO_SERVICE_ID",
  templateId: "INCOLLA_IL_TUO_TEMPLATE_ID"
};

window.FN_EMAILJS_READY = false;
try {
  if (window.EMAILJS_CONFIG.publicKey && !window.EMAILJS_CONFIG.publicKey.startsWith("INCOLLA") && window.emailjs) {
    emailjs.init({ publicKey: window.EMAILJS_CONFIG.publicKey });
    window.FN_EMAILJS_READY = true;
  } else {
    console.warn("[FN] EmailJS non configurato: compila emailjs-config.js per avere un mittente fisso (comitatoroncade@gmail.com). Finché non lo fai, le email usano il client di posta del dispositivo (mailto).");
  }
} catch (e) {
  console.error("[FN] Errore inizializzazione EmailJS:", e);
}
