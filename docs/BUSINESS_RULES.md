# BUSINESS_RULES.md

# Auteur Education

**Versión:** 1.0

**Estado:** Aprobado

**Ubicación canónica:** `docs/BUSINESS_RULES.md`

## Propósito de este documento

Este archivo define las reglas de negocio verificables del MVP de Auteur Education. Convierte los principios, el alcance y los flujos aprobados en condiciones que la implementación debe respetar de forma consistente, independientemente de la interfaz o la arquitectura técnica elegida.

Una regla de negocio expresa una obligación, prohibición, condición o consecuencia funcional. Las cantidades descritas como referencias pedagógicas no deben convertirse en límites rígidos salvo que una regla lo indique expresamente.

## Instrucciones de uso para agentes

- Leer `PRODUCT.md`, `MVP.md` y `USER_FLOWS.md` antes de implementar reglas de este archivo.
- Utilizar los identificadores `BR-XXX-000` como referencias estables en planes, código, pruebas, incidencias y commits.
- Implementar cada regla aplicable tanto en el recorrido principal como en reintentos, eventos duplicados y recuperaciones.
- Validar autorización, disponibilidad comercial y transiciones críticas del lado servidor; la interfaz no es una barrera suficiente.
- No transformar referencias, ejemplos o rangos habituales en cuotas rígidas.
- No inferir nuevas reglas a partir del proveedor, la interfaz o una decisión técnica.
- Si una solicitud contradice una regla aprobada, detener la implementación y registrar la contradicción en `DECISIONS.md`.
- Si falta una decisión necesaria, no inventarla: registrarla como pendiente en `DECISIONS.md`.
- Los textos visibles del producto deben implementarse en inglés, aunque este documento esté escrito en español.

## Autoridad y precedencia

En caso de contradicción, aplicar este orden:

1. decisiones posteriores aprobadas y registradas en `DECISIONS.md`;
2. `MVP.md`;
3. `BUSINESS_RULES.md`;
4. `USER_FLOWS.md`;
5. `PRODUCT.md`;
6. definición funcional y relevamientos anteriores.

Una fuente de menor prioridad nunca amplía por sí sola el alcance del MVP. Toda contradicción detectada debe registrarse y resolverse; no debe corregirse silenciosamente desde el código.

## Convenciones

- **Regla:** obligación o restricción funcional.
- **Consecuencia verificable:** comportamiento observable que debe poder demostrarse mediante una prueba.
- **Entitlement:** derecho comercial utilizado para iniciar un curso; puede ser el beneficio de bienvenida o un crédito de generación.
- **Versión vigente:** única versión que puede continuar hacia la etapa siguiente.
- **Build:** proceso persistido de investigación, generación, revisión y publicación de un curso.

## 1. Roles, identidad y autorización

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-AUT-001` | El sistema reconoce tres actores humanos: visitante, cliente y administrador. | Cada capacidad queda disponible únicamente para el actor autorizado. |
| `BR-AUT-002` | Un cliente solo puede acceder a sus propias solicitudes, Blueprints, cursos, audios, progreso y datos comerciales. | Un identificador ajeno o una ruta manipulada produce denegación sin revelar información privada. |
| `BR-AUT-003` | La administración requiere un rol diferenciado y validado del lado servidor. | Un cliente no obtiene acceso administrativo modificando rutas, parámetros o estado local. |
| `BR-AUT-004` | El registro o inicio de sesión se solicita después de seleccionar una propuesta y antes del checkout. | El visitante puede llegar a una propuesta sin cuenta y no puede pagar anónimamente. |
| `BR-AUT-005` | El registro o login debe conservar y asociar de forma segura la solicitud anónima y su propuesta vigente. | El usuario autenticado continúa desde la propuesta seleccionada sin repetir el onboarding. |
| `BR-AUT-006` | Los métodos de acceso del MVP son Google y email, con verificación y recuperación seguras cuando corresponda. | Las credenciales inválidas, enlaces vencidos o recuperaciones fallidas no crean acceso ni eliminan el contexto recuperable. |
| `BR-AUT-007` | Una misma identidad validada no debe producir cuentas duplicadas evidentes. | Reintentos o métodos vinculados resuelven una única cuenta conforme a la política de identidad. |
| `BR-AUT-008` | Suspender un usuario bloquea nuevas sesiones y nuevas generaciones, pero no elimina automáticamente sus datos ni modifica su suscripción. | La suspensión y la eliminación de datos o cancelación comercial son operaciones independientes. |

## 2. Idioma y onboarding

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-ONB-001` | Interfaz, entradas, objetivos, propuestas, Blueprints, cursos, audios, Knowledge Checks, mensajes y emails del MVP funcionan exclusivamente en inglés. | Una entrada no inglesa no avanza hacia propuestas ni contenido. |
| `BR-ONB-002` | El sistema no traduce automáticamente entradas ni genera cursos en otros idiomas dentro del MVP. | Ante otro idioma solicita una reformulación en inglés y conserva el recorrido recuperable. |
| `BR-ONB-003` | El usuario puede iniciar con una intención temática, una pregunta o una capacidad deseada en texto libre. | No se le exige redactar un prompt técnico ni conocer la estructura de un curso. |
| `BR-ONB-004` | El nivel debe ser exactamente uno de `None`, `Basic`, `Intermediate` o `Advanced`. | No se persisten valores alternativos ni múltiples niveles simultáneos. |
| `BR-ONB-005` | Los conocimientos previos son opcionales y no reemplazan la selección de nivel. | El sistema acepta el campo vacío y no inventa experiencia ausente. |
| `BR-ONB-006` | Nivel y conocimientos previos modifican punto de entrada, lenguaje, profundidad, recapitulación, ejemplos, fuentes y razonamiento exigido. | Dos usuarios con preparación distinta no reciben únicamente un cambio superficial de tono. |
| `BR-ONB-007` | El ritmo, las horas semanales y un calendario personal de cursada no forman parte del onboarding del MVP. | Ninguno de esos datos es obligatorio para avanzar. |
| `BR-ONB-008` | Antes de confirmar el objetivo, el usuario puede modificar respuestas previas. | Los datos posteriores compatibles se conservan; los resultados dependientes incompatibles se invalidan y recalculan. |
| `BR-ONB-009` | La solicitud anónima debe persistir temporalmente y poder reanudarse mientras su sesión siga vigente. | Al regresar se recupera el último paso real; si expiró, se informa la pérdida y se ofrece reiniciar. |

## 3. Compatibilidad, precisión y objetivo

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-OBJ-001` | Toda solicitud se clasifica como `Allowed`, `Allowed with reframing` o `Incompatible` antes de generar propuestas. | Solo una solicitud compatible o reformulada puede continuar. |
| `BR-OBJ-002` | El contenido debe poder comprenderse plenamente mediante texto y audio. | Una habilidad dependiente de demostración visual, corporal, manual o procedimental no se promete como resultado del curso. |
| `BR-OBJ-003` | Una solicitud práctica reformulable conserva su intención y se convierte en un objetivo teórico, histórico, crítico, conceptual o metodológico honesto. | La alternativa se presenta como reformulación y no como equivalente al dominio práctico original. |
| `BR-OBJ-004` | Una solicitud incompatible no puede llegar al checkout ni producir propuestas como si fuera realizable. | El sistema explica el límite y, si existe, ofrece una alternativa segura. |
| `BR-OBJ-005` | Solicitudes de salud, derecho, finanzas, seguridad, armas u otros ámbitos sensibles se limitan a alfabetización general y contenido teórico seguro, o se rechazan. | No se generan instrucciones personalizadas de alto impacto. |
| `BR-OBJ-006` | Si la intención es amplia o ambigua, el sistema ofrece entre dos y cinco objetos de aprendizaje relevantes y texto libre cuando corresponda. | Las opciones precisan el objeto; no son todavía propuestas completas de curso. |
| `BR-OBJ-007` | Si la intención ya es suficientemente específica, la etapa de precisión se omite. | El usuario no atraviesa preguntas redundantes. |
| `BR-OBJ-008` | El objetivo debe expresar una capacidad intelectual alcanzable: comprender, distinguir, explicar, comparar, analizar o evaluar. | El objetivo puede utilizarse como criterio de alcance y QA. |
| `BR-OBJ-009` | El objetivo no puede inventar ensayos, proyectos, portfolios, presentaciones, cargas ni entregables no solicitados o no soportados. | Una intención de comprensión no se convierte automáticamente en producción evaluable. |
| `BR-OBJ-010` | El usuario debe confirmar o corregir explícitamente el objetivo antes de recibir propuestas. | No existe un conjunto vigente de propuestas sin una versión confirmada del objetivo. |
| `BR-OBJ-011` | Cada cambio posterior del objetivo crea una nueva versión e invalida los resultados dependientes anteriores. | Propuestas o Blueprints de una versión anterior no pueden seleccionarse ni aprobarse accidentalmente. |

## 4. Propuestas de curso

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-PRP-001` | El sistema genera entre una y cinco propuestas genuinamente diferentes. | Puede devolver menos de cinco; nunca agrega variantes cosméticas para completar una cantidad. |
| `BR-PRP-002` | Las propuestas deben diferenciarse en al menos tres dimensiones significativas, como pregunta central, alcance, orden, tradición, profundidad o tipo de razonamiento. | La comparación permite reconocer recorridos intelectuales distintos. |
| `BR-PRP-003` | Cada propuesta informa título, descripción, pregunta central, resultado, recorrido, alcance, exclusiones, adecuación al nivel, estimaciones y principal ventaja o trade-off. | El visitante comprende qué clase de curso recibiría antes de registrarse y pagar. |
| `BR-PRP-004` | Si una propuesta es claramente superior para el objetivo, el sistema puede recomendarla con una razón concreta. | La recomendación no oculta alternativas ni se basa en una preferencia arbitraria. |
| `BR-PRP-005` | Solo puede existir un conjunto vigente de propuestas por solicitud y una única propuesta activa seleccionada. | Regenerar o cambiar entradas invalida el conjunto anterior; cambiar selección reemplaza la anterior. |
| `BR-PRP-006` | Generar, regenerar, comparar o seleccionar propuestas no consume créditos. | El balance comercial permanece sin cambios antes del inicio del build. |
| `BR-PRP-007` | Antes del pago no se generan el Blueprint completo ni lecciones. | La propuesta entrega valor de decisión sin adelantar el producto pago. |

## 5. Suscripción, cancelación y acceso

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-SUB-001` | El MVP ofrece un único plan pago configurable. | No aparecen múltiples planes, trials, promociones, cupones, referidos ni marketplace de créditos. |
| `BR-SUB-002` | Antes del checkout se muestran precio, moneda, frecuencia, renovación, beneficio de bienvenida, créditos y condiciones de cancelación. | El cliente conoce la obligación comercial antes de confirmar. |
| `BR-SUB-003` | Una suscripción `Active` es requisito para generar un Blueprint y comenzar un nuevo curso. | Estados `Pending`, `Past due`, `Canceled` o `Inactive` no habilitan nuevas generaciones. |
| `BR-SUB-004` | La suscripción solo se activa después de confirmar un evento auténtico y exitoso de Stripe. | Abandonar el checkout, un pago fallido o pendiente no activa beneficios ni generación. |
| `BR-SUB-005` | Eventos comerciales duplicados deben procesarse de manera idempotente. | Un mismo pago no crea dos suscripciones, beneficios ni asignaciones de créditos. |
| `BR-SUB-006` | Una renovación fallida bloquea nuevas generaciones, pero no el acceso a cursos, fuentes, audio y progreso existentes. | El estado comercial no borra ni oculta aprendizaje ya adquirido. |
| `BR-SUB-007` | Cancelar programa la finalización para el cierre del período ya pagado. | Hasta esa fecha el cliente conserva los derechos correspondientes al período activo. |
| `BR-SUB-008` | Cuando la cancelación se vuelve efectiva, se bloquean nuevos Blueprints y cursos. | El cliente debe reactivar la suscripción para iniciar nuevas generaciones. |
| `BR-SUB-009` | Después de cancelar, el cliente conserva indefinidamente sus cursos, fuentes, audio y progreso mientras exista la cuenta. | La biblioteca sigue disponible sin una suscripción activa. |
| `BR-SUB-010` | Si la cancelación todavía no fue efectiva, el cliente puede reactivarla sin crear una segunda suscripción. | La fecha de cancelación programada se elimina y continúa el mismo vínculo comercial. |
| `BR-SUB-011` | El registro y la conversión inicial se realizan una sola vez. Un cliente autenticado no vuelve a registrarse al crear cursos posteriores. | Al iniciar otra creación, el sistema conserva la cuenta existente y comienza directamente el nuevo onboarding. |
| `BR-SUB-012` | El checkout se presenta únicamente cuando el cliente no posee una suscripción activa que habilite la creación. | Un cliente con suscripción activa no vuelve a pagar ni a contratar el plan por cada curso. |
| `BR-SUB-013` | Para cada curso posterior, el cliente completa un nuevo onboarding, elige una propuesta y revisa un nuevo Blueprint; si mantiene la suscripción activa, continúa sin repetir registro ni checkout. | La repetición corresponde al recorrido pedagógico de cada curso, no a la conversión comercial inicial. |
| `BR-SUB-014` | Un cliente autenticado cuya suscripción no está activa no vuelve a registrarse, pero debe activar o reactivar el plan antes de generar un nuevo Blueprint. | El sistema lo dirige a la resolución comercial conservando la nueva solicitud y su propuesta. |

## 6. Beneficio de bienvenida y créditos de generación

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-CRD-001` | Los derechos comerciales se presentan como beneficio de bienvenida o créditos de generación, nunca como tokens técnicos de IA. | La interfaz no expone unidades internas de proveedores. |
| `BR-CRD-002` | La primera suscripción activa asigna un beneficio de bienvenida para el primer curso. | El primer build elegible puede iniciarse sin reducir el balance de créditos. |
| `BR-CRD-003` | El beneficio de bienvenida es independiente de los créditos y se utiliza una sola vez. | Reintentos, webhooks duplicados o reactivaciones no lo vuelven a asignar. |
| `BR-CRD-004` | Generar o revisar un Blueprint no reserva ni consume un entitlement. | El usuario puede iterar antes de aprobar sin alterar su balance. |
| `BR-CRD-005` | Al aprobar un Blueprint se reserva exactamente un entitlement disponible. | Dos aprobaciones equivalentes no generan dos reservas. |
| `BR-CRD-006` | El consumo se confirma únicamente cuando el build persistido comienza correctamente. | Si falla antes de iniciar trabajo persistido, la reserva se libera. |
| `BR-CRD-007` | Un fallo técnico definitivo restaura una vez el entitlement consumido por ese build. | Reintentar el mismo evento no produce restituciones múltiples. |
| `BR-CRD-008` | El audio, los reintentos automáticos y las revisiones técnicas no consumen créditos adicionales. | Un curso mantiene un único costo comercial aunque requiera recuperación técnica. |
| `BR-CRD-009` | Eliminar un curso o abandonarlo voluntariamente no devuelve el entitlement. | La acción voluntaria no incrementa el balance. |
| `BR-CRD-010` | Sin beneficio ni créditos, el usuario puede completar onboarding, ver propuestas y revisar un Blueprint permitido, pero no aprobarlo para iniciar un build. | El bloqueo ocurre antes de la reserva y explica cuándo habrá un nuevo derecho, si se conoce. |
| `BR-CRD-011` | Todo ajuste administrativo de créditos requiere cantidad, motivo, actor y fecha. | El historial permite auditar el balance y no admite mutaciones silenciosas. |
| `BR-CRD-012` | Después de utilizar el beneficio de bienvenida, cada nuevo curso consume un crédito de generación disponible en el balance asociado a la suscripción del cliente. | Crear cursos posteriores no provoca un pago individual ni un nuevo checkout; requiere suscripción activa y al menos un crédito disponible. |

## 7. Blueprint

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-BLP-001` | Para generar un Blueprint se requiere usuario autenticado, suscripción activa, objetivo confirmado y propuesta vigente. | Si falta una condición, el proceso no comienza y señala la acción necesaria. |
| `BR-BLP-002` | El Blueprint es el contrato pedagógico entre intención, propuesta y curso; no es solo un índice. | Explicita qué se enseñará, qué quedará fuera, cómo progresará y por qué. |
| `BR-BLP-003` | El Blueprint visible incluye objetivo, resultado, problema central, nivel, supuestos, alcance, exclusiones, arco intelectual, módulos ordenados, lecciones, justificación, estimaciones y fuentes o tradiciones relevantes. | El usuario puede evaluar el recorrido antes de consumir un entitlement. |
| `BR-BLP-004` | El sistema conserva internamente dependencias, prerrequisitos, confusiones previsibles, afirmaciones a investigar, pertinencia del marco materialista y riesgos de QA. | La generación y la revisión pueden validar esos criterios sin exponer razonamiento privado. |
| `BR-BLP-005` | La estructura se determina por el recorrido mínimo suficiente para alcanzar el objetivo. | No se agrega relleno ni se fragmenta contenido para cumplir cuotas. |
| `BR-BLP-006` | Como referencia, un curso suele tener de cuatro a ocho módulos, con un mínimo de dos; la cantidad no es una cuota rígida. | Una estructura fuera del rango requiere justificación pedagógica, no rechazo automático. |
| `BR-BLP-007` | Como referencia, el primer módulo suele tener tres lecciones y los siguientes entre tres y seis, con un mínimo de dos por módulo. | La cantidad se adapta a dependencias y objetivo sin fragmentación artificial. |
| `BR-BLP-008` | Como referencia, una lección apunta a unas 1.500–2.000 palabras; menos de 800 activa revisión, no rechazo automático. | La calidad y suficiencia prevalecen sobre una cuota de palabras. |
| `BR-BLP-009` | Cada solicitud de cambios produce una nueva versión completa y conserva la anterior para trazabilidad. | Solo una versión queda vigente y cualquier aprobación previa se invalida. |
| `BR-BLP-010` | El usuario debe aprobar explícitamente la versión exacta visible antes de iniciar la construcción. | No existe build válido sin Blueprint aprobado y versionado. |
| `BR-BLP-011` | Antes de aprobar, el usuario puede pedir nuevas revisiones, elegir otra propuesta o cancelar sin consumo. | Ninguna de esas acciones inicia lecciones ni altera el entitlement. |

## 8. Construcción, publicación y recuperación

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-GEN-001` | La aprobación válida inicia un build asíncrono y persistente asociado a una versión exacta del Blueprint. | Cerrar la pantalla, navegar o cerrar sesión no detiene ni duplica el proceso. |
| `BR-GEN-002` | Solo puede existir un build activo por usuario. | Un segundo intento dirige al build existente y no consume otro entitlement. |
| `BR-GEN-003` | Los módulos se construyen en el orden aprobado. | No se publica una etapa que dependa de contenido anterior aún incompleto. |
| `BR-GEN-004` | Un módulo se publica atómicamente solo cuando sus lecciones, fuentes, síntesis, Knowledge Check y QA local están completos. | El usuario nunca recibe borradores, placeholders, fragmentos truncados ni módulos parcialmente válidos. |
| `BR-GEN-005` | La publicación es progresiva por módulos completos. | El usuario puede estudiar un módulo publicado mientras continúa el resto del build. |
| `BR-GEN-006` | El curso pasa a `Complete` solo cuando todos sus módulos, síntesis final, fuentes y QA global están completos. | No existe estado completo con unidades obligatorias faltantes. |
| `BR-GEN-007` | Los estados mostrados deben corresponder a etapas reales persistidas. | No se inventan porcentajes, tiempos restantes ni progreso ficticio. |
| `BR-GEN-008` | Cada unidad admite inicialmente hasta tres reintentos automáticos ante fallos recuperables. | Los reintentos quedan registrados y no duplican contenido publicado. |
| `BR-GEN-009` | Si la evidencia es insuficiente, el sistema debe volver a investigar, reducir la afirmación o bloquear la publicación. | Nunca rellena una falta de evidencia con referencias inventadas. |
| `BR-GEN-010` | Un fallo técnico definitivo lleva el build a `Failed`, conserva todo contenido válido, registra un diagnóstico y restaura el entitlement una vez. | El usuario conoce qué se conservó y puede recuperarse sin doble restitución. |
| `BR-GEN-011` | El cliente no puede cancelar directamente un build ya iniciado; un administrador puede cancelar operativamente uno bloqueado. | La intervención administrativa queda auditada y evita consumos o estados inconsistentes. |
| `BR-GEN-012` | Reintentar, reanudar o recibir un evento duplicado no puede crear dos builds, módulos ni consumos equivalentes. | Las operaciones críticas son idempotentes. |

## 9. Contenido educativo y calidad pedagógica

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-CNT-001` | El curso debe conservar la intención, el objetivo, el nivel, el alcance y la propuesta aprobados. | QA puede rastrear cada unidad hasta el Blueprint vigente. |
| `BR-CNT-002` | Un curso es una progresión acumulativa y no una colección intercambiable de resúmenes. | Cada módulo cumple una función y prepara dependencias posteriores. |
| `BR-CNT-003` | Cada lección debe producir una ganancia intelectual reconocible. | Su propósito puede expresarse en relación con el objetivo y el módulo. |
| `BR-CNT-004` | Cuando corresponda, una lección incluye problema, tesis o idea central, conceptos, distinciones, argumento, ejemplo verbalizable, límite o contraste, síntesis, puente y fuentes. | La estructura responde al contenido y no a una plantilla vacía. |
| `BR-CNT-005` | El contenido final debe ser continuo, claro, riguroso y apto para narración. | No se publican esquemas internos, notas de trabajo ni listas genéricas como lecciones. |
| `BR-CNT-006` | No se acepta contenido superficial, repetitivo o reutilizable en cualquier tema cambiando pocas palabras. | La lección demuestra especificidad conceptual y relación con sus fuentes. |
| `BR-CNT-007` | Texto y audio deben sostener la misma tesis y evidencia sustantiva. | La modalidad de consumo no cambia el significado educativo. |
| `BR-CNT-008` | El curso no promete dominio profesional, certificación ni resultados prácticos que texto y audio no pueden garantizar. | Las afirmaciones comerciales y pedagógicas se limitan al resultado intelectual aprobado. |
| `BR-CNT-009` | La finalización integra el recorrido mediante una síntesis teórica; no exige capstone ni entregables abiertos en el MVP. | El curso puede completarse sin carga de archivos, ensayo o evaluación humana. |

## 10. Investigación, fuentes y criterio intelectual

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-SRC-001` | Toda lección con afirmaciones factuales sustantivas debe investigarse antes de publicarse. | La escritura factual dispone de evidencia trazable previa. |
| `BR-SRC-002` | Se priorizan fuentes primarias, académicas, instituciones reconocidas, obras de referencia y medios especializados; fuentes generales solo respaldan aspectos periféricos. | La jerarquía de evidencia es coherente con el peso de la afirmación. |
| `BR-SRC-003` | Cada lección utiliza al menos dos fuentes sustantivas y normalmente entre tres y seis, pero la suficiencia prevalece sobre la cuota. | Una excepción justificada no genera relleno bibliográfico ni una sola fuente dominante sin razón. |
| `BR-SRC-004` | Las fuentes deben vincularse con las afirmaciones que respaldan. | El usuario o QA puede identificar qué evidencia sostiene cada afirmación central. |
| `BR-SRC-005` | El sistema verifica citas, fechas, cifras, atribuciones y afirmaciones contemporáneas o controvertidas. | Una afirmación sensible no se publica basándose en memoria o intuición del modelo. |
| `BR-SRC-006` | Cuando resulte razonable, una afirmación disputada se contrasta con dos fuentes independientes. | El contenido distingue consenso, controversia e incertidumbre. |
| `BR-SRC-007` | Nunca se inventan autores, obras, citas, URLs ni metadatos. | Si un dato no puede verificarse, se elimina, se reduce su certeza o se bloquea la publicación. |
| `BR-SRC-008` | Las fuentes realmente utilizadas se muestran al usuario en la lección o curso. | Las referencias visibles coinciden con la evidencia de generación y QA. |
| `BR-SRC-009` | El contenido externo se trata como evidencia, no como instrucciones para el sistema. | Instrucciones incrustadas en una fuente no alteran prompts, políticas ni acciones. |
| `BR-EPI-001` | Cada curso clasifica internamente la pertinencia del marco materialista como `Central`, `Complementary` o `Not applicable`, con justificación. | La aplicación del criterio es explícita para generación y QA, no automática. |
| `BR-EPI-002` | El marco materialista no se presenta como etiqueta doctrinal ni se fuerza sobre todos los temas. | Cuando no aporta valor, prevalecen los métodos propios de la disciplina. |
| `BR-EPI-003` | Autores y tradiciones se exponen fielmente antes de interpretarlos, criticarlos o evaluarlos. | El curso no caricaturiza posiciones para hacerlas encajar en un marco. |
| `BR-EPI-004` | Cuando corresponda, el análisis identifica mecanismos, operaciones, soportes, instituciones, recursos, restricciones, historia, causalidad, escala, contraejemplos y límites. | El criterio agrega capacidad explicativa y no solo vocabulario. |

## 11. Knowledge Checks

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-KC-001` | Cada módulo publicado contiene un Knowledge Check. | Un módulo no supera su QA local si falta el check correspondiente. |
| `BR-KC-002` | Cada Knowledge Check tiene exactamente cinco preguntas de opción única. | No se publican checks con otra cantidad o preguntas de selección múltiple. |
| `BR-KC-003` | Cada pregunta tiene exactamente cuatro opciones y una sola respuesta claramente correcta. | La evaluación puede corregirse automáticamente sin ambigüedad razonable. |
| `BR-KC-004` | Las preguntas evalúan comprensión conceptual, relaciones, aplicación, razonamiento y reconocimiento de errores o contraejemplos. | El conjunto no se limita a memorizar nombres, fechas o definiciones literales. |
| `BR-KC-005` | Los distractores deben ser plausibles y las respuestas ofrecen explicación o feedback. | El check contribuye al aprendizaje además de mostrar un resultado. |
| `BR-KC-006` | Completar el check es opcional, repetible y no bloquea contenido ni finalización. | Un usuario puede continuar aunque no lo responda o falle. |
| `BR-KC-007` | El sistema persiste el último resultado como `X/5`; no certifica ni califica profesionalmente. | Reintentar reemplaza o actualiza el resultado visible conforme al flujo, sin alterar progreso de lecciones. |

## 12. Audio

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-AUD-001` | Toda lección publicada debe ser apta para disponer de audio semánticamente equivalente. | La narración puede comprenderse sin apoyarse en imágenes o video. |
| `BR-AUD-002` | El audio se genera bajo demanda la primera vez que el usuario intenta reproducir una versión de la lección. | No es requisito terminar todos los audios para publicar texto válido. |
| `BR-AUD-003` | Un audio generado se conserva y reutiliza para la misma versión de la lección. | Reproducir nuevamente no vuelve a generar ni consumir un crédito. |
| `BR-AUD-004` | Cambiar la versión sustantiva de una lección invalida el audio anterior para esa versión. | El usuario no escucha una narración que contradiga el texto vigente. |
| `BR-AUD-005` | El reproductor permite reproducir, pausar, reanudar, desplazarse y cambiar velocidad. | Los controles funcionan en escritorio y móvil. |
| `BR-AUD-006` | Posición y velocidad se persisten entre sesiones y dispositivos. | El usuario retoma desde el punto y preferencia guardados. |
| `BR-AUD-007` | Un fallo de audio se informa y puede reintentarse sin invalidar la lección ni el curso. | El texto permanece disponible y el estado general del curso no pasa a `Failed`. |
| `BR-AUD-008` | El MVP no permite descargar audio ni usarlo offline. | Solo se ofrece reproducción dentro de la plataforma. |

## 13. Aprendizaje y progreso

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-PRG-001` | El usuario marca y desmarca manualmente una lección como completada. | Abrir, desplazar, escuchar o responder un check no la completa automáticamente. |
| `BR-PRG-002` | El progreso de un módulo se calcula sobre sus lecciones publicadas y marcadas como completas. | Lecciones aún no publicadas no aparecen como completadas ni accesibles. |
| `BR-PRG-003` | Un curso se considera completado solo cuando el build está completo y todas sus lecciones están marcadas. | Terminar el contenido disponible durante un build parcial no completa el curso. |
| `BR-PRG-004` | Última actividad, última lección, posición de lectura, completitud y resultados de checks persisten entre sesiones y dispositivos. | La biblioteca y el lector reanudan el punto real del usuario. |
| `BR-PRG-005` | Los estados de build, suscripción y progreso de aprendizaje son independientes. | Cancelar no completa ni reinicia el curso; publicar no marca lecciones; estudiar no altera la suscripción. |

## 14. Biblioteca personal

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-LIB-001` | Todo curso y solicitud convertida del usuario se conserva en una biblioteca privada. | Otro cliente no puede descubrirla ni abrirla. |
| `BR-LIB-002` | La biblioteca se ordena por actividad reciente. | La última interacción relevante actualiza su posición sin requerir orden manual. |
| `BR-LIB-003` | Cada elemento muestra título personalizado, objetivo o enfoque, nivel, estado de build, progreso, última actividad y siguiente acción. | El usuario puede distinguir qué existe y cómo continuarlo. |
| `BR-LIB-004` | Reanudar dirige a la superficie correcta según estado: propuesta, Blueprint, generación, módulo disponible o lección pendiente. | No se envía a todos los estados al mismo destino genérico. |
| `BR-LIB-005` | El usuario puede asignar un nombre personal al curso y restaurar el título editorial original. | Renombrar no modifica contenido, Blueprint ni metadatos editoriales canónicos. |
| `BR-LIB-006` | Un curso solo puede eliminarse si no tiene un build activo y después de una confirmación explícita. | Durante generación la acción está bloqueada con explicación. |
| `BR-LIB-007` | Eliminar un curso elimina su acceso y progreso, es irreversible en el MVP y no devuelve créditos. | El curso desaparece de la biblioteca y no existe opción de restauración para el cliente. |
| `BR-LIB-008` | El MVP no incluye búsqueda, filtros, carpetas, etiquetas, orden manual ni duplicación de cursos. | Ninguna de esas capacidades se infiere a partir de la biblioteca básica. |

## 15. Cuenta, facturación y notificaciones

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-ACC-001` | La cuenta muestra perfil básico, estado de plan, importe, frecuencia, renovación o finalización, créditos y beneficio de bienvenida. | El cliente puede comprender su situación comercial actual. |
| `BR-ACC-002` | Actualización del medio de pago y comprobantes se gestionan mediante Stripe. | La plataforma no almacena ni muestra datos completos de tarjeta. |
| `BR-ACC-003` | El MVP no incluye selector de idioma. | La cuenta no permite cambiar el idioma funcional definido. |
| `BR-NOT-001` | Se envían notificaciones transaccionales para verificación y recuperación, suscripción y pagos, pago fallido, cancelación, Blueprint disponible, primer módulo disponible, curso completo y fallo definitivo con restitución. | Cada evento aprobado tiene una notificación rastreable. |
| `BR-NOT-002` | Una notificación se envía solo después de persistir y validar el evento que la origina. | No se anuncia un estado que todavía no existe. |
| `BR-NOT-003` | Reintentos o eventos duplicados no pueden enviar dos notificaciones equivalentes. | Cada evento lógico produce como máximo un envío correspondiente. |
| `BR-NOT-004` | Las notificaciones están en inglés y no incluyen secretos ni contenido privado innecesario. | Los enlaces sensibles requieren autenticación o un token seguro y limitado. |

## 16. Administración y auditoría

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-ADM-001` | Administración puede consultar usuarios, estado de cuenta, suscripción, beneficio, créditos, cursos y builds. | El soporte puede diagnosticar el recorrido sin acceder a secretos. |
| `BR-ADM-002` | Administración puede suspender o habilitar usuarios sin borrar datos ni cancelar automáticamente pagos. | Cada dimensión conserva su propio estado. |
| `BR-ADM-003` | Administración puede inspeccionar Blueprint aprobado, módulos, etapa, errores y reintentos de un build. | Un build bloqueado puede diagnosticarse desde datos persistidos. |
| `BR-ADM-004` | Administración puede reintentar idempotentemente, cancelar operativamente un build bloqueado y restaurar un entitlement cuando corresponda. | Toda intervención registra actor, fecha, motivo y resultado. |
| `BR-ADM-005` | Administración puede ajustar créditos con motivo obligatorio. | El balance conserva un historial auditable. |
| `BR-ADM-006` | Administración puede consultar estados y eventos comerciales confirmados de Stripe. | El panel no presenta como definitivo un estado comercial no validado. |
| `BR-ADM-007` | Administración puede configurar precio, moneda, periodicidad y créditos del único plan. | Los cambios afectan la oferta conforme a su vigencia sin crear planes no soportados. |
| `BR-ADM-008` | El MVP no ofrece CMS ni edición manual de lecciones, prompts o reglas de calidad desde administración. | Una intervención operativa no altera silenciosamente el contenido editorial. |

## 17. Estados, errores, seguridad e invariantes

| ID | Regla | Consecuencia verificable |
| --- | --- | --- |
| `BR-STA-001` | Solicitud, Blueprint, build, módulo, audio, curso, suscripción, entitlement y progreso tienen estados explícitos y persistidos. | Recargar o reconectar muestra el último estado válido, no uno ficticio. |
| `BR-STA-002` | Toda transición relevante se persiste antes de presentarse como completada. | Un mensaje de éxito corresponde a un cambio durable. |
| `BR-STA-003` | Solo se permiten transiciones válidas desde el estado actual y la versión vigente. | Eventos atrasados o repetidos no hacen retroceder ni saltar el proceso. |
| `BR-STA-004` | No puede existir build sin Blueprint aprobado, publicación sin QA, consumo sin entitlement ni curso completo con unidades faltantes. | Las invariantes se validan del lado servidor y en pruebas. |
| `BR-STA-005` | Los estados de generación, aprendizaje y suscripción permanecen separados salvo una regla explícita. | Un cambio en una dimensión no modifica las otras por efecto colateral. |
| `BR-ERR-001` | Todo error visible explica qué ocurrió, qué se conservó y cuál es la siguiente acción disponible. | El usuario no queda ante un spinner indefinido ni un callejón sin salida. |
| `BR-ERR-002` | Un timeout de interfaz no equivale automáticamente al fallo del proceso asíncrono. | Al regresar se consulta y muestra el estado persistido real. |
| `BR-ERR-003` | La recuperación de una unidad fallida no regenera ni invalida unidades ya publicadas correctamente. | El contenido válido permanece accesible. |
| `BR-ERR-004` | Los errores internos se registran con una referencia de soporte sin exponer prompts privados, secretos ni detalles sensibles. | El usuario puede reportar el incidente sin recibir información insegura. |
| `BR-SEC-001` | Secretos y claves privadas solo se usan del lado servidor y nunca se incluyen en frontend, repositorio, mensajes o logs. | Una inspección del cliente no revela credenciales operativas. |
| `BR-SEC-002` | Los eventos de pago se autentican y procesan idempotentemente antes de alterar acceso o créditos. | Un evento falsificado o repetido no concede beneficios. |
| `BR-SEC-003` | Solo se envían a servicios de IA los datos necesarios para la función solicitada. | Prompts y logs excluyen credenciales, datos completos de pago y datos personales innecesarios. |
| `BR-SEC-004` | Toda operación sensible queda auditada con actor, fecha, acción, motivo cuando corresponda y resultado. | Ajustes, suspensiones, cancelaciones operativas y restituciones pueden reconstruirse. |

## Matriz de invariantes críticas

| Invariante | Debe impedir |
| --- | --- |
| Objetivo confirmado antes de propuestas | Propuestas basadas en una intención no aceptada por el usuario. |
| Propuesta vigente antes de Blueprint | Blueprints desconectados de la elección actual. |
| Suscripción activa antes de Blueprint | Generación paga sin derecho comercial vigente. |
| Blueprint vigente aprobado antes del build | Construcción de una versión obsoleta o no aceptada. |
| Entitlement disponible antes del build | Consumo negativo o creación comercial no autorizada. |
| Un build activo por usuario | Cursos duplicados y doble consumo. |
| QA local antes de publicar módulo | Contenido parcial, sin fuentes o sin Knowledge Check. |
| QA global antes de completar curso | Estado `Complete` con contenido faltante. |
| Idempotencia en pagos, builds y créditos | Cobros, beneficios, consumos o restituciones duplicadas. |
| Separación de estados | Que cancelar, estudiar o generar altere dimensiones no relacionadas. |
| Conversión inicial única | Que un cliente con cuenta y suscripción activas repita registro o checkout al crear otro curso. |

## Reglas que no deben inferirse

Este documento no autoriza:

- tutor conversacional o chat libre;
- adaptación automática del currículo según desempeño;
- certificación, acreditación o evaluación humana;
- tareas abiertas, ensayos, proyectos, portfolios o carga de archivos;
- contenido pedagógico dependiente de imágenes o video;
- aplicación móvil nativa, descargas u operación offline;
- traducción automática o generación multilingüe;
- búsqueda avanzada, filtros, carpetas, etiquetas o duplicación;
- múltiples planes, trials, promociones, cupones o marketplace;
- CMS editorial, edición manual de cursos o prompts desde administración;
- corpus propio, scraping, embeddings o integraciones bibliográficas adicionales;
- biblioteca editorial o selección curada dentro del MVP.

## Criterios de aceptación del documento

La implementación de estas reglas debe permitir comprobar que:

1. cada regla aplicable dispone de al menos una prueba funcional, de integración o automatizada;
2. las precondiciones comerciales y de autorización se validan del lado servidor;
3. doble clic, reintento y evento duplicado no producen efectos comerciales o editoriales duplicados;
4. las versiones obsoletas no pueden continuar hacia etapas posteriores;
5. los procesos prolongados pueden reanudarse desde estado persistido;
6. un fallo conserva contenido válido y restituye derechos solo cuando corresponde;
7. ningún contenido se publica sin evidencia y QA exigidos;
8. cancelar una suscripción no elimina el aprendizaje existente;
9. ninguna capacidad excluida aparece por inferencia de una herramienta o proveedor.

## Relación con otros documentos

- `PRODUCT.md`: identidad, usuario, valor y principios estables.
- `MVP.md`: alcance aprobado y exclusiones de la primera versión.
- `USER_FLOWS.md`: secuencias observables que aplican estas reglas.
- `AI_GENERATION.md`: contratos de entrada y salida, prompts, validaciones y QA de IA.
- `DATA_MODEL.md`: entidades, relaciones, versiones, estados y auditoría requeridos para persistir estas reglas.
- `INTEGRATIONS.md`: comportamiento de OpenAI, ElevenLabs, Stripe y demás servicios.
- `DECISIONS.md`: cambios aprobados, contradicciones y preguntas pendientes.
- `ARCHITECTURE.md`: mecanismos técnicos elegidos para cumplir estas reglas.
