-- 0004_one_connection_per_aspsp.sql
--
-- Una sola connessione per istituto.
--
-- Non e' un vincolo di comodo per far funzionare un upsert: e' la realta' del
-- dominio. Il consenso presso una banca e' uno, e riautorizzare sostituisce il
-- precedente — su Intesa in modo esplicito, visto che ammette un solo consenso
-- attivo per TPP. Due righe per lo stesso istituto significherebbero due
-- verita' su quando scade l'accesso, e l'alert di rinnovo della Fase 7 ne
-- guarderebbe una a caso.

alter table public.bank_connections
  add constraint bank_connections_aspsp_unique unique (aspsp_name, aspsp_country);
