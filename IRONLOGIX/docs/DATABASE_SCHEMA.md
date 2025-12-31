# IRONLOGIX — Database Schema (V1)

This document defines the core database structure for the IRONLOGIX Safety Management Platform.
It supports incidents, inspections, violations, audit trails, and legal-grade exports.

---

## ENUMS

### UserRole
- ADMIN
- SAFETY_DIRECTOR
- SUPERVISOR
- SAFETY_TECH

### IncidentStatus
- DRAFT
- SUBMITTED
- SUPERVISOR_REVIEWED
- DIRECTOR_APPROVED
- LOCKED

### ViolationStatus
- ISSUED
- ACKNOWLEDGED
- DIRECTOR_REVIEWED
- CLOSED

### InspectionResult
- PASS
- FAIL
- OUT_OF_SERVICE

---

## TABLES

### companies
- id (uuid, pk)
- name
- createdAt

---

### users
- id (uuid, pk)
- companyId (fk → companies.id)
- name
- email (unique)
- role (UserRole)
- isActive (boolean)
- createdAt

---

### jobsites
- id (uuid, pk)
- companyId (fk)
- name
- address
- city
- state
- zip
- isActive
- createdAt

---

### employees
- id (uuid, pk)
- companyId (fk)
- firstName
- lastName
- employeeId (optional)
- department (optional)
- status (active / inactive)
- createdAt

---

### incidents
- id (uuid, pk)
- companyId (fk)
- jobsiteId (fk)
- reportedByUserId (fk → users.id)
- incidentType (injury / near_miss / property / environmental / unsafe_condition)
- occurredAt (datetime)
- description
- immediateAction
- rootCause (optional)
- status (IncidentStatus)
- lockedAt (optional)
- createdAt
- updatedAt

---

### violations
- id (uuid, pk)
- companyId (fk)
- jobsiteId (fk)
- issuedByUserId (fk)
- employeeId (fk)
- category (PPE / LOTO / HotWork / FallProtection / Equipment / Housekeeping / Other)
- description
- correctiveAction
- retrainingRequired (boolean)
- status (ViolationStatus)
- createdAt
- updatedAt

---

### assets
- id (uuid, pk)
- companyId (fk)
- assetType (forklift / scissor / telehandler / harness / ladder / tool / other)
- tagNumber (optional)
- makeModel (optional)
- serialNumber (optional)
- status (active / out_of_service)
- createdAt

---

### inspections
- id (uuid, pk)
- companyId (fk)
- jobsiteId (fk)
- performedByUserId (fk)
- assetId (fk, optional)
- inspectionType (asset / jobsite)
- checklistName
- result (InspectionResult)
- notes
- performedAt
- createdAt

---

### attachments
- id (uuid, pk)
- companyId (fk)
- relatedType (incident / violation / inspection)
- relatedId (uuid)
- fileName
- fileUrl
- mimeType
- uploadedByUserId (fk)
- createdAt

---

### signatures
- id (uuid, pk)
- companyId (fk)
- relatedType (incident / violation / inspection)
- relatedId (uuid)
- signedByUserId (fk)
- signedRole (Supervisor / Director / Employee)
- signedAt
- signatureData (optional)
- createdAt

---

### audit_logs
- id (uuid, pk)
- companyId (fk)
- actorUserId (fk)
- entityType (incident / violation / inspection / asset / jobsite / employee)
- entityId
- action (create / update / submit / approve / lock)
- beforeJson (optional)
- afterJson (optional)
- createdAt
