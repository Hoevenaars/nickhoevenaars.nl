import { crawlWebsite } from "../lib/browser/crawl";
import { findingsFromScan, qualityFromScan } from "../lib/scoring/from-scan";
import { calculateOpportunity } from "../lib/scoring/opportunity";

async function main() {
  const url = process.argv[2] ?? "https://example.com";
  const crawl = await crawlWebsite({ url, maxPages: 5 });
  const metrics = {
    httpStatus: crawl.httpStatus,
    sslValid: crawl.sslValid,
    brokenLinksCount: crawl.brokenLinks.length,
    formsCount: crawl.pages.filter((page) => page.hasForm).length,
    formsWorkingCount: crawl.pages.filter((page) => page.hasForm).length,
    hasPhone: crawl.pages.some((page) => page.hasPhone),
    hasEmail: crawl.pages.some((page) => page.hasEmail),
    hasPrimaryCta: crawl.pages.some((page) => page.hasPrimaryCta),
    hasContactPage: crawl.pages.some((page) => page.pageType === "contact"),
    pageCount: crawl.pages.length,
    wordCount: crawl.pages.reduce((sum, page) => sum + page.wordCount, 0),
  };
  const quality = qualityFromScan(metrics);
  const findings = findingsFromScan(metrics);
  const score = calculateOpportunity({
    quality,
    commercial: {
      companySize: "5-30",
      likelyCustomerValue: "medium",
      websiteImportanceForAcquisition: "medium",
    },
    productFit: crawl.functionality,
    findings,
  });

  console.log(
    JSON.stringify(
      {
        url,
        errorCode: crawl.errorCode ?? null,
        httpStatus: crawl.httpStatus,
        sslValid: crawl.sslValid,
        pages: crawl.pages.map((page) => ({ url: page.url, type: page.pageType, title: page.title })),
        brokenLinks: crawl.brokenLinks.length,
        productFit: {
          webshop: crawl.functionality.hasWebshop,
          login: crawl.functionality.hasLogin,
          pages: crawl.functionality.estimatedPageCount,
        },
        websiteScore: score.websiteScore,
        opportunityScore: score.opportunityScore,
        status: score.suggestedStatus,
        findings: findings.map((item) => item.title),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
