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

1:1 con `auth.users`. Trigger `private.handle_new_user` inserta el perfil y, si el alta trae datos, copia `first_name`, `last_name`, `birth_date` y `gender`. Esos campos quedan vacíos en un visitante anónimo. No autorizan nada: el acceso sigue saliendo del `id` verificado.

`birth_date` es una fecha que, al momento del alta, corresponde a una edad de 13 a 120 años. `gender` es `female`, `male`, `nonbinary` o `undisclosed`. Si el alta llega por Google y el nombre todavía está vacío, el trigger parte `full_name` en `first_name` y `last_name` y guarda `avatar_url` solo cuando es una URL `https`.

El visitante sin cuenta es un usuario anónimo de Supabase. Al crear la cuenta, el mismo `id` se conserva, o FastAPI mueve las filas si entra a una cuenta que ya existía (DEC-011).

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

RLS está activo en las nueve tablas de dominio. `anon` y `authenticated` no tienen grants: el navegador no lee esas tablas. `service_role` escribe después de verificar el JWT. Una policy restrictiva niega el JWT anónimo si esos grants volvieran a existir.

## Fuera de alcance

Stripe, créditos, ElevenLabs, biblioteca, administración, respuestas de Knowledge Check, TTL de solicitudes anónimas (`BR-ONB-009`). La sesión de Auth sí está en alcance (DEC-011).
