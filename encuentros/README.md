# Encuentros — Producto separado

Producto independiente estilo Skokka/Slixa. **NO se debe deployar en el
mismo dominio que Destino TV ni operar bajo OC Moon Group LLC.**

## ⚠ Requisitos legales/operacionales antes de deploy

| Capa | Requisito |
|---|---|
| **Entidad legal** | LLC offshore separada (Belize Corp / Curacao N.V. / Costa Rica S.R.L.). Owners NO solapados con OC Moon Group LLC. |
| **Domain** | Dominio completamente distinto (NO subdomain de destino.app). Ejemplos: `encuentrosdo.com`, `linksdo.net`, `contactosdo.com`. |
| **Payment processor** | Verotel, MobiusPay, o SegPay con escort license. Stripe + CCBill normal NO aceptan este modelo. |
| **DB** | Postgres/Supabase project SEPARADO. Si compartes DB con Destino TV, el vínculo legal queda probado en discovery. |
| **Email** | Dominio email separado (no @destino.app). |
| **Bank account** | Cuenta a nombre de la LLC offshore. |
| **Customer support** | Equipo y workflows separados de Destino TV. |
| **2257 compliance** | Records propios. Custodian designation. |
| **DSA compliance (EU users)** | Trusted Flagger program propio. |
| **Cross-link** | UN solo link desde destino.app → encuentros, marcado claramente "sitio partner". Sin embed. Sin SSO compartido. |

## ✅ Lo que está acá

- `database/schema_v1_encuentros.sql` — schema standalone con tablas:
  - `encuentros_listings` — anuncios con todos los campos Skokka-style
  - `encuentros_subscriptions` — billing con processor escort-licensed
  - `encuentros_reports` — DSA + safety reporting
  - `encuentros_publisher_log` — audit trail
- `backend/` — Express server independiente con endpoints CRUD
- `frontend/` — React app con paleta visual distinta a Destino TV
- `Dockerfile` + `docker-compose.yml` para deploy aislado

## ❌ Lo que NO comparte con Destino TV

- Auth / users (publishers crean cuenta nueva acá)
- Payment processor (NO Stripe, NO CCBill normal)
- Database
- Email infrastructure
- Customer support workflow
- Legal entity
- Brand / logos / colors
- Cross-cookie tracking

## Flow del producto

```
1. Browser visita encuentrosdo.com (dominio independiente)
2. Age gate + country verify
3. Browse listings por país/ciudad/género
4. View listing → ve foto, datos, tarifas, contacto directo (WhatsApp/Telegram)
5. Click en contacto → opens WhatsApp web/app del publisher
6. La plataforma NO procesa el pago entre cliente y publisher
7. La plataforma cobra al PUBLISHER por aparecer (subscription mensual)
   via Verotel/MobiusPay
```

## Diferencia clave con Destino TV Fuck Now

| Aspecto | Destino TV Fuck Now (legal/limpio) | Encuentros (este producto) |
|---|---|---|
| Modelo | Adult dating con publicación premium | Classifieds escort directory |
| Comparable | AdultFriendFinder, PH Personals pre-2018 | Skokka, Slixa, Tryst |
| Tarifas explícitas | ❌ Prohibidas (moderation regex) | ✅ Permitidas (campo dedicado) |
| Contacto externo | ❌ Solo chat interno | ✅ WhatsApp/Telegram visible |
| Servicios físicos | ❌ Prohibidos en bio | ✅ Lista estructurada |
| Dirección | ❌ Prohibida | ✅ Campo dedicado (incall) |
| Processor | Stripe + CCBill normal | Verotel/MobiusPay escort |
| Entidad | OC Moon Group LLC (USA) | LLC offshore separada |
| Jurisdicción | USA — FOSTA-SESTA aplica | Offshore — fuera de jurisdicción US |
| Domain | destino.app | encuentrosdo.com (separado) |

## Roadmap mínimo para activación

```
Semana 1-2:  Setup LLC offshore (lawyer escrow)
Semana 2-3:  Apertura cuenta bank corporativa
Semana 3-4:  Onboarding Verotel o MobiusPay (1-2 semanas approval)
Semana 4-5:  DNS + dominio nuevo + Cloudflare
Semana 5-6:  Deploy backend + frontend a domain nuevo
Semana 6:    Soft launch invite-only
Semana 7+:   Marketing
```

## ⚠ Lo que NO hago automáticamente

- Setup de la LLC offshore — necesitás lawyer
- Aplicación a Verotel/MobiusPay — vos tenés que hacerla
- Registro de dominio — vos
- DNS / Cloudflare — vos
- Bank account — vos

Yo solo entrego el **código** listo para deployar cuando los anteriores
estén listos. NO activar/deployar antes de tenerlos.
