# MVP.md

# Auteur Education MVP

**Versión:** 1.0

**Estado:** Aprobado

**Ubicación canónica:** `docs/MVP.md`

## Propósito de este documento

Este archivo es la fuente canónica del alcance de la primera versión comercializable de Auteur Education. Establece qué capacidades deben construirse, qué comportamientos mínimos deben validarse y qué funcionalidades quedan expresamente fuera.

`PRODUCT.md` define la identidad y los principios estables de Auteur. Este archivo define qué parte de ese producto debe existir en el MVP.

## Instrucciones de uso para agentes

- Utilizar este archivo como límite de alcance del MVP.
- No implementar funcionalidades incluidas en **Fuera del MVP** o **Evolución futura** sin una decisión explícita registrada en `DECISIONS.md`.
- No convertir ejemplos, referencias anteriores o posibilidades futuras en requisitos.
- No decidir arquitectura técnica a partir de este documento. Registrar o consultar esas decisiones en `ARCHITECTURE.md`.
- Cuando una solicitud contradiga este archivo, detener la implementación y señalar la contradicción.
- Cuando falte una decisión funcional necesaria, no inventarla. Registrarla como pendiente en `DECISIONS.md`.
- Ante contradicciones documentales, aplicar esta precedencia:
    1. decisiones posteriores confirmadas por Auteur Education;
    2. este archivo `MVP.md`;
    3. `PRODUCT.md`;
    4. definición funcional aprobada;
    5. presupuesto aceptado;
    6. relevamientos, prototipos y documentos anteriores como contexto no vinculante.

## Objetivo del MVP

Validar un recorrido completo y comercializable que permita transformar una intención de aprendizaje en un curso teórico personalizado, investigado y estructurado, que pueda estudiarse mediante texto y audio.

El MVP debe demostrar que el sistema puede:

- comprender y precisar la intención del usuario;
- proponer recorridos de aprendizaje realmente diferenciados;
- convertir una propuesta en un Blueprint revisable y aprobable;
- investigar, generar, verificar y publicar un curso completo;
- cobrar una suscripción y administrar créditos de generación;
- conservar cursos, progreso y audio;
- recuperarse de fallos sin perder información ni cobrar dos veces;
- operar sin intervención manual obligatoria de Auteur o Trama en el recorrido normal.

## Resultado esperado

Al finalizar el MVP, un visitante debe poder comenzar con una intención amplia, recibir una propuesta concreta antes de registrarse, convertirse en cliente, aprobar el mapa de su curso, recibir contenido progresivamente y estudiarlo desde una biblioteca personal.

El resultado debe funcionar con integraciones reales de prueba y debe poder validarse de extremo a extremo en un entorno de staging.

## Usuarios incluidos

### Visitante

Persona sin sesión iniciada. Puede conocer la propuesta de valor, comenzar el onboarding, confirmar un objetivo, recibir propuestas y seleccionar una antes de registrarse.

### Cliente

Usuario autenticado. Puede suscribirse, solicitar y aprobar Blueprints, generar cursos, leer y escuchar lecciones, completar evaluaciones formativas, administrar su biblioteca y gestionar su cuenta.

### Administrador

Usuario interno autorizado. Puede gestionar usuarios, suscripciones, créditos, cursos, procesos de generación, errores y configuraciones funcionales permitidas.

## Alcance incluido

### 1. Sitio público

El MVP incluye una superficie pública responsive que:

- explica qué hace Auteur;
- comunica que el aprendizaje es teórico y se ofrece mediante texto y audio;
- explica de manera general el recorrido de creación de un curso;
- permite iniciar una nueva intención de aprendizaje;
- permite iniciar sesión;
- presenta la información comercial necesaria antes del pago;
- incluye acceso a términos, privacidad y condiciones de suscripción.

La propuesta de valor no debe presentar Auteur como un simple generador de cursos mediante inteligencia artificial.

### 2. Onboarding previo al registro

El visitante puede completar el recorrido inicial antes de crear una cuenta.

El onboarding incluye:

- intención inicial en texto libre;
- nivel de experiencia;
- contexto opcional sobre conocimientos previos, estudios, experiencia o dificultades;
- resultado esperado;
- clasificación de compatibilidad con el medio textual y sonoro;
- precisión condicional cuando la intención sea demasiado amplia o ambigua;
- formulación y confirmación de un objetivo observable.

Los niveles disponibles son:

- `None`;
- `Basic`;
- `Intermediate`;
- `Advanced`.

El nivel y los conocimientos previos deben afectar el punto de entrada, el lenguaje, la profundidad, la recapitulación, los ejemplos, las fuentes y el tipo de razonamiento exigido. No alcanza con cambiar solamente el tono.

El ritmo o esfuerzo semanal no forma parte del MVP.

La precisión no es un paso obligatorio. Debe aparecer únicamente cuando resulte necesaria para construir un objetivo honesto y concreto.

El MVP funciona exclusivamente en inglés. Si el usuario escribe en otro idioma, el sistema solicita que reformule su entrada en inglés y no traduce ni genera automáticamente el curso en otro idioma.

La información confirmada durante el onboarding debe conservarse temporalmente y sobrevivir al registro, inicio de sesión y pago.

### 3. Clasificación de solicitudes

Antes de generar propuestas, el sistema clasifica la solicitud como:

- `Allowed`: puede desarrollarse correctamente mediante teoría, texto y audio;
- `Allowed with reframing`: contiene una dimensión teórica, histórica, crítica o metodológica que puede enseñarse si se reformula honestamente;
- `Incompatible`: depende de demostraciones visuales, corporales, manuales, procedimentales o de otro tipo que el producto no puede ofrecer adecuadamente.

Las solicitudes prácticas en ámbitos sensibles, como salud, derecho, finanzas, seguridad o armas, deben limitarse a alfabetización general y contenidos teóricos o rechazarse cuando no puedan tratarse de manera segura.

### 4. Objetivo confirmado

Auteur formula un objetivo que combina:

- intención inicial;
- nivel;
- conocimientos previos;
- resultado esperado;
- precisión seleccionada, cuando corresponda.

El objetivo debe describir una capacidad intelectual alcanzable, como comprender, distinguir, explicar, comparar, analizar o evaluar.

El usuario puede confirmarlo o solicitar una corrección. No se generan propuestas hasta que exista un objetivo confirmado.

El sistema no debe inventar ensayos, proyectos, portfolios, presentaciones, cargas de archivos ni otros entregables que el usuario no haya solicitado y el MVP no soporte.

### 5. Propuestas de curso

El sistema genera entre una y cinco propuestas de curso. Puede generar menos de cinco cuando el objetivo sea específico o no existan alternativas sustantivas.

Las propuestas deben diferenciarse realmente por dimensiones como:

- pregunta central;
- perspectiva;
- principio organizador;
- escala o recorte;
- autores o tradiciones;
- orden del contenido;
- balance entre historia, teoría, sistema y casos;
- resultado intelectual.

No se permiten variantes cosméticas creadas solamente para completar una cantidad fija.

Cada propuesta debe presentar información suficiente para que el visitante comprenda qué tipo de curso recibiría, sin generar todavía el Blueprint completo ni las lecciones.

Debe incluir, como mínimo:

- título y descripción breve;
- pregunta central;
- resultado esperado;
- recorrido distintivo;
- alcance y exclusiones principales;
- nivel estimado y adecuación al usuario;
- estimación de módulos y duración;
- principal ventaja y trade-off;
- recomendación justificada, cuando exista una opción claramente superior.

El visitante selecciona una propuesta antes del registro y del pago. Solamente puede existir una propuesta seleccionada y un conjunto de propuestas vigente por solicitud.

### 6. Registro y autenticación

El registro o inicio de sesión ocurre después de seleccionar una propuesta y antes del checkout.

El MVP incluye:

- acceso con Google;
- acceso mediante email con un mecanismo seguro;
- verificación de email cuando corresponda;
- recuperación de acceso;
- cierre de sesión;
- continuidad del recorrido después de autenticarse.

El usuario no debe repetir el onboarding ni perder la propuesta seleccionada después del registro o inicio de sesión.

### 7. Suscripción y checkout

Una suscripción activa es necesaria para solicitar el Blueprint y construir un curso.

El MVP incluye:

- un único plan pago configurable;
- checkout mediante Stripe;
- precio, moneda, frecuencia, renovación y cantidad de créditos configurables;
- confirmación de pago;
- estados de suscripción;
- actualización del medio de pago;
- consulta de comprobantes disponibles;
- programación de cancelación;
- tratamiento de pagos fallidos.

Los estados mínimos son:

- `Pending`;
- `Active`;
- `Past due`;
- `Cancellation scheduled`;
- `Canceled`;
- `Inactive`.

Un pago fallido no activa la suscripción ni inicia la generación del Blueprint.

### 8. Beneficio de bienvenida y créditos

La primera generación posterior a la primera suscripción activa utiliza un beneficio de bienvenida separado del saldo de créditos y no consume créditos de generación.

Los créditos de generación habilitan la construcción de cursos adicionales.

Reglas incluidas:

- generar o revisar un Blueprint no consume créditos;
- el beneficio o crédito se reserva al aprobar el Blueprint;
- el consumo se confirma cuando comienza correctamente un build persistido;
- un fallo técnico definitivo restituye el beneficio o crédito una única vez;
- el audio forma parte del curso y no consume créditos adicionales;
- los créditos se asignan por ciclo según la configuración del plan;
- eliminar un curso o abandonar voluntariamente una solicitud no devuelve créditos;
- las operaciones repetidas no pueden reservar ni consumir dos veces el mismo entitlement;
- el usuario puede consultar su saldo sin ver tokens ni costes técnicos de IA.

Si el usuario no tiene beneficio ni créditos, puede completar el onboarding y explorar propuestas, pero no puede aprobar un Blueprint para iniciar un nuevo curso.

### 9. Blueprint

El Blueprint se genera únicamente cuando existen:

- usuario autenticado;
- suscripción activa;
- objetivo confirmado;
- propuesta vigente seleccionada.

El Blueprint es la arquitectura pedagógica justificable del curso, no un índice decorativo ni una muestra de contenido.

Debe mostrar:

- título y subtítulo;
- objetivo y resultado observable;
- pregunta o problema central;
- nivel y conocimientos asumidos;
- alcance y exclusiones;
- arco intelectual;
- módulos ordenados y función de cada uno;
- lecciones previstas y propósito;
- justificación del orden y de la extensión;
- estimación de módulos, lecciones, palabras y tiempo;
- fuentes, autores o tradiciones orientativas cuando corresponda;
- riesgos o limitaciones pedagógicas relevantes.

Internamente debe conservar dependencias conceptuales, prerrequisitos, confusiones a corregir, necesidades de investigación, criterios de QA y la pertinencia del marco materialista.

La estructura es flexible:

- habitualmente contiene entre cuatro y ocho módulos, con un mínimo de dos;
- cada módulo contiene al menos dos lecciones;
- el primer módulo suele tener tres lecciones;
- los módulos posteriores suelen tener entre tres y seis;
- una lección suele tener entre 1.500 y 2.000 palabras;
- una lección menor a 800 palabras activa revisión, pero no rechazo automático;
- no existe una extensión total fija para el curso.

Estas cantidades son referencias, no cuotas. Toda estructura debe justificarse por el objetivo y debe evitar relleno o fragmentación artificial.

El usuario puede:

- aprobar el Blueprint;
- solicitar cambios en texto libre;
- corregir supuestos;
- volver a elegir una propuesta;
- cancelar antes de construir.

Cada modificación genera una nueva versión completa e invalida la aprobación anterior. Las revisiones no consumen créditos. La construcción nunca comienza sin aprobación explícita de una versión concreta.

### 10. Generación del curso

La aprobación del Blueprint inicia un proceso asíncrono y persistente.

El MVP admite un único build activo por usuario. El usuario puede cerrar la pantalla, navegar o cerrar sesión sin detener la generación.

La interfaz debe mostrar estados reales y comprensibles, como:

- `Queued`;
- `Researching`;
- `Building module`;
- `Reviewing sources`;
- `Preparing Knowledge Check`;
- `Publishing module`.

No se muestran porcentajes, tiempos o avances inventados.

Los módulos se construyen en el orden aprobado y se publican progresivamente. Un módulo solamente se publica cuando sus lecciones, fuentes, síntesis y Knowledge Check están completos y pasaron su control de calidad.

No se exponen borradores, placeholders, lecciones truncadas ni módulos parcialmente escritos.

El usuario puede comenzar a estudiar módulos completos mientras continúa la generación de los siguientes.

El curso pasa a `Complete` cuando se publicaron todos los módulos, la síntesis final, las fuentes y los controles de calidad requeridos.

El usuario no puede cancelar directamente un build iniciado. La cancelación operativa corresponde al administrador.

### 11. Contenido educativo

Un curso es el recorrido mínimo suficiente para alcanzar el objetivo aprobado. Debe formar una secuencia intelectual acumulativa y no una enciclopedia ni una colección intercambiable de resúmenes.

Cada lección incluye, cuando corresponda:

- pregunta o problema;
- idea o tesis central;
- conceptos y distinciones;
- desarrollo argumental;
- ejemplo o caso descriptible sin imágenes ni video;
- límite, contraste, error, contraejemplo o controversia;
- síntesis;
- puente hacia la siguiente lección;
- fuentes utilizadas.

La lección debe ser contenido final, continuo, claro, riguroso y apto para ser narrado. No se acepta contenido que solamente enumere datos, resuma autores, repita ideas o pueda adaptarse a cualquier tema cambiando algunas palabras.

Texto y audio deben sostener la misma tesis y la misma evidencia sustantiva.

### 12. Investigación, fuentes y verificación

Las lecciones con carga factual deben investigarse antes de publicarse.

El MVP debe:

- priorizar fuentes primarias, académicas e institucionales;
- utilizar fuentes sustantivas y pertinentes;
- vincular fuentes con afirmaciones concretas;
- verificar citas, fechas, cifras, atribuciones y afirmaciones controvertidas;
- mostrar las fuentes realmente utilizadas;
- representar controversias relevantes sin caricaturas ni falso equilibrio;
- bloquear o revisar contenido cuando no exista evidencia suficiente;
- evitar que instrucciones presentes en fuentes externas modifiquen las reglas del sistema.

El sistema nunca completa URLs, autores, obras, citas o metadatos por intuición.

Los mecanismos técnicos concretos de investigación, auditoría y trazabilidad se definirán en `ARCHITECTURE.md` y `AI_GENERATION.md`.

### 13. Criterio materialista filosófico

El marco inspirado en el materialismo filosófico de Gustavo Bueno funciona como disciplina interna de análisis cuando resulte pertinente.

Cada curso debe clasificar internamente su aplicación como:

- `Central`;
- `Complementary`;
- `Not applicable`.

El criterio no se presenta como una etiqueta doctrinal al usuario, no debe forzarse sobre todos los temas y no puede reemplazar los métodos propios de cada disciplina.

Cuando corresponda, debe favorecer explicaciones que identifiquen mecanismos, operaciones, soportes, instituciones, recursos, restricciones, historia, causalidad, escala, contraejemplos y límites.

Los autores y tradiciones diferentes deben exponerse con fidelidad antes de ser interpretados, criticados o evaluados.

### 14. Knowledge Checks

Cada módulo publicado finaliza con un Knowledge Check formativo y opcional.

Cada Check contiene:

- cinco preguntas de selección simple;
- cuatro opciones por pregunta;
- una respuesta claramente correcta según el contenido enseñado;
- distractores plausibles;
- explicación de la respuesta correcta y de las confusiones relevantes.

Las preguntas deben evaluar comprensión conceptual, relaciones, aplicación, razonamiento y reconocimiento de errores o contraejemplos. No deben limitarse a memorizar nombres, fechas o definiciones literales.

El usuario puede omitirlo, repetirlo y continuar sin aprobarlo. El resultado no modifica automáticamente el curso, no bloquea módulos y no constituye certificación.

El sistema conserva, como mínimo, el último resultado en formato `X/5`.

### 15. Audio

Toda lección publicada debe ser apta para disponer de audio semánticamente equivalente.

El audio:

- se genera bajo demanda en la primera reproducción;
- permanece asociado a la versión de la lección;
- no bloquea la lectura mientras se genera;
- permite reproducir, pausar, reanudar, avanzar, retroceder y cambiar velocidad;
- conserva posición y velocidad preferida;
- funciona en escritorio y móvil;
- permite reintentar ante errores;
- sigue disponible después de cancelar la suscripción;
- no puede descargarse ni utilizarse offline en el MVP.

Una falla de audio no cambia el curso a `Failed` ni bloquea el texto.

### 16. Experiencia de aprendizaje y progreso

El lector debe mostrar:

- curso, módulos y lecciones;
- contenido actual;
- fuentes y controversias;
- controles de audio;
- Knowledge Checks;
- estado de módulos futuros o en construcción.

El usuario puede navegar libremente por todo el contenido publicado.

El progreso incluye:

- última actividad;
- última lección visitada;
- lecciones marcadas manualmente como completas;
- progreso por módulo;
- estado de finalización del curso;
- posición y preferencias de audio;
- último resultado de cada Knowledge Check.

Leer, escuchar o responder un Check no marca automáticamente una lección como completa. La finalización es una acción manual y reversible.

El progreso debe conservarse entre sesiones y dispositivos.

### 17. Biblioteca personal

El MVP incluye una biblioteca privada de cursos generados.

Cada curso muestra:

- título editorial y nombre personalizado, cuando exista;
- objetivo y enfoque;
- nivel;
- estado de construcción;
- estado de aprendizaje;
- progreso;
- última actividad;
- próxima acción relevante.

La biblioteca:

- se ordena inicialmente por actividad reciente;
- permite retomar desde la posición o estado correcto;
- permite renombrar un curso sin modificar su título editorial;
- permite eliminar cursos sin builds activos mediante confirmación explícita;
- impide eliminar un curso mientras se está generando;
- permanece disponible mientras exista la cuenta, incluso sin una suscripción activa.

Eliminar un curso elimina su acceso y progreso, no puede deshacerse dentro del MVP y no devuelve créditos.

La biblioteca no incluye búsqueda, filtros, carpetas, etiquetas, orden manual ni duplicación de cursos.

### 18. Cuenta, facturación y notificaciones

El usuario puede:

- consultar y modificar su nombre visible y datos básicos permitidos;
- cerrar sesión y recuperar el acceso;
- consultar estado, importe y frecuencia del plan;
- consultar fecha de renovación o cancelación;
- ver créditos y beneficio de bienvenida;
- actualizar el medio de pago mediante Stripe;
- acceder a comprobantes disponibles;
- programar la cancelación de la suscripción.

El MVP no incluye selector de idioma.

Los mensajes transaccionales se envían en inglés e incluyen, como mínimo:

- verificación de email y recuperación de acceso;
- confirmación de suscripción y pago;
- pago fallido o acción requerida;
- cancelación programada y efectiva;
- Blueprint disponible;
- primer módulo publicado;
- curso completo;
- fallo definitivo y restitución del crédito.

Una notificación repetida por reintentos o eventos duplicados no debe enviarse más de una vez.

### 19. Cancelación de suscripción y acceso posterior

La cancelación se programa para el final del período pago.

Después de que la suscripción quede inactiva:

- el usuario conserva indefinidamente sus cursos mientras mantenga su cuenta;
- conserva progreso, fuentes, Knowledge Checks y audio;
- puede estudiar y administrar su biblioteca;
- no puede generar nuevos Blueprints ni cursos hasta reactivar la suscripción.

La cancelación de una suscripción no modifica el estado de construcción ni el estado de aprendizaje de un curso.

### 20. Panel de administración

El panel administrativo incluye:

- acceso exclusivo por rol validado del lado servidor;
- listado y consulta de usuarios;
- consulta de estado de cuenta, suscripción, beneficio y créditos;
- habilitación y suspensión de usuarios;
- consulta de cursos y builds asociados;
- ajustes de créditos con motivo registrado;
- listado de cursos por usuario, estado y fecha;
- consulta del Blueprint aprobado y estado de módulos;
- consulta de etapa actual, errores e intentos;
- reintento idempotente de unidades fallidas;
- cancelación operativa de builds bloqueados;
- restitución de entitlements cuando corresponda;
- consulta de eventos de pago y referencias de Stripe;
- configuración permitida de precio, moneda, periodicidad y créditos;
- auditoría de acciones administrativas sensibles.

El panel no incluye un editor visual de módulos o lecciones ni expone claves privadas o secretos.

Suspender una cuenta bloquea nuevas sesiones y generaciones, pero no elimina datos ni cancela automáticamente la suscripción.

### 21. Estados, errores y recuperación

Los procesos de solicitud, Blueprint, build, módulo, audio, curso, suscripción y créditos deben tener estados explícitos y persistidos.

El MVP debe garantizar:

- transiciones válidas entre estados;
- separación entre generación, aprendizaje y suscripción;
- prevención de builds, pagos, reservas, consumos y reintentos duplicados;
- mensajes de error que expliquen qué ocurrió, qué se conservó y qué puede hacer el usuario;
- conservación de información confirmada ante cierres, errores de red o timeouts;
- identificadores operativos para diagnosticar fallos;
- recuperación independiente por subsistema;
- reintentos acotados, con un máximo inicial de tres por unidad;
- restitución idempotente del entitlement ante fallos técnicos definitivos.

Una falla de audio no bloquea texto. Una falla de un módulo no elimina módulos ya publicados. Una falla de email no revierte una operación válida.

## Integraciones requeridas

El MVP requiere capacidades provistas por:

- **OpenAI:** generación, investigación y asistencia en controles de calidad;
- **ElevenLabs:** generación de audio a partir de las lecciones;
- **Stripe:** suscripciones, checkout, pagos, facturación y gestión autorizada del medio de pago;
- **Servicio de email transaccional:** mensajes operativos y comerciales necesarios.

Las claves privadas nunca se exponen en frontend, repositorios, mensajes o logs.

Este documento exige las capacidades, no distribuye responsabilidades entre frontend, backend, n8n u otros componentes. Esa distribución se decide en `ARCHITECTURE.md`.

## Requisitos transversales

### Responsive

Los recorridos críticos deben funcionar en escritorio y móvil: onboarding, propuestas, registro, checkout, Blueprint, biblioteca, lector, audio, Knowledge Checks, cuenta y administración esencial.

### Navegadores

El MVP debe validar versiones actuales de Chrome, Edge, Safari y Firefox según la matriz definida para QA.

### Accesibilidad

Los flujos críticos deben incluir:

- navegación por teclado;
- foco visible y orden lógico;
- etiquetas accesibles;
- contraste suficiente;
- estados que no dependan solamente del color;
- zoom de hasta 200 % sin pérdida funcional;
- errores asociados al campo correspondiente;
- estructura semántica correcta en el lector.

### Seguridad y privacidad

- Los secretos solo se utilizan del lado servidor.
- Toda operación privada valida identidad, rol y propiedad.
- La plataforma no almacena datos completos de tarjetas.
- Los eventos de pago deben ser auténticos e idempotentes.
- Solo se envían a sistemas de IA los datos necesarios para generar el contenido.
- Prompts y logs no deben incluir credenciales, información de pago ni datos personales innecesarios.

### Procesos prolongados

La generación del Blueprint, el curso y el audio debe ejecutarse como trabajo reanudable con estado persistido. Un timeout de interfaz no equivale al fallo del proceso.

### Calidad de interfaz

- La experiencia debe sentirse sobria, editorial, contemporánea y confiable.
- No debe utilizar estética futurista genérica ni badges de IA sin función.
- No debe mostrar spinners indefinidos.
- No debe inventar porcentajes, tiempos, testimonios o métricas.
- Los textos deben ser claros, específicos y consistentes en inglés.

## Fuera del MVP

Las siguientes capacidades no deben implementarse en la primera versión:

- biblioteca editorial o Curated;
- catálogo público de cursos preexistentes;
- marketplace de docentes o cursos;
- comunidad, comentarios públicos o mensajería entre usuarios;
- tutor conversacional;
- adaptación automática del currículo según desempeño;
- certificaciones, acreditaciones o habilitaciones profesionales;
- corrección humana o evaluación profesional universal;
- respuestas abiertas, ensayos, proyectos, portfolios o entregables del alumno;
- carga de archivos por el alumno;
- contenido pedagógico dependiente de imágenes o video;
- galerías, demostraciones con cursor o tutoriales visuales;
- aplicación móvil nativa;
- descarga offline o descarga de audios;
- cursos en español u otros idiomas;
- traducción automática o selector de idioma;
- búsqueda, filtros, carpetas, etiquetas, orden manual o duplicación en la biblioteca;
- editor visual de cursos o CMS editorial avanzado;
- edición manual de lecciones desde administración;
- múltiples planes complejos;
- trials, promociones, cupones o referidos;
- marketplace o compra independiente de créditos;
- scraping, carga de corpus propio, embeddings o base vectorial;
- integraciones bibliográficas adicionales;
- dashboard avanzado de analítica o business intelligence;
- soporte humano integrado o sistema de tickets;
- promesa de revisión humana universal;
- múltiples builds simultáneos por usuario;
- cancelación de un build iniciado por parte del cliente.

## Evolución futura sin compromiso de alcance

Las siguientes ideas forman parte de la visión o fueron consideradas, pero no están comprometidas para el MVP:

- Selección editorial o Curated;
- catálogo público y cursos preexistentes;
- comunidad Auteur Society;
- tutor conversacional;
- adaptación del recorrido según desempeño;
- múltiples idiomas;
- aplicación móvil y funcionamiento offline;
- búsqueda y organización avanzada de biblioteca;
- herramientas editoriales avanzadas;
- analítica de producto y negocio;
- experiencias de creación, colaboración o contribución para el `Practicing Auteur`.

Estas ideas requieren definición, estimación y aprobación independiente antes de convertirse en alcance.

## Escenarios mínimos de aceptación

El MVP debe superar, como mínimo, los siguientes escenarios:

1. Una intención amplia activa precisión y produce propuestas diferenciadas antes del registro.
2. Una intención específica omite precisión innecesaria.
3. Una entrada no inglesa solicita reformulación y no genera contenido en otro idioma.
4. Un objetivo práctico incompatible se reformula honestamente o se rechaza.
5. Un tema específico genera menos de cinco propuestas sin variantes artificiales.
6. Registro, login y pago conservan la intención y propuesta seleccionada.
7. El primer curso utiliza el beneficio de bienvenida sin consumir créditos.
8. Un Blueprint flexible puede aprobarse sin cumplir cantidades orientativas cuando existe justificación pedagógica.
9. Una revisión de Blueprint crea una nueva versión y exige nueva aprobación sin consumir créditos.
10. La generación continúa después de cerrar la pantalla y recupera el estado correcto.
11. Un módulo completo puede publicarse mientras continúan los siguientes.
12. Una afirmación central sin evidencia suficiente no se publica.
13. Cada módulo incluye un Knowledge Check opcional de cinco preguntas y cuatro opciones.
14. El audio se genera bajo demanda y un fallo no bloquea el texto.
15. El progreso se recupera en otra sesión o dispositivo.
16. La cancelación bloquea nuevas generaciones, pero conserva cursos, progreso y audio.
17. Un fallo técnico definitivo restaura una sola vez el entitlement consumido.
18. Sin créditos, el usuario puede explorar propuestas, pero no iniciar un nuevo curso.
19. Dos confirmaciones o eventos repetidos producen un único build y un único consumo.
20. Una suspensión administrativa bloquea el acceso sin borrar datos ni cancelar automáticamente el pago.
21. Eliminar un curso requiere confirmación, elimina el progreso y no devuelve créditos.
22. El recorrido completo puede utilizarse en un viewport móvil.

## Definición de terminado

El MVP se considera terminado cuando:

- todos los escenarios críticos se encuentran aprobados en staging;
- los recorridos de visitante, cliente y administrador funcionan con datos reales de prueba;
- OpenAI, investigación, ElevenLabs, Stripe y notificaciones funcionan con configuraciones controladas equivalentes a producción;
- no existen defectos críticos o altos abiertos en autenticación, pagos, permisos, generación, progreso o conservación de datos;
- se verificó al menos un curso completo real desde la intención hasta la finalización;
- se verificaron fallos, reintentos, idempotencia y recuperación;
- se comprobaron cancelación y acceso posterior a cursos existentes;
- se registraron tiempos y costes externos observados para decidir el lanzamiento;
- el funcionamiento responsive y accesible de los recorridos críticos fue validado;
- el alcance implementado coincide con este documento y no incorpora funcionalidades excluidas.

## Decisiones reservadas para otros documentos

No se resuelven en `MVP.md`:

- distribución entre frontend, backend, n8n y otros componentes;
- stack tecnológico;
- hosting, despliegue y escalabilidad;
- contratos técnicos con OpenAI;
- mecanismo concreto de investigación web;
- persistencia, colas, jobs e idempotencia técnica;
- proveedor de email;
- fragmentación o streaming de audio;
- estrategia técnica de versiones;
- cantidad y tipo de validadores automáticos;
- límites de coste, tiempo y concurrencia por entorno;
- observabilidad, backups y recuperación de infraestructura.

Estas decisiones deben documentarse en `ARCHITECTURE.md`, `INTEGRATIONS.md`, `AI_GENERATION.md` o `DECISIONS.md`, según corresponda, sin alterar silenciosamente el alcance definido aquí.

## Relación con otros documentos

- `PRODUCT.md`: identidad, usuario, valor y principios del producto.
- `USER_FLOWS.md`: recorridos detallados de visitante, cliente y administrador.
- `BUSINESS_RULES.md`: reglas funcionales verificables y transiciones válidas.
- `AI_GENERATION.md`: entradas, salidas, restricciones y controles de generación.
- `DATA_MODEL.md`: entidades, relaciones y estados persistidos.
- `INTEGRATIONS.md`: contratos y comportamiento esperado de servicios externos.
- `DECISIONS.md`: decisiones aprobadas y preguntas abiertas.
- `ARCHITECTURE.md`: implementación técnica del alcance.