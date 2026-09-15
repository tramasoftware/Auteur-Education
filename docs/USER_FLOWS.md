# USER_FLOWS.md

# Auteur Education

**Versión:** 1.0

**Estado:** Aprobado

**Ubicación canónica:** `docs/USER_FLOWS.md`

## Propósito de este documento

Este archivo describe cómo interactúan visitantes, clientes y administradores con Auteur Education. Convierte el alcance definido en `MVP.md` en secuencias observables que pueden utilizarse para diseñar pantallas, implementar estados y construir pruebas funcionales.

Este documento define el comportamiento esperado desde la perspectiva del usuario. No define componentes, endpoints, tablas, proveedores ni arquitectura técnica.

## Instrucciones de uso para agentes

- Leer `PRODUCT.md` y `MVP.md` antes de implementar cualquiera de estos flujos.
- Utilizar los identificadores `UF-XX` como referencias estables en planes, tareas, commits y pruebas.
- Implementar tanto el recorrido principal como sus variantes y recuperaciones.
- No convertir una sugerencia de interfaz en una decisión arquitectónica.
- No agregar pasos, campos, permisos o resultados que no estén documentados.
- No omitir persistencia, estados de espera, errores ni acciones de recuperación.
- Mantener separados el estado de generación, el progreso de aprendizaje y el estado de suscripción.
- Cuando un flujo contradiga `MVP.md`, prevalece `MVP.md` y la contradicción debe registrarse en `DECISIONS.md`.
- Cuando falte una decisión necesaria, no asumirla: registrar la pregunta en `DECISIONS.md`.
- Los textos visibles, nombres de acciones y mensajes del producto se implementan en inglés, aunque este documento esté escrito en español.

## Convenciones

Cada flujo contiene:

- **Actor:** persona que inicia o conduce el recorrido.
- **Disparador:** acción o evento que lo inicia.
- **Precondiciones:** condiciones que deben cumplirse antes de comenzar.
- **Recorrido principal:** secuencia esperada cuando no se producen excepciones.
- **Variantes y errores:** caminos alternativos que también deben implementarse.
- **Resultado:** estado persistido al finalizar.

Las acciones y estados escritos entre backticks representan conceptos funcionales estables. No obligan a utilizar esos mismos nombres en el código.

## Mapa general

1. El visitante conoce Auteur e inicia una intención.
2. Completa el onboarding y confirma un objetivo.
3. Recibe y selecciona una propuesta de curso.
4. Se registra o inicia sesión sin perder el contexto.
5. Se suscribe mediante Stripe.
6. Recibe, revisa y aprueba un Blueprint.
7. Auteur construye y publica el curso por módulos.
8. El cliente lee, escucha y comprueba su comprensión.
9. Retoma su progreso desde la biblioteca.
10. Gestiona su cuenta y suscripción.
11. Administración interviene únicamente cuando la operación lo requiere.

## Índice de flujos

| ID | Flujo | Actor principal |
| --- | --- | --- |
| `UF-01` | Iniciar una intención desde el sitio público | Visitante |
| `UF-02` | Completar el onboarding y confirmar el objetivo | Visitante |
| `UF-03` | Tratar una solicitud ambigua, práctica o incompatible | Visitante |
| `UF-04` | Recibir, comparar y seleccionar propuestas | Visitante |
| `UF-05` | Reanudar o perder una sesión anónima | Visitante |
| `UF-06` | Registrarse o iniciar sesión conservando el contexto | Visitante |
| `UF-07` | Suscribirse y completar el checkout | Cliente |
| `UF-08` | Recuperarse de un pago fallido | Cliente |
| `UF-09` | Generar y revisar el Blueprint inicial | Cliente |
| `UF-10` | Solicitar cambios en el Blueprint | Cliente |
| `UF-11` | Aprobar el Blueprint e iniciar el build | Cliente |
| `UF-12` | Intentar generar sin beneficio o créditos | Cliente |
| `UF-13` | Seguir la generación y comenzar con contenido parcial | Cliente |
| `UF-14` | Recuperarse de un fallo de generación | Cliente y administrador |
| `UF-15` | Abrir o retomar un curso | Cliente |
| `UF-16` | Estudiar y registrar progreso | Cliente |
| `UF-17` | Completar un Knowledge Check | Cliente |
| `UF-18` | Generar y reproducir audio | Cliente |
| `UF-19` | Gestionar la biblioteca personal | Cliente |
| `UF-20` | Eliminar un curso | Cliente |
| `UF-21` | Gestionar cuenta y facturación | Cliente |
| `UF-22` | Cancelar o reactivar la suscripción | Cliente |
| `UF-23` | Recuperar acceso a la cuenta | Cliente |
| `UF-24` | Gestionar usuarios y suspensiones | Administrador |
| `UF-25` | Gestionar builds fallidos o bloqueados | Administrador |
| `UF-26` | Ajustar créditos | Administrador |
| `UF-27` | Gestionar configuración comercial | Administrador |
| `UF-28` | Enviar notificaciones transaccionales | Sistema |

## Flujos de visitante

### UF-01 Iniciar una intención desde el sitio público

**Actor:** Visitante.

**Disparador:** Abre la página pública de Auteur Education.

**Precondiciones:** Ninguna.

#### Recorrido principal

1. El visitante recibe una explicación breve de qué hace Auteur y de que el aprendizaje es teórico mediante texto y audio.
2. Puede elegir `Start learning` o `Sign in` sin recorrer páginas intermedias obligatorias.
3. Selecciona `Start learning`.
4. El sistema solicita qué quiere aprender o llegar a comprender.
5. El visitante escribe una intención, pregunta o capacidad deseada en texto libre.
6. El sistema valida que la entrada tenga contenido significativo.
7. Se crea una solicitud anónima en estado `Draft` y comienza `UF-02`.

#### Variantes y errores

- Si la entrada está vacía o no contiene información significativa, el sistema explica qué debe completar y conserva la pantalla.
- Si la entrada está en un idioma distinto del inglés, comienza la variante de idioma de `UF-03`.
- Si el visitante elige `Sign in`, comienza `UF-06` sin crear una nueva solicitud.
- Abrir términos, privacidad o condiciones comerciales no elimina la solicitud en curso.

#### Resultado

Existe una solicitud anónima persistida con la intención inicial.

### UF-02 Completar el onboarding y confirmar el objetivo

**Actor:** Visitante.

**Disparador:** Existe una intención inicial válida.

**Precondiciones:** Solicitud anónima en estado `Draft`.

#### Recorrido principal

1. El sistema solicita el nivel de experiencia.
2. El visitante selecciona exactamente uno: `None`, `Basic`, `Intermediate` o `Advanced`.
3. Puede describir opcionalmente conocimientos previos, estudios, experiencia o dificultades.
4. El sistema solicita el resultado que espera alcanzar.
5. El visitante explica qué quiere poder comprender, distinguir, explicar, comparar, analizar o evaluar.
6. El sistema clasifica la compatibilidad de la solicitud.
7. Si la intención necesita precisión, el sistema presenta entre dos y cinco recortes relevantes y una opción de texto libre cuando corresponda.
8. El visitante selecciona o escribe el objeto de aprendizaje específico.
9. Auteur formula un objetivo alcanzable utilizando la intención, el nivel, el contexto, el resultado esperado y la precisión.
10. El visitante revisa el objetivo.
11. Confirma que representa lo que busca.
12. El objetivo confirmado queda versionado y comienza `UF-04`.

#### Variantes y errores

- Si la intención ya es suficientemente específica, se omite el paso de precisión.
- El visitante puede volver a un paso anterior sin perder datos posteriores que sigan siendo compatibles.
- Si modifica información que invalida la precisión o el objetivo, el sistema advierte qué resultados se reemplazarán y recalcula las etapas dependientes.
- Si el objetivo no representa lo que busca, el visitante solicita una corrección en texto libre y vuelve a revisarlo.
- El ritmo o esfuerzo semanal no se solicita en el MVP.

#### Resultado

La solicitud contiene intención, nivel, contexto opcional, resultado esperado, precisión cuando corresponda y una versión confirmada del objetivo.

### UF-03 Tratar una solicitud ambigua, práctica o incompatible

**Actor:** Visitante.

**Disparador:** La validación detecta un problema de idioma, precisión, compatibilidad o seguridad.

**Precondiciones:** Existe una solicitud en onboarding.

#### Variante A: entrada no inglesa

1. El sistema detecta que la entrada no está escrita en inglés.
2. Solicita al visitante que la reformule en inglés.
3. No traduce automáticamente ni genera propuestas en otro idioma.
4. El visitante reemplaza la entrada y retoma `UF-02`.

#### Variante B: intención amplia o ambigua

1. El sistema conserva la intención de fondo.
2. Explica que necesita precisar qué parte del campo se estudiará.
3. Presenta opciones de precisión relevantes y una opción libre cuando corresponda.
4. El visitante selecciona una opción y continúa con la formulación del objetivo.

#### Variante C: solicitud práctica reformulable

1. El sistema clasifica la solicitud como `Allowed with reframing`.
2. Explica qué parte no puede enseñarse honestamente mediante texto y audio.
3. Propone un objetivo teórico, histórico, crítico, conceptual o metodológico relacionado con la intención original.
4. El visitante confirma la reformulación o vuelve a editar su intención.

#### Variante D: solicitud incompatible

1. El sistema clasifica la solicitud como `Incompatible`.
2. Explica por qué el resultado depende de una demostración visual, corporal, manual, procedimental o insegura.
3. Si existe una alternativa teórica segura y honesta, la ofrece sin presentarla como equivalente al resultado original.
4. No genera propuestas ni permite avanzar al checkout con la solicitud incompatible.

#### Resultado

La solicitud vuelve a un camino compatible o finaliza sin propuestas y sin consumo comercial.

### UF-04 Recibir, comparar y seleccionar propuestas

**Actor:** Visitante.

**Disparador:** Confirma un objetivo.

**Precondiciones:** Objetivo vigente y solicitud compatible.

#### Recorrido principal

1. El sistema genera entre una y cinco propuestas sustantivamente diferentes.
2. Cada propuesta muestra título, descripción, pregunta central, resultado, recorrido distintivo, alcance, exclusiones, nivel estimado, duración aproximada y trade-off.
3. Si existe una opción claramente más adecuada, el sistema la recomienda con una razón concreta.
4. El visitante compara las propuestas.
5. Selecciona una sola propuesta.
6. La propuesta queda asociada a la solicitud y el estado pasa a `Awaiting account`.
7. Comienza `UF-06`.

#### Variantes y errores

- El sistema puede devolver menos de cinco propuestas cuando no existan alternativas genuinas.
- No se crean variantes cosméticas para completar una cantidad.
- El visitante puede volver y modificar entradas sustantivas.
- Si modifica entradas, el sistema advierte que las propuestas actuales dejarán de ser vigentes.
- Al confirmar la modificación, se crea un nuevo conjunto y el anterior no puede seleccionarse accidentalmente.
- Cambiar la selección dentro del conjunto vigente no consume créditos.

#### Resultado

Existe una única propuesta vigente seleccionada y todavía no se generaron Blueprint ni lecciones.

### UF-05 Reanudar o perder una sesión anónima

**Actor:** Visitante.

**Disparador:** Abandona y luego vuelve al onboarding antes de registrarse.

**Precondiciones:** Existió una solicitud anónima.

#### Recorrido principal

1. El visitante vuelve mientras la sesión anónima sigue vigente.
2. El sistema recupera el último paso persistido.
3. Restaura intención, respuestas, precisión, objetivo y propuesta seleccionada disponibles.
4. El visitante continúa desde el punto correcto.

#### Variante: sesión expirada

1. El sistema detecta que la sesión ya no puede recuperarse.
2. Informa claramente que la información anterior expiró.
3. Ofrece comenzar una nueva solicitud.
4. No presenta un formulario vacío como si hubiera restaurado el progreso.

#### Resultado

La solicitud se reanuda de forma consistente o el visitante comienza una nueva con conocimiento explícito de la pérdida.

## Flujos de autenticación y conversión

### UF-06 Registrarse o iniciar sesión conservando el contexto

**Actor:** Visitante.

**Disparador:** Selecciona una propuesta o elige `Sign in`.

**Precondiciones:** Para continuar una creación, existe una solicitud anónima con propuesta seleccionada.

#### Recorrido principal: registro

1. El sistema ofrece registro mediante Google o email.
2. El visitante completa un método de acceso válido.
3. Si corresponde, verifica su email.
4. El sistema crea o identifica una única cuenta para la identidad validada.
5. Asocia de forma segura la solicitud anónima con la cuenta.
6. Recupera la propuesta seleccionada.
7. El usuario continúa en `UF-07` sin repetir el onboarding.

#### Recorrido principal: inicio de sesión

1. El visitante selecciona Google o email.
2. Completa la autenticación.
3. El sistema asocia o recupera la solicitud cuando corresponde.
4. Si venía de una propuesta, vuelve a esa propuesta y continúa en `UF-07`.
5. Si inició sesión sin una solicitud, abre la biblioteca o destino originalmente solicitado.

#### Variantes y errores

- Un error de autenticación no elimina la solicitud anónima.
- Los mensajes no revelan si una cuenta de terceros existe.
- Los enlaces de verificación y recuperación vencidos permiten solicitar uno nuevo.
- No deben crearse cuentas duplicadas evidentes para una misma identidad validada.

#### Resultado

Existe un cliente autenticado con la solicitud y propuesta correctas asociadas.

### UF-07 Suscribirse y completar el checkout

**Actor:** Cliente.

**Disparador:** Continúa después de autenticarse con una propuesta seleccionada.

**Precondiciones:** Cuenta activa, objetivo confirmado y propuesta vigente.

#### Recorrido principal

1. El sistema muestra el único plan disponible.
2. Presenta precio, moneda, frecuencia, renovación, beneficio de bienvenida, créditos y condiciones de cancelación.
3. El cliente inicia el checkout de Stripe.
4. Stripe procesa el pago.
5. El sistema confirma el evento auténtico e idempotente.
6. La suscripción pasa a `Active`.
7. El beneficio de bienvenida queda disponible en la cuenta.
8. El cliente vuelve a la propuesta seleccionada.
9. Comienza `UF-09`.
10. El sistema envía una única confirmación de suscripción y pago.

#### Variantes y errores

- Cancelar o abandonar el checkout conserva la solicitud y propuesta sin activar la suscripción.
- Un evento duplicado no crea una segunda suscripción ni asigna beneficios o créditos adicionales.
- Un pago pendiente mantiene la suscripción en `Pending` y no permite generar el Blueprint.

#### Resultado

La cuenta posee una suscripción activa y conserva el contexto necesario para solicitar el Blueprint.

### UF-08 Recuperarse de un pago fallido

**Actor:** Cliente.

**Disparador:** Stripe rechaza el checkout o una renovación.

**Precondiciones:** Existe una operación comercial iniciada.

#### Recorrido principal

1. El sistema recibe y valida el estado de pago fallido.
2. Informa que el pago no pudo completarse y qué acciones siguen disponibles.
3. No activa la suscripción ni inicia el Blueprint si se trata del primer pago.
4. Conserva la solicitud, el objetivo y la propuesta seleccionada.
5. Permite actualizar el medio de pago o reintentar mediante Stripe.
6. Si el pago se confirma, actualiza la suscripción una sola vez.
7. El cliente retoma el punto donde estaba.

#### Renovación fallida

- La suscripción pasa a `Past due` según la confirmación comercial.
- Se bloquean nuevas generaciones mientras el estado no habilite el beneficio.
- Los cursos existentes, el audio y el progreso permanecen accesibles.
- Se envía un único aviso de pago fallido o acción requerida.

#### Resultado

El pago se recupera sin duplicaciones o la cuenta conserva acceso de lectura con nuevas generaciones bloqueadas.

## Flujos de Blueprint y generación

### UF-09 Generar y revisar el Blueprint inicial

**Actor:** Cliente.

**Disparador:** Continúa desde una propuesta seleccionada con suscripción activa.

**Precondiciones:** Usuario autenticado, suscripción `Active`, objetivo confirmado y propuesta vigente.

#### Recorrido principal

1. El cliente solicita continuar con la propuesta elegida.
2. El sistema valida todas las precondiciones.
3. La solicitud pasa a `Blueprint generating`.
4. Auteur realiza la investigación de orientación necesaria.
5. Genera una versión completa del Blueprint.
6. La solicitud pasa a `Awaiting approval`.
7. El cliente recibe una notificación de Blueprint disponible.
8. Abre el Blueprint y revisa objetivo, alcance, exclusiones, supuestos, estructura, progresión, estimaciones y justificación.
9. El sistema informa qué beneficio o crédito se utilizará al aprobar.

#### Variantes y errores

- Si falta una precondición, el sistema bloquea el proceso y explica cómo resolverla.
- Un timeout o cierre de pantalla no elimina el proceso; al volver se muestra el estado real.
- Generar el Blueprint no reserva ni consume créditos.
- La información interna de generación no se presenta como JSON, razonamiento privado ni instrucciones del sistema.

#### Resultado

Existe una versión vigente del Blueprint pendiente de decisión del cliente.

### UF-10 Solicitar cambios en el Blueprint

**Actor:** Cliente.

**Disparador:** El Blueprint vigente no representa adecuadamente el recorrido esperado.

**Precondiciones:** Blueprint en estado `Awaiting approval`.

#### Recorrido principal

1. El cliente selecciona solicitar cambios.
2. Describe el ajuste en texto libre o corrige un supuesto permitido.
3. El sistema conserva la versión anterior para trazabilidad.
4. Genera una nueva versión completa del Blueprint.
5. Invalida cualquier aprobación anterior.
6. Presenta la nueva versión como vigente.
7. El cliente vuelve a revisar y puede aprobar, pedir otra revisión, elegir otra propuesta o cancelar.

#### Variantes y errores

- La revisión nunca produce lecciones completas.
- Las revisiones previas a la aprobación no consumen créditos.
- Si el cliente vuelve a elegir una propuesta, el Blueprint actual deja de ser aprobable y comienza `UF-09` con la selección nueva.
- Cancelar antes de aprobar conserva suscripción, beneficio y créditos.

#### Resultado

Existe una nueva versión pendiente de aprobación o la solicitud queda cancelada sin consumo.

### UF-11 Aprobar el Blueprint e iniciar el build

**Actor:** Cliente.

**Disparador:** Decide construir la versión visible del Blueprint.

**Precondiciones:** Blueprint vigente, suscripción activa y beneficio de bienvenida o crédito disponible.

#### Recorrido principal

1. El cliente selecciona aprobar.
2. El sistema confirma que la versión aprobada es la versión visible.
3. Confirma que no existe otro build activo para el usuario.
4. Reserva el beneficio de bienvenida o un crédito.
5. Crea un build persistido asociado al Blueprint y a una única operación comercial.
6. Cuando el build comienza correctamente, confirma el consumo del entitlement.
7. El build pasa a `Queued` y luego a `Researching`.
8. El cliente ve la pantalla de generación con su estado real.
9. Comienza `UF-13`.

#### Variantes y errores

- Dos clics o solicitudes equivalentes producen un único build y un único consumo.
- Si el Blueprint cambió, se rechaza la aprobación y se solicita revisar la versión nueva.
- Si existe otro build activo, el sistema no crea uno nuevo y dirige al cliente al proceso existente.
- Si la creación del build falla antes del trabajo persistido, libera la reserva.
- El cliente no puede cancelar directamente un build ya iniciado.

#### Resultado

Existe un único build activo y un único entitlement correctamente reservado o consumido.

### UF-12 Intentar generar sin beneficio o créditos

**Actor:** Cliente.

**Disparador:** Intenta aprobar un Blueprint sin entitlement disponible.

**Precondiciones:** Cuenta autenticada y Blueprint vigente.

#### Recorrido principal

1. El sistema detecta que no existe beneficio de bienvenida ni crédito disponible.
2. No crea un build ni consume una operación comercial.
3. Explica la causa del bloqueo.
4. Muestra la fecha de renovación cuando está disponible.
5. Permite volver a la biblioteca o gestionar la suscripción.

#### Resultado

El Blueprint permanece disponible y sin aprobación efectiva hasta que exista un entitlement.

### UF-13 Seguir la generación y comenzar con contenido parcial

**Actor:** Cliente.

**Disparador:** Existe un build activo.

**Precondiciones:** Blueprint aprobado y build persistido.

#### Recorrido principal

1. El sistema muestra la etapa real del build sin porcentajes o tiempos inventados.
2. Investiga y construye los módulos en el orden aprobado.
3. Cada módulo atraviesa `Queued`, `Researching`, `Writing` y `QA`.
4. Un módulo se publica únicamente cuando todas sus lecciones, fuentes, síntesis y Knowledge Check están completos.
5. Al publicarse el primer módulo, el curso pasa a `Partially available`.
6. El cliente recibe una única notificación de que puede comenzar.
7. Puede abrir el módulo publicado mientras los siguientes continúan en construcción.
8. El sistema distingue claramente contenido disponible de contenido futuro.
9. Al publicarse todas las unidades y la síntesis final, el build pasa a `Complete`.
10. El cliente recibe una única notificación de curso completo.

#### Variantes y errores

- Cerrar la pantalla, navegar o cerrar sesión no detiene el proceso.
- Al regresar, el cliente ve el mismo estado o uno posterior válido.
- No se muestran placeholders, borradores ni lecciones parcialmente escritas.
- Una corrección posterior crea una nueva versión sin perder la identidad del curso ni el progreso compatible.

#### Resultado

El curso queda parcial o completamente disponible y aparece en la biblioteca con el estado correspondiente.

### UF-14 Recuperarse de un fallo de generación

**Actor:** Cliente y administrador.

**Disparador:** Falla una etapa del build o no existe evidencia suficiente.

**Precondiciones:** Build iniciado.

#### Recorrido automático

1. El sistema registra etapa, unidad, intento y diagnóstico operativo.
2. Reintenta automáticamente la unidad hasta un máximo inicial de tres intentos.
3. Si falta evidencia, investiga nuevamente, reduce la afirmación o bloquea el módulo.
4. Conserva módulos ya publicados y toda información confirmada.
5. Si se recupera, continúa desde la última unidad consistente.

#### Fallo definitivo

1. El build pasa a `Failed`.
2. El sistema genera una referencia operativa consultable por administración.
3. Explica al cliente qué ocurrió, qué se conservó y qué puede hacer.
4. Si la causa es técnica o atribuible al sistema, restaura una sola vez el beneficio o crédito.
5. Envía una única notificación de fallo y restitución.
6. El administrador puede continuar con `UF-25`.

#### Resultado

El build continúa de forma consistente o queda fallido con diagnóstico, contenido válido preservado y entitlement restituido cuando corresponde.

## Flujos de aprendizaje y biblioteca

### UF-15 Abrir o retomar un curso

**Actor:** Cliente.

**Disparador:** Abre la biblioteca o selecciona `Resume course`.

**Precondiciones:** Cuenta activa y al menos un curso o solicitud persistida.

#### Recorrido principal

1. La biblioteca muestra cursos ordenados por actividad reciente.
2. Cada elemento presenta estado de construcción, progreso de aprendizaje y próxima acción.
3. El cliente selecciona un curso.
4. El sistema dirige según su estado:
   - a la última lección si está disponible;
   - al Blueprint si espera aprobación;
   - al estado de construcción si sigue generándose;
   - al diagnóstico si falló.
5. Restaura última lección, completitud, posición de audio y último resultado de los Checks.

#### Resultado

El cliente continúa desde el último estado funcional consistente, no desde una pantalla genérica.

### UF-16 Estudiar y registrar progreso

**Actor:** Cliente.

**Disparador:** Abre una lección publicada.

**Precondiciones:** Curso con al menos un módulo publicado.

#### Recorrido principal

1. El lector muestra el curso, módulos, lecciones y contenido actual.
2. El cliente puede consultar fuentes y controversias sin perder el hilo principal.
3. Navega libremente entre las unidades publicadas.
4. Marca explícitamente una lección como completa.
5. El sistema actualiza el progreso del módulo usando las lecciones publicadas completadas.
6. El cliente puede desmarcar una lección para revisarla nuevamente.
7. Cuando el build está completo y todas las lecciones publicadas están marcadas, el curso pasa a `Completed` para ese usuario.

#### Variantes y errores

- Abrir, leer, escuchar o responder un Check no completa automáticamente una lección.
- Los módulos aún no publicados aparecen identificados, pero no pueden abrirse.
- Un error de red no elimina la última posición o completitud confirmada.
- El resultado del Knowledge Check no condiciona el progreso.

#### Resultado

Última actividad, posición, lecciones completadas y progreso quedan persistidos entre sesiones y dispositivos.

### UF-17 Completar un Knowledge Check

**Actor:** Cliente.

**Disparador:** Abre el Check al final de un módulo.

**Precondiciones:** Módulo publicado con su evaluación completa.

#### Recorrido principal

1. El sistema presenta cinco preguntas de selección simple.
2. Cada pregunta contiene cuatro opciones y una respuesta correcta según lo enseñado.
3. El cliente selecciona y confirma una opción.
4. Después de guardar el intento, el sistema informa si es correcta y explica la respuesta.
5. Al finalizar, muestra el resultado `X/5`.
6. Conserva como mínimo el último resultado.

#### Variantes y errores

- El cliente puede omitir el Check y continuar.
- Puede repetirlo sin afectar créditos ni progreso.
- La respuesta correcta no se muestra antes de confirmar.
- Completar o aprobar el Check no marca automáticamente el módulo como completado.
- Un resultado bajo no bloquea contenido y no se presenta como certificación.

#### Resultado

El intento y su resultado quedan persistidos sin modificar la navegación ni el curso.

### UF-18 Generar y reproducir audio

**Actor:** Cliente.

**Disparador:** Reproduce por primera vez una lección.

**Precondiciones:** Lección publicada y texto disponible.

#### Recorrido principal

1. El audio se encuentra en estado `Not generated`.
2. El cliente selecciona reproducir.
3. El audio pasa a `Generating`.
4. La lectura y navegación permanecen disponibles.
5. Cuando finaliza, pasa a `Ready` y comienza la reproducción.
6. El cliente puede pausar, reanudar, avanzar, retroceder y cambiar velocidad.
7. El sistema conserva posición y velocidad preferida.
8. En reproducciones posteriores reutiliza el audio asociado a esa versión de la lección.

#### Variantes y errores

- Si falla, el audio pasa a `Failed` y ofrece reintentar.
- La falla no bloquea el texto ni cambia el curso a `Failed`.
- Una nueva versión sustantiva de la lección invalida o regenera solamente su audio.
- El MVP no permite descarga directa ni uso offline.

#### Resultado

El audio queda disponible y su progreso se conserva independientemente del progreso de lectura.

### UF-19 Gestionar la biblioteca personal

**Actor:** Cliente.

**Disparador:** Abre su biblioteca.

**Precondiciones:** Usuario autenticado.

#### Recorrido principal

1. El sistema lista solicitudes y cursos relevantes por actividad reciente.
2. Muestra título, nombre personalizado, objetivo, enfoque, nivel, estado, progreso, última actividad y próxima acción.
3. El cliente puede abrir y retomar cada elemento desde su estado correcto.
4. Puede asignar un nombre personal a un curso.
5. El nombre personalizado se muestra sin alterar el título editorial interno.
6. Puede restaurar el título visible original.

#### Límites

- No existen búsqueda, filtros, carpetas, etiquetas, orden manual ni duplicación.
- La biblioteca sigue accesible con suscripción inactiva mientras exista la cuenta.

#### Resultado

La biblioteca refleja el estado real y permite continuidad sin modificar el contenido editorial.

### UF-20 Eliminar un curso

**Actor:** Cliente.

**Disparador:** Selecciona eliminar desde la biblioteca.

**Precondiciones:** El curso no posee un build activo.

#### Recorrido principal

1. El sistema muestra una confirmación que identifica el curso.
2. Explica que se eliminarán el acceso y el progreso y que no se devolverán créditos.
3. El cliente confirma.
4. El sistema elimina el curso de la biblioteca y su progreso asociado según la política vigente.
5. La acción no puede deshacerse dentro del MVP.

#### Variantes y errores

- Si existe un build activo, la acción no está disponible y se explica el motivo.
- Salir de la confirmación no modifica datos.
- Repetir la operación no produce efectos adicionales ni restituye créditos.

#### Resultado

El curso deja de estar accesible y el saldo comercial permanece sin cambios.

## Flujos de cuenta y suscripción

### UF-21 Gestionar cuenta y facturación

**Actor:** Cliente.

**Disparador:** Abre la configuración de cuenta.

**Precondiciones:** Usuario autenticado.

#### Recorrido principal

1. Consulta y modifica nombre visible y datos básicos permitidos.
2. Consulta estado, importe, frecuencia y fecha de renovación o finalización del plan.
3. Consulta créditos disponibles y beneficio de bienvenida.
4. Accede a comprobantes disponibles.
5. Actualiza el medio de pago mediante una superficie segura de Stripe.
6. Los cambios válidos se reflejan sin alterar identidad, historial o cursos.

#### Límites y errores

- No existe selector de idioma en el MVP.
- La plataforma no muestra ni almacena datos completos de tarjeta.
- Una sesión expirada redirige a `UF-06` o `UF-23` conservando el destino seguro.

#### Resultado

La cuenta refleja datos y estado comercial confirmados sin afectar el aprendizaje.

### UF-22 Cancelar o reactivar la suscripción

**Actor:** Cliente.

**Disparador:** Solicita cancelar o reactivar desde su cuenta.

**Precondiciones:** Usuario autenticado con una suscripción conocida.

#### Cancelación

1. El sistema muestra la fecha efectiva y las consecuencias.
2. El cliente confirma la cancelación.
3. La suscripción pasa a `Cancellation scheduled`.
4. Conserva beneficios hasta el final del período pago.
5. Se envía una única confirmación por email.
6. Al finalizar el período, pasa a `Canceled` o `Inactive`.
7. Se bloquean nuevos Blueprints y cursos.
8. Cursos existentes, fuentes, audio, Knowledge Checks y progreso siguen accesibles mientras exista la cuenta.

#### Reactivación

1. El cliente selecciona reactivar.
2. Completa cualquier acción requerida por Stripe.
3. El sistema espera la confirmación auténtica del estado.
4. Cuando vuelve a `Active`, habilita nuevas generaciones sin duplicar la suscripción ni alterar cursos existentes.

#### Resultado

El acceso comercial cambia, pero el estado de construcción y aprendizaje de los cursos permanece independiente.

### UF-23 Recuperar acceso a la cuenta

**Actor:** Cliente.

**Disparador:** No puede iniciar sesión o solicita recuperar el acceso.

**Precondiciones:** Utiliza un método compatible.

#### Recorrido principal

1. El cliente solicita recuperación mediante email.
2. El sistema responde sin revelar si la cuenta existe.
3. Envía un enlace sensible y temporal cuando corresponde.
4. El cliente abre un enlace válido y recupera el acceso.
5. El sistema invalida el enlace según la política de seguridad.
6. Redirige al destino previo cuando sea seguro o a la biblioteca.

#### Variantes y errores

- Un enlace vencido o utilizado no permite continuar y ofrece solicitar uno nuevo.
- Los errores no exponen credenciales ni información de terceros.
- El proceso no altera cursos, pagos ni progreso.

#### Resultado

El cliente recupera una sesión válida sin pérdida de información.

## Flujos administrativos

### UF-24 Gestionar usuarios y suspensiones

**Actor:** Administrador.

**Disparador:** Abre la gestión de usuarios.

**Precondiciones:** Sesión con rol administrativo validado del lado servidor.

#### Recorrido principal

1. Lista y consulta usuarios.
2. Abre un usuario y consulta estado de cuenta, suscripción, beneficio, créditos, cursos y builds.
3. Selecciona suspender o habilitar.
4. El sistema solicita confirmación y motivo cuando corresponda.
5. Registra administrador, entidad, operación, fecha, motivo y resultado.

#### Efecto de suspensión

- Impide nuevas sesiones y generaciones.
- No elimina datos.
- No cancela automáticamente la suscripción.
- No modifica automáticamente cursos ni pagos.

#### Variantes y errores

- Un cliente nunca accede a este flujo mediante URL o manipulación de interfaz.
- Un error no deja un estado visual distinto del estado persistido.

#### Resultado

El estado del usuario se modifica de manera auditable y separada de la gestión comercial.

### UF-25 Gestionar builds fallidos o bloqueados

**Actor:** Administrador.

**Disparador:** Consulta un build con error, bloqueo o intervención requerida.

**Precondiciones:** Rol administrativo y build persistido.

#### Recorrido principal

1. Localiza el build por usuario, estado, fecha o referencia de error.
2. Consulta Blueprint aprobado, módulos, etapa actual, último error e intentos.
3. Decide reintentar una unidad fallida, cancelar operativamente un build bloqueado o mantenerlo para análisis.
4. El sistema ejecuta la acción de forma idempotente.
5. Registra administrador, acción, motivo, fecha y resultado.
6. Si corresponde, restituye el entitlement una sola vez.

#### Variantes y errores

- Reintentar no crea otro build ni duplica consumo.
- Cancelar un build no elimina módulos ya publicados.
- El panel no permite editar manualmente las lecciones como un CMS.
- Los detalles visibles no exponen secretos ni cadenas privadas de razonamiento.

#### Resultado

El build queda recuperado, cancelado o diagnosticado con trazabilidad completa.

### UF-26 Ajustar créditos

**Actor:** Administrador.

**Disparador:** Necesita corregir o compensar el saldo de una cuenta.

**Precondiciones:** Rol administrativo y usuario identificado.

#### Recorrido principal

1. Consulta beneficio, saldo y operaciones comerciales del usuario.
2. Selecciona el ajuste permitido.
3. Ingresa un motivo obligatorio.
4. Confirma la operación.
5. El sistema aplica el cambio una sola vez.
6. Registra administrador, valor anterior, ajuste, valor resultante, motivo, fecha y resultado.

#### Variantes y errores

- Un reintento no duplica el ajuste.
- El ajuste no se presenta como tokens técnicos de IA.
- No modifica automáticamente Stripe ni la suscripción salvo una operación comercial separada y autorizada.

#### Resultado

El saldo queda actualizado y auditado.

### UF-27 Gestionar configuración comercial

**Actor:** Administrador.

**Disparador:** Modifica valores comerciales configurables.

**Precondiciones:** Rol administrativo autorizado.

#### Recorrido principal

1. Consulta precio visible, moneda, periodicidad y cantidad de créditos del único plan.
2. Modifica un valor permitido.
3. Revisa el impacto visible.
4. Confirma el cambio.
5. El sistema registra la operación y utiliza la configuración vigente en los recorridos futuros.

#### Límites y errores

- El flujo no crea planes complejos, promociones, cupones, trials ni referidos.
- El panel no muestra ni permite copiar secretos de OpenAI, ElevenLabs, Stripe o infraestructura.
- La configuración no reescribe silenciosamente operaciones históricas.

#### Resultado

Los valores comerciales permitidos quedan actualizados y auditados.

## Flujo transversal del sistema

### UF-28 Enviar notificaciones transaccionales

**Actor:** Sistema.

**Disparador:** Ocurre un evento notificable confirmado.

**Precondiciones:** Evento persistido y destinatario válido.

#### Eventos mínimos

- verificación de email;
- recuperación de acceso;
- suscripción y pago confirmados;
- pago fallido o acción requerida;
- cancelación programada;
- cancelación efectiva;
- Blueprint disponible;
- primer módulo publicado;
- curso completo;
- fallo definitivo de generación;
- restitución de beneficio o crédito.

#### Recorrido principal

1. El sistema confirma que el evento es real y está persistido.
2. Verifica que la misma notificación no se haya enviado para ese evento y destinatario.
3. Compone el mensaje en inglés.
4. Evita incluir prompts internos, secretos, datos de pago o contenido privado innecesario.
5. Envía el mensaje.
6. Registra evento, destinatario, fecha y resultado.

#### Variantes y errores

- Un reintento o webhook duplicado no genera emails repetidos.
- Una falla de email se reintenta de forma independiente y no revierte la operación que originó el mensaje.
- Los enlaces a información privada requieren autenticación.

#### Resultado

La notificación se envía una sola vez o queda registrada para recuperación sin alterar el evento principal.

## Reglas transversales para todos los flujos

### Persistencia

- Toda transición relevante debe persistirse antes de mostrarse como completada.
- Recargar, cerrar la pantalla o perder la conexión no debe retroceder a un estado ficticio.
- La información confirmada no se elimina silenciosamente.

### Estados independientes

- El estado del build describe construcción.
- El progreso describe aprendizaje.
- La suscripción describe acceso comercial.
- Cambiar uno no debe modificar los otros salvo una regla explícita.

### Idempotencia

Doble clic, reintento o evento duplicado no puede crear dos cuentas, suscripciones, builds, consumos, restituciones, ajustes o notificaciones equivalentes.

### Errores

Todo error visible debe explicar:

1. qué ocurrió;
2. qué información se conservó;
3. qué puede hacer el usuario;
4. cómo identificar el problema ante soporte cuando corresponda.

### Accesibilidad y responsive

- Todos los recorridos críticos deben funcionar con teclado.
- El foco debe ser visible y seguir un orden lógico.
- Los errores deben asociarse al campo correspondiente.
- Ningún estado debe comunicarse solamente mediante color.
- Los flujos deben funcionar en escritorio y móvil sin scroll horizontal obligatorio.
- El zoom de hasta 200 % no debe impedir completar acciones.

### Seguridad y privacidad

- Toda operación privada valida identidad, rol y propiedad del recurso.
- Las claves privadas y datos completos de tarjeta nunca se muestran al cliente.
- Los prompts y logs no incluyen credenciales, tarjetas ni datos personales innecesarios.
- Los enlaces sensibles vencen y las rutas administrativas se protegen del lado servidor.

## Matriz de estados y destinos

| Entidad | Estado | Destino principal del usuario |
| --- | --- | --- |
| Solicitud | `Draft` | Continuar onboarding |
| Solicitud | `Precision required` | Elegir o escribir precisión |
| Solicitud | `Objective confirmation` | Confirmar o corregir objetivo |
| Solicitud | `Proposals ready` | Comparar propuestas |
| Solicitud | `Awaiting account` | Registrarse o iniciar sesión |
| Solicitud | `Awaiting subscription` | Completar checkout |
| Solicitud | `Blueprint generating` | Ver estado real y esperar |
| Solicitud | `Awaiting approval` | Revisar Blueprint |
| Solicitud | `Canceled` | Volver a biblioteca o iniciar otra intención |
| Build | `Queued` | Ver estado de generación |
| Build | `Researching` | Ver estado de generación |
| Build | `Generating` | Ver módulo actual |
| Build | `Reviewing` | Ver estado de control de calidad |
| Build | `Partially available` | Comenzar módulo publicado o seguir esperando |
| Build | `Complete` | Abrir o retomar curso |
| Build | `Failed` | Consultar diagnóstico o intervención |
| Build | `Canceled` | Consultar resultado y biblioteca |
| Audio | `Not generated` | Iniciar reproducción y generación |
| Audio | `Generating` | Seguir leyendo o navegando |
| Audio | `Ready` | Reproducir o retomar |
| Audio | `Failed` | Reintentar o continuar leyendo |
| Suscripción | `Pending` | Esperar o recuperar pago |
| Suscripción | `Active` | Generar y aprender |
| Suscripción | `Past due` | Actualizar pago; conservar cursos |
| Suscripción | `Cancellation scheduled` | Usar beneficios hasta la fecha efectiva |
| Suscripción | `Canceled` | Aprender; reactivar para generar |
| Suscripción | `Inactive` | Aprender; suscribirse para generar |

## Criterios de aceptación del documento

La implementación de estos flujos debe permitir comprobar que:

- un visitante obtiene valor antes de registrarse y pagar;
- una intención amplia, específica, no inglesa, práctica e incompatible sigue el camino correcto;
- registro, login y checkout no pierden el contexto;
- el Blueprint exige revisión y aprobación explícita;
- las revisiones no consumen créditos;
- solamente existe un build activo por usuario;
- los módulos se publican completos y progresivamente;
- el aprendizaje puede comenzar antes de completar todo el build;
- audio y Knowledge Checks no bloquean la lectura;
- el progreso se conserva entre dispositivos;
- cancelar la suscripción no bloquea cursos existentes;
- las operaciones repetidas no duplican efectos;
- los fallos conservan datos válidos y permiten recuperación;
- los administradores pueden intervenir sin acceder a secretos ni editar manualmente el contenido;
- todos los recorridos críticos funcionan en escritorio y móvil.

## Relación con otros documentos

- `PRODUCT.md`: define identidad, usuario, valor y principios.
- `MVP.md`: determina qué capacidades forman parte de la primera versión.
- `BUSINESS_RULES.md`: formaliza condiciones, restricciones y transiciones utilizadas por estos flujos.
- `AI_GENERATION.md`: especifica el comportamiento interno de los procesos generativos.
- `DATA_MODEL.md`: define qué información y estados deben persistirse.
- `INTEGRATIONS.md`: define las interacciones con servicios externos.
- `DECISIONS.md`: registra decisiones aprobadas y preguntas pendientes.
- `ARCHITECTURE.md`: determina cómo implementar técnicamente estos recorridos.
