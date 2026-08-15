-- 0039_contare_senza_scaricare.sql
--
-- Una vista per contare, invece di scaricare tutto e contare in TypeScript.
--
-- ---------------------------------------------------------------------------
-- Il difetto, misurato
-- ---------------------------------------------------------------------------
-- `/categorie` scaricava **74 KB** a ogni apertura: 1.323 righe di `v_expenses`
-- e 300 di `merchants`, per poi contarle in un ciclo. Serviva a scrivere «3
-- esercenti · 12 movimenti» accanto a ogni categoria, cioe' sessantasei numeri.
--
-- PostgREST non puo' fare di meglio da solo: le funzioni di aggregazione sono
-- disabilitate su questo progetto (`PGRST123`), ed e' una scelta di sicurezza
-- ragionevole che non vale la pena cambiare per una schermata. Quello che si
-- puo' fare e' chiedere al database un conto gia' fatto — che e' anche la
-- regola di CLAUDE.md: **le aggregazioni si fanno in SQL, non in TypeScript**.
--
-- ---------------------------------------------------------------------------
-- Diretto, non roll-up
-- ---------------------------------------------------------------------------
-- Conta cio' che sta appeso **direttamente** al nodo, non all'intero ramo. E'
-- la domanda giusta prima di eliminare una categoria: quanto si sposta. La
-- spesa del ramo intero la dice gia' `v_monthly_by_category`, e mescolare le
-- due misure in una vista sola darebbe un numero che nessuna delle due domande
-- vuole.

create or replace view public.v_categorie_uso with (security_invoker = on) as
select c.id,
       (select count(*) from public.merchants m    where m.category_id = c.id) as esercenti,
       (select count(*) from public.v_expenses e   where e.category_id = c.id) as movimenti
from public.categories c;

comment on view public.v_categorie_uso is
  'Quanti esercenti e quanti movimenti stanno appesi direttamente a ogni categoria. Diretto, non roll-up: e'' cio'' che si sposta eliminandola.';

grant select on public.v_categorie_uso to authenticated;

notify pgrst, 'reload schema';
