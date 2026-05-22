import { deployApp } from "@templar/deploy";
import { tanstackStartApp } from "@templar/deploy/cloudflare";

const app = await deployApp("loan-payment-calculator");

export const website = await tanstackStartApp("website", {
  project: "loan-payment-calculator",
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName: "loan-payment-calculator.ericventor.com",
      adopt: true,
    },
  ],
  url: false,
});

console.log({
  url: "https://loan-payment-calculator.ericventor.com",
});

await app.finalize();
