/**
 * Backfill Admin.ceremonyType for accounts created before the ceremony-type
 * feature existed.
 *
 * The 20260823120000_admin_ceremony_type migration adds the column NOT NULL
 * DEFAULT 'WEDDING', so Postgres already stamps every existing row as WEDDING.
 * This script is the explicit, re-runnable confirmation of that: it reports
 * what is in the table and forces any row that is somehow not WEDDING — e.g.
 * a row written by a half-deployed build — back to WEDDING.
 *
 * Idempotent. Safe to run more than once.
 *
 *   npx tsx prisma/scripts/backfill-ceremony-type.ts          # dry run
 *   npx tsx prisma/scripts/backfill-ceremony-type.ts --apply  # write
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');

  const total = await prisma.admin.count();
  const grouped = await prisma.admin.groupBy({
    by: ['ceremonyType'],
    _count: { _all: true },
  });

  console.log(`Admin rows: ${total}`);
  for (const g of grouped) {
    console.log(`  ${g.ceremonyType}: ${g._count._all}`);
  }

  const notWedding = await prisma.admin.count({
    where: { NOT: { ceremonyType: 'WEDDING' } },
  });

  if (notWedding === 0) {
    console.log('Nothing to backfill — every admin is already WEDDING.');
    return;
  }

  if (!apply) {
    console.log(`${notWedding} row(s) would be set to WEDDING. Re-run with --apply to write.`);
    return;
  }

  const result = await prisma.admin.updateMany({
    where: { NOT: { ceremonyType: 'WEDDING' } },
    data: { ceremonyType: 'WEDDING' },
  });
  console.log(`Updated ${result.count} row(s) to WEDDING.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
