#!/bin/bash
# Unified test execution script — CI-safe.
# Requires only Docker (with Compose) on the host; no Node.js needed.
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve docker compose command (v2 plugin or legacy standalone v1)
# ---------------------------------------------------------------------------
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: 'docker compose' is required but was not found on PATH." >&2
  exit 1
fi

# Default: run full DB integration tests unless explicitly disabled
RUN_DB_INTEGRATION_TESTS="${RUN_DB_INTEGRATION_TESTS:-1}"

echo "==> Executing test suite inside Docker (test-runner service)..."

$DC run --rm -T \
  -e "RUN_DB_INTEGRATION_TESTS=${RUN_DB_INTEGRATION_TESTS}" \
  test-runner \
  sh -c '
    set -e

    run_with_timeout() {
      local seconds="$1"
      shift
      if timeout "${seconds}" "$@"; then
        return 0
      fi
      local rc=$?
      if [ "${rc}" -eq 124 ]; then
        echo "ERROR: Command timed out after ${seconds}s: $*"
      fi
      return "${rc}"
    }

    echo "--- Installing backend dependencies ---"
    (cd /workspace/backend && npm ci)

    echo "--- Installing frontend dependencies ---"
    (cd /workspace/frontend && npm ci)

    cd /workspace

    echo "--- Running Unit Tests ---"
    run_with_timeout 900 node --test --test-concurrency=1 unit_tests/*.test.js

    echo "--- Running API Tests ---"
    run_with_timeout 900 node --test --test-concurrency=1 API_tests/*.api.test.js

    echo "--- Running Integration Tests ---"
    if [ -z "${RUN_DB_INTEGRATION_TESTS:-}" ]; then
      export RUN_DB_INTEGRATION_TESTS=1
      echo "RUN_DB_INTEGRATION_TESTS not set. Defaulting to full DB integration verification."
    fi
    if run_with_timeout 900 node --test --test-concurrency=1 integration_tests/*.test.js; then
      echo "Integration boundary: full DB integration executed."
    else
      echo "Integration boundary: DB prerequisites missing or integration failed."
      echo "Action: apply backend/schema.sql, backend/seed.sql, then run node backend/scripts/seed-users.js"
      exit 1
    fi

    echo "--- Running Frontend Tests ---"
    run_with_timeout 900 sh -c "cd /workspace/frontend && npm run test"

    echo "--- Building Frontend ---"
    run_with_timeout 600 sh -c "cd /workspace/frontend && npm run build"
  '

echo "==> All tests completed successfully."
