import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
prisma
  .$queryRaw`SELECT 1 AS ok`
  .then((r) => console.log("Connected:", r))
  .catch((e) => console.error("Failed:", e.message))
  .finally(() => prisma.$disconnect());