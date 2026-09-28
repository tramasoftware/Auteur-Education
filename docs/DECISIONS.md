# DECISIONS.md

# Auteur Education

**Versión:** 0.1

**Estado:** Registro de decisiones técnicas temporales para la demostración del generador. Ninguna entrada marcada como `TEMPORAL` es una decisión de producto aprobada.

**Ubicación canónica:** `docs/DECISIONS.md`

## Propósito

Registrar decisiones necesarias para implementar la demostración del generador que no están definidas en `MVP.md`, `BUSINESS_RULES.md`, `AI_GENERATION.md`, `USER_FLOWS.md` ni `PRODUCT.md`.

Cada entrada indica su estatus:

- `TEMPORAL`: supuesto adoptado por el equipo de desarrollo para desbloquear la demo. Debe confirmarse o reemplazarse antes del MVP comercial.
- `APROBADA`: decisión confirmada por Auteur Education.
- `PENDIENTE`: requiere respuesta antes de poder implementar la parte afectada.

Las entradas `TEMPORAL` no amplían el MVP ni relajan reglas de negocio; solo omiten precondiciones comerciales que la demo no implementa.

## Decisiones

### DEC-001 — Dependencia `openai` (SDK oficial)

- **Estatus:** TEMPORAL
- **Necesidad:** `MVP.md` exige OpenAI para generación, investigación y controles de calidad. El stack no incluía cliente.
- **Decisión:** usar el SDK oficial `openai` (Responses API con salidas estructuradas validadas por Pydantic). Alternativa descartada: `httpx` directo (más código propio, sin soporte de esquema estricto).
- **Impacto:** `apps/api/pyproject.toml`. Código de proveedor aislado en `auteur_api/ai/`.

### DEC-002 — Mecanismo de investigación web

- **Estatus:** TEMPORAL
- **Necesidad:** `MVP.md §12` y `AI-STG-06/07` exigen investigar antes de redactar. El mecanismo concreto estaba reservado a `ARCHITECTURE.md`.
- **Decisión:** usar la herramienta de búsqueda web integrada del proveedor (`web_search`) sin proveedor ni clave adicional. Las URLs devueltas por el modelo solo se consideran `retrieved` si aparecen en las citas de la búsqueda; el resto se marca `unverified` y no cuenta como evidencia sustantiva.
- **Impacto:** `modules/generation/research.py`, `modules/blueprints` (orientación).

### DEC-003 — Bypass de precondiciones comerciales en la demo

- **Estatus:** TEMPORAL (requiere confirmación explícita)
- **Necesidad:** `BR-BLP-001`, `BR-SUB-003`, `BR-CRD-005/006` exigen usuario autenticado, suscripción activa y entitlement antes del Blueprint y del build. `AGENTS.md §12` excluye auth, Stripe y créditos de la demo.
- **Decisión:** la demo omite esas precondiciones. La solicitud pasa de `proposal_selected` directamente a `blueprint_generating`. No se reserva ni consume entitlement. Este bypass solo está habilitado cuando `APP_ENV != production`.
- **Impacto:** `modules/blueprints/service.py`. Debe eliminarse cuando existan auth y billing.

### DEC-004 — Ejecución de Blueprint y build

- **Estatus:** TEMPORAL
- **Necesidad:** generar Blueprint y curso excede los tiempos razonables de una petición HTTP. `MVP.md §10` exige proceso asíncrono; la infraestructura está reservada a `ARCHITECTURE.md`.
- **Decisión:** tareas en background dentro del proceso (`asyncio`) y consulta por polling (`GET`). Sin colas, workers ni base de datos. El estado se pierde al reiniciar el proceso.
- **Impacto:** `core/background.py`, rutas de Blueprint y curso. Ejecutar Uvicorn sin `--reload` durante demostraciones.

### DEC-005 — Exposición de información interna de generación

- **Estatus:** TEMPORAL
- **Necesidad:** la demo debe permitir observar criterios, calidad, tiempo y coste (`AGENTS.md §11`).
- **Decisión:** endpoint `GET /api/v1/courses/{id}/diagnostics` con trazas por etapa (versión de prompt, modelo, duración, tokens, intento, resultado QA), clasificación materialista y auditorías. Disponible solo cuando `APP_ENV != production`. No forma parte del producto.

### DEC-006 — Onboarding en una sola pantalla

- **Estatus:** TEMPORAL
- **Necesidad:** `UF-01/UF-02` describen pasos secuenciales; la demo prioriza recorrer el flujo con mínima interfaz.
- **Decisión:** un único formulario con los campos en el orden aprobado (intención, nivel, conocimientos previos opcionales, resultado esperado). El error de idioma se asocia al campo de intención. La clasificación, la precisión y el objetivo se muestran a continuación como pasos de revisión.

### DEC-007 — Límite de módulos construidos en la demo

- **Estatus:** TEMPORAL
- **Necesidad:** controlar coste y tiempo de la demostración (`AGENTS.md §22`).
- **Decisión:** `GENERATION_MAX_MODULES` (por defecto 1). Los módulos no construidos se muestran como `not_built` y el curso no pasa a `complete` (`BR-GEN-006`). Sin límite (`vacío`) construye el curso completo.

### DEC-008 — Modelo por defecto

- **Estatus:** TEMPORAL (`PENDING-CLIENT-06`)
- **Decisión:** un modelo configurable por `OPENAI_MODEL` para todas las etapas, con `OPENAI_REASONING_EFFORT` opcional. El coste se reporta en tokens por etapa; solo se convierte a moneda si se configura una tabla de precios.

### DEC-009 — Recomendación de propuestas

- **Estatus:** APROBADA por precedencia documental
- **Conflicto:** la Skill `proposal-generation` prohíbe recomendar; `MVP.md §5`, `BR-PRP-004` y `AI-STG-04` permiten una recomendación justificada cuando existe una opción claramente superior.
- **Decisión:** implementar recomendación opcional con razón concreta, sin ranking ni puntuaciones. Pendiente: corregir el texto de la Skill.

### DEC-010 — Registro de evidencia de la demo

- **Estatus:** TEMPORAL
- **Decisión:** la evidencia de tiempo y tokens se obtiene del endpoint de diagnósticos y de los logs del servidor. No se persiste en el repositorio.

## Pendientes sin decisión

- `DATA_MODEL.md`: modelo de persistencia real, expiración de la sesión anónima (`BR-ONB-009`).
- `INTEGRATIONS.md`: contratos definitivos con OpenAI, ElevenLabs, Stripe y email.
- `ARCHITECTURE.md`: distribución de responsabilidades, jobs, observabilidad.
- `PENDING-CLIENT-01..06` de `AI_GENERATION.md`.
