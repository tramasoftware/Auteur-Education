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
- **Decisión:** usar la herramienta de búsqueda web integrada del proveedor (`web_search`) sin proveedor ni clave adicional. La llamada de búsqueda exige la herramienta (`tool_choice`), para que el modelo no responda de memoria. En este modelo la salida estructurada no trae las citas, así que la investigación hace primero una búsqueda en texto y lee `web_search_call.action.sources` y las anotaciones. Si esa búsqueda no trae páginas, se reintenta una vez. Esas URLs se pasan al modelo en un bloque `SEARCH PAGES` y son las que se publican. No se compara el título inventado con el de un artículo para elegir el enlace. Una URL que esa búsqueda no devolvió no se publica. Una URL de la búsqueda que responde 404 o 410 tampoco; un 403 u otro estado se conserva. Ediciones de archivo de la misma entrada (por ejemplo Stanford `/archives/<edición>/`) y parámetros de seguimiento cuentan como una sola obra, y el enlace publicado es la página canónica. Ese colapso ocurre antes del tope. Cada lección conserva como máximo las primeras seis obras distintas que siguen vivas, en el orden de la búsqueda (`BR-SRC-003`). La búsqueda se intenta dos veces. Si la segunda tampoco trae páginas, o falla el proveedor en esa llamada, la lección se redacta igual y el módulo sigue. Una revisión que pida investigar de nuevo no detiene la lección después de dos rondas: se publica el texto ya escrito. El build de la demo no falla por una URL descartada ni por una lista de fuentes vacía.
- **Impacto:** `modules/generation/build.py`, `modules/generation/prompts.py`, `modules/blueprints` (orientación).

### DEC-003 — Bypass de precondiciones comerciales en la demo

- **Estatus:** TEMPORAL (requiere confirmación explícita)
- **Necesidad:** `BR-BLP-001`, `BR-SUB-003`, `BR-CRD-005/006` exigen usuario autenticado, suscripción activa y entitlement antes del Blueprint y del build. `AGENTS.md §12` excluye auth, Stripe y créditos de la demo.
- **Decisión:** la demo omite esas precondiciones. La solicitud pasa de `proposal_selected` directamente a `blueprint_generating`. No se reserva ni consume entitlement. Este bypass solo está habilitado cuando `APP_ENV != production`.
- **Impacto:** `modules/blueprints/service.py`. Debe eliminarse cuando existan auth y billing.

### DEC-004 — Ejecución de Blueprint y build

- **Estatus:** TEMPORAL
- **Necesidad:** generar Blueprint y curso excede los tiempos razonables de una petición HTTP. `MVP.md §10` exige proceso asíncrono; la infraestructura está reservada a `ARCHITECTURE.md`.
- **Decisión:** tareas en background dentro del proceso (`asyncio`) y consulta por polling (`GET`). Sin colas ni workers externos. El estado durable vive en Postgres cuando `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están configurados (`docs/DATA_MODEL.md`); si no, permanece el `DemoStore` in-memory. Un proceso muerto no continúa el worker: al arrancar, la API retoma cursos no terminales (DEC-013).
- **Impacto:** `core/background.py`, `core/postgres_store.py`, rutas de Blueprint y curso.

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
- **Decisión:** la evidencia de tiempo y tokens se obtiene del endpoint de diagnósticos y de los logs del servidor. Las trazas se persisten en `generation_traces` cuando hay Postgres; no se copian al repositorio.

### DEC-011 — Identidad de producto con Supabase Auth

- **Estatus:** Reemplaza el bypass temporal del usuario demo
- **Necesidad:** `BR-AUT-004` a `BR-AUT-007` y `UF-06` exigen una cuenta real. El perfil sembrado compartía todas las filas de quien no enviaba un JWT.
- **Decisión:** FastAPI resuelve `Authorization: Bearer <jwt>` con `supabase.auth.get_user` en todos los entornos. Sin un JWT válido la respuesta es 401. El visitante es un usuario anónimo de Supabase, con su propio `id`. Al registrarse o iniciar sesión, esa solicitud pasa a la cuenta permanente. El usuario `00000000-0000-0000-0000-000000000001` fue eliminado. No hay `DEMO_USER_BYPASS`. Los tests sustituyen la dependencia solo en el arnés.
- **Impacto:** `core/auth.py`, `apps/web` (cookies de sesión), migración que borra el usuario demo y revoca el Data API a `anon` y `authenticated`.
- **Configuración de Auth que queda en el proyecto de Supabase:** confirmación de email ya obligatoria. Usuarios anónimos y manual linking hay que activarlos en el dashboard (el navegador de esta sesión no tenía la cuenta de Supabase abierta). Google sigue apagado hasta que existan client id y secret; el botón no se muestra mientras `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` no sea `true`.

### DEC-012 — FastAPI como único plano de datos del generador

- **Estatus:** TEMPORAL
- **Necesidad:** el navegador no debe usar `service_role` ni leer `blueprint_versions.internal` / borradores por PostgREST.
- **Decisión:** el frontend llama solo a FastAPI. El backend escribe con `service_role` tras comprobar el dueño. No hay cliente PostgREST en `apps/web`.
- **Impacto:** `apps/web/src/lib/api.ts`, políticas RLS (defensa en profundidad).

### DEC-013 — Reanudación de builds incompletos al arrancar la API

- **Estatus:** TEMPORAL
- **Necesidad:** `--reload` o un proceso muerto deja módulos `published` y el resto en pipeline. Postgres no ejecuta el worker.
- **Decisión:** al lifespan de FastAPI, si hay Postgres y clave OpenAI, `ensure_started` reprograma cursos cuyo estado no es `complete`/`failed` y que aún tienen módulos construibles (no `published` ni `not_built`).
- **Impacto:** `main.py`, `modules/generation/build.py`.

### DEC-014 — Identificadores UUID con guiones

- **Estatus:** TEMPORAL
- **Necesidad:** Postgres `uuid` y el demo in-memory usaban hex sin guiones y ids recortados.
- **Decisión:** `new_id()` devuelve `str(uuid.uuid4())`. Rompe ids viejos del DemoStore (aceptable: no hay datos de producto).
- **Impacto:** `core/store.py`, contratos de `id: string`.

### DEC-015 — Orientación de la intención y fundamentos aplicados

- **Estatus:** APROBADA para los prompts del generador
- **Necesidad:** el clasificador rechazaba materias como personal branding por “incompatibles”, y la redacción empujaba cualquier tema hacia una indagación de ciencias sociales. El reclamo del cliente (octubre 2026) pide reconocer si la intención es más teórica o más de fundamentos aplicados, y no tratar esa segunda vía como un tutorial.
- **Decisión:** `AI-STG-01` registra `learning_orientation` (`theoretical` | `applied`) y la arrastran el objetivo, las propuestas, el Blueprint y la redacción. `applied` enseña criterios, juicio y decisiones explicables en texto y audio. Sigue siendo `Incompatible` el resultado que depende de ver, hacer u operar una herramienta. `Allowed with reframing` conserva el núcleo de la materia pedida y no lo convierte en su filosofía. La voz editorial y el criterio materialista siguen esa orientación: en un curso aplicado el materialismo parte de `Not applicable` salvo que el tema lo vuelva útil (`BR-EPI-002`).
- **Impacto:** prompts de onboarding, propuestas, Blueprint y generación. El campo viaja en la respuesta de la solicitud para poder observarlo; no hay una pantalla nueva.
- **Límite:** no agrega modalidades de aprendizaje ni autoriza procedimientos físicos o tutoriales de software.

### DEC-016 — Alternativas de recuperación tras una intención incompatible

- **Estatus:** APROBADA (pedido del cliente, octubre 2026)
- **Necesidad:** rechazar una intención incompatible y pedir otra de inmediato resulta demasiado abrupto. La persona necesita direcciones cercanas a lo que pidió, enseñables por texto y audio, sin tratar la solicitud original como realizable.
- **Decisión:** si `AI-STG-01` clasifica la solicitud como `Incompatible` y el riesgo no es `weapons` ni `security`, el mismo análisis devuelve exactamente tres alternativas (`title`, `explanation`, `suggested_intent`). Cada una es una intención nueva, relacionada con la pedido, y se queda en el `learning_orientation` ya elegido (`DEC-015`). `applied` no se rescata como historia o filosofía del tema; `theoretical` no se convierte en un procedimiento. Elegir una vuelve al formulario de onboarding con solo la intención inicial autocompletada. Nivel, conocimientos previos y resultado esperado los completa la persona. Enviar crea una solicitud nueva, que se clasifica de nuevo. La solicitud incompatible no produce objetivo, propuestas de curso, Blueprint ni checkout (`BR-OBJ-004`). Si el riesgo es `weapons` o `security`, no hay alternativas. Salud, derecho y finanzas pueden recibir tres alternativas de alfabetización segura.
- **Impacto:** `UF-03` variante D, `BR-OBJ-004`, `AI-STG-01`, `MVP.md` §3, análisis de onboarding y la pantalla de incompatibilidad.
- **Límite:** no son propuestas de curso (`AI-STG-04`). No cambian `Allowed with reframing` ni el arrastre de `learning_orientation`. No se muestra la orientación en la tarjeta.

## Pendientes sin decisión

- Expiración de la sesión anónima (`BR-ONB-009`) si se mantiene el bypass demo.
- `INTEGRATIONS.md`: contratos definitivos con OpenAI, ElevenLabs, Stripe y email.
- `ARCHITECTURE.md`: distribución de responsabilidades, jobs, observabilidad.
- `PENDING-CLIENT-01..06` de `AI_GENERATION.md`.
