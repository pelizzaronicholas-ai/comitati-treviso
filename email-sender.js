// Modulo condiviso per la composizione/invio email: un'unica finestra di
// composizione (oggetto + messaggio) usata da tutti i punti dell'app che
// mandano email (scheda contatto singolo, "Email ai selezionati" in Rubrica,
// notifica evento). Se EmailJS è configurato (vedi emailjs-config.js) l'invio
// parte davvero da comitatoroncade@gmail.com, un destinatario alla volta;
// altrimenti si ricade su mailto (mittente = client di chi clicca), cosi'
// l'app resta utilizzabile anche prima di collegare EmailJS.
(function () {
  const SEND_DELAY_MS = 350; // spaziatura tra un invio e l'altro, per non sforare i rate limit del piano gratuito EmailJS

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let currentRecipients = [];
  let sending = false;

  function els() {
    return {
      overlay: document.getElementById("email-modal"),
      title: document.getElementById("email-modal-title"),
      recipients: document.getElementById("email-modal-recipients"),
      subject: document.getElementById("email-modal-subject"),
      body: document.getElementById("email-modal-body"),
      status: document.getElementById("email-modal-status"),
      sendBtn: document.getElementById("email-modal-send"),
      cancelBtn: document.getElementById("email-modal-cancel")
    };
  }

  // opts: { title, recipients: [{email,...}], recipientsLabel, subject, body }
  function open(opts) {
    const recipients = (opts.recipients || []).filter(d => d && d.email);
    if (recipients.length === 0) { alert("Nessun destinatario con un indirizzo email valido."); return; }
    currentRecipients = recipients;
    const e = els();
    e.title.textContent = opts.title || "Invia email";
    e.recipients.textContent = opts.recipientsLabel || `A: ${recipients.length} destinatari`;
    e.subject.value = opts.subject || "";
    e.body.value = opts.body || "";
    e.status.textContent = "";
    e.sendBtn.disabled = false;
    e.overlay.style.display = "flex";
    (opts.subject ? e.body : e.subject).focus();
  }

  function close() {
    if (sending) return; // non si chiude a metà di un invio in corso
    els().overlay.style.display = "none";
  }

  async function sendCurrent() {
    const e = els();
    const subject = e.subject.value.trim();
    const body = e.body.value;
    if (!subject) { alert("Inserisci un oggetto."); return; }
    if (sending) return;

    if (!window.FN_EMAILJS_READY) {
      // Fallback: EmailJS non configurato ancora -> mailto (il mittente sarà
      // quello di default del dispositivo/client di chi clicca, non un
      // indirizzo fisso: limite del protocollo, non risolvibile lato codice).
      if (currentRecipients.length === 1) {
        window.location.href = `mailto:${encodeURIComponent(currentRecipients[0].email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      } else {
        const bcc = currentRecipients.map(d => d.email).join(",");
        window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
      close();
      return;
    }

    sending = true;
    e.sendBtn.disabled = true;
    let ok = 0;
    const failed = [];
    for (let i = 0; i < currentRecipients.length; i++) {
      const d = currentRecipients[i];
      e.status.textContent = `Invio in corso… ${i + 1}/${currentRecipients.length}`;
      try {
        await emailjs.send(window.EMAILJS_CONFIG.serviceId, window.EMAILJS_CONFIG.templateId, {
          to_email: d.email,
          subject,
          message: body
        });
        ok++;
      } catch (err) {
        failed.push(d.email);
        console.error("[FN] Invio email fallito per", d.email, err);
      }
      if (i < currentRecipients.length - 1) await sleep(SEND_DELAY_MS);
    }
    sending = false;
    e.sendBtn.disabled = false;
    if (failed.length === 0) {
      e.status.textContent = `✓ Inviata a tutti e ${ok} i destinatari.`;
      setTimeout(close, 1600);
    } else {
      e.status.textContent = `Inviata a ${ok}, fallita per: ${failed.join(", ")}. Riprova (i destinatari falliti spesso sono un errore temporaneo di rete).`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const e = els();
    e.sendBtn.addEventListener("click", sendCurrent);
    e.cancelBtn.addEventListener("click", close);
    e.overlay.addEventListener("click", (ev) => { if (ev.target === e.overlay) close(); });
  });

  window.FN_EMAIL = { open, close };
})();
