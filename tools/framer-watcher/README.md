# Framer Watcher

Script standalone que monitorea `framer.com/marketplace/templates/` y te avisa cuando aparecen templates nuevos. Sin dependencias externas (usa `fetch` nativo de Node 18+).

## Cómo funciona

1. Fetch del HTML de 6 categorías (root + business + creative + community + style + free)
2. Parsea slugs de templates (`<a href="/marketplace/templates/<slug>/">`)
3. Compara contra `seen.json` (estado local)
4. Si hay nuevos, los lista por stdout y opcionalmente manda email vía Resend

## Uso

### Una vez (check rápido)
```bash
cd tools/framer-watcher
node index.js
```

Salida:
```
✓ root       → 21 templates
✓ business   → 12 templates
✓ creative   → 18 templates
...

Total únicos: 47
Nuevos en este run: 3

🎨 NUEVOS TEMPLATES:
  • Athletix
    https://www.framer.com/marketplace/templates/athletix/
  ...
```

### Con email automático cada vez que hay nuevos

```bash
export RESEND_API_KEY=re_xxxxx
export WATCHER_NOTIFY_EMAIL=orbys85@gmail.com
node index.js --notify
```

> Primera corrida no manda email (todos serían "nuevos"). A partir de la 2da, solo los nuevos.

### JSON estructurado (para piping a otros scripts)

```bash
node index.js --json
```

### Reset (borra seen.json, empieza de cero)

```bash
node index.js --reset
```

## Configuración

Variables de entorno opcionales (solo para `--notify`):

| Var | Default | Notas |
|---|---|---|
| `RESEND_API_KEY` | — | Si falta, el flag `--notify` se ignora |
| `WATCHER_NOTIFY_EMAIL` | `orbys85@gmail.com` | A quién mandar |
| `WATCHER_FROM_EMAIL` | `Framer Watcher <onboarding@resend.dev>` | Tiene que ser un dominio verificado en Resend, o `onboarding@resend.dev` para test |

## Ejecutar automáticamente

### Opción 1: Cron local (Linux/Mac)

```bash
# crontab -e
0 9 * * * cd /path/to/destino/tools/framer-watcher && RESEND_API_KEY=re_xxx node index.js --notify
```

### Opción 2: GitHub Actions (recomendado, gratis)

Ver `.github/workflows/framer-watcher.yml` en el root del repo. Corre cada día a las 9am UTC, commit el `seen.json` actualizado.

### Opción 3: Railway (junto al backend de Destino)

Crear un nuevo servicio Railway pointing a este folder con `start: node index.js --notify` y un schedule cron. Requiere `RESEND_API_KEY` configurada en el servicio.

## Estado guardado

`seen.json` se commitea al repo para persistir entre runs (especialmente útil con GitHub Actions). Estructura:

```json
{
  "firstSeen": "2026-06-13T10:00:00.000Z",
  "lastChecked": "2026-06-13T18:30:00.000Z",
  "templates": {
    "athletix":   { "name": "Athletix",   "firstSeen": "2026-06-13T10:00:00.000Z" },
    "course-hub": { "name": "Course Hub", "firstSeen": "2026-06-13T10:00:00.000Z" }
  }
}
```

## Limitaciones honestas

- **HTML parsing con regex** — frágil si Framer cambia el DOM. Si los `<a href="/marketplace/templates/<slug>/">` desaparecen, el script no encontrará nada. En ese caso, actualizar el regex en `parseTemplateSlugs`.
- **No detecta ediciones** — solo nuevos slugs. Si un template existente recibe update, no avisa.
- **No detecta unpublish** — si Framer retira un template, queda en `seen.json` para siempre (no es problema funcional).
- **Sin scraping de meta rica** — el slug es el ground truth; el nombre se infiere del `alt` o se humaniza del slug.

## Compliance

Este watcher es para uso personal/educativo (descubrir templates para inspiración). Hace 1 request HTTP por día por categoría = 6 GETs/día. Bajísimo impact para Framer.

Si planeas re-publicar los datos, revisa los TOS de Framer.
