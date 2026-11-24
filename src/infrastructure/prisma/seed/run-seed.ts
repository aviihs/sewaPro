import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { normalizeNepalPhone } from '../../../common/validation/nepal-phone.js';
import { Argon2PasswordHasher } from '../../security/argon2-password-hasher.js';
import { PrismaClient } from '../generated/client.js';
import { seed } from './seed.js';

const password = z.string().min(10, 'must be at least 10 characters');

const seedEnv = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SEED_ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase()),
  SEED_ADMIN_PHONE: z
    .string()
    .transform((value) => normalizeNepalPhone(value))
    .pipe(z.string({ error: 'must be a valid Nepal mobile number' })),
  SEED_ADMIN_PASSWORD: password,
  SEED_SAMPLE_PASSWORD: z
    .union([z.literal(''), password])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

const parsed = seedEnv.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  process.stderr.write(`Invalid seed configuration:\n${issues.join('\n')}\n`);
  process.exit(1);
}
const env = parsed.data;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
try {
  const summary = await seed(prisma, new Argon2PasswordHasher(), {
    admin: {
      email: env.SEED_ADMIN_EMAIL,
      phone: env.SEED_ADMIN_PHONE,
      password: env.SEED_ADMIN_PASSWORD,
    },
    samplePassword: env.SEED_SAMPLE_PASSWORD,
  });
  process.stdout.write(`Seed complete: ${JSON.stringify(summary)}\n`);
} finally {
  await prisma.$disconnect();
}
