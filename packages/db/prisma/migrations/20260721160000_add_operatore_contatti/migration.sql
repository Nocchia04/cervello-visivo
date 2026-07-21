-- Campi di contatto operatore: email personale (notifiche push) + telefono.
ALTER TABLE "users" ADD COLUMN "emailPersonale" TEXT;
ALTER TABLE "users" ADD COLUMN "telefono" TEXT;
