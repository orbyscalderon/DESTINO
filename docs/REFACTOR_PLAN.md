# Plan de refactor — archivos enormes

Estado actual de los 4 archivos más grandes y plan de descomposición.
Cada uno requiere 2-5 días de trabajo cuidadoso con tests manuales por feature.

## Why refactor?

- **Mantenibilidad**: encontrar un bug en `LiveShow.jsx:2400` requiere scroll de 3434 líneas
- **Code review**: PR de 100 líneas en archivo de 3000 LOC pierde contexto
- **Onboarding**: nuevos colaboradores no entienden la estructura
- **Performance del IDE**: VSCode/Cursor LSP se cuelga con archivos >3000 LOC
- **Riesgo**: bug en gifts arriesga romper tickets, porque conviven

## Why NOT yet?

- Refactorar antes del lanzamiento arriesga regresiones que no se detectan sin users reales
- Mejor lanzar con archivos grandes pero working, después refactorar con confidence de qué features están consolidadas
- Cada split necesita testing manual de TODOS los flows (no hay E2E suite)

## 4 archivos en orden de prioridad

### 1. `LiveShow.jsx` — 3434 LOC ⚠️ MÁS URGENTE

Mezcla 6+ responsabilidades:

```
/pages/live-show/
  index.jsx                    (~200 LOC) — routing + props del show
  HostView/
    index.jsx                  (~300 LOC) — vista del host en su propio show
    StartShowOverlay.jsx       (~150) — countdown 3-2-1
    HostControls.jsx           (~200) — mute/cam/screen/end
    StatsPanel.jsx             (~150) — viewer count, coins earned
  ViewerView/
    index.jsx                  (~300) — vista del viewer
    JoinFlow.jsx               (~200) — ticket compra, age gate
    ViewerOverlay.jsx          (~200) — chat, gifts, tips UI
  ChatPanel/
    index.jsx                  (~250) — chat público + privado
    MessageList.jsx            (~150)
    Composer.jsx               (~100)
  Gifts/
    GiftAnimations.jsx         (~200) — overlay de regalos
    GiftSelector.jsx           (~150)
  PrivateSession/
    PrivateRequestModal.jsx    (~200)
    PrivateActiveOverlay.jsx   (~150)
  BattleMode/
    BattleOverlay.jsx          (~150) — ya extraído como component
    OpponentTile.jsx           (~100)
  CoHost/
    CoHostTiles.jsx            (~150)
  hooks/
    useLiveKitConnection.js    (~200) — conexión + reconnect
    useShowChannel.js          (~200) — Supabase Realtime
    useReconnectTimeout.js     (~100) — auto-close 2 min
```

**Effort**: 4 días — testing manual full por feature.
**Risk**: alto — es la página más usada del adult flow.

### 2. `ShowStudio.jsx` — 3035 LOC

Vista del host PRE-show + EN-show. Mezcla:
- Onboarding de creator (cámaras, mic, calidad)
- Live controls del host (mute, screen share, end)
- Tip goal management
- Co-host invites
- Battle invites
- Recording upload
- Scheduled shows

**Plan similar**: `/pages/show-studio/` con módulos.
**Effort**: 3 días.
**Risk**: medio — solo lo usan creators activos.

### 3. `showController.js` — 2590 LOC backend

Mezcla:
- Tickets (purchase, confirm, refund)
- Tips
- Gifts (multiple types)
- Private/spy mode
- Recording upload + processing
- Public listing + filters
- Adult vs general show logic
- Battle endpoints
- Co-host management
- Poll/quiz

**Plan**:
```
backend/src/controllers/shows/
  index.js                — re-exports
  publicListing.js        — GET /, GET /:id, getLiveCreators
  ticketsController.js    — purchaseShowTicket(coins+stripe), confirm, refund
  tipsController.js       — sendTip
  giftsController.js      — sendGift, custom gifts, catalog
  privateController.js    — privateRequest/accept/decline/tick
  recordingController.js  — upload, list replays
  battlesIntegration.js   — battle creation hooks
  helpers/
    showAccess.js         — checkUserCanJoin
    creatorEarnings.js    — upsertCreatorEarnings
```

**Effort**: 2 días.
**Risk**: medio — múltiples integration points pero pure logic.

### 4. `creatorController.js` — 2038 LOC backend

Mezcla:
- Discover adult creators
- Public profile (consolidated query)
- Dashboard del creator (earnings, subs, top fans)
- Galleries CRUD
- Onboarding link Stripe Connect
- Payout management

**Plan**:
```
backend/src/controllers/creator/
  discover.js
  publicProfile.js
  dashboard.js
  galleries.js
  payouts.js
  onboarding.js (Stripe Connect)
```

**Effort**: 1.5 días.
**Risk**: bajo — endpoints bien separados.

## Estrategia de ejecución

### Pre-requisitos antes de refactorar

1. **Smoke test suite extendida** — agregar tests para cada endpoint que se va a tocar
2. **Sentry alerts activas** — para detectar regresiones en producción rápido
3. **Feature flags** — poder revertir un módulo sin redeploy completo
4. **Staging environment** — replica de prod para testear el refactor sin risk

### Orden recomendado (post-launch)

```
Mes 1 post-launch:    consolidar features, NO refactor (mide qué se usa)
Mes 2:                #4 creatorController (bajo risk, validar enfoque)
Mes 3:                #3 showController (medio risk)
Mes 4-5:              #1 LiveShow.jsx (alto risk, feature crítica)
Mes 6:                #2 ShowStudio.jsx
```

### Métricas de éxito

| Métrica | Target |
|---|---|
| LOC máximo por archivo | < 500 |
| Funciones por archivo | < 20 |
| Tiempo de LSP autocomplete | < 200ms |
| PR review time (median) | < 24h |
| Bug rate post-refactor | similar o menor a pre |

## Decisión actual

**No refactorar hasta tener users reales validando features**. Toda hora gastada en refactor de un componente que terminamos eliminando es hora perdida. Después del launch + 1 mes de signal real, decidir cuál vale la pena descomponer primero.
