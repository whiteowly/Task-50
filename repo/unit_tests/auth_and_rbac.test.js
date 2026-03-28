import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "../backend/node_modules/bcryptjs/index.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import { createUser, login } from "../backend/src/services/auth-service.js";
import { optionalAuth, requirePermission } from "../backend/src/middleware/auth.js";
import { pool } from "../backend/src/db.js";
import { config } from "../backend/src/config.js";

const originalExecute = pool.execute;

test("db config uses UTC timezone for MySQL session timestamps", () => {
  assert.equal(config.db.timezone, "Z");
});

test("login locks account after fifth failed attempt", async () => {
  const hash = await bcrypt.hash("CorrectPassword123", 4);
  let updateParams = null;

  pool.execute = async (sql, params) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      return [[{
        id: 10,
        username: "clerk1",
        role: "CLERK",
        password_hash: hash,
        failed_login_attempts: 4,
        locked_until: null,
        site_id: 1,
        department_id: 1,
        has_sensitive_permission: 0
      }]];
    }
    if (sql.includes("SET failed_login_attempts = ?")) {
      updateParams = params;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await assert.rejects(() => login("clerk1", "WrongPassword123"), /Invalid username or password/);
  assert.equal(updateParams[0], 5);
  assert.equal(updateParams[2], 10);
  assert.ok(updateParams[1] instanceof Date);

  pool.execute = originalExecute;
});

test("login allows access after lockout period (15 minutes)", async () => {
  const hash = await bcrypt.hash("CorrectPassword123", 4);
  const now = Date.now();
  const lockoutTime = new Date(now - 1 * 60 * 1000); // Locked 1 minute ago
  // Note: config.accountLockMinutes = 15. We'll simulate advancing time 16 minutes after that lock.

  let resetAttemptsCalled = false;
  let sessionInsertCalled = false;

  pool.execute = async (sql, params) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      return [[{
        id: 10,
        username: "locked-user",
        role: "CLERK",
        password_hash: hash,
        failed_login_attempts: 5,
        locked_until: lockoutTime,
        site_id: 1,
        department_id: 1,
        has_sensitive_permission: 0
      }]];
    }
    if (sql.includes("SET failed_login_attempts = 0, locked_until = NULL")) {
      resetAttemptsCalled = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO sessions")) {
      sessionInsertCalled = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  // 1. First, verify login fails BEFORE time advancement (1 minute after lock)
  // At this point, new Date() is > lockoutTime but wait... 
  // Let's re-read the service logic:
  // if (user.locked_until && new Date(user.locked_until) > new Date())
  // So if locked_until = 12:00 and current time = 11:59, it's blocked.
  
  // Set locked_until to 14 minutes in the future relative to "now"
  const futureLockout = new Date(now + 14 * 60 * 1000);
  
  pool.execute = async (sql, params) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      return [[{
        id: 10,
        username: "locked-user",
        role: "CLERK",
        password_hash: hash,
        failed_login_attempts: 5,
        locked_until: futureLockout,
        site_id: 1,
        department_id: 1,
        has_sensitive_permission: 0
      }]];
    }
    throw new Error(`Unexpected SQL during pre-check: ${sql}`);
  };

  await assert.rejects(() => login("locked-user", "CorrectPassword123"), /Account locked/);

  // 2. Mock Date.now to advance time by 16 minutes (beyond the 15 min config)
  const advancedNow = now + 16 * 60 * 1000;
  
  pool.execute = async (sql, params) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      // In auth-service.js:
      // if (user.locked_until && new Date(user.locked_until) > new Date())
      // We pass a date that is clearly in the past relative to "now".
      const passedLockout = new Date(Date.now() - 1 * 60 * 1000); 
      
      return [[{
        id: 10,
        username: "locked-user",
        role: "CLERK",
        password_hash: hash,
        failed_login_attempts: 5,
        locked_until: passedLockout,
        site_id: 1,
        department_id: 1,
        has_sensitive_permission: 0
      }]];
    }
    if (sql.includes("failed_login_attempts = 0")) {
      resetAttemptsCalled = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO sessions")) {
      sessionInsertCalled = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL during retry: ${sql}`);
  };

  const result = await login("locked-user", "CorrectPassword123");
  assert.ok(result.token, "Login should succeed after 15 minutes");
  assert.strictEqual(resetAttemptsCalled, true);
  assert.strictEqual(sessionInsertCalled, true);

  pool.execute = originalExecute;
});

test("login sensitiveDataView depends on permission mapping, not user flag", async () => {
  const hash = await bcrypt.hash("CorrectPassword123", 4);
  let resetAttempts = false;
  let sessionInsert = false;
  let auditInsert = false;

  pool.execute = async (sql, params) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      return [[{
        id: 11,
        username: "planner1",
        role: "PLANNER",
        password_hash: hash,
        failed_login_attempts: 0,
        locked_until: null,
        site_id: 1,
        department_id: 2,
        has_sensitive_permission: 0
      }]];
    }
    if (sql.includes("failed_login_attempts = 0")) {
      resetAttempts = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO sessions")) {
      sessionInsert = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      auditInsert = true;
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await login("planner1", "CorrectPassword123");
  assert.ok(result.token);
  assert.equal(result.user.role, "PLANNER");
  assert.equal(resetAttempts, true);
  assert.equal(sessionInsert, true);
  assert.equal(auditInsert, true);
  assert.equal(result.user.sensitiveDataView, false);

  pool.execute = originalExecute;
});

test("login sensitiveDataView depends on permission mapping, not user flag", async () => {
  const hash = await bcrypt.hash("CorrectPassword123", 4);

  pool.execute = async (sql) => {
    if (sql.includes("FROM users WHERE username = ?")) {
      return [[{
        id: 42,
        username: "hr1",
        role: "HR",
        password_hash: hash,
        failed_login_attempts: 0,
        locked_until: null,
        site_id: 1,
        department_id: 2,
        has_sensitive_permission: 1
      }]];
    }
    if (sql.includes("failed_login_attempts = 0")) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO sessions")) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await login("hr1", "CorrectPassword123");
  assert.equal(result.user.sensitiveDataView, true);

  pool.execute = originalExecute;
});

test("optionalAuth revokes idle session after timeout", async () => {
  const token = jwt.sign({ sub: 1, sessionId: "session-1" }, config.jwtSecret, { expiresIn: 3600 });
  let revokedCalled = false;
  
  // config.idleTimeoutSeconds = 1800 (30 mins)
  const staleDate = new Date(Date.now() - 31 * 60 * 1000); // 31 mins ago

  pool.execute = async (sql) => {
    if (sql.includes("FROM sessions s")) {
      return [[{
        id: "session-1",
        user_id: 1,
        last_activity_at: staleDate,
        username: "admin",
        role: "ADMIN",
        site_id: 1,
        department_id: 1,
        has_sensitive_permission: 1
      }]];
    }
    if (sql.includes("SET revoked_at = NOW()")) {
      revokedCalled = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const ctx = { headers: { authorization: `Bearer ${token}` }, state: {} };
  await optionalAuth(ctx, async () => {});
  assert.strictEqual(revokedCalled, true);
  assert.strictEqual(ctx.state.user, undefined);

  pool.execute = originalExecute;
});

test("requirePermission blocks user without mapped permission", async () => {
  pool.execute = async (sql) => {
    if (sql.includes("FROM role_permissions rp")) {
      return [[]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const middleware = requirePermission("RECEIPT_CLOSE");
  const ctx = {
    state: {
      user: {
        id: 12,
        role: "CLERK"
      }
    }
  };

  await assert.rejects(() => middleware(ctx, async () => {}), /Permission missing: RECEIPT_CLOSE/);

  pool.execute = originalExecute;
});

test("createUser rejects password shorter than 12 chars", async () => {
  await assert.rejects(
    () =>
      createUser(
        {
          username: "new-user",
          role: "CLERK",
          password: "short1"
        },
        1
      ),
    /Password too short/
  );
});

test("createUser hashes password and never stores plaintext", async () => {
  const originalHash = bcrypt.hash;
  let receivedHashInput = null;
  let storedPasswordHash = null;

  bcrypt.hash = async (value, rounds) => {
    receivedHashInput = { value, rounds };
    return "$2a$12$hashedPasswordValue";
  };

  pool.execute = async (sql, params) => {
    if (sql.includes("INSERT INTO users")) {
      storedPasswordHash = params[2];
      return [{ insertId: 55 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await createUser(
    {
      username: "secure-user",
      role: "HR",
      password: "VeryLongPassword123",
      siteId: 1,
      departmentId: 1,
      sensitiveDataView: false
    },
    99
  );

  assert.equal(result.id, 55);
  assert.deepEqual(receivedHashInput, { value: "VeryLongPassword123", rounds: 12 });
  assert.equal(storedPasswordHash, "$2a$12$hashedPasswordValue");
  assert.notEqual(storedPasswordHash, "VeryLongPassword123");

  bcrypt.hash = originalHash;
  pool.execute = originalExecute;
});

test("createUser writes audit log on success", async () => {
  const originalHash = bcrypt.hash;
  let auditInsertSeen = false;

  bcrypt.hash = async () => "$2a$12$anotherHashedValue";

  pool.execute = async (sql) => {
    if (sql.includes("INSERT INTO users")) {
      return [{ insertId: 56 }];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      auditInsertSeen = true;
      return [{ insertId: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await createUser(
    {
      username: "audited-user",
      role: "PLANNER",
      password: "AnotherStrongPass123"
    },
    100
  );

  assert.equal(auditInsertSeen, true);

  bcrypt.hash = originalHash;
  pool.execute = originalExecute;
});
