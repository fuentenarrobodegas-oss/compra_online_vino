// Edge Function: stripe-webhook
// Stripe la llama cuando un pago se completa. Marca el pedido como "pagado"
// y (opcional) te envía un correo con los datos de envío.
//
// Despliegue:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secretos:    supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Opcional:    supabase secrets set RESEND_API_KEY=re_... AVISO_EMAIL=bodegas@fuentenarro.com AVISO_FROM="Tienda Fuentenarro <onboarding@resend.dev>"

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const eur = (cent: number) => (cent / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function avisarPorCorreo(p: Record<string, any>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const para = Deno.env.get("AVISO_EMAIL");
  if (!apiKey || !para) return;

  const lineas = (p.items as any[]).map((i) => `<li>${i.cantidad} × ${esc(i.nombre)}</li>`).join("");
  const html = `
    <h2 style="font-family:Georgia,serif;color:#6b1e2e">Nuevo pedido nº ${p.numero} · ${eur(p.total_cent)}</h2>
    <p><strong>${p.botellas} botellas</strong></p>
    <ul>${lineas}</ul>
    <h3>Enviar a</h3>
    <p>${esc(p.nombre)}<br>${esc(p.direccion)}<br>${esc(p.cp)} ${esc(p.ciudad)} (${esc(p.provincia)})<br>
       Tel: ${esc(p.telefono)}<br>Email: ${esc(p.email)}</p>
    ${p.notas ? `<p><strong>Notas:</strong> ${esc(p.notas)}</p>` : ""}`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AVISO_FROM") ?? "Tienda Fuentenarro <onboarding@resend.dev>",
      to: [para],
      reply_to: p.email,
      subject: `🍷 Pedido nº ${p.numero} · ${p.botellas} botellas · ${eur(p.total_cent)}`,
      html,
    }),
  });
  if (!r.ok) console.error("Resend:", r.status, await r.text());
}

Deno.serve(async (req) => {
  const firma = req.headers.get("stripe-signature");
  const cuerpo = await req.text();

  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(
      cuerpo,
      firma!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    console.error("Firma no válida:", e);
    return new Response("Firma no válida", { status: 400 });
  }

  const s = evento.data.object as Stripe.Checkout.Session;
  const pedidoId = s?.metadata?.pedido_id;

  if (pedidoId) {
    if (
      (evento.type === "checkout.session.completed" && s.payment_status === "paid") ||
      evento.type === "checkout.session.async_payment_succeeded"
    ) {
      // Solo pasa a "pagado" si seguía pendiente (Stripe puede reenviar el mismo evento)
      const { data } = await supabase
        .from("pedidos")
        .update({ estado: "pagado", pagado_at: new Date().toISOString() })
        .eq("id", pedidoId)
        .eq("estado", "pendiente_pago")
        .select("*")
        .maybeSingle();
      if (data) await avisarPorCorreo(data);
    }

    if (evento.type === "checkout.session.expired" || evento.type === "checkout.session.async_payment_failed") {
      await supabase.from("pedidos").update({ estado: "cancelado" }).eq("id", pedidoId).eq("estado", "pendiente_pago");
    }
  }

  return new Response(JSON.stringify({ recibido: true }), { headers: { "Content-Type": "application/json" } });
});
