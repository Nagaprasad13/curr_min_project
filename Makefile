# CareBridge Research Prototype Makefile
# Provides uniform automation across all project lifecycle phases

.PHONY: setup seed test evaluate experiment train-ml demo demo-reset check-reproduce ci

setup:
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

seed:
	@echo "Seeding synthetic hospital and clinical database in MongoDB..."
	cd backend && npm run seed

test:
	@echo "Running complete automated test suite across all phases..."
	cd backend && npm test

evaluate:
	@echo "Running Phase 3 referral engine baseline evaluation (500 scenarios)..."
	cd backend && npm run evaluate

experiment:
	@echo "Running Phase 4 staleness degradation Monte Carlo experiment..."
	cd backend && npm run experiment

train-ml:
	@echo "Training screening models and triage severity classifier..."
	cd ml && python train_screening_models.py && python train_triage.py

demo:
	@echo "Executing guided 7-step clinical referral and consent scenario..."
	cd backend && npm run demo

demo-reset:
	@echo "Restoring database to pristine seeded state..."
	cd backend && npm run demo:reset

check-reproduce:
	@echo "Verifying numerical reproducibility across Phase 3, 4, and 5 results..."
	cd backend && npm run check:reproduce

ci: test check-reproduce
	@echo "All continuous integration gates passed successfully."
