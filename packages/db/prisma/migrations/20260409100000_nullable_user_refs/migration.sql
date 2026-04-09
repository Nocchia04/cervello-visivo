-- AlterTable: make uploadedById nullable on foto_360
ALTER TABLE "foto_360" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable: make autoreId nullable on annotazioni
ALTER TABLE "annotazioni" ALTER COLUMN "autoreId" DROP NOT NULL;

-- DropForeignKey (recreate with ON DELETE SET NULL)
ALTER TABLE "foto_360" DROP CONSTRAINT IF EXISTS "foto_360_uploadedById_fkey";
ALTER TABLE "annotazioni" DROP CONSTRAINT IF EXISTS "annotazioni_autoreId_fkey";

-- AddForeignKey with SET NULL
ALTER TABLE "foto_360" ADD CONSTRAINT "foto_360_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "annotazioni" ADD CONSTRAINT "annotazioni_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
