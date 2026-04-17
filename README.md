# final-approver-interface-backend

Production-ready disbursement workflow API built with Node.js, TypeScript, Express, and MongoDB.

## Why this implementation

- Final Approver gatekeeping with mandatory eligibility checklist.
- Instruction lockdown to prevent unauthorized payout-field changes.
- Priority tagging (`normal|urgent|high_value`) to push critical files to the top.
- Claim-based work queue so only one disbursement officer owns a task.
- Capacity dashboard and workflow status breadcrumbs.
- Clean disbursement package (copy-ready account and amount + documents).
- Mandatory transaction reference to close the loop.
- Return-to-approver exception path with mandatory reason.
- Internal comments thread with `@mention` extraction.
- Operational metrics: pending volume, average TAT, stale queue alerts.

## Quickstart

```bash
npm install
npm run build
MONGO_URI="mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/final-approver?retryWrites=true&w=majority" npm start
```

For local development:

```bash
npm run dev
```

## Tests (100% coverage enforced)

```bash
npm test
```

## API Surface

- `GET /health`
- `POST /api/loans/instructions`
- `GET /api/loans/queue?status=unassigned|awaiting_disbursement|processing|on_hold|completed|action_required|all`
- `POST /api/loans/:id/claim`
- `PATCH /api/loans/:id/instruction`
- `GET /api/loans/:id/package`
- `GET /api/loans/:id/status-breadcrumbs`
- `POST /api/loans/:id/comments`
- `POST /api/loans/:id/return`
- `PATCH /api/loans/:id/hold`
- `POST /api/loans/:id/complete`
- `GET /api/supervisor/capacity`
- `GET /api/dashboard/metrics?staleHours=24`

## Contribution Notes

- Keep business rules in `src/app.ts` route handlers grouped by workflow stage.
- Add request/response examples in PRs for new endpoints.
- Preserve strict typing and run `npm run build` before opening a PR.
- Tests must keep global branch/function/line/statement coverage at 100%.
