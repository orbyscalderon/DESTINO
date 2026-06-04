# Roadmap — features pendientes

## 🟢 Implementadas (recientes)

- ✅ Broadcast realtime para battle/cohost/revancha invites
- ✅ Detección de viewer desconectado en privado/exclusivo via LiveKit
- ✅ Header viewer con avatar + Seguir + ⭐ VIP suscribirse
- ✅ Bottom bar mobile sin overflow + tip goal único + rejoin tras pausa
- ✅ Reels desktop split-view con comments inline
- ✅ Stats avanzados Creator (top tippers, retention, earnings/hora)
- ✅ Sección Replays en /shows
- ✅ i18n bootstrap (es/en/pt) con selector en Settings

## 🟡 i18n — sweep completo pendiente

`lib/i18n.js` ya bootstreapeado con 3 idiomas. Cobertura actual:
strings de auth/nav/viewer/settings. Faltan:

- [ ] Admin, AdminPanel
- [ ] CreatorDashboard (cientos de strings)
- [ ] Modal/sheet de privado/exclusivo
- [ ] Chat, Matches, Discover
- [ ] Toast messages (ahora mismo todos en español hardcoded)
- [ ] Errores del backend (requiere modificar backend para devolver claves
      en lugar de strings, y traducir en frontend)

Approach recomendado: hacer un script con `git grep` de strings en
español, wrapearlas en `t()`, y agregar las claves a `locales/*.json`.
~2 días de trabajo manual.

## 🟠 2FA (Two-Factor Auth)

Supabase Auth soporta MFA TOTP nativamente desde v2.39. Pasos:

1. **Habilitar en Supabase Dashboard** → Auth → Multi-Factor Auth
2. **Frontend** — añadir flow de enrollment:
   ```js
   const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
   // muestra data.totp.qr_code al user
   // user introduce código → supabase.auth.mfa.challenge() + verify()
   ```
3. **UI** en Settings:
   - "Activar 2FA" → muestra QR para escanear con Authenticator
   - Después del scan: input para verificar primer código
   - Backup codes generados al activar
4. **Gate** en login: si user tiene MFA activo, requiere paso adicional
   tras password con `supabase.auth.mfa.challenge()`

Tiempo estimado: 1 día. Recomendado para creators con ingresos > $500/mes.

## 🟠 Stories del host

Modelo:
- Tabla `stories(id, user_id, media_url, media_type, expires_at, is_paid,
  price)` con TTL 24h.
- Reusar storage/Bunny CDN.

Backend:
- POST `/api/stories` — sube media + duración
- GET `/api/stories/feed` — stories de creators que sigo
- POST `/api/stories/:id/view` — marca como vista + cobra si is_paid

Frontend:
- Componente `StoryRing` en feed con avatar circulado en rosa.
- `StoryViewer` full-screen tipo Instagram con timer.
- Subir desde botón ➕ del navbar mobile (CreateMenuSheet).

Tiempo: 3-4 días. Alta complejidad por scrubber, swipe entre stories,
prefetch siguiente.

## 🔵 Sin priorizar (tu lo dirás)

- Goals de gift ("10 corazones → cambio outfit")
- Push reales con FCM (requiere Firebase del user)
- Onboarding del primer show del creador
- KYC para retiros grandes ($> umbral)
- Calendar de shows recurrentes
- Highlights auto-clips
