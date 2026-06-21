# repair-and-push-migrations.ps1
#
# Equivalente en PowerShell del .sh. Uso:
#   cd path\to\Destino
#   pwsh scripts\repair-and-push-migrations.ps1
#
# Auto-repara migration history en Supabase tras el rename del commit d5d1648
# (timestamps únicos), y aplica el push final.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "═══════════════════════════════════════════════════════════════"
Write-Host " Supabase migration repair + push"
Write-Host "═══════════════════════════════════════════════════════════════"
Write-Host ""

# Verificar CLI
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host "❌ supabase CLI no instalado. Instalar:" -ForegroundColor Red
  Write-Host "   npm install -g supabase"
  exit 1
}

Write-Host "→ Estado actual del migration history..."
$listOutput = supabase migration list 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ supabase migration list falló. Asegurate de:" -ForegroundColor Red
  Write-Host "   - supabase login"
  Write-Host "   - supabase link --project-ref <tu-ref>"
  exit 1
}
$listOutput | Write-Host

Write-Host ""
Write-Host "→ Verificando si hay versiones huérfanas a reparar..."

$daysRenamed = @("20260521", "20260523", "20260524")
$appliedText = ($listOutput -join "`n")
$repaired = 0

foreach ($day in $daysRenamed) {
  # ¿Está el día sin HHMMSS marcado como applied? Buscamos línea con la version exacta.
  $pattern = "\|\s+\|\s+$day\s+\|"
  if ($appliedText -match $pattern) {
    $newFirst = "${day}000000"
    Write-Host "  • $day está como applied — reparando a $newFirst"
    & supabase migration repair --status reverted "$day" 2>&1 | Out-Null
    & supabase migration repair --status applied  "$newFirst" 2>&1 | Out-Null
    $repaired++
  }
}

if ($repaired -eq 0) {
  Write-Host "  ✓ No hay versiones huérfanas. Migration history limpio."
} else {
  Write-Host "  ✓ Reparadas $repaired versiones."
}

Write-Host ""
Write-Host "→ Aplicando migraciones pendientes (supabase db push)..."
supabase db push

Write-Host ""
Write-Host "✅ Migraciones aplicadas con éxito." -ForegroundColor Green
Write-Host ""
Write-Host "Estado final:"
supabase migration list
