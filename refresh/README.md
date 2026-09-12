# Refresh — Website intake V1

Interne Next.js-app om een URL toe te voegen, te scannen en te beoordelen voor het standaard **Website Refresh**-product.

Dit is **niet** Fluweel. Data staat in een eigen Supabase-project: `Website Refresh` (`exnprzhtxnxlrntlcsnh`).

## Wat V1 doet

1. Prospect toevoegen via URL
2. Website crawlen (max. 10 relevante pagina's)
3. Findings opslaan als FACT / OBSERVATION / HYPOTHESIS
4. Productfit en Opportunity Score berekenen met vaste regels
5. Dashboard, lijst, detail, human review, interne preview

AI mag harde uitsluitingen (webshop, klantportaal, onbereikbaar, recente high-quality site) **niet** overrulen.

## Lokaal draaien

```bash
cd refresh
cp .env.example .env.local
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), maak een intern account, plak een URL, klik **Add & Scan**.

Zet in het Supabase-project **Authentication → Providers → Email** confirmations uit voor intern gebruik, of bevestig de eerste mail.

## Verplichte env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (workflows / storage; niet in de browser)
- `OPENAI_API_KEY` (optioneel; zonder key draait de pipeline op regels + crawl)
- `TRIGGER_SECRET_KEY` (productieachtergrondtaken)

## Vercel

Maak een **apart** Vercel-project met root directory `refresh`. Niet het bestaande nickhoevenaars.nl-project overschrijven.

## Trigger.dev

Zware stappen (Playwright, Lighthouse, retries) horen in Trigger.dev. De pipeline zit in `lib/pipeline/run.ts` en wordt nu vanuit API-routes aangeroepen zodat V1 zonder Trigger-account al scoort. Koppel later:

- `workflows/scan-prospect.ts`
- `workflows/analyse-prospect.ts`
- `workflows/generate-preview.ts`

## Testdataset

Zie `testdata/calibration.json`. Vul aan tot ~100 gelabelde sites voordat je opschaalt.
