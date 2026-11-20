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
- **Decisión:** un único formulario con los campos en el orden aprobado (intención, nivel, conocimientos previos opcionales, resultado esperado). El error de idioma se asocia al campo de intención. La clasificación y la precisión se muestran a continuación como pasos de revisión. El objetivo no se muestra: se formula y se confirma durante la carga de learning paths (`DEC-021`).

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
- **Configuración de Auth que queda en el proyecto de Supabase:** confirmación de email ya obligatoria. Usuarios anónimos y manual linking hay que activarlos en el dashboard (el navegador de esta sesión no tenía la cuenta de Supabase abierta). Google sigue apagado hasta que existan client id y secret. Los botones de Apple y Microsoft son visuales; todavía no inician OAuth.

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
- **Decisión:** si `AI-STG-01` clasifica la solicitud como `Incompatible` y el riesgo no es `weapons` ni `security`, el mismo análisis devuelve exactamente tres alternativas (`title`, `explanation`, `suggested_intent`, `suggested_outcome`). Cada una es una intención nueva, relacionada con lo pedido, y se queda en el `learning_orientation` ya elegido (`DEC-015`). `applied` no se rescata como historia o filosofía del tema; `theoretical` no se convierte en un procedimiento. `suggested_outcome` es una oración básica que responde «What do you want to be able to do or understand?» para esa intención. Elegir una no continúa esta solicitud. La alternativa llega con nivel `None`, conocimientos previos vacíos, la intención y ese resultado esperado. La persona puede editar esos cuatro campos. Elegir crea una solicitud nueva con esos valores y la clasifica de nuevo: la precisión aparece solo si ese análisis la pide. La solicitud incompatible no produce objetivo, propuestas de curso, Blueprint ni checkout (`BR-OBJ-004`). Si el riesgo es `weapons` o `security`, no hay alternativas. Salud, derecho y finanzas pueden recibir tres alternativas de alfabetización segura.
- **Impacto:** `UF-03` variante D, `BR-OBJ-004`, `AI-STG-01`, `MVP.md` §3, análisis de onboarding y la pantalla de incompatibilidad.
- **Límite:** no son propuestas de curso (`AI-STG-04`). No cambian `Allowed with reframing` ni el arrastre de `learning_orientation`. No se muestra la orientación en la tarjeta.

### DEC-017 — Cuenta iniciada antes de analizar la intención

- **Estatus:** APROBADA (pedido de implementación, octubre 2026)
- **Necesidad:** analizar la intención no debe empezar para quien no está en una cuenta.
- **Decisión:** «Analyze my intention» comprueba el token con Auth. Una sesión anónima o un token rechazado no cuentan como cuenta iniciada. Si no hay cuenta, se guarda el formulario y se abre `/login?next=/onboarding`. Si hay cuenta, se crea la solicitud y sigue el análisis. El visitante anónimo sigue existiendo para el resto del recorrido (`DEC-011`).
- **Impacto:** formulario de onboarding. No cambia el requisito de cuenta permanente del Blueprint (`BR-AUT-004`).

### DEC-018 — Destino después del login sin cursos generados

- **Estatus:** APROBADA (pedido de implementación, octubre 2026)
- **Necesidad:** UF-06 abre la biblioteca si no hay una solicitud en curso. Un miembro sin ningún curso generado debe entrar al onboarding.
- **Decisión:** `profiles.generated_course_count` cuenta las filas de `courses` de esa cuenta. Tras login, registro o OAuth, si `next` es `/home` o `/` y el recuento es 0, el destino es `/onboarding`. Un `next` explícito (por ejemplo `/onboarding` o una propuesta) se respeta. El formulario de intención se guarda en `localStorage` para no perderlo al pasar por login o registro (`UF-01`, `BR-AUT-005`).
- **Impacto:** pantalla de auth, callback OAuth, confirmación de email, `GET /auth/profile`.

### DEC-019 — Cuatro propuestas de curso por solicitud

- **Estatus:** APROBADA (pedido del cliente, octubre 2026)
- **Necesidad:** la pantalla «Your learning path» compara direcciones en una grilla 2×2; un número variable (1–5) dejaba filas incompletas y obligaba a excepciones en prompt y validación.
- **Decisión:** tras la confirmación automática del objetivo (`DEC-021`), `AI-STG-04` devuelve **exactamente cuatro** propuestas de curso genuinamente diferentes. Ni más ni menos. Si el modelo no alcanza cuatro direcciones sustantivas, la etapa reintenta; no se rellena con variantes cosméticas ni se acepta un conjunto incompleto. Se elimina la excepción de «una sola propuesta cuando no hay alternativas». La recomendación opcional (`BR-PRP-004`, `DEC-009`) sigue vigente cuando una opción es claramente superior.
- **Impacto:** `BR-PRP-001`, `AI-STG-04`, `UF-04`, `MVP.md` §5, prompts y validación en `modules/proposals`, pantalla de propuestas (`apps/web`).
- **Límite:** no cambia la diferenciación mínima entre pares (`BR-PRP-002`) ni confunde propuestas con alternativas de intención incompatible (`DEC-016` / `AI-STG-01`).

### DEC-020 — Progreso de lectura y finalización del curso

- **Estatus:** APROBADA (pedido de implementación, noviembre 2026)
- **Necesidad:** `MVP.md` §16, `BR-PRG-001` a `BR-PRG-005` y `UF-16` exigen marcas manuales, progreso de módulo y de curso, última lección y finalización persistida. La demo había dejado ese estado fuera del modelo.
- **Decisión:** el aprendizaje se guarda aparte del build. `lesson_reads` es la marca por usuario y lección. `course_learning_progress` guarda la última lección, la actividad, la primera finalización, la finalización vigente y si ya se presentó sola la síntesis final. El porcentaje y los estados `not_started`, `in_progress` y `completed` se calculan. `courses.completed_at` sigue siendo el fin de la generación. El total del curso incluye las lecciones previstas todavía no publicadas. Un curso se completa solo con build `complete`, todos los módulos `published` y todas las lecciones leídas. La presentación automática de la síntesis final ocurre una sola vez.
- **Impacto:** migración `lesson_reads` y `course_learning_progress`, `modules/learning_progress`, `GET/PUT/POST` bajo `/courses/{id}`. Home, Mis cursos, el esquema del curso y la lección muestran ese progreso. La lección publicada se marca a mano y registrar la visita no ocurre en el prefetch.
- **Límite:** no incluye posición de audio ni resultado de Knowledge Check. `BR-PRG-004` sigue pidiendo esos dos datos para una tarea posterior. No se rediseñan las sugerencias editoriales de Home ni de Mis cursos. Con `DEC-007`, los módulos `not_built` entran en el total y el curso no puede completarse mientras existan.

### DEC-021 — El objetivo se confirma sin pantalla

- **Estatus:** APROBADA (pedido del cliente, noviembre 2026)
- **Necesidad:** la pantalla de confirmación del objetivo frenaba el recorrido. En la mayoría de los casos la persona confirmaba sin leer ni corregir.
- **Decisión:** no hay pantalla ni corrección en texto libre del objetivo. Tras el análisis de la intención, y tras la precisión o las sugerencias cuando corresponden, la carga de learning paths formula el objetivo (`AI-STG-03`), lo marca confirmado y genera las cuatro paths (`AI-STG-04`). Las dos llamadas de modelo siguen separadas. El prompt y los campos del objetivo no cambian: alimentan paths, Blueprint y curso. `BR-OBJ-010` pasa a ser confirmación del sistema. `BR-OBJ-011` se conserva para una versión posterior, sin pantalla que la dispare.
- **Impacto:** `BR-OBJ-010`, `UF-02`, `UF-03` variante C, `UF-04`, `MVP.md` §4, `AI-STG-03`, `PRODUCT.md`, `DEC-006`, `DEC-019`, `POST /learning-requests/{id}/directions`, onboarding y propuestas en `apps/web`.
- **Límite:** no fusiona los prompts. No quita campos del objetivo ni el endpoint de revisión. No agrega un estado nuevo de base de datos.

### DEC-022 — El Blueprint se confirma sin pantalla

- **Estatus:** APROBADA (pedido del cliente, noviembre 2026)
- **Necesidad:** la pantalla de revisión del Blueprint frenaba la generación. En la mayoría de los casos la persona confirmaba sin leer ni cambiar el plan.
- **Decisión:** no hay pantalla de revisión, cambios ni aprobación. Tras elegir una learning path, la carga de “generando curso” ejecuta `AI-STG-05`, confirma esa versión y arranca el build. Si ya hay una versión guardada sin confirmar, el mismo inicio la confirma y arranca el build, sin generar otra. La vista del curso se abre sola cuando terminó la animación y ya existe el esquema inicial (título, módulos, lecciones y estados de generación). No se espera a que las lecciones estén escritas. “Aprobado” es confirmación del sistema. Las llamadas de modelo siguen separadas. El prompt conserva los mismos campos: disciplinan el plan aunque algunos no se copien al curso. Solo cambia la frase que presentaba la parte visible como texto para que el learner lo apruebe. `BR-BLP-010` pasa a ser confirmación del sistema. `BR-BLP-011` y la revisión en texto libre quedan para una versión posterior, sin pantalla ni rutas que las disparen.
- **Impacto:** `BR-BLP-010`, `BR-BLP-011`, `BR-GEN-001`, `UF-09` a `UF-11`, `UF-13`, `UF-15`, `AI-PRN-08`, `AI-STG-05`, `MVP.md` §9, `PRODUCT.md`, `POST /learning-requests/{id}/blueprint`, propuestas y la carga del curso en `apps/web`. Se eliminan `POST /blueprints/{id}/approve` y `POST /blueprints/{id}/revisions`.
- **Límite:** no fusiona `AI-STG-05` con el build. No quita campos del Blueprint ni sus tablas. No cambia créditos, suscripción ni la vista de lectura. La numeración visible del armado pasa de tres pasos a dos (Onboarding, Learning path).

### DEC-023 — Base comercial de Stripe y créditos, sin restringir la generación

- **Estatus:** TEMPORAL (implementación de noviembre 2026; reglas de producto todavía abiertas)
- **Necesidad:** hace falta una base real de Checkout, suscripción, portal, webhooks y ledger antes de fijar precios, la unidad de consumo y el momento en que el usuario ve la falta de créditos.
- **Decisión:** Stripe vive solo en FastAPI. Las ofertas y la tarifa `course_build` son filas versionadas y provisionales (USD 11 y USD 22 de sandbox, un crédito). El navegador no confirma un pago al volver de Checkout. Los créditos se mueven en funciones SQL transaccionales, revocadas a `anon` y `authenticated`. Un reembolso de Stripe no restituye créditos. `COMMERCIAL_GATE_ENABLED` queda apagado: la reserva dentro de `approve_blueprint` no corre y el Learning Path no cambia. `BR-SUB-001`, `BR-SUB-003`, `BR-CRD-002` y la unidad definitiva de consumo no se adoptan con esta base.
- **Impacto:** migración `20261116230000_commercial_ledger.sql`, `modules/commercial`, `/api/v1/billing/*`, planes y `/account`.
- **Límite:** no se aplica la migración al remoto ni se activan cobros live. No hay vencimiento, acumulación ni beneficio de bienvenida. No se ofrece Checkout antes de generar el curso. Encender el flag sin esa pantalla descubriría la falta de saldo durante “Generating course”.

### DEC-024 — Narración de lecciones independiente del proveedor

- **Estatus:** TEMPORAL (implementación de noviembre 2026; ElevenLabs aún sin cuenta)
- **Necesidad:** el MVP pide audio bajo demanda (`BR-AUD-001` a `BR-AUD-008`, `UF-18`) sin atar el producto a un único TTS ni a un poll del navegador que facture.
- **Decisión:** FastAPI posee el trabajo. Un contrato `TTSProvider` declara `max_input`, `input_unit` (`chars` o `bytes`), `generation` (`sync` o `async`) y `usage_unit`. El mock es el proveedor de desarrollo. ElevenLabs queda detrás del mismo contrato, apagado sin credenciales. Google no se implementa. El texto narrado reutiliza `lesson_reading_text()` y se parte según las capacidades del proveedor activo. La reutilización usa `content_sha256` más `config_sha256` (proveedor, modelo, voz, formato). El `POST` persiste y agenda el runner existente; los `GET` de estado y playback solo leen. Cada fragmento se reserva con `lease_token` y vencimiento; la llamada TTS ocurre fuera de la transacción. Un fragmento `ready` no se vuelve a sintetizar. En un proceso largo, el lifespan retoma leases vencidos (no en Vercel). La recuperación en Vercel es un `GET /api/v1/internal/audio/tick` con `CRON_SECRET`; el cron no se activa en este cambio. El bucket `lesson-audio` es privado. El progreso de audio vive en `lesson_audio_progress`, no en `position_revision`. El audio no toca el ledger (`BR-CRD-008`) ni el estado del curso (`BR-AUD-007`). El mock no corre cuando `APP_ENV=production`.
- **Impacto:** migración `20261117200000_lesson_audio.sql`, `modules/audio`, rutas bajo `/courses/{id}/modules/{id}/lessons/{id}/audio`, `AudioRail` en `ModuleDesk`, `docs/AUDIO.md`.
- **Límite:** no concatena un único archivo (manifiesto de fragmentos). No hay streaming ni SSML en el contrato. Un corte después de que el proveedor cobró y antes de persistir el objeto puede repetir esa llamada al vencer el lease; el token evita dos escrituras, no un segundo cobro del proveedor. No se aplica la migración ni se crea el bucket remoto. No se configura el cron en Vercel.

## Pendientes sin decisión

- Expiración de la sesión anónima (`BR-ONB-009`) si se mantiene el bypass demo.
- `INTEGRATIONS.md`: contratos definitivos con OpenAI, ElevenLabs, Stripe y email.
- `ARCHITECTURE.md`: distribución de responsabilidades, jobs, observabilidad.
- `PENDING-CLIENT-01..06` de `AI_GENERATION.md`.
