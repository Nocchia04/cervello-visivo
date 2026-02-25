-- Inizializzazione database Cervello Visivo
-- Questo script viene eseguito solo al primo avvio del container

-- Estensioni utili
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- ricerca testuale fuzzy sulle annotazioni

-- Crea schema pubblico (già esiste di default, ma lo esplicitiamo)
CREATE SCHEMA IF NOT EXISTS public;

GRANT ALL ON SCHEMA public TO cervello;
