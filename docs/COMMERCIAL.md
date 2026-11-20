# Base comercial

Stripe, las suscripciones y los créditos viven en FastAPI y en Postgres. El navegador solo llama a `/api/v1/billing/*`. No hay fallback a `DemoStore`. Si Supabase o Stripe no están configurados, esas rutas responden 503.

`COMMERCIAL_GATE_ENABLED` está apagado. Elegir una learning path y confirmar el Blueprint no reserva créditos. El gancho interno existe en `approve_blueprint` para cuando se decida cómo ofrecer Checkout antes de la pantalla de generación.

## Variables

Nombres solamente. Los valores van en el entorno del API, nunca en el frontend.

- `STRIPE_SECRET_KEY`: clave secreta de sandbox (`sk_test_`).
- `STRIPE_WEBHOOK_SECRET`: secreto del endpoint de webhooks (`whsec_`).
- `COMMERCIAL_GATE_ENABLED`: `false` por defecto.
- `PUBLIC_SITE_URL`: origen al que Stripe devuelve al usuario, sin barra final. En local, `http://localhost:3000`.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: ya usadas por el API. La service role no sale del servidor.

## Datos

La migración local es `supabase/migrations/20261116230000_commercial_ledger.sql`. No está aplicada al proyecto remoto.

La semilla provisional es:

- pago único, 1100 centavos USD, 1 crédito;
- suscripción mensual, 2200 centavos USD, 1 crédito por factura pagada;
- tarifa `course_build`, 1 crédito.

`stripe_price_id` queda vacío. Checkout responde 409 hasta que una versión de oferta tenga un price id de sandbox.

Para cambiar un precio o una cantidad, se inserta una versión nueva y se desactiva la anterior. No se reescribe la fila que ya usaron pagos o grants. La tarifa activa de `course_build` se reemplaza del mismo modo. No hay job de vencimiento ni crédito de bienvenida. `expires_at` queda nulo.

Las funciones `grant_credits`, `reserve_credits`, `confirm_reservation`, `release_reservation`, `refund_reservation_for_course` y `apply_commercial_event` tienen `search_path` fijo. `EXECUTE` está revocado para `PUBLIC`, `anon` y `authenticated`. Solo `service_role` ejecuta las que el API necesita. `grant_credits` no se otorga a `service_role`: la llama la función del evento.

Un evento ya `processed` responde 200 y no vuelve a acreditar. Si el procesamiento falla, la fila queda `failed`, la respuesta es 500 y Stripe reintenta el mismo evento. El grant usa la clave `(source_type, source_id)`.

Un `charge.refunded` marca el pago como `refunded`. No devuelve créditos. La restitución interna solo ocurre si el flag está encendido y el build falla de forma definitiva.

## Sandbox

1. Crear en el dashboard de prueba un Product/Price de pago único y otro recurrente. No usar claves live.
2. Guardar los price id en las versiones activas, por SQL, después de aplicar la migración cuando esté autorizado:

```sql
update public.commercial_offer_versions
set stripe_price_id = 'price_...'
where id = '11111111-1111-4111-8111-111111111112';
```

El id de la suscripción provisional es `22222222-2222-4222-8222-222222222222`.

3. En el API, completar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `PUBLIC_SITE_URL`. Dejar `COMMERCIAL_GATE_ENABLED=false`.
4. Reenviar los eventos al API:

```text
stripe listen --forward-to localhost:8000/api/v1/billing/webhook
```

El secreto que imprime ese comando es `STRIPE_WEBHOOK_SECRET`. En el deploy, el endpoint es el origen público más `/api/v1/billing/webhook`.

5. Con una cuenta permanente, abrir `/plans`, elegir un plan y completar el pago de prueba `4242 4242 4242 4242`.
6. Volver a `/account`. El saldo cambia cuando el webhook quedó `processed`, no porque la URL tenga `checkout=return`.
7. Para una factura fallida, usar una tarjeta de prueba que falla el cobro. El pago queda `failed`, la suscripción puede pasar a `past_due` y no se acreditan créditos.
8. Cancelar desde el portal de facturación. La suscripción queda `cancel_at_period_end` y, al terminar, `canceled`. Los cursos ya generados siguen visibles.
9. Reenviar un evento fallido con `stripe events resend evt_...`. Un evento ya procesado no acredita de nuevo.

## Pendiente

- Unidad real de consumo.
- Precios y cantidades definitivos.
- Vencimiento, acumulación y beneficio de bienvenida.
- Si hace falta una suscripción activa además de créditos.
- Aplicar la migración en `auteur-education-dev`.
- Dónde ofrecer Checkout antes de que empiece la generación, sin descubrir la falta de saldo en esa pantalla.
