import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordPolicy } from "../src/lib/auth/password.ts";
import { checkEmail } from "../src/lib/import/email.ts";

const prisma = new PrismaClient();
const { SEED_ORG_NAME = "Lucid Stem", SEED_OWNER_EMAIL = "", SEED_OWNER_PASSWORD = "" } = process.env;

const email = checkEmail(SEED_OWNER_EMAIL);
if (!email.ok) throw new Error("Set SEED_OWNER_EMAIL to a valid address.");
const policy = validatePasswordPolicy(SEED_OWNER_PASSWORD);
if (policy) throw new Error(policy);

const slug = SEED_ORG_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const org = await prisma.organization.upsert({ where: { slug }, create: { name: SEED_ORG_NAME, slug }, update: {} });
const user = await prisma.user.upsert({
  where: { email: email.normalized },
  create: { email: email.normalized, name: "Owner", passwordHash: await hashPassword(SEED_OWNER_PASSWORD) },
  update: {},
});
await prisma.membership.upsert({
  where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
  create: { userId: user.id, organizationId: org.id, role: "OWNER" }, update: {},
});
console.log(`Seeded organisation "${org.name}" with owner ${user.email}`);
await prisma.$disconnect();
