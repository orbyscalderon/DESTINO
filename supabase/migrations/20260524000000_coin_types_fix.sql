-- Amplía el CHECK constraint de coin_transactions para incluir tipos de
-- video_requests y user_follows que el backend usa pero no estaban en la lista.

-- Primero eliminar el constraint viejo
ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

-- Crear el constraint actualizado con todos los tipos que usa el backend
ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_type_check CHECK (type IN (
    'purchase',
    'bonus',
    'ppv_spent',
    'ppv_received',
    'tip_sent',
    'tip_received',
    'gift_sent',
    'gift_received',
    'show_ticket',
    'subscription_received',
    'withdrawal',
    'video_request_escrow',
    'video_request_refund',
    'video_request_sale',
    'video_request_cancel'
  ));
