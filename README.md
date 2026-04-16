# final-approver-interface-backend

Disbursement Workflow Management System (Node.js + MongoDB).

## Run

```bash
npm install
MONGO_URI='mongodb://127.0.0.1:27017/final-approver' npm start
```

## Test (100% coverage enforced)

```bash
npm test
```

## Key API Endpoints

- `POST /api/loans/instructions` – final approver submission with mandatory checklist validation and priority tagging (`normal|urgent|high_value`)
- `PATCH /api/loans/:id/instruction` – instruction update (blocked after lockdown)
- `GET /api/loans/queue?status=unassigned` – centralized queue view
- `POST /api/loans/:id/claim` – claim/assign record to self
- `GET /api/loans/:id/package` – clean disbursement package (copy fields + documents)
- `POST /api/loans/:id/comments` – comments thread with `@mention` extraction
- `POST /api/loans/:id/return` – return to approver with mandatory reason
- `PATCH /api/loans/:id/hold` – move item to on-hold
- `POST /api/loans/:id/complete` – close loop with mandatory transaction reference
- `GET /api/supervisor/capacity` – active file counts per disbursement officer
- `GET /api/dashboard/metrics` – pending total, average TAT, stale queue entries (24h+)
