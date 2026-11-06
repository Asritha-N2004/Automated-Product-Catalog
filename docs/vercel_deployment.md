# Verified Vercel deployment

Production URL: https://freshwise-grocery-topaz.vercel.app
Team URL: https://vercel.com/resum-projects
Project: `freshwise-grocery`
Owner: `Resume_Projects` (`resum-projects`)
Project ID: `prj_O98lYAyysVyA63O5uzz59g5ZtGY8`
Deployment ID: `dpl_FAGjf81mFYAGiHKqyP7yp881Xt7J`
Alternate production alias: https://freshwise-grocery-resum-projects.vercel.app

## Database

A separate Neon database named `freshwise-db` is connected for Production and Preview using the existing team's **Free** (`free_v3`) plan. Resource ID: `store_6iAu7NGrrO38hG5L`. It is located in `iad1`, alongside the backend. DATABASE_URL is supplied by the integration. JWT_SECRET is stored as a Vercel Secret and is not committed to source.

The Vercel entrypoint requires durable storage and never substitutes temporary SQLite for a missing cloud database. Standard Neon PostgreSQL URLs are normalized to the installed psycopg driver. Initialization and seeding use a PostgreSQL advisory transaction lock to handle concurrent cold starts safely.

## Live verification — 6 November 2026

- Vercel deployment: Ready, production, owned by resum-projects.
- Public health endpoint: HTTP 200.
- Registration: HTTP 201 for a disposable test account.
- Login: successful with the same account.
- Catalog: 110 products.
- Eight deterministic agents executed successfully.
- A sample ₹175 basket was optimized to ₹160 and explicitly applied.
- Sample checkout succeeded and analytics persisted ₹160 of spending.
- Browser displayed the live sign-in page at the new production URL.

No real payment was collected. The live verification used generated test credentials kept only in memory. Create your own account on the URL above. Accounts from local SQLite or the earlier incorrect-team deployment are not migrated.

## Redeploy

Use the CLI signed into your account. Confirm the target before deploying:

```powershell
vercel project inspect --non-interactive --scope resum-projects
vercel deploy --prod --yes --scope resum-projects
```

The local .vercel link selects this verified project. Do not use resume-project3; the user confirmed it is not their team. The connected plugin used earlier belongs to that different account, so deployment was completed through the CLI authenticated as the user instead.
