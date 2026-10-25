import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createCipheriv, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function encrypt(text: string): string {
  const rawKey =
    process.env.PII_ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const key = Buffer.from(rawKey.slice(0, 64), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

async function main() {
  console.log('Seeding initial GateFlow data...');

  // 1. Create Default Admin
  const adminPasswordHash = await bcrypt.hash('Admin12345!', 10);
  const adminEmailEnc = encrypt('admin@gateflow.example');

  const admin = await prisma.user.upsert({
    where: { emailEnc: adminEmailEnc },
    update: {},
    create: {
      emailEnc: adminEmailEnc,
      passwordHash: adminPasswordHash,
      role: 'Admin',
      status: 'ACTIVE',
    },
  });
  console.log(`Admin user created: ${admin.id}`);

  // 2. Create Default Standard Shift
  const shift = await prisma.shift.upsert({
    where: { id: 'standard-shift' },
    update: {},
    create: {
      id: 'standard-shift',
      name: 'Standard 9-5',
      startTime: '09:00',
      endTime: '17:00',
      graceMinutes: 15,
    },
  });
  console.log(`Standard shift created: ${shift.name}`);

  // 3. Create Default Site
  const defaultSite = await prisma.site.upsert({
    where: { siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111' },
    update: {},
    create: {
      name: 'Headquarters - New York',
      siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
      timezone: 'America/New_York',
      latitude: 40.7128,
      longitude: -74.006,
      radiusMeters: 150,
    },
  });
  console.log(`Default site created: ${defaultSite.name}`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
