# Directorio `database/` — LEGACY

Este directorio contiene 76 migraciones históricas (v2 → v75) del período
pre-Supabase-CLI. **NO usar para deploys nuevos.**

## Estado actual (2026-06-25)

Todas las migraciones de `database/` **ya están aplicadas** a las bases
Supabase de producción y staging. Se preservan por:

- **Auditoría histórica** — trazabilidad de cambios de schema
- **Fresh deploys** — replicar el estado histórico si necesitamos otro entorno
- **Rollback documentation** — algunas incluyen `-- DOWN:` comentado

## ¿Dónde van las migraciones nuevas?

**Todas las migraciones NUEVAS van a `/supabase/migrations/`** con timestamp
formato `YYYYMMDDHHMMSS_descripcion.sql` para que Supabase CLI las gestione:

```bash
supabase migration new nombre_de_la_migration
```

## Orden de aplicación (fresh deploy)

Si necesitás recrear una base desde cero:

1. `database/schema_v1_initial.sql` (base — si existe) o `supabase/migrations/*complete_schema.sql`
2. `database/migration_v2.sql` → `migration_v75_*.sql` en orden alfabético
3. `supabase/migrations/20260521*.sql` en adelante en orden alfabético

**Recomendado**: en vez de correr las 94 migrations, usar `supabase db dump`
de un ambiente sano y aplicarlo directamente. Solo aplicar migrations
si necesitás el step-by-step para debugging.

## Tablas relevantes que viven aquí

Las siguientes tablas fueron creadas por migrations legacy y NO están
en `supabase/migrations/*complete_schema.sql`:

- `reels`, `reel_likes`, `reel_comments`, `reel_saves` — v35, v36, v37
- `adult_categories`, `creator_terms` — v29, v33
- `tiers`, `tier_gifts`, `subscription_tiers` — v32
- `battles`, `battle_participants`, `battle_gifts` — v28, v30
- Watermark queue tables — v40+
- Achievement tables — v50+

Si añadís columnas a estas tablas, hacelo en `supabase/migrations/` con
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotente).

## Consolidación futura (post-launch)

Post-launch, dumpear el schema actual (`supabase db dump --data-only=false`)
y consolidar todo en `supabase/migrations/00000000000000_baseline.sql`.
Luego archivar `database/*` completo. No se hace pre-launch por riesgo
de desalineación entre schema real vs baseline generado.
