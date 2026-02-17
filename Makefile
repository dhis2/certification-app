PRE_COMMIT_VERSION ?= 4.3.0
COMPOSE ?= docker compose
COMPOSE_OPTS ?=

.PHONY: init reinit dev dev-build dev-down dev-restart dev-logs dev-ps \
        api-logs client-logs db-logs \
        api-shell db-shell \
        migrate migrate-revert seed \
        lint format test test-e2e check \
        clean

init:
	@test -d .venv || python3 -m venv .venv
	@.venv/bin/python -m pip install -q "pre-commit==$(PRE_COMMIT_VERSION)"
	@.venv/bin/pre-commit install
	cd api && npm install
	cd client && npm install

reinit:
	rm -rf .venv
	$(MAKE) init

up:
	@$(COMPOSE) up -d $(COMPOSE_OPTS)

build:
	@$(COMPOSE) up -d --build $(COMPOSE_OPTS)

down:
	@$(COMPOSE) down

down-restart: dev-down dev

logs-all:
	$(COMPOSE) logs -f

api-logs:
	$(COMPOSE) logs -f dhis2-cert-api

client-logs:
	$(COMPOSE) logs -f dhis2-cert-client

db-logs:
	$(COMPOSE) logs -f dhis2-cert-db

ps:
	@$(COMPOSE) ps

api-shell:
	@$(COMPOSE) exec dhis2-cert-api sh

db-shell:
	@$(COMPOSE) exec dhis2-cert-db psql -U $${DB_USER} -d $${DB_NAME}

migrate:
	@$(COMPOSE) exec dhis2-cert-api npm run migration:run

migrate-revert:
	@$(COMPOSE) exec dhis2-cert-api npm run migration:revert

seed: migrate
	@$(COMPOSE) exec dhis2-cert-api npm run seed

lint:
	@cd api && npm run lint
	@cd client && npm run lint

format:
	@cd api && npm run format
	@cd client && npm run format

test:
	@cd api && npm test

test-e2e: dev
	@cd client && npm run test:e2e

check:
	@.venv/bin/pre-commit run --all-files
	@cd api && npm test

clean:
	@$(COMPOSE) down -v --remove-orphans
