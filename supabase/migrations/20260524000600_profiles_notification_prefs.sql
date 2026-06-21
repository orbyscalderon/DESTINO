-- ═══════════════════════════════════════════════════════════════════════
-- Destino — profiles.notification_prefs
-- notificationController.js guarda preferencias de notificación del usuario
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
