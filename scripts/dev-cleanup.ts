import { cleanupTestData, closeSeedPool } from "../tests/e2e/fixtures/seed";

async function main() {
  await cleanupTestData();
  console.log("Cleaned up test data.");
  await closeSeedPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
