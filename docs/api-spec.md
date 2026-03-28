# API Specification

| Method | Path | Description | Params | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | Login and create session | `username,password` | `token,user` |
| POST | `/api/auth/logout` | Revoke session | auth header | `{ok}` |
| GET | `/api/dashboard` | Role workspace widgets | auth header | `role,widgets` |
| POST | `/api/receiving/dock-appointments` | Create 30-min dock slot | site,po,start,end | `appointmentId` |
| POST | `/api/receiving/receipts` | Create PO receipt lines | site,po,lines | `receiptId` |
| POST | `/api/receiving/receipts/:id/close` | Close receipt (must resolve discrepancies) | id | `{ok}` |
| GET | `/api/receiving/receipts/:id/documents` | List receipt documents | id | `documents[]` |
| POST | `/api/receiving/receipts/:id/documents` | Upload receipt document | multipart file + traceability fields | `documentId` |
| POST | `/api/receiving/putaway/recommend` | Validate capacity + mixed storage | sku,lot,qty | `location recommendation` |
| POST | `/api/planning/mps` | Save 12-week MPS | weeks[] | `planId` |
| GET | `/api/planning/mps/:planId/mrp` | Run material requirements | planId | `requirements[]` |
| POST | `/api/planning/work-orders` | Create work order | plan,item,qty | `workOrderId` |
| POST | `/api/planning/work-orders/:id/events` | Log production/rework/downtime | type,qty,reason | `{ok}` |
| POST | `/api/planning/plans/:id/adjustments` | Submit plan change with reason | before,after,reason | `adjustmentId` |
| POST | `/api/planning/adjustments/:id/approve` | Supervisor approval | id | `{ok}` |
| POST | `/api/hr/applications` | Candidate submits application | demographics,formData | `candidateId,duplicateFlag,uploadToken,attachmentCompleteness` |
| POST | `/api/hr/applications/:id/attachments` | Upload attachment <=20MB | multipart file + optional `x-candidate-upload-token` | `attachmentId,attachmentCompleteness` |
| GET | `/api/hr/candidates/:id` | Candidate profile with masking rules | id | candidate profile |
| POST | `/api/notifications/subscriptions` | Subscribe to milestone topics | topic,frequency,dndStart,dndEnd | `{ok}` |
| GET | `/api/notifications` | List notification inbox/history | status,eventType,page,pageSize | paged notifications |
| POST | `/api/notifications/events` | Publish event to center | event,payload | `{ok}` |
| POST | `/api/notifications/offline-queue` | Export connector message file | channel,body | `queueId,filePath` |
| GET | `/api/audit` | Read paged audit trail (authorized) | action,entityType,actorUserId,page,pageSize | paged audit rows |
| GET | `/api/search` | Full-text-like search + filters | q,start,end,source,topic,entity | results[] |
| POST | `/api/rules/versions` | Create scoring rule version | weights,policy | `ruleVersionId` |
| POST | `/api/rules/score` | Score qualification and GPA | scores,credits | score payload |
