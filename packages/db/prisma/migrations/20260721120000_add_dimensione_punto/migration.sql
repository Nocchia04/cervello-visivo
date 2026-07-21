-- Aggiunge la dimensione del marker al punto di scatto (PICCOLO|MEDIO|GRANDE|XL).
ALTER TABLE "punti_di_scatto" ADD COLUMN "dimensione" TEXT NOT NULL DEFAULT 'MEDIO';
