# Design Document

## Architecture
- Vue.js SPA (`repo/frontend`) runs on local network and calls Koa APIs.
- Koa backend (`repo/backend`) provides domain APIs for auth, receiving, planning, HR, notifications, search, and rules.
- MySQL stores transactional and reference data; audit logs are append-only.
- Offline messaging writes export files to local storage and tracks retry status in DB.

## Tech Stack
- Frontend: Vue 3, Pinia, Vue Router, Vite
- Backend: Koa, koa-router, koa-body, bcryptjs, JWT
- Database: MySQL (`mysql2/promise`)
- Security: bcrypt salted hashes + AES-256-GCM field encryption

## Database Schema
- Authentication: `users`, `sessions`, `permissions`, `role_permissions`
- Receiving: `dock_appointments`, `receipts`, `receipt_lines`, `receipt_discrepancies`, `inventory_locations`
- Planning: `production_plans`, `production_plan_lines`, `work_orders`, `work_order_events`, `plan_adjustments`, `bill_of_materials`
- HR: `candidates`, `candidate_form_answers`, `candidate_attachments`, `interviewer_candidate_assignments`
- Notifications: `notification_templates`, `notification_subscriptions`, `notifications`, `message_queue`
- Search & scoring: `search_documents`, `scoring_rule_versions`, `qualification_scores`
- Compliance: `audit_logs`
