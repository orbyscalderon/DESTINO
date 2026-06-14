# Encuentros — comandos rápidos
# Uso: `make dev` corre backend + frontend en paralelo

.PHONY: install dev backend frontend build seed clean

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
