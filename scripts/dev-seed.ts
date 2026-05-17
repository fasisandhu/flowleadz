import { seedTestUsers, closeSeedPool } from "../tests/e2e/fixtures/seed";

async function main() {
  const result = await seedTestUsers();
  console.log("Seed complete:", result);
  await closeSeedPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
