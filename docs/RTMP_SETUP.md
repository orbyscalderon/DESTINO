# RTMP setup — Destino TV

Este doc cubre cómo activar RTMP (stream desde OBS Studio) en tu app, **alineado con tu plan de migración de infra**: hoy LiveKit Cloud → mañana LiveKit self-hosted en Vultr.

El código del backend ([`backend/src/controllers/rtmpController.js`](../backend/src/controllers/rtmpController.js)) es **agnostic** — usa las mismas env vars que ya tienes para LiveKit y se autoadapta cuando migres a self-hosted.

---

## FASE 1 — Activar HOY con LiveKit Cloud

Tu `.env` actual ya tiene las credenciales:

```
LIVEKIT_URL=wss://destino-e7a9u6cp.livekit.cloud
LIVEKIT_API_KEY=APIa7PgfiPTmLhr
LIVEKIT_API_SECRET=K7Cm5OsSJnLhkNlwdHqDYYdbt5i7If0kmfAWpUW7w0m
```

Eso es lo único que necesita el `rtmpController.js`. **No hay env vars nuevas que añadir.**

### Pasos para activar RTMP en LiveKit Cloud

1. Login en [cloud.livekit.io](https://cloud.livekit.io)
2. Selecciona tu proyecto **destino-e7a9u6cp**
3. Menú izquierdo → **Settings** → **Ingress**
4. Activa **"RTMP ingress enabled"**
5. (No hay paso 5 — ya está)

### Verificar que funciona

Una vez activado en el dashboard, prueba desde tu propio show:

1. Crea un show (cualquier creator)
2. Entra a ShowStudio
3. Scrolleá hasta el panel "Advanced" → "Stream con OBS (RTMP)"
4. Click **"Activar"**
5. Si todo funciona, verás:
   - `Server URL: rtmps://destino-e7a9u6cp.livekit.cloud:443/x` (algo similar)
   - `Stream key: APIxxx-yyy-zzz...`
6. Si devuelve `503 RTMP_UNAVAILABLE` → el ingress no está activado en cloud.livekit.io. Volver al paso 3.

### Costo en Cloud

LiveKit Cloud cobra por bandwidth + participant-minutes. Un RTMP ingress cuenta como **1 participant más** en la sala, igual que cualquier viewer publicador. El bandwidth lo sigue cobrando por el output (lo que ven los viewers), no por el ingress.

En tu plan de migración mencionas que esto se vuelve caro a escala — RTMP no cambia el cálculo, sigue siendo lo mismo $0.006/participante/min.

---

## FASE 2 — Migrar a self-hosted en Vultr (futuro)

Cuando ejecutes tu plan de migración a Vultr para LiveKit, RTMP necesita un servicio adicional: **livekit-ingress** (proceso separado del `livekit-server`).

### Servicios que correrán en cada VPS Vultr

Por cada región (LATAM, US, EU, etc) tendrás 3 procesos:

| Servicio | Puerto | Función |
|---|---|---|
| `livekit-server` | 7880 (TCP/WS), 7882 (UDP) | Media SFU |
| `livekit-ingress` | 1935 (RTMP), 8080 (HTTP API) | Recibe RTMP de OBS, lo convierte a participant |
| `redis` | 6379 | Comm interna entre server e ingress |

### Setup paso a paso (per región — repetir 3-5 veces)

Tomando como ejemplo `livekit-sp.destino.app` (LATAM, Vultr São Paulo):

#### 1. VPS Vultr — Ubuntu 22.04, mínimo 2 vCPU / 4GB RAM

```bash
# Instalar Docker + docker compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

#### 2. `docker-compose.yml`

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks: [livekit]

  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    network_mode: host  # necesita acceso directo a UDP
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml

  ingress:
    image: livekit/ingress:latest
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./ingress.yaml:/etc/ingress.yaml
    command: --config /etc/ingress.yaml
    depends_on: [redis]

networks:
  livekit:
```

#### 3. `livekit.yaml`

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  APIlatamSP: secretLatamSP   # tus credenciales — guardar para .env
redis:
  address: 127.0.0.1:6379
```

#### 4. `ingress.yaml`

```yaml
api_key: APIlatamSP
api_secret: secretLatamSP
ws_url: ws://127.0.0.1:7880
redis:
  address: 127.0.0.1:6379
rtmp_base_url: rtmp://livekit-sp.destino.app:1935/x   # public DNS de este VPS
```

#### 5. DNS + firewall

- DNS A record: `livekit-sp.destino.app` → IP del VPS
- Firewall: abrir puertos `7880/tcp`, `7881/tcp`, `7882/udp`, `1935/tcp`
- Para HTTPS/RTMPS: caddy/nginx delante en `443` apuntando a `7880`

#### 6. Levantar

```bash
docker compose up -d
docker compose logs -f
```

#### 7. Backend `.env` — descomentar las líneas regionales

```env
# LATAM
LIVEKIT_URL_LATAM=wss://livekit-sp.destino.app
LIVEKIT_KEY_LATAM=APIlatamSP
LIVEKIT_SECRET_LATAM=secretLatamSP

# (repetir para US, EUROPA, ASIA, OCEANIA según fases)
```

Reiniciar el backend en Railway. El código del `rtmpController.js` **autoadapta** — cuando un creator con `country=BR` active RTMP, el ingress se crea en `livekit-sp.destino.app`. Un creator con `country=US` se va a `livekit-la.destino.app`. Etc.

El fallback a `LIVEKIT_URL` (Cloud) sigue activo durante la transición — si una región todavía no está deployada, se va a Cloud.

### Costo self-hosted

- Vultr **High Frequency 4GB** ≈ $24/mes por región
- 3 regiones (LATAM + US + EU) = ~$72/mes fijo
- Bandwidth: Vultr da 4TB/mes incluidos en cada plan; pasado eso ~$0.01/GB
- A diferencia de Cloud: **NO cobra por participante**, solo bandwidth

Para 100 shows concurrentes con ~50 viewers cada uno = breakeven aprox a $80/mes vs >$500/mes en Cloud.

---

## OBS Studio — config para el creator

Una vez que el backend devuelve `stream_key + ingress_url`, el creator configura OBS así:

1. **Settings → Stream**
   - Service: `Custom...`
   - Server: pega el `Server URL` que copió
   - Stream Key: pega el `Stream Key` que copió

2. **Settings → Output**
   - Output Mode: `Advanced`
   - Encoder: `NVENC H.264` (GPU NVIDIA) o `x264` (CPU)
   - Rate Control: `CBR`
   - Bitrate: `4500-6000 kbps`
   - Keyframe Interval: `2s`
   - Profile: `main`
   - Preset: `Quality` (NVENC) o `veryfast` (x264)

3. **Settings → Video**
   - Output (Scaled) Resolution: `1920x1080`
   - FPS: `30` (60 si banda lo permite)

4. **Settings → Audio**
   - Sample Rate: `48000 Hz`
   - Channels: `Stereo`

5. **Start Streaming**

En 5-10 segundos el host aparece en la sala. Los viewers lo ven igual que si hubiera usado la cámara del browser.

---

## Troubleshooting

| Síntoma | Causa | Fix |
|---|---|---|
| `503 RTMP_UNAVAILABLE` | Faltan env vars `LIVEKIT_*` | Verificar Railway env |
| `502 No se pudo crear el ingress` | Ingress no activado en LiveKit Cloud / livekit-ingress no corre | Cloud: activar en dashboard. Self-hosted: `docker compose logs ingress` |
| OBS "Failed to connect" | Stream key viejo | "Detener" + "Activar" otra vez |
| Stream conecta pero pixela mucho | Bitrate muy alto para banda del creator | Bajar a 3000 kbps |
| Audio desync | Sample rate ≠ 48000 | Cambiar OBS → Settings → Audio → 48000 Hz |
| `livekit-sp.destino.app` no resuelve | DNS no propagó | `dig livekit-sp.destino.app` — esperar 15min |
| Self-hosted: ingress no conecta a server | `ws_url` mal | En `ingress.yaml` usar `ws://127.0.0.1:7880` (no `wss://`) |

---

## Seguridad de stream keys

- Cada `stream_key` es un secret. Si se filtra (screenshot público, leak en discord), regenerá: el creator hace "Detener" + "Activar" en la app → genera un key nuevo, el viejo deja de funcionar.
- El RTMP plaintext (puerto 1935) es vulnerable a sniffing. Para shows pagos / adult considerá RTMPS (1936 con TLS).
- El backend valida que solo `host_id === userId` puede activar/desactivar RTMP del show ([rtmpController.js:36-37](../backend/src/controllers/rtmpController.js#L36-L37)).
- En self-hosted: agregá rate limit en nginx por IP origen, para que un atacante no abuse del endpoint `enableRtmp` brute-forceando stream keys.

---

## TL;DR

- **Hoy:** activá Ingress en `cloud.livekit.io → Settings → Ingress`. Sin código nuevo. Funciona.
- **Cuando migres a Vultr:** instalá `livekit-ingress` paralelo al server en cada VPS, descomenta `LIVEKIT_URL_LATAM/US/EUROPA/...` en `.env`. El código del controller no cambia.
- **El `rtmpController.js` es agnostic** — usa el mismo patrón multi-región que `videoProvider.js`.
