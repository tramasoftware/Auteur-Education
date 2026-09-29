# DATA_MODEL.md

# Auteur Education

**Versión:** 0.1

**Estado:** Modelo de persistencia del generador en `auteur-education-dev`. No cubre Stripe, audio, biblioteca, administración ni progreso del estudiante.

**Ubicación canónica:** `docs/DATA_MODEL.md`

## Propósito

Describir las tablas que sustituyen el `DemoStore` in-memory para el flujo de generación (solicitud → objetivo → propuestas → Blueprint → curso).

El plano de datos para el navegador sigue siendo FastAPI (DEC-012). El frontend no usa PostgREST ni `service_role`.

## Identificadores y tiempo

- Claves: `uuid` PostgreSQL (`gen_random_uuid()`). La API expone el UUID con guiones (DEC-014).
- Tiempos: `timestamptz`. Tablas mutables tienen `updated_at` vía `public.set_updated_at()`.

## Tablas

### `profiles`

1:1 con `auth.users`. Trigger `private.handle_new_user` inserta el perfil.

El usuario demo `00000000-0000-0000-0000-000000000001` se siembra para el bypass no productivo (DEC-011).

### `learning_requests`

Equivalente a `LearningRequestRecord` sin las versiones de objetivo.

`interpretation`, `compatibility`, `precision`, `proposal_set` y `selected_precision` son JSONB. `blueprint_id` y `course_id` son UUID denormalizados **sin FK cruzada** (evitan ciclos con `blueprints.request_id` y `courses.request_id`).

### `objective_versions`

Una fila por versión. UNIQUE `(learning_request_id, version)`. `confirmed` sostiene BR-OBJ-010.

### `blueprints`

UNIQUE `request_id` (un Blueprint activo por solicitud; un reintento reutiliza la fila). `course_id` sin FK cíclica.

### `blueprint_versions`

UNIQUE `(blueprint_id, version)`. `visible` e `internal` son JSONB. `internal` no se sirve en el API público de producto.

### `courses`

El build. UNIQUE `blueprint_id` (BR-GEN-012). Estados = `CourseState`.

### `modules` / `lessons`

Filas reales del curso, no el plan del Blueprint. `user_id` y `course_id` denormalizados para RLS y listados. El API público de lección solo responde si el módulo está `published` (BR-GEN-004); RLS no sustituye esa regla.

### `generation_traces`

Una fila por llamada a modelo (`StageTrace`). Sin prompts ni output crudo. DEC-005 sigue ocultando este endpoint en producción.

## Relaciones

```text
auth.users
  └── profiles
        └── learning_requests
              ├── objective_versions
              ├── blueprints
              │     └── blueprint_versions
              ├── courses
              │     └── modules
              │           └── lessons
              └── generation_traces
```

## RLS

RLS está activo en las nueve tablas de dominio. Policies `authenticated`: `user_id = auth.uid()` para SELECT/INSERT/UPDATE. Sin DELETE para el learner. `anon` no tiene grants. El backend escribe con `service_role` después de atribuir `user_id` (JWT o demo).

## Fuera de alcance

Autenticación de producto, Stripe, créditos, ElevenLabs, biblioteca, administración, respuestas de Knowledge Check, TTL de solicitudes anónimas (`BR-ONB-009`).
