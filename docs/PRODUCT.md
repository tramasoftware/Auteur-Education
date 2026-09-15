# Product.md

# Auteur Education

**Versión:** 1.0

**Estado:** Aprobado

**Ubicación canónica:** `docs/PRODUCT.md`

## Propósito de este documento

Este archivo es la fuente canónica de la identidad de Auteur Education. Define qué producto se está construyendo, para quién, qué valor debe entregar, cómo debe sentirse y qué principios deben conservarse durante el diseño y el desarrollo.

`MVP.md` determina qué parte de esta visión corresponde a la primera versión. Este archivo no amplía por sí solo el alcance del MVP.

## Instrucciones de uso para agentes

- Consultar este archivo antes de planificar funcionalidades o tomar decisiones que afecten la experiencia del producto.
- Preservar la definición, el usuario principal, la propuesta de valor, los límites del medio y los principios establecidos aquí.
- Consultar `MVP.md` para determinar si una capacidad forma parte de la primera versión.
- No implementar ideas identificadas como futuras únicamente porque formen parte de la visión general del producto.
- No convertir ejemplos, formulaciones de marca o aspiraciones en requisitos funcionales no documentados.
- No definir arquitectura técnica a partir de este archivo. Consultar `ARCHITECTURE.md` y `DECISIONS.md`.
- Cuando una solicitud contradiga un principio aprobado, detener la implementación y señalar la contradicción.
- Cuando falte una decisión necesaria, no inventarla: registrarla como pendiente en `DECISIONS.md`.

## Definición del producto

Auteur Education es una plataforma web B2C de educación teórica personalizada que transforma una intención de aprendizaje en una trayectoria estructurada, investigada y adaptada al punto de partida del usuario.

La persona expresa qué quiere comprender, cuál es su experiencia previa y qué resultado espera alcanzar. Auteur la ayuda a precisar ese objetivo, le presenta posibles direcciones de aprendizaje, construye un Blueprint para el recorrido elegido y, después de su aprobación, genera un curso organizado en módulos y lecciones que puede leerse y escucharse.

El producto no busca simplemente generar contenido. Busca que la persona pueda comprender, distinguir, explicar, comparar, analizar o evaluar algo que antes no podía.

## Problema que resuelve

Una persona puede tener interés en un tema sin saber:

- qué pregunta necesita responder;
- qué parte del tema debería estudiar;
- qué conocimientos necesita primero;
- desde qué perspectiva conviene abordarlo;
- en qué orden debería aprender los conceptos;
- cómo distinguir información central de contenido accesorio;
- cuándo alcanzó una comprensión suficiente.

Una respuesta convencional de inteligencia artificial puede producir mucha información, pero no necesariamente construye una progresión pedagógica, considera el nivel del usuario, conserva coherencia entre las distintas partes ni demuestra en qué fuentes se apoya.

Auteur convierte una intención amplia o desordenada en un recorrido intelectual con objetivo, alcance, secuencia, fuentes, límites y criterios de comprensión.

## Usuario principal

El usuario principal de Auteur es una persona adulta, curiosa, ambiciosa y culturalmente abierta que siente que podría desarrollar más capacidades de las que posee actualmente, pero todavía no cuenta con una estructura clara para hacerlo.

No se define por una profesión ni necesita considerarse intelectual. Puede ser estudiante, profesional, creativo, emprendedor o encontrarse todavía explorando su campo. Lo que lo caracteriza es el deseo de comprender mejor el mundo, desarrollar criterio y ampliar las posibilidades de lo que puede hacer con su vida.

Generalmente ya consume libros, artículos, podcasts, cursos y otras formas de contenido, pero siente que gran parte de ese conocimiento permanece fragmentado. Tiene información e intereses, aunque no siempre posee un recorrido que le permita relacionarlos, jerarquizarlos y convertirlos en comprensión.

Auteur se dirige principalmente a personas que ya tienen curiosidad e iniciativa, pero necesitan estructura, dirección y profundidad. No busca convencer de aprender a alguien completamente desinteresado ni comunicarse únicamente con expertos de formación académica avanzada. Los usuarios avanzados también pueden encontrar valor, pero no deben definir la experiencia ni el lenguaje general del producto.

El producto debe permitirle:

- precisar qué quiere comprender;
- construir fundamentos desde cero;
- ordenar conocimientos dispersos;
- atravesar distintas disciplinas;
- profundizar una formación previa;
- relacionar ideas que antes aparecían aisladas;
- comparar perspectivas y desarrollar criterio propio;
- adquirir fundamentos conceptuales antes de comenzar una práctica;
- avanzar desde su capacidad actual hacia objetivos intelectuales más amplios.

La experiencia debe resultar accesible sin ser superficial, intelectualmente exigente sin convertirse en académicamente excluyente y cercana a la vida real sin prometer resultados prácticos que el aprendizaje mediante texto y audio no puede garantizar.

## Valor entregado

El curso es el medio pedagógico. El valor final es la comprensión o capacidad intelectual que desarrolla la persona.

Auteur debe permitirle:

- comprender temas complejos;
- construir un marco conceptual;
- ordenar conocimientos dispersos;
- reconocer distinciones relevantes;
- relacionar ideas que antes aparecían aisladas;
- comparar perspectivas sin confundirlas;
- analizar argumentos, métodos o decisiones;
- identificar límites, controversias y explicaciones alternativas;
- formular nuevas preguntas a partir de lo aprendido.

Auteur no promete dominio profesional, certificación, transformación personal ni resultados prácticos que el aprendizaje mediante texto y audio no pueda producir honestamente.

## Experiencia central

El recorrido principal comienza con una intención, una pregunta o una capacidad que la persona quiere desarrollar.

1. El usuario expresa qué quiere aprender o comprender.
2. Indica su nivel y sus conocimientos previos.
3. Define qué resultado espera alcanzar.
4. Si la solicitud es demasiado amplia, Auteur ayuda a precisar el objeto de aprendizaje.
5. Auteur formula un objetivo concreto y el usuario lo confirma o corrige.
6. El sistema presenta entre una y cinco propuestas de curso realmente diferentes.
7. El usuario elige una dirección.
8. Auteur genera un Blueprint que explica qué se enseñará, qué quedará fuera, cómo se organizará el recorrido y por qué.
9. El usuario revisa, modifica o aprueba el Blueprint.
10. Después de la aprobación, el sistema investiga y construye el curso.
11. El curso se publica como una trayectoria de módulos y lecciones con texto, audio, fuentes y evaluaciones formativas.
12. El usuario puede avanzar, abandonar y retomar su progreso desde su biblioteca personal.

La cantidad de propuestas no debe completarse artificialmente. Si solamente existe una dirección verdaderamente adecuada, el sistema puede presentar una sola.

## El Blueprint

El Blueprint es el contrato pedagógico entre la intención del usuario y el curso que se construirá.

No es solamente un índice. Debe explicar:

- el objetivo que persigue el curso;
- su alcance y sus exclusiones;
- los conocimientos que se asumirán;
- la perspectiva o principio organizador;
- los módulos y lecciones previstos;
- la progresión conceptual;
- las principales preguntas, conceptos y controversias;
- la justificación de la estructura y del orden elegidos.

El curso no puede comenzar a construirse sin la aprobación explícita del usuario. Si el Blueprint cambia, debe volver a aprobarse.

## Modelo de aprendizaje

Un curso de Auteur es el recorrido mínimo suficiente para alcanzar el objetivo aprobado. No debe comportarse como una enciclopedia ni como una colección intercambiable de resúmenes.

Cada módulo representa una etapa conceptual del recorrido. Cada lección debe producir una ganancia intelectual reconocible y preparar la comprensión necesaria para lo que sigue.

Las lecciones deben presentar, cuando corresponda:

- una pregunta o problema;
- una idea o relación central;
- conceptos y distinciones;
- desarrollo argumental;
- ejemplos explicables mediante lenguaje;
- límites, contraejemplos o controversias;
- una síntesis;
- un puente hacia la lección siguiente;
- las fuentes realmente utilizadas.

La extensión del curso se subordina al objetivo. No se agrega contenido para completar una cantidad predeterminada de módulos o lecciones.

## Investigación y fuentes

Auteur investiga antes de escribir contenido factual.

Las fuentes utilizadas deben ser verificables, pertinentes y estar relacionadas con las afirmaciones que respaldan. El sistema no debe inventar autores, obras, citas, datos, enlaces ni referencias bibliográficas.

Cuando existan desacuerdos relevantes, el curso debe representar las distintas posiciones, sus fundamentos y su peso relativo sin caricaturizarlas ni crear un falso equilibrio.

La investigación, la trazabilidad de las fuentes y la revisión editorial forman parte del producto, no son detalles internos opcionales.

## Criterio intelectual

Auteur aplica una disciplina interna de análisis inspirada, cuando resulte pertinente, en el materialismo filosófico.

Este criterio debe ayudar a identificar mecanismos, operaciones, instituciones, condiciones materiales, escalas, restricciones, relaciones históricas y límites de las explicaciones.

No debe convertirse en una etiqueta doctrinal visible ni imponerse a todos los temas. Cuando no agregue valor, deben prevalecer los métodos propios de la disciplina estudiada. Cuando se presenten autores o tradiciones diferentes, sus posiciones deben explicarse fielmente antes de interpretarlas o criticarlas.

## Texto y audio

La experiencia educativa de Auteur es principalmente textual y sonora.

Una clase debe poder comprenderse completamente mediante:

- texto editorial;
- narración en audio;
- títulos y definiciones;
- citas y fuentes;
- comparaciones escritas;
- ejemplos descriptibles;
- tablas simples;
- controversias y contraejemplos;
- preguntas de comprensión.

El audio no es un resumen ni un contenido diferente. Debe conservar el significado, la estructura y la evidencia sustantiva de la versión escrita.

## Límites del medio

El contenido pedagógico no puede depender de imágenes, video, demostraciones visuales, acciones físicas o manipulación práctica.

Las solicitudes se clasifican de la siguiente manera:

- **Compatible:** puede enseñarse correctamente mediante teoría, texto y audio.
- **Compatible con reformulación:** contiene una dimensión conceptual enseñable, aunque el pedido original sea práctico o visual.
- **Incompatible:** depende esencialmente de una demostración visual, corporal, manual o procedimental.

Por ejemplo, Auteur puede enseñar los fundamentos, la historia, los criterios y las implicancias de la edición fotográfica, pero no puede reemplazar una demostración práctica dentro de Photoshop.

## Principios del producto

### Fidelidad a la intención

El objetivo, el Blueprint y el curso deben conservar la necesidad real expresada por el usuario.

### Control del usuario

El usuario confirma el objetivo, elige la propuesta y aprueba el Blueprint antes de que se construya el curso.

### Valor antes de la conversión

La persona debe recibir una propuesta de aprendizaje suficientemente concreta antes de registrarse y pagar.

### Progresión intelectual

Los contenidos deben formar una secuencia acumulativa basada en prerrequisitos y dependencias conceptuales.

### Honestidad

El producto debe reconocer los límites del aprendizaje mediante texto y audio y no prometer resultados que no puede producir.

### Evidencia

Las afirmaciones sustantivas deben investigarse. Las fuentes no se inventan ni se utilizan como decoración.

### Ausencia de relleno

La extensión y estructura responden al objetivo pedagógico, no a cuotas predeterminadas.

### Continuidad

El usuario puede abandonar y retomar sus cursos sin perder el progreso confirmado.

### Evaluación formativa

Las comprobaciones de conocimiento ayudan a detectar confusiones, pero no bloquean el avance ni representan una certificación.

### Criterio editorial

El contenido debe sentirse como una clase universitaria personalizada, un ensayo estructurado o un podcast educativo, no como una respuesta extensa de chatbot.

## Qué es Auteur

- Una plataforma de educación teórica personalizada.
- Un sistema que convierte intenciones en recorridos pedagógicos.
- Una experiencia de aprendizaje mediante texto y audio.
- Una cadena de investigación, estructuración, generación y revisión.
- Una biblioteca personal de cursos persistentes.
- Una herramienta para desarrollar comprensión y criterio.

## Qué no es Auteur

- Un chatbot que responde prompts largos.
- Un generador automático de textos sin estructura.
- Un marketplace de profesores o cursos.
- Un LMS institucional tradicional.
- Una plataforma de tutoriales visuales.
- Un tutor conversacional adaptativo permanente.
- Una aplicación de certificación o acreditación.
- Una promesa de dominio práctico o profesional.
- Una aplicación móvil nativa.

## Experiencias del producto

Auteur contempla dos experiencias complementarias.

### Creación personalizada

Parte de una pregunta, intención o capacidad deseada y construye un recorrido específicamente diseñado para esa persona.

### Selección editorial

Presenta cursos elegidos, investigados y revisados bajo el criterio institucional de Auteur, permitiendo descubrir preguntas relevantes y continuar aprendiendo.

La creación personalizada constituye la experiencia central del producto actual. La Selección editorial forma parte de la visión del producto, pero su implementación no pertenece al MVP inicial.

## Criterio de éxito

Auteur cumple su propósito cuando:

- el usuario entiende qué recibirá antes de construir el curso;
- el recorrido conserva su intención original;
- la estructura se adapta realmente a su punto de partida;
- el curso desarrolla una progresión intelectual coherente;
- cada lección aporta una comprensión identificable;
- las afirmaciones relevantes pueden rastrearse hasta fuentes reales;
- el usuario puede leer, escuchar y retomar el curso;
- el resultado evita superficialidad, relleno y formulaciones genéricas;
- el usuario termina pudiendo realizar una operación intelectual que antes no podía.

## Relación con otros documentos

Este archivo define la identidad y los principios estables del producto.

Los detalles correspondientes a la primera versión se documentan en `MVP.md`. Los recorridos específicos se describen en `USER_FLOWS.md`; las reglas verificables, en `BUSINESS_RULES.md`; y el comportamiento de los sistemas generativos, en `AI_GENERATION.md`.

Las decisiones técnicas y de arquitectura no forman parte de esta definición.