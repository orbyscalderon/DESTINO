# Deploy de Encuentros — pasos exactos

## TL;DR

```bash
# 1. Local dev (después de install)
make dev
# → Backend en :4100, Frontend en :5180

# 2. Demo deploy (sin LLC offshore aún, solo para preview UI)
#    Frontend → Vercel free tier
#    Backend  → Railway free tier
#    DB       → Supabase free tier (project NUEVO, no el de Destino TV)

# 3. Prod deploy (CON LLC offshore + processor)
#    Mismo stack pero a dominio propio + plan pago
```

## Paso 1: Dev local (10 min)

```bash
cd encuentros
make install            # instala backend + frontend deps

# Copiá los .env.example a .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Editá backend/.env con tu Supabase project (uno NUEVO, no el de Destino TV)
# Mínimo necesario:
#   ENCUENTROS_SUPABASE_URL=https://xxx.supabase.co
#   ENCUENTROS_SUPABASE_SERVICE_KEY=eyJ...

# Aplicá el schema + seed
SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres" make seed

# Levantá todo
make dev
# Abrí http://localhost:5180
```

## Paso 2: Demo deploy (1-2 horas, gratis)

### 2.1 Supabase project nuevo

```
1. https://supabase.com/dashboard → New project
2. Name: encuentros-demo
3. Region: us-east-1 (US East) o sa-east-1 (São Paulo) para latencia LATAM
4. Settings → API → copiar:
   - URL              → ENCUENTROS_SUPABASE_URL
   - service_role key → ENCUENTROS_SUPABASE_SERVICE_KEY
5. SQL Editor → pegar contenido de:
   - database/schema_v1_encuentros.sql
   - database/seed_demo_listings.sql
6. Ejecutar ambos
```

### 2.2 Backend en Railway

```
1. https://railway.app → New project → Deploy from GitHub
2. Seleccionar este repo
3. Service name: encuentros-backend
4. Root directory: /encuentros/backend
5. Variables (settear todas):
   - PORT=4100  (Railway lo expone automáticamente)
   - NODE_ENV=production
   - ENCUENTROS_SUPABASE_URL=<de supabase>
   - ENCUENTROS_SUPABASE_SERVICE_KEY=<de supabase>
   - FRONTEND_URL=https://encuentros-demo.vercel.app
6. Deploy → copiar la URL pública del backend
   Ej: https://encuentros-backend-production.up.railway.app
```

### 2.3 Frontend en Vercel

```
1. https://vercel.com → Add New → Project → Import Git Repository
2. Seleccionar este repo
3. Root directory: encuentros/frontend
4. Framework preset: Vite
5. Environment variables:
   - VITE_API_URL=<la URL de Railway del paso 2.2>
   - VITE_PUBLIC_URL=https://encuentros-demo.vercel.app
6. Deploy
7. Custom domain (opcional): encuentros-demo.tu-dominio.com
```

### 2.4 Activar el link en Destino TV

```
En el proyecto de Destino TV (Vercel/Cloudflare Pages):
1. Environment variables → añadir:
   VITE_ENCUENTROS_URL=https://encuentros-demo.vercel.app
2. Redeploy
3. Ir a /adult en Destino TV → al final aparece el banner naranja
   "encuentros · sitio partner"
4. Click → abre el demo
```

## Paso 3: Producción real (4-7 semanas)

### 3.1 Pre-requisitos legales/operacionales

| Item | Provider | Tiempo | Costo aprox |
|---|---|---|---|
| LLC offshore | Belize Corp (Speedy Inc, Holcorp) | 1-2 sem | $1500-2500 |
| Lawyer review (Tos, 2257, DSA) | Local en jurisdicción | 1 sem | $1500-3000 |
| Bank corporate | Caye Int'l Bank, EuroPacific | 2-3 sem | $300 setup |
| Merchant escort | Verotel, MobiusPay, SegPay | 1-3 sem | 5-12% fee |
| Domain | encuentrosdo.com vía Namecheap | 5 min | $10/año |
| Email domain | Google Workspace en el domain nuevo | 30 min | $6/usuario |
| Cloudflare | Cuenta nueva (NO la de destino) | 5 min | Free tier OK |

### 3.2 Mover de demo a prod

```
1. Cambiar VITE_API_URL en Vercel del frontend
   FROM: https://encuentros-backend-production.up.railway.app
   TO:   https://api.encuentrosdo.com

2. Cambiar custom domain del frontend Vercel
   FROM: encuentros-demo.vercel.app
   TO:   encuentrosdo.com

3. Railway:
   - Backend pasa a plan Pro (5$/mes)
   - Custom domain: api.encuentrosdo.com
   - Update FRONTEND_URL en env

4. Onfido/Jumio: aplicar age verification API
   Settear ONFIDO_API_TOKEN y ONFIDO_WEBHOOK_TOKEN

5. Verotel/MobiusPay: aplicar a su escort program
   Settear vars correspondientes

6. Migrar DB: NO migrar los demo listings. Schema sí, seed NO.
   Los publishers reales se onboardean uno por uno con KYC.

7. En Destino TV:
   VITE_ENCUENTROS_URL=https://encuentrosdo.com (cambiar de la demo)

8. Cloudflare proxy + WAF activado en el domain de Encuentros
```

### 3.3 Verificación final pre-launch

- [ ] LLC offshore registrada, owners declarados, sin overlap con OC Moon LLC
- [ ] Bank account funcional a nombre de la LLC
- [ ] Merchant approved + test transactions OK
- [ ] Domain whois NO muestra a Orbys / OC Moon LLC (usar privacy proxy)
- [ ] Tos / Privacy / 2257 / DSA publicados en footer del sitio
- [ ] Onfido funcional en el publish flow
- [ ] Reportes urgentes (underage/trafficking) llegan al email correcto
- [ ] DB de prod SIN demo listings — solo publishers KYCeados
- [ ] Sentry / Plausible apuntando a cuentas SEPARADAS de Destino TV
- [ ] DPO designado en jurisdicción de la LLC

## Mantenimiento

- Cron diario para expirar listings (status='expired' cuando expires_at < now())
- Cron diario para enviar warnings 3 días antes de expiry
- Backup nightly de la DB (Supabase Pro lo hace automático)
- Review semanal de reports urgentes (siempre <24h SLA)
- Audit mensual de listings activos (Onfido re-verify si > 6 meses)

## Rollback

Si algo sale mal:
```
En Destino TV → quitar VITE_ENCUENTROS_URL del env → redeploy.
El banner desaparece. Encuentros sigue operando pero deslinkeado.
```
