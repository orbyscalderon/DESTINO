# i18n audit

Localiza strings ES hardcodeadas en `frontend/src/pages/*.jsx`. Heurístico:
detecta texto JSX, props `placeholder/title/label/aria-label`, y llamadas
a `toast.*`, `confirm`, `alert` con literales que parecen español
(tildes/eñe o palabras típicas ES).

## Uso

```bash
node tools/i18n-audit/index.js              # resumen + top 20
node tools/i18n-audit/index.js --json       # JSON completo
node tools/i18n-audit/index.js --page Reels # filtra por nombre
```

## Output

```
📋 Auditoría i18n — 76 páginas analizadas
   useTranslation cableado:  17/76
   strings ES hardcodeadas:  N
   páginas con hardcode:     M

TOP 20 por hardcode count:
  🔴 sin i18n  Reels.jsx       42 strings
              "Sin reels disponibles"
              ...
```

## Falsos positivos

El heurístico es generoso — algunas strings detectadas son URLs en español,
keys de objeto con valores ES (que ya están en los locales), o atributos
HTML que no son visibles. Tomar el output como guía, no como ground truth.

## Después del audit

1. Agrupar páginas por dominio: auth, creator, profile, chat, etc.
2. Asignar keys a los locales (es/en/pt) por namespace
3. Wrappar `useTranslation()` en cada componente
4. Reemplazar literals por `t('namespace.key')`
