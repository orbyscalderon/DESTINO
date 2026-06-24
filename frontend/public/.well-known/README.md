# `.well-known/` — Deep linking setup

Estos archivos asocian el dominio `destino.app` con las apps mobile (iOS + Android)
para que los links destino.app/profile/123 abran la app instalada en vez del browser.

## Pre-launch checklist

### Android — assetlinks.json

1. Generar SHA-256 del cert de signing:
   ```bash
   keytool -list -v -keystore <tu-keystore.jks> -alias <alias>
   # Buscar línea "SHA256:"
   ```
2. Reemplazar `PLACEHOLDER_REPLACE_WITH_REAL_SHA256_FINGERPRINT` con el valor real
3. Verificar con: https://developers.google.com/digital-asset-links/tools/generator

### iOS — apple-app-site-association

1. Obtener Team ID de Apple Developer Console
2. Reemplazar `PLACEHOLDER_TEAM_ID` con el Team ID real (10 chars alphanum)
3. En Xcode → Signing & Capabilities → + Capability → "Associated Domains"
4. Agregar dominio: `applinks:destino.app`
5. Build + deploy

## Servir correctamente desde el dominio

Estos archivos deben servirse desde `https://destino.app/.well-known/...` con:

- `Content-Type: application/json` (apple-app-site-association NO debe tener `.json` extension)
- `Cache-Control: max-age=86400` recomendado
- HTTPS obligatorio

En Cloudflare Pages / Vercel: poner los archivos en `/public/.well-known/`
y el static host los sirve automáticamente.

## Headers para Vercel (si lo siguen usando)

En `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ]
}
```

## Testing

- Android: `adb shell pm verify-app-links --re-verify com.destino.app`
- iOS: Compartir link en Notes → si la app está instalada, se abre directamente
