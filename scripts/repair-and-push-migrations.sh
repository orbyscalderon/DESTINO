#!/usr/bin/env bash
# repair-and-push-migrations.sh
#
# Auto-repara el estado del migration history en Supabase cuando hubo
# rename de archivos (timestamps únicos en commit d5d1648).
#
# Asume que en remote pueden estar registradas como "applied" las versions
# viejas (20260521, 20260523, 20260524) — las que tenían colisión y por
# eso se renombraron localmente.
#
# Por cada day-prefix duplicado:
#   1. Marca la version vieja como reverted (saca el registro huérfano)
#   2. Marca la PRIMERA del rename (00000_) como applied (asume que esa
#      fue la que se aplicó cuando el push falló)
#   3. Las demás del mismo día se aplicarán en el push final
#
# Uso:
#   cd path/to/Destino
#   bash scripts/repair-and-push-migrations.sh
#
# Requiere: supabase CLI logueado + linked al project.

set -e
cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════════"
echo " Supabase migration repair + push"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Verificar CLI
if ! command -v supabase &> /dev/null; then
  echo "❌ supabase CLI no instalado. Instalar:"
  echo "   npm install -g supabase  # o brew install supabase/tap/supabase"
  exit 1
fi

echo "→ Estado actual del migration history..."
supabase migration list || {
  echo "❌ supabase migration list falló. Asegurate de:"
  echo "   - supabase login"
  echo "   - supabase link --project-ref <tu-ref>"
  exit 1
}

echo ""
echo "→ Verificando si hay versiones huérfanas a reparar..."

# Days que tuvieron rename (commit d5d1648)
DAYS_RENAMED=("20260521" "20260523" "20260524")

# Capturamos las versions remote aplicadas en un array
APPLIED_VERSIONS=$(supabase migration list 2>/dev/null | grep -oE '^\s*\|\s+\|\s+[0-9]{14}\s+' | awk '{print $NF}' || echo "")

REPAIRED=0
for DAY in "${DAYS_RENAMED[@]}"; do
  # ¿Está la version vieja del día (sin HHMMSS) marcada como applied?
  if echo "$APPLIED_VERSIONS" | grep -q "^${DAY}$"; then
    NEW_FIRST="${DAY}000000"
    echo "  • $DAY está como applied — reparando a $NEW_FIRST"
    supabase migration repair --status reverted "$DAY" || true
    supabase migration repair --status applied  "$NEW_FIRST" || true
    REPAIRED=$((REPAIRED+1))
  fi
done

if [ "$REPAIRED" -eq 0 ]; then
  echo "  ✓ No hay versiones huérfanas. Migration history limpio."
else
  echo "  ✓ Reparadas $REPAIRED versiones."
fi

echo ""
echo "→ Aplicando migraciones pendientes (supabase db push)..."
supabase db push

echo ""
echo "✅ Migraciones aplicadas con éxito."
echo ""
echo "Estado final:"
supabase migration list
