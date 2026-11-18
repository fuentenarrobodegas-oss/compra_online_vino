# Tienda Fuentenarro · Puesta en marcha

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La tienda (sustituye al actual en GitHub). Mantén `4_meses_barrica.jpg` al lado. |
| `admin.html` | Tu panel de pedidos: ves dirección, teléfono, productos y marcas "enviado". |
| `supabase/schema.sql` | Crea las tablas `perfiles` y `pedidos` con sus permisos. |
| `supabase/functions/crear-checkout/` | Guarda el pedido y abre Stripe con el total real de la cesta. |
| `supabase/functions/stripe-webhook/` | Stripe avisa cuando se paga → el pedido pasa a "pagado" y te llega un correo. |

## Cómo funciona ahora

1. El cliente añade botellas y/o cajas de 6 en las cantidades que quiera (se suman en la cesta).
2. En "Finalizar pedido" rellena nombre, teléfono y dirección **en tu web** (si tiene cuenta, se rellena solo).
3. La Edge Function recalcula el precio con su propio catálogo, guarda el pedido y crea un pago en Stripe con todas las líneas.
4. En Stripe el cliente solo pone la tarjeta.
5. Al pagar, el webhook marca el pedido como pagado y te envía un correo. Lo gestionas en `admin.html`.

Los Payment Links (`buy.stripe.com/...`) ya no se usan: tienen precio fijo y por eso no se sumaba la cesta.

## Pasos

### 1. Base de datos
Supabase → **SQL Editor** → pega `supabase/schema.sql` → **Run**.

### 2. Instalar la CLI de Supabase y enlazar el proyecto
```bash
npm i -g supabase        # o: brew install supabase/tap/supabase
supabase login
supabase link --project-ref wifukeifpabvxuiwpeao
```
Desde la carpeta que contiene `supabase/`.

### 3. Claves de Stripe
Stripe → Desarrolladores → Claves de API → copia la **clave secreta** (`sk_test_...` para probar, `sk_live_...` para real).
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx SITE_URL=https://fuentenarrobodegas-oss.github.io/compra_online_vino/
```

### 4. Desplegar las funciones
```bash
supabase functions deploy crear-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```
(`--no-verify-jwt` es necesario: los invitados compran sin cuenta y Stripe no manda token de Supabase.)

### 5. Webhook en Stripe
Stripe → Desarrolladores → Webhooks → **Añadir destino**
- URL: `https://wifukeifpabvxuiwpeao.supabase.co/functions/v1/stripe-webhook`
- Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`

Copia el **secreto de firma** (`whsec_...`):
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 6. Aviso por correo (opcional, recomendado)
Crea cuenta gratis en resend.com → API Keys.
```bash
supabase secrets set RESEND_API_KEY=re_xxx AVISO_EMAIL=bodegas@fuentenarro.com
```
Con el remitente de pruebas `onboarding@resend.dev` Resend solo envía al correo con el que te registraste en Resend. Para enviar a cualquier dirección, verifica el dominio `fuentenarro.com` en Resend y añade:
```bash
supabase secrets set AVISO_FROM="Tienda Fuentenarro <tienda@fuentenarro.com>"
```

### 7. Autenticación
Supabase → Authentication → URL Configuration:
- **Site URL**: `https://fuentenarrobodegas-oss.github.io/compra_online_vino/`
- **Redirect URLs**: añade también `https://fuentenarrobodegas-oss.github.io/compra_online_vino/admin.html`

Deja activado **Confirm email** (Authentication → Sign In / Providers → Email).

### 8. Darte acceso al panel
Regístrate en la tienda con el correo de la bodega, confirma el correo y ejecuta en el SQL Editor:
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'bodegas@fuentenarro.com';
```
Ya puedes entrar en `.../compra_online_vino/admin.html`.

### 9. Probar
Con `sk_test_...` paga con la tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC. Comprueba que el pedido aparece "Por enviar" en `admin.html`. Cuando todo vaya bien, cambia a `sk_live_...` y crea el webhook también en modo live (tiene otro `whsec_`).

## Añadir más vinos (Crianza, Reserva…)
Hay que tocar **dos sitios** con los mismos ids:
1. `index.html` → array `VINOS` (lo que se ve).
2. `supabase/functions/crear-checkout/index.ts` → `CATALOGO` (lo que se cobra). Vuelve a desplegar la función.

## Gastos de envío
Ahora son gratis. Para cobrarlos cambia `GASTOS_ENVIO` (euros) en `index.html` y `GASTOS_ENVIO_CENT` (céntimos) en `crear-checkout`, y redespliega.
