# AUDIO.md

# Auteur Education — Narración de lecciones

**Estado:** implementación local (DEC-024). El bucket, las migraciones remotas, el cron de Vercel y ElevenLabs no están activos.

**Ubicación canónica:** `docs/AUDIO.md`

## Propósito

Describir el sistema de audio de las lecciones: contrato de proveedores, persistencia, procesamiento durable, reutilización, reproducción y el procedimiento para activar ElevenLabs más adelante.

El audio no consume créditos de curso (`BR-CRD-008`) y un fallo de narración no cambia el estado del curso (`BR-AUD-007`). La lectura sigue disponible.

## Contrato `TTSProvider`

El producto habla con un adaptador, no con un proveedor concreto.

```text
capabilities
  name            identificador interno (mock, elevenlabs)
  max_input       tope de una solicitud
  input_unit      chars | bytes
  generation      sync | async
  usage_unit      characters | bytes | requests
  media_type      p. ej. audio/mpeg

synthesize(text, attempt_id, voice_id, model) -> audio, billed_units, duration_ms
```

`input_unit` decide cómo se parte el texto. ElevenLabs y el mock usan caracteres y generación sincrónica. Un adaptador futuro de Google Cloud TTS puede declarar `bytes` y `async` y guardar `provider_job_id` en el fragmento. Ese adaptador no está implementado y no hay dependencia de Google.

El contrato no incluye SSML, streaming ni un archivo único concatenado. La reproducción usa un manifiesto de fragmentos ordenados.

## Configuración (solo backend)

| Variable | Rol |
| --- | --- |
| `TTS_ENABLED` | Apaga la narración sin tocar el resto del producto. |
| `TTS_PROVIDER` | `mock` (desarrollo) o `elevenlabs`. |
| `TTS_ALLOW_MOCK` | Si ElevenLabs no tiene clave, permite el mock fuera de producción. En `APP_ENV=production` el mock se rechaza siempre. |
| `TTS_MODEL` / `TTS_VOICE_ID` / `TTS_OUTPUT_FORMAT` | Identidad de la voz. Entran en `config_sha256`. |
| `TTS_MAX_INPUT` | Tope efectivo; no supera el del proveedor. |
| `TTS_MAX_ACTIVE_JOBS_PER_USER` | Una narración en curso por usuario, por defecto. |
| `TTS_LEASE_SECONDS` | Vencimiento de la reserva del fragmento. |
| `TTS_MONTHLY_UNIT_CAP` | Tope de unidades facturadas del mes. `0` lo desactiva. |
| `ELEVENLABS_API_KEY` | Secreto. Nunca en el frontend ni en logs. |
| `CRON_SECRET` | Autoriza `GET /api/v1/internal/audio/tick`. |

## Texto, hash y fragmentación

El texto narrado es `lesson_reading_text(draft)`: título, encabezados y cuerpos. No se modifica esa función. No se narran fuentes, quizzes, síntesis de módulo ni pantallas que no sean una lección aprobada.

`content_sha256` cubre ese texto. `config_sha256` cubre proveedor, modelo, voz, formato y unidad de entrada. La misma lección con el mismo texto y la misma configuración reutiliza la narración. Un cambio de voz o de contenido pide un trabajo nuevo.

Los fragmentos respetan `max_input` y `input_unit`, parten por párrafos y frases, y conservan el orden.

## Procesamiento durable

1. `POST .../audio` crea o reutiliza la narración y agenda el runner. Responde 202. No espera a ElevenLabs.
2. `GET .../audio` y `GET .../audio/playback` solo leen. No sintetizan ni suben objetos.
3. El runner reserva un fragmento (`leased` + `lease_token` + vencimiento), cierra esa escritura, llama al proveedor, guarda el objeto y completa solo si el token sigue coincidiendo.
4. Un fragmento `ready` no se vuelve a sintetizar.
5. Si el proceso muere, el lease vence. El lifespan (fuera de Vercel) y el tick interno reclaman el siguiente fragmento pendiente.
6. PostgreSQL no permanece bloqueado durante la llamada TTS.

El navegador puede cerrarse. El trabajo sigue en el servidor o se recupera al próximo tick.

## Costos duplicados

La reserva evita dos escrituras concurrentes del mismo fragmento. No evita un segundo cobro si el proveedor ya facturó y el proceso murió antes de marcar `ready`. En ese caso el fragmento se reserva de nuevo y se llama otra vez. El `attempt_id` queda en logs (sin secretos) para conciliar. No se promete exactamente una ejecución por fragmento.

## API

Prefijo: `/api/v1/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}`

| Método | Ruta | Efecto |
| --- | --- | --- |
| POST | `/audio` | Solicita o reutiliza. Agenda trabajo si hace falta. |
| GET | `/audio` | Estado. |
| GET | `/audio/playback` | URLs firmadas y progreso. |
| PUT | `/audio/progress` | Posición y velocidad. No toca `lesson_reads`. |
| POST | `/audio/retry` | Reencola fragmentos fallidos. Conserva los `ready`. |
| GET | `/api/v1/internal/audio/tick` | Recupera leases vencidos. Requiere `Bearer CRON_SECRET`. |

Autorización: JWT de Supabase, lección de un curso del usuario, módulo publicado, lección aprobada. Una suscripción cancelada no se consulta: el acceso es el del curso conservado.

## Almacenamiento

Bucket privado `lesson-audio`. No se usa `profile-photos`. El cliente nunca habla con Storage. FastAPI firma la URL después de autorizar.

## Frontend

El reproductor vive en `AudioRail` dentro de `ModuleDesk`, solo en el panel de lección. No hay pantalla de generación aparte. No se muestran nombres de proveedores.

## Activación futura (no ejecutar ahora)

### 1. Cuenta ElevenLabs

Crear la cuenta a nombre de Auteur Education. No usar una cuenta personal de un colaborador como titular definitivo.

### 2. API key

Crear una clave en el panel de ElevenLabs. Guardarla solo en el backend (`ELEVENLABS_API_KEY`). Nunca `NEXT_PUBLIC_*`, nunca el frontend, nunca logs.

### 3. Voz y modelo

Elegir voz y modelo estables. Cargar `TTS_VOICE_ID`, `TTS_MODEL` y `TTS_OUTPUT_FORMAT`. Un cambio de estos valores genera un `config_sha256` distinto y no reutiliza audios anteriores.

### 4. Cuotas

Definir `TTS_MONTHLY_UNIT_CAP` según el plan contratado. Dejar `TTS_MAX_ACTIVE_JOBS_PER_USER=1` hasta ver concurrencia real.

### 5. Proveedor activo

```text
TTS_ENABLED=true
TTS_PROVIDER=elevenlabs
TTS_ALLOW_MOCK=false
APP_ENV=production
```

En producción el mock se rechaza aunque `TTS_PROVIDER=mock` o `TTS_ALLOW_MOCK=true`.

### 6. Bucket remoto

En el proyecto Supabase de Auteur, crear el bucket privado `lesson-audio` (audio/mpeg) o aplicar la migración que lo declara. Sin políticas para `anon` / `authenticated`.

### 7. Migración remota

Aplicar `supabase/migrations/20261117200000_lesson_audio.sql` cuando se autorice. Esta implementación no la aplica.

### 8. Recuperación programada

El endpoint `GET /api/v1/internal/audio/tick` ya existe. Autenticación: `Authorization: Bearer $CRON_SECRET`.

Vercel Cron:

- Solo corre en producción, no en Preview.
- Solo admite GET.
- El plan Hobby dispara como máximo una vez al día.
- El plan Pro permite hasta un disparo por minuto.
- Dos invocaciones solapadas son posibles; el lease las hace idempotentes.
- `maxDuration` del servicio API ya es 1800s en `apps/api/vercel.json`. El cron usa el máximo del plan (Hobby 60s, Pro hasta el máximo del proyecto).

Para activarlo más adelante, añadir en el `vercel.json` del servicio API (no está en el archivo a propósito: un deploy no debe encender el cron):

```json
{
  "crons": [
    {
      "path": "/api/v1/internal/audio/tick",
      "schedule": "* * * * *"
    }
  ]
}
```

Vercel no envía `CRON_SECRET` solo. Hay que validar el bearer en la propia ruta (ya implementado) y configurar el secreto en el proyecto, o un header `Authorization` si el plan lo permite. Mientras el cron no esté en `vercel.json`, llamar el tick a mano o depender del lifespan en un proceso largo.

### 9. Prueba real

Con una lección aprobada de un usuario de prueba: POST, esperar `ready`, reproducir, comprobar el objeto en `lesson-audio`, reintentar un fallo forzado, confirmar que un segundo POST no llama a ElevenLabs.

### 10. Costos y calidad

Medir caracteres facturados, `estimated_cost_cents` (si hay fila en `tts_price_versions`), tiempo hasta `ready` y calidad de la voz. Ajustar fragmentación si el proveedor corta mal.

### 11. Almacenamiento y reproducción

Confirmar que las URLs firmadas caducan, que un usuario no obtiene el audio de otro y que `profile-photos` no recibe narraciones.

### 12. Habilitación gradual

1. Staging con ElevenLabs y un usuario interno.
2. Producción con `TTS_ENABLED=true` y tope mensual conservador.
3. Observar tickets y costos antes de subir el tope.

## Pendiente (fuera de esta implementación)

- Aplicar la migración en Supabase remoto.
- Crear el bucket remoto si no se aplica la migración.
- Configurar `ELEVENLABS_API_KEY` y voz reales.
- Añadir `crons` a `vercel.json` y desplegar.
- Llamadas reales a ElevenLabs.
- Adaptador Google Cloud TTS.
