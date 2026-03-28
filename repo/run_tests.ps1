$ErrorActionPreference = "Stop"

if (-not (Test-Path "backend/node_modules")) {
  Write-Host "Installing backend dependencies..."
  Push-Location "backend"
  try {
    npm.cmd install
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path "frontend/node_modules")) {
  Write-Host "Installing frontend dependencies..."
  Push-Location "frontend"
  try {
    npm.cmd install
  }
  finally {
    Pop-Location
  }
}

Write-Host "Running Unit Tests..."
node --test --test-concurrency=1 unit_tests/*.test.js

Write-Host "Running API Tests..."
node --test --test-concurrency=1 API_tests/*.api.test.js

Write-Host "Running Integration Tests..."
$integrationEnv = [System.Environment]::GetEnvironmentVariable("RUN_DB_INTEGRATION_TESTS")
if ([string]::IsNullOrWhiteSpace($integrationEnv)) {
  $env:RUN_DB_INTEGRATION_TESTS = "1"
  Write-Host "RUN_DB_INTEGRATION_TESTS not set. Defaulting to full DB integration verification (RUN_DB_INTEGRATION_TESTS=1)."
}
try {
  node --test --test-concurrency=1 integration_tests/*.test.js
  Write-Host "Integration boundary: full DB integration executed."
}
catch {
  $message = $_.Exception.Message
  if ($message -match "\[DB preflight failed\]") {
    Write-Host "Integration boundary: DB prerequisites missing; full DB integration not executed."
    Write-Host $message
    Write-Host "Action: apply backend/schema.sql, backend/seed.sql, then run node backend/scripts/seed-users.js"
  }
  throw
}

Write-Host "Running Frontend Tests..."
Push-Location "frontend"
try {
  npm.cmd run test
  Write-Host "Building Frontend..."
  npm.cmd run build
}
finally {
  Pop-Location
}
