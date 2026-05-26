.DEFAULT_GOAL := help
.PHONY: help web-install web-dev web-build web-check worker-test worker-build

help: ## Show this help
	@echo "Empire Command Center — common tasks"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

web-install: ## Install web dependencies
	cd web && npm install

web-dev: ## Run the dashboard locally (http://localhost:3000)
	cd web && npm run dev

web-build: ## Production build of the web app
	cd web && npm run build

web-check: ## Typecheck the web app
	cd web && npx tsc --noEmit

worker-test: ## Run worker validation tests (no GPU)
	cd wan22-runpod-worker && MODEL_DIR=/tmp python3 test_local.py

worker-build: ## Build & push the worker image. Override tag: make worker-build TAG=v1
	cd wan22-runpod-worker && ./build.sh $(TAG)
