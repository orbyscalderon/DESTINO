# Runbook — incident response

Documento operacional para cuando algo se rompe en producción.

## 1. Triaje rápido — qué chequear primero

Si te llega alerta o user reporta "no funciona":

```
1. ¿/healthz responde 200?              → https://api.destino.app/healthz
2. ¿Sentry tiene errores nuevos?         → https://sentry.io → tu proyecto
3. ¿Railway service is "running"?        → https://railway.app → backend
4. ¿Supabase project is healthy?         → https://supabase.com/dashboard
5. ¿Cloudflare status?                   → https://www.cloudflarestatus.com/
6. ¿LiveKit Cloud status?                → https://status.livekit.io/
7. ¿Stripe status?                       → https://status.stripe.com/
```

Si todo ✅ y el user sigue reportando → es bug específico, leer su request_id en logs (`X-Request-Id` header).

## 2. Severidades

| Sev | Definición | Tiempo de respuesta |
|---|---|---|
| **SEV-0** | Sitio down completo, pagos fallando, data leak | **15 min** — page al teléfono |
| **SEV-1** | Feature crítica rota (login, signup, chat) | 1 hora |
| **SEV-2** | Feature secundaria rota (perfil, settings) | 4 horas |
| **SEV-3** | UI bug visual, typo | 1 día |

## 3. Playbooks por síntoma

### A) `/healthz` responde 5xx o timeout

**Causa probable**: backend crasheó, OOM, o Supabase no conecta.

```bash
# 1. Ver logs Railway
railway logs --tail 200

# 2. Si ves OOM → bump RAM en Railway settings (de 512MB a 1GB)
# 3. Si ves "ECONNREFUSED supabase" → check Supabase dashboard
# 4. Si nada en logs → restart manual
railway service restart
```

### B) Webhooks de Stripe no llegan

**Causa probable**: webhook secret mal seteado o raw body parseado por error.

```bash
# 1. Verificar secret en Railway env: STRIPE_WEBHOOK_SECRET=whsec_...
# 2. Verificar en Stripe dashboard que el endpoint URL es correcto
#    https://api.destino.app/api/payments/webhook
# 3. Replay del último webhook en Stripe dashboard
# 4. Buscar en logs:
railway logs | grep "constructEvent"
```

### C) LiveKit muestra "DUPLICATE_IDENTITY" o "could not createOffer"

**Causa**: identity duplicado entre 2 sesiones del mismo user.

- Viewers tienen suffix random (`userId#abc12345`) → fix ya aplicado en commit 1c8d8b6
- Si pasa con HOST → el host abrió 2 tabs como host. Es comportamiento esperado.

Si pasa masivamente → verificar `videoProvider.js:createToken` no se rompió.

### D) Mass DM no termina (status: 'queued' permanente)

**Causa**: el setImmediate del fan-out falló silently después de responder 202.

```sql
-- Ver broadcast en estado 'sending'
SELECT id, recipients_count, sent_count, status, completed_at
FROM mass_dm_broadcasts
WHERE status = 'sending'
ORDER BY created_at DESC LIMIT 10;
```

```bash
# Logs del fan-out
railway logs | grep "fanout"
```

Si nunca termina → bug en `processBroadcastFanOut`. Marcar como `failed` manualmente:

```sql
UPDATE mass_dm_broadcasts SET status = 'failed' WHERE id = '...';
```

### E) Resend rechaza emails (422)

**Causa**: dominio `destino.app` no verificado o SPF/DKIM rotos.

```
1. https://resend.com/domains → verificar destino.app está "Verified"
2. Si no, agregar DNS records:
   - TXT: SPF
   - CNAME ×3: DKIM
   - MX (opcional, para replies)
3. Esperar 24h propagación
4. Re-trigger el send: railway logs | grep "[mail:failed]"
```

### F) Stripe sk_test_ en producción

**Causa**: env var no actualizada al pasar a live.

```
1. https://dashboard.stripe.com → toggle live mode
2. Copiar sk_live_... + whsec_... (webhook signing en live)
3. Update Railway env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
4. Update STRIPE_PRICE_ID, STRIPE_VIP_PRICE_ID con price IDs de live products
5. Restart Railway service
```

### G) Migrations no aplican (`23505 unique constraint`)

Ver [docs/MONITORING_SETUP.md](MONITORING_SETUP.md) sección "Migrations" — usar `scripts/repair-and-push-migrations.ps1`.

## 4. Rollback de deploy

Si el último deploy rompió producción:

```bash
# Railway
railway deployments
railway rollback <deployment-id>

# O via git
git revert HEAD
git push origin main
# Railway auto-redeploys
```

**Antes de rollback**:
1. ¿Es una migration SQL? Si sí, **NO rollback código sin rollback de DB** primero (puede dejar columns huérfanas).
2. Documentar qué se rompió → issue en GitHub.

## 5. Acceso de emergencia

Si nadie del team está disponible:

| Servicio | Quién tiene acceso |
|---|---|
| Railway | `orbys85@gmail.com` (owner) |
| Supabase | `orbys85@gmail.com` (owner) |
| Stripe | `orbys85@gmail.com` |
| LiveKit Cloud | `orbys85@gmail.com` |
| Sentry | `orbys85@gmail.com` |
| GitHub | `orbys85@gmail.com` |
| Resend | `orbys85@gmail.com` |
| Cloudflare | TBD |

⚠️ **Single point of failure**: todo bajo 1 email. Plan post-launch — agregar admin secundario.

## 6. Backup test (hacer mensual)

```bash
# 1. Verificar que Supabase backups están activos
#    Dashboard → Database → Backups

# 2. Una vez al mes, crear staging project y restore último backup
#    Confirmar que el restore funciona

# 3. Si nunca lo probaste — el backup no existe.
```

## 7. Cost alerts

Setear en cada provider:

| Provider | Alert threshold |
|---|---|
| Railway | $50/mes — si pasás esto algo se desbocó |
| Supabase | $50/mes |
| LiveKit Cloud | $30/mes — si crece a esto, evaluar Vultr self-hosted |
| Stripe | -- (no aplica) |
| OpenAI | $20/mes |
| Sightengine | -- (free tier) |

## 8. Contacto incidents externos

- **DMCA notice**: `dmca@destino.app` (configurar en `compliance_config`)
- **NCMEC (CSAM)**: 1-800-843-5678 / report.cybertip.org
- **2257 records request**: `records@destino.app`
- **Stripe risk team**: directo en dashboard "Disputes" tab
- **CCBill compliance**: support ticket en CCBill portal

## 9. Post-incident

Después de resolver un SEV-0/1:

1. Documento postmortem en `docs/postmortems/YYYY-MM-DD-<short>.md`:
   - Qué pasó (timeline)
   - Por qué (root cause)
   - Cómo se detectó (alert? user report?)
   - Cómo se resolvió
   - Action items para prevenir
2. Crear issues en GitHub para cada action item
3. Si fue por bug en código → escribir test que reproduzca antes de cerrar issue
