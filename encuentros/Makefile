# Encuentros — comandos rápidos
# Uso: `make dev` corre backend + frontend en paralelo

.PHONY: install dev backend frontend build seed clean deploy-frontend deploy-backend check-separation

install:
	cd backend && npm install
	cd frontend && npm install

dev:
	@echo "→ Backend en :4100 · Frontend en :5180"
	@(cd backend && npm run dev) & (cd frontend && npm run dev)

backend:
	cd backend && npm run dev

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

# Aplicar schema + seed a Supabase
# Ejemplo: SUPABASE_DB_URL=postgresql://... make seed
seed:
	@if [ -z "$$SUPABASE_DB_URL" ]; then echo "Falta SUPABASE_DB_URL"; exit 1; fi
	psql "$$SUPABASE_DB_URL" -f database/schema_v1_encuentros.sql
	psql "$$SUPABASE_DB_URL" -f database/seed_demo_listings.sql

clean:
	rm -rf backend/node_modules frontend/node_modules frontend/dist

# Deploy a Vercel (frontend). Requiere `npm i -g vercel` y `vercel login`.
# Primera vez: pregunta team/project. Después: directo.
# Usar `make deploy-frontend ENV=prod` para producción.
deploy-frontend:
	@command -v vercel >/dev/null || (echo "Instala Vercel CLI: npm i -g vercel"; exit 1)
	cd frontend && vercel $(if $(filter prod,$(ENV)),--prod,)

# Deploy a Railway (backend). Requiere `npm i -g @railway/cli` y `railway login`.
deploy-backend:
	@command -v railway >/dev/null || (echo "Instala Railway CLI: npm i -g @railway/cli"; exit 1)
	cd backend && railway up

# Verifica que NO haya referencias a Destino TV en el código de Encuentros.
# Crucial para mantener separación legal: si Encuentros aparece como brand de
# Destino TV ante un regulador (FOSTA-SESTA, payment processor TOS), el riesgo
# se traslada al pivot principal.
check-separation:
	@echo "→ Buscando referencias a Destino en código de Encuentros..."
	@! grep -rni "destino" frontend/src backend/src 2>/dev/null | grep -v "node_modules" | grep -v "package-lock" | grep -v "^[^:]*: *//\?" || (echo "❌ Encontradas referencias a Destino. Removerlas antes de deploy prod."; exit 1)
	@echo "✅ Sin referencias cruzadas. Encuentros está aislado."
