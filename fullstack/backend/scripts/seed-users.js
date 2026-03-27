import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const users = [
  ["admin", "ADMIN", "AdminPassw0rd!"],
  ["clerk1", "CLERK", "ClerkPassw0rd!"],
  ["planner1", "PLANNER", "PlannerPassw0rd!"],
  ["hr1", "HR", "HrRecruitPassw0rd!"],
  ["interviewer1", "INTERVIEWER", "InterviewerPass!"],
  ["candidate1", "CANDIDATE", "CandidatePassw0rd!"]
];

for (const [username, role, password] of users) {
  const hash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users (username, role, password_hash, site_id, department_id, sensitive_data_view)
     VALUES (?, ?, ?, 1, 1, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), password_hash = VALUES(password_hash)`,
    [username, role, hash, role === "HR" || role === "ADMIN" ? 1 : 0]
  );
}

console.log("Seed users done");
await pool.end();
