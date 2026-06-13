# Roadmap — features pendientes

## 🟢 Implementadas (recientes)

- ✅ Stories tier-1 (controller + viewer + ring + reply + viewers list + tier-1 polish: pause/resume real, swipe-down-close, mute toggle, preload, keyboard nav)
- ✅ Optimistic chat send con tempId + rollback + dedup realtime
- ✅ Pull-to-refresh nativo-feeling (Discover + Messages)
- ✅ Sounds opt-in (whoosh/pop en swipe, success en match, ding en tip/gift) + SoundsToggle en Settings
- ✅ Empty states con SVG illustrations custom (EmptyHeart, EmptyVault, EmptyInbox, EmptySearch, EmptyCoins)
- ✅ LazyImage con blur-up effect (cableado en Messages, Matches, SavedReels)
- ✅ PageShell pattern (9 páginas v67-v73)
- ✅ Aliveness utilities (AnimatedCounter, PresenceDot, SuccessConfetti, PageTransition)
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

## 🟠 PageShell sweep — 67 páginas restantes

Solo 9 de 76 páginas usan `PageShell` (12% cobertura). Pendiente aplicar
el pattern v67-v73 en alto tráfico:

- Reels, Chat, Conversations, ShowStudio, CreatorDashboard
- AdultCreators, Profile, UserProfile, Home, Matches, Notifications, Premium
- Achievements, Referrals, Leaderboard, Coins, Stickers, Search, Explore
- Páginas legales (low priority): Terms, Privacy, DSA, DMCA, 2257, etc.

## 🟠 Stories creator UI tier-2

El viewer está pulido. Falta el creator flow tier-1:
- Caption text input antes de publicar
- Stickers/emojis overlay
- Música/audio attach
- Link CTA opcional
- Cover frame selector para videos

Tiempo: 2-3 días.

## 🔵 Sin priorizar (tu lo dirás)

- Goals de gift ("10 corazones → cambio outfit")
- Push reales con FCM (requiere Firebase del user)
- Onboarding del primer show del creador
- KYC para retiros grandes ($> umbral)
- Calendar de shows recurrentes
- Highlights auto-clips
