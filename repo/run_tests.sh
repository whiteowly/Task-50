#!/bin/bash
# Unified test execution script
set -e

if [ ! -d "backend/node_modules" ]; then
  echo 'Installing backend dependencies...'
  (cd backend && npm install)
fi

if [ ! -d "frontend/node_modules" ]; then
  echo 'Installing frontend dependencies...'
  (cd frontend && npm install)
fi

echo 'Running Unit Tests...'
node --test --test-concurrency=1 unit_tests/*.test.js

echo 'Running API Tests...'
node --test --test-concurrency=1 API_tests/*.api.test.js

echo 'Running Integration Tests...'
if [ -z "${RUN_DB_INTEGRATION_TESTS:-}" ]; then
  export RUN_DB_INTEGRATION_TESTS=1
  echo 'RUN_DB_INTEGRATION_TESTS not set. Defaulting to full DB integration verification (RUN_DB_INTEGRATION_TESTS=1).'
fi
if node --test --test-concurrency=1 integration_tests/*.test.js; then
  echo 'Integration boundary: full DB integration executed.'
else
  echo 'Integration boundary: DB prerequisites missing or integration failed; full DB integration not executed.'
  echo 'Action: apply backend/schema.sql, backend/seed.sql, then run node backend/scripts/seed-users.js'
  exit 1
fi

echo 'Running Frontend Tests...'
(cd frontend && npm run test)

echo 'Building Frontend...'
(cd frontend && npm run build)
