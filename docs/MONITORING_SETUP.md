# Monitoring & Alerting — setup guide

Pasos para activar el monitoring de producción. Todo gratis salvo notas.

## 1. Uptime monitor — BetterStack (recomendado)

**Por qué**: free tier de 10 monitors, 3-min checks, status page público.

### Setup (10 min)

1. https://betterstack.com → Sign up con GitHub
2. Uptime → **Create Monitor**:
   - **URL**: `https://api.destino.app/healthz`
   - **Check frequency**: 3 minutes
   - **Expected status**: 200
   - **Expected body contains**: `"ok":true` (si lo retornás así) o solo `200`
3. **Alerts** → email/SMS/Slack según preferencia
4. Repetir para frontend: `https://destino.app` (200 esperado)

### Status page público (opcional, gratis)

BetterStack → Status Pages → New
- Subdomain: `status.destino.app`
- Monitors: agregá los 2 anteriores
- Users pueden suscribirse a actualizaciones

## 2. Sentry — alert rules

Sentry ya está instalado (commit anterior). Solo falta configurar **alert rules**.

### Rules recomendadas (5 min)

1. https://sentry.io → tu proyecto → **Alerts** → **Create Alert**

#### Rule 1: New error type
- **When**: A new issue is created
- **If**: `event.level` is `error` or `fatal`
- **Then**: Send email to `orbys85@gmail.com`

#### Rule 2: Error rate spike
- **When**: Number of events in an issue > 50 in 1 hour
- **Then**: Send email + (opcional) Slack webhook

#### Rule 3: Performance regression
- **When**: p95 transaction duration > 2s para 5 min
- **Then**: Send email

#### Rule 4: Critical user impact
- **When**: Issue affects > 100 users
- **Then**: Send SMS + email

### Tags útiles para filtrar

Tu código ya envía estos tags en errores:
- `boundary_scope` → qué área de la app cayó (admin, live-show, etc.)
- `reqId` → trace por request

Filtros en Sentry:
```
tags.boundary_scope:live-show  # solo errores del live show
level:fatal                    # solo fatales
```

## 3. PostHog — funnel + retention

Ya está instalado (`VITE_POSTHOG_KEY`). Para empezar a ver data:

### Setup funnels críticos (15 min)

1. https://posthog.com → tu proyecto → **Funnels**

#### Funnel 1: Signup → activación
- Step 1: `sign_up_started`
- Step 2: `sign_up_completed`
- Step 3: `onboarding_completed`
- Step 4: `swipe_right` (primer swipe)
- Step 5: `match_created` (primer match)

#### Funnel 2: Monetización
- Step 1: `coin_purchase_initiated`
- Step 2: `coin_purchase_completed`

#### Funnel 3: Premium
- Step 1: `premium_purchased` (`step: 'checkout_initiated'`)
- Step 2: `premium_purchased` (`step: 'success'` — cuando lo agreguemos)

#### Retention
- Cohort weekly: users que hicieron `sign_up_completed`
- Returning event: `swipe_right`

## 4. Railway — cost alerts

1. https://railway.app → tu proyecto → **Settings** → **Usage**
2. **Spending Limit**: $50/mes (te avisa si te pasás)
3. **Email notifications**: ON

## 5. Supabase — query performance

Activar **Query Performance** insights:

1. https://supabase.com/dashboard → tu proyecto
2. **Database** → **Query Performance**
3. Revisar las top 10 queries por tiempo total
4. Si alguna toma > 100ms p95, agregar index

### Query lenta común — explore feed

Si `getFeed` aparece arriba, asegurate que tenés:

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_feed
  ON profiles (gender, age, country, last_active DESC)
  WHERE is_adult_creator = false AND status = 'active';
```

## 6. Migrations safety

### Comando estándar para aplicar migrations

```bash
# Linux/Mac/Git-Bash
bash scripts/repair-and-push-migrations.sh

# Windows PowerShell
pwsh scripts/repair-and-push-migrations.ps1
```

Antes de cada `supabase db push` en producción:
1. Confirmar que las migrations corren OK en local Supabase (`supabase start`)
2. Backup de DB (Supabase Pro lo hace auto)
3. Aplicar — el script repara timestamps duplicados si hace falta

## 7. Domain & DNS — Cloudflare (cuando migremos)

Plan actual: DNS + WAF + proxy en Cloudflare, Pages NO (por contenido adulto).
Ver decisión en docs/INFRA_PLAN.md (si existe).

Cuando se migre:
1. https://cloudflare.com → Add Site → `destino.app`
2. Copiar nameservers que te da → setear en tu registrar (Namecheap/GoDaddy)
3. Esperar 24h propagación
4. Activar:
   - **SSL**: Full (strict)
   - **WAF**: Managed Rules ON
   - **Bot Fight Mode**: ON
   - **Always Use HTTPS**: ON
   - **Min TLS**: 1.2

## 8. Email deliverability — Resend

1. https://resend.com/domains → Add Domain → `destino.app`
2. Copiar los 3 DNS records:
   - **MX** (optional, para replies)
   - **SPF**: `v=spf1 include:_spf.resend.com ~all`
   - **DKIM** (3 CNAME records)
3. Agregarlos en Cloudflare DNS
4. Volver a Resend → Verify Domain
5. ~10 min hasta verificado

## 9. Backup test (mensual)

```
1. Supabase Dashboard → Database → Backups
2. Confirmar que el backup más reciente es < 24h
3. Una vez al mes, restore a un proyecto staging
4. Verificar que funciona

⚠️  Un backup que nunca probaste NO existe.
```

## 10. Compliance config (post-launch)

Antes de aceptar primer pago:

```sql
UPDATE compliance_config SET value = '<valor>' WHERE key = '<key>';
```

Keys a llenar:
- `entity_name` → "OC Moon Group LLC"
- `entity_address` → dirección registrada
- `entity_tax_id` → EIN
- `dmca_agent_name` → quién recibe DMCA notices
- `dmca_agent_address` → dirección física del agente
- `dmca_agent_phone` → teléfono
- `dmca_agent_registered_at` → fecha registro US Copyright Office
- `custodian_name` → custodio 2257 (solo si abrís USA)
- `dpo_name` → DPO (solo si abrís EU)

## 11. Checklist pre-launch

```
[ ] BetterStack monitor activo en /healthz
[ ] Sentry alerts configuradas (4 rules mínimas)
[ ] PostHog funnels creados
[ ] Railway cost alert a $50
[ ] Supabase Query Performance revisado
[ ] DNS apuntando a Cloudflare (proxy ON)
[ ] WAF + Bot Fight Mode ON
[ ] Resend dominio verificado
[ ] Backup probado en staging
[ ] Compliance config llenado
[ ] env vars críticas en Railway (ver backend/.env.example)
[ ] Stripe en modo LIVE
[ ] CCBill webhook URL configurada en CCBill portal
[ ] LiveKit token expiry razonable (default 2h)
[ ] /healthz devuelve 200 desde el dominio público
```

Si todos están en ✅ → estás listo para abrir.
