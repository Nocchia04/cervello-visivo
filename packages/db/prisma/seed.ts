import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Pulizia dati esistenti (ordine rispetta le FK)
  await prisma.annotazione.deleteMany();
  await prisma.foto360.deleteMany();
  await prisma.puntoDiScatto.deleteMany();
  await prisma.piantina.deleteMany();
  await prisma.cantiereUser.deleteMany();
  await prisma.cantiere.deleteMany();
  // Rimuove tutti gli utenti tranne quello che stiamo per creare
  await prisma.user.deleteMany({ where: { email: { not: "info@nrggold.it" } } });

  // Admin NRG Gold
  const adminPassword = await bcrypt.hash("HoloBuilder2025!?", 12);
  const admin = await prisma.user.upsert({
    where: { email: "info@nrggold.it" },
    update: { password: adminPassword, nome: "Admin", cognome: "NRG Gold", role: "ADMIN" },
    create: {
      email: "info@nrggold.it",
      password: adminPassword,
      nome: "Admin",
      cognome: "NRG Gold",
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  console.log("\n📋 Credenziali di accesso:");
  console.log("  ADMIN → info@nrggold.it / HoloBuilder2025!?");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
