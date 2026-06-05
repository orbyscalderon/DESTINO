# Migración LiveKit Cloud → mediasoup self-hosted en Vultr

Documento técnico para reducir el coste de streaming en 90% cuando crezca el volumen. **No urgente** — LiveKit funciona perfectamente hoy. Solo activar cuando el bill mensual de LiveKit supere ~$500/mes.

## Estado actual

- **Provider**: LiveKit Cloud (`livekit-server-sdk` en backend, `livekit-client` en frontend)
- **Coste**: $0.04/minuto de outbound participant. Un creator con 50 viewers × 1h/día = 3000 min/día = ~$3600/mes
- **SDK frontend**: 503 KB (livekit-client gzipped = 131 KB)
- **Features usadas**: simulcast, dynacast, adaptive stream, data channel (chat reactions)

## Por qué migrar

| Métrica | LiveKit Cloud | mediasoup en Vultr |
|---|---|---|
| Coste mensual base | $0 | $40 (VPS) |
| Coste por minuto | $0.04 / part-min | $0 |
| Coste a 100k min/mes | $4,000 | $40 + bandwidth (~$50) |
| Latencia (LATAM) | ~80ms (Houston/SP) | ~30ms (Mexico/SP regions) |
| Control sobre features | Limitado | Total |
| Compliance (datos de US) | Sale del país | Queda en tu región |

**Break-even ≈ 25k participant-minutes/mes** (~12 creators activos a 2h/día con 10 viewers).

## Por qué NO migrar todavía

1. mediasoup tiene curva de aprendizaje empinada — workers, transports, producers, consumers
2. LiveKit Cloud te da DTLS/STUN/TURN automáticamente — mediasoup requiere config
3. La operación 24/7 es tuya: si el VPS cae, los lives caen
4. Sin "Cloud" auto-scaling — necesitas planificar capacidad

## Plan de migración (2 semanas estimado)

### Fase 1 — Infra (3 días)

1. Vultr VPS: **High Frequency Compute** 4 CPU / 8 GB RAM, region más cercana a usuarios (Mexico City o São Paulo).
   - Coste: $40/mes
   - Bandwidth incluido: 4 TB/mes (luego $0.01/GB)
2. Domain: `media.destino.app` con SSL (Let's Encrypt via certbot)
3. Firewall:
   - 443/tcp para signaling (WebSocket Secure)
   - 10000-10100/udp para RTC (rango configurable)
4. Setup ufw + fail2ban + auto-updates
5. mediasoup-demo (`mediasoup/mediasoup-demo` en GitHub) como base de pruebas

### Fase 2 — Server (4 días)

1. Node.js 20+ + mediasoup 3.x
2. Estructura:
   ```
   media-server/
     src/
       index.ts          # Express + WebSocket
       worker.ts         # mediasoup worker pool
       room.ts           # Room logic (host + viewers)
       signaling.ts      # WS messages
       auth.ts           # JWT verify del backend Destino
     package.json
   ```
3. **Auth crítica**: cada cliente envía un JWT firmado por el backend de Destino (mismo `SUPABASE_JWT_SECRET`). El media server verifica y extrae `user_id` antes de permitir conexión.
4. Tipos de room:
   - `show:public:<showId>` — host produce, viewers consumen
   - `show:private:<showId>:<viewerId>` — host + 1 viewer, ambos producen/consumen
   - `battle:<showId1>:<showId2>` — 2 hosts producen, viewers de ambos consumen
   - `videocall:<matchId>` — 1-a-1 bidireccional
5. Transports: WebRTC con DTLS, IPs públicas via `announcedIp`
6. Codecs: VP8 (compat universal) + H264 (Safari iOS). Bajar a 480p si CPU > 80%
7. Recording (opcional, fase 3): pipe los RTP a FFmpeg → MP4 → S3/BunnyCDN

### Fase 3 — Backend Destino (2 días)

1. Reemplazar `livekitController.js` con `mediasoupController.js`
2. Endpoint `POST /api/media/token` devuelve JWT firmado para conectar al media server
3. Endpoint `POST /api/media/rooms` crea room en media server vía HTTP interno
4. Webhooks del media server al backend Destino cuando:
   - Viewer entra → incrementar `viewers_count`
   - Viewer sale → decrementar
   - Producer termina → marcar show como `ended`

### Fase 4 — Frontend (3 días)

1. Reemplazar `livekitSession.js` con `mediasoupSession.js` usando `mediasoup-client`
2. API similar:
   - `connect(roomId, token)`
   - `publishVideo({ camera, mic })`
   - `subscribeTo(participantId)`
   - `sendData(channel, payload)`
3. Manejar reconnection automática con backoff exponencial
4. Detectar cambios de calidad y avisar al UI (banner de "señal débil")

### Fase 5 — Testing (3 días)

1. Carga sintética con 50 conexiones simuladas (mediasoup-client headless en Node)
2. Stress test del worker pool (CPU usage por fanout)
3. Failover: matar el VPS y verificar que el frontend reconecta a un fallback
4. Latencia end-to-end con WebRTC stats API

### Fase 6 — Rollout (3 días)

1. Feature flag `USE_MEDIASOUP` en backend → 5% de shows
2. Monitorear con Sentry breadcrumbs
3. Escalar a 50% si Sentry queda limpio en 48h
4. 100% en 1 semana
5. Apagar el plan de LiveKit Cloud cuando 0% de tráfico use sus rooms

## Recursos

- [mediasoup docs oficiales](https://mediasoup.org/documentation/v3/)
- [mediasoup-demo repo](https://github.com/versatica/mediasoup-demo) — referencia completa
- [Janus vs mediasoup vs LiveKit comparison](https://webrtchacks.com/sfu-comparison/) — para contexto
- [Vultr High Frequency pricing](https://www.vultr.com/products/high-frequency-compute/)

## Decisión recomendada

- **<50k participant-min/mes**: quedarse en LiveKit Cloud, el coste es despreciable
- **50k–500k**: empezar la fase 1 y 2 en paralelo
- **>500k**: migrar es urgente, el ahorro paga el trabajo en 1 mes

Actualmente Destino está en early stage (<50k/mes). Revisar este doc cuando el bill de LiveKit pase $300/mes.

## Plan B: WebRTC peer-to-peer puro (sin SFU)

Para shows con ≤4 participantes (videocalls, cohost), considerar P2P puro vía PeerJS o simple-peer. No requiere servidor (solo STUN/TURN). Coste = $0. Funciona perfectamente para battles 1v1 y videocalls 1-a-1 que ya tenemos.

**El SFU solo es necesario cuando el host emite a >5 viewers simultáneos** — en P2P el host tendría que upload 5× su video.

Híbrido posible: videocalls/cohost en P2P, shows en mediasoup. Reduciría aún más el coste del SFU.
