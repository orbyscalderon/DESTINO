-- Agrega columna `type` a messages para distinguir texto de GIFs
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'gif', 'image', 'video', 'audio', 'gift'));
