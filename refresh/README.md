# Refresh — Website intake V1

Interne Next.js-app om een URL toe te voegen, te scannen en te beoordelen voor het standaard **Website Refresh**-product.

Dit is **niet** Fluweel. Data staat in een eigen Supabase-project: `Website Refresh` (`exnprzhtxnxlrntlcsnh`).
Er is nog geen klantlabel nodig; die kun je later elders ontwikkelen.

## Privé live zetten

Dit mag al in de lucht als **besloten interne URL**. Niet koppelen aan nickhoevenaars.nl, Fluweel of `/admin`.

1. Nieuw Vercel-project, root directory `refresh`.
2. Env uit `.env.example`, plus `SUPABASE_SERVICE_ROLE_KEY` en `REFRESH_ALLOWED_EMAILS`.
3. In Supabase Authentication:
   - **Allow new users to sign up** uit.
   - **Confirm email** uit.
   - Zelf één user aanmaken (Add user) met het allowlist-adres.
4. Vercel-URL nergens publiek linken. `robots.txt` blokkeert indexatie.

OpenAI, Trigger.dev, Playwright en Lighthouse zijn **niet** nodig om privé te starten. Zonder OpenAI scoort de pipeline op crawl + regels. Lange scans kunnen op Vercel Hobby timeouten; lokaal of Pro is ruimer.

## Lokaal draaien

```bash
cd refresh
cp .env.example .env.local
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) en log in met de user uit Supabase.

## Testdataset

Zie `testdata/calibration.json`.
