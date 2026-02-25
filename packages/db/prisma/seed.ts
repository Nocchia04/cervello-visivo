import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Admin
  const adminPassword = await bcrypt.hash("Admin1234!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@cervello.local" },
    update: {},
    create: {
      email: "admin@cervello.local",
      password: adminPassword,
      nome: "Admin",
      cognome: "Cervello Visivo",
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // Capo Cantiere di test
  const capoPassword = await bcrypt.hash("Capo1234!", 12);
  const capo = await prisma.user.upsert({
    where: { email: "capo@cervello.local" },
    update: {},
    create: {
      email: "capo@cervello.local",
      password: capoPassword,
      nome: "Mario",
      cognome: "Rossi",
      role: "CAPO_CANTIERE",
    },
  });
  console.log(`✅ Capo Cantiere: ${capo.email}`);

  console.log("\n📋 Credenziali di accesso:");
  console.log("  ADMIN          → admin@cervello.local  / Admin1234!");
  console.log("  CAPO_CANTIERE  → capo@cervello.local   / Capo1234!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
