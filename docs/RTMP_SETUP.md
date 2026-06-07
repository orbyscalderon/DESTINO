# RTMP Relay setup guide

El feature de RTMP (`/api/shows/:id/rtmp/enable`) permite que creators usen OBS Studio en vez del navegador para streamear sus shows. Mejor calidad, overlays, multi-track audio.

El backend está implementado en [`backend/src/controllers/rtmpController.js`](../backend/src/controllers/rtmpController.js). Llama a LiveKit Ingress API (`createIngress(RTMP_INPUT, ...)`) que devuelve `streamKey` + `url`. El frontend de creator copia esos valores a OBS.

**El controller funciona SIEMPRE que tengas un provider de Ingress configurado.** Sin uno, devuelve `503 RTMP_UNAVAILABLE`. Aquí están las 3 opciones realistas, ordenadas por facilidad/costo.

## Opción 1 — LiveKit Cloud (recomendado para empezar)

LiveKit Cloud tiene Ingress incluido en cualquier plan. Es el camino más fácil porque tu app ya usa LiveKit Cloud (probablemente).

**Setup:**
1. Login en [cloud.livekit.io](https://cloud.livekit.io)
2. Tu proyecto ya tiene API key + secret (los que están en `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` de tu backend env)
3. Ve a *Settings → Ingress* en el dashboard → activa "RTMP ingress"
4. Verifica que `LIVEKIT_API_URL` en tu env apunta a tu instance (algo como `wss://destino-xyz.livekit.cloud`). Ese mismo host se usa para Ingress.
5. Reinicia el backend.

**Costo:** Ingress está incluido en el bandwidth de tu plan LiveKit Cloud. No hay surcharge.

**Verificar:**
```bash
curl -X POST https://api.destino.tv/api/shows/SHOW_ID/rtmp/enable \
  -H "Authorization: Bearer YOUR_TOKEN"
# Debería devolver { stream_key, ingress_url, instructions: {...} }
```

## Opción 2 — LiveKit self-hosted (control total)

Si tienes el servidor LiveKit corriendo en Vultr/AWS/GCP, el ingress es un servicio aparte (`livekit-server` + `livekit-ingress`).

**Setup:**
1. Instalar el LiveKit Ingress: [docs.livekit.io/ingress/deploy](https://docs.livekit.io/realtime/ingress/deploy/)
2. Tu `livekit-ingress.yaml`:
   ```yaml
   api_key: tu-api-key
   api_secret: tu-api-secret
   ws_url: ws://localhost:7880   # tu livekit-server
   redis:
     address: redis:6379
   rtmp_base_url: rtmp://0.0.0.0:1935/x   # OBS publica aquí
   ```
3. Exponer puerto `1935` TCP en tu firewall/load balancer
4. En el backend env:
   ```
   LIVEKIT_API_URL=wss://livekit.destino.tv
   LIVEKIT_API_KEY=tu-api-key
   LIVEKIT_API_SECRET=tu-api-secret
   ```

**Costo:** El servidor (~$10-30/mes en Vultr) + bandwidth. Para >100 streams concurrentes, sale más barato que LiveKit Cloud.

## Opción 3 — Cloudflare Stream Live Inputs (alternativa)

Si no usas LiveKit en absoluto, [Cloudflare Stream](https://www.cloudflare.com/products/cloudflare-stream/) tiene Live Inputs por $5/mes + uso. Pero necesitarías reescribir el `rtmpController.js` para usar su API en vez de LiveKit Ingress. NO está implementado hoy.

## Cómo probar que funciona

Una vez con un provider configurado:

1. **Activar RTMP**: en ShowStudio del creator, panel "Advanced" → toggle "Activar". Aparecen `Server URL` y `Stream key`.

2. **Configurar OBS**:
   - Settings → Stream
   - Service: `Custom...`
   - Server: pega el URL
   - Stream Key: pega el key (botón del ojo para mostrar)
   - Settings → Output: bitrate `4500-6000 kbps`, keyframe interval `2s`, x264 preset `veryfast`, profile `main`
   - Apply

3. **Start Streaming** en OBS. En 5-10s deberías aparecer como participant en el room del show, y los viewers te ven igual que si usaras la cámara del browser.

4. **Desactivar**: el botón "Detener" llama `disableRtmp`, que revoca el ingress en LiveKit. El key queda inválido.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `503 RTMP_UNAVAILABLE` | Faltan `LIVEKIT_API_*` env vars | Configurar en Railway/Vercel |
| `502 no se pudo crear el ingress` | Tu proyecto LiveKit Cloud no tiene Ingress activado | Settings → Ingress → enable |
| OBS dice "Failed to connect" | Stream key viejo (regenerado) o URL mala | Detener + Activar en la app, copiar de nuevo |
| Stream conecta pero no se ve | Bitrate muy alto para tu red | Bajar a 3000 kbps |
| Audio desync | Sample rate diferente al de LiveKit | OBS → Settings → Audio → Sample rate 48000 Hz |

## Seguridad

- El `stream_key` es un secret. Si se expone (screenshot público, leak en discord), regenera: el creator hace "Detener" + "Activar" en la app, lo cual genera un key nuevo.
- El RTMP puerto 1935 es plaintext. Para shows premium considera RTMPS (puerto 1936) — requiere cert TLS en el ingress.
- El backend solo permite que el `host_id` del show active/desactive su propio RTMP (check en `rtmpController.js:36-37`).
