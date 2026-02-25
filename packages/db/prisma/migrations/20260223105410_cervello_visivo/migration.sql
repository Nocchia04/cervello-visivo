-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CAPO_CANTIERE');

-- CreateEnum
CREATE TYPE "StatoCantiere" AS ENUM ('ATTIVO', 'ARCHIVIATO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CAPO_CANTIERE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cantieri" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "indirizzo" TEXT NOT NULL,
    "stato" "StatoCantiere" NOT NULL DEFAULT 'ATTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cantieri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cantiere_users" (
    "id" TEXT NOT NULL,
    "cantiereId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cantiere_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piantine" (
    "id" TEXT NOT NULL,
    "cantiereId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "livello" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "larghezza" INTEGER NOT NULL,
    "altezza" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "piantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punti_di_scatto" (
    "id" TEXT NOT NULL,
    "piantinaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punti_di_scatto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foto_360" (
    "id" TEXT NOT NULL,
    "puntoDiScattoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotazioni" (
    "id" TEXT NOT NULL,
    "foto360Id" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "autoreId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotazioni_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cantiere_users_cantiereId_userId_key" ON "cantiere_users"("cantiereId", "userId");

-- AddForeignKey
ALTER TABLE "cantiere_users" ADD CONSTRAINT "cantiere_users_cantiereId_fkey" FOREIGN KEY ("cantiereId") REFERENCES "cantieri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cantiere_users" ADD CONSTRAINT "cantiere_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piantine" ADD CONSTRAINT "piantine_cantiereId_fkey" FOREIGN KEY ("cantiereId") REFERENCES "cantieri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punti_di_scatto" ADD CONSTRAINT "punti_di_scatto_piantinaId_fkey" FOREIGN KEY ("piantinaId") REFERENCES "piantine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_360" ADD CONSTRAINT "foto_360_puntoDiScattoId_fkey" FOREIGN KEY ("puntoDiScattoId") REFERENCES "punti_di_scatto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_360" ADD CONSTRAINT "foto_360_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotazioni" ADD CONSTRAINT "annotazioni_foto360Id_fkey" FOREIGN KEY ("foto360Id") REFERENCES "foto_360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotazioni" ADD CONSTRAINT "annotazioni_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
