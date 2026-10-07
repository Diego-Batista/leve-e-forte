// Recebe o formulário da página /checklist e cadastra o contato na lista da Brevo.
// A chave fica só no servidor: configure BREVO_API_KEY nas variáveis de ambiente da Vercel.
// BREVO_LIST_ID é opcional (padrão: 3, a lista "Leve & Forte · Checklist").

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function phone(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? "+" + d : "";
}

async function createContact(key, payload) {
  return fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { nome, email, whatsapp, site, aceite } = body;

  // Campo invisível preenchido = robô. Responde como se tivesse dado certo.
  if (site) return res.status(200).json({ ok: true, saved: false });

  const mail = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(mail) || mail.length > 254) return res.status(400).json({ ok: false, error: "invalid_email" });
  if (aceite !== true) return res.status(400).json({ ok: false, error: "consent_required" });

  const key = process.env.BREVO_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: "not_configured" });

  const attributes = {};
  const name = String(nome || "").trim().slice(0, 80);
  if (name) attributes.NOME = name;
  const tel = phone(whatsapp);
  if (tel) attributes.WHATSAPP = tel;

  const listId = Number(process.env.BREVO_LIST_ID || 3);
  const payload = { email: mail, attributes, listIds: [listId], updateEnabled: true };

  try {
    let r = await createContact(key, payload);
    // WhatsApp inválido ou já usado por outro contato: salva sem ele.
    if (!r.ok && tel) {
      delete payload.attributes.WHATSAPP;
      r = await createContact(key, payload);
    }
    if (r.ok) return res.status(200).json({ ok: true, saved: true });
    console.error("Brevo", r.status, await r.text());
    return res.status(502).json({ ok: false, error: "brevo_error" });
  } catch (err) {
    console.error("Brevo", err);
    return res.status(502).json({ ok: false, error: "network_error" });
  }
};
