import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';

  const existing = await prisma.superAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`✅ Super Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const superAdmin = await prisma.superAdmin.create({
    data: { email, passwordHash },
  });

  console.log(`✅ Super Admin created:`);
  console.log(`   Email    : ${superAdmin.email}`);
  console.log(`   Password : ${password}`);
  console.log(`\n⚠️  Change the password after first login!\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
