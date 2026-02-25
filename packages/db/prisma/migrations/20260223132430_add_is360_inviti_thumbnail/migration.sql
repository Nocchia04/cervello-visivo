-- AlterTable
ALTER TABLE "cantieri" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "foto_360" ADD COLUMN     "is360" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "inviti" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CAPO_CANTIERE',
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "inviti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inviti_email_key" ON "inviti"("email");

-- CreateIndex
CREATE UNIQUE INDEX "inviti_token_key" ON "inviti"("token");

-- AddForeignKey
ALTER TABLE "inviti" ADD CONSTRAINT "inviti_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
