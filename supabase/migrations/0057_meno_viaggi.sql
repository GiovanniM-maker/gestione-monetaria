-- ---------------------------------------------------------------------------
-- 0057 — meno viaggi: due funzioni che tolgono 166+ andate e ritorno per giro
-- ---------------------------------------------------------------------------
-- Nasce dal secondo passaggio di `docs/prestazioni.md` (22 agosto 2026). Il
-- difetto non e' SQL — nessuna query supera gli 11 ms — sono le **andate e
-- ritorno in fila**: il giro `veloce` ne fa circa 195 ogni cinque minuti, e 166
-- di quelle sono una `UPDATE` per esercente dentro un `for … await`.
--
-- Questa migration non cambia nessun numero dell'applicazione. Sposta due
-- lavori che oggi si fanno in TypeScript, un viaggio per volta, dentro Postgres,
-- dove sono una istruzione sola.

-- ---------------------------------------------------------------------------
-- 1. rileva_giroconti_strutturali — la prova che non interpreta niente
-- ---------------------------------------------------------------------------
-- Lo stesso `entry_reference` su due conti nostri diversi e' un giroconto
-- interno: la banca registra lo stesso riferimento sul conto di partenza e su
-- quello di arrivo. Non c'e' niente da interpretare.
--
-- Oggi lo calcola `normalizzaTutto` in memoria, e per farlo deve **leggere
-- l'intero registro grezzo** — 884 kB, cinque viaggi — anche quando sta
-- normalizzando gli ultimi tre movimenti. E' l'unica ragione per cui quella
-- funzione non puo' lavorare su una finestra.
--
-- Qui il fatto globale resta globale, ma costa un viaggio invece di cinque e
-- non passa da Node.
--
-- **E' additiva di proposito**: marca, non smarca. Il registro grezzo e'
-- immutabile, quindi un riferimento condiviso non torna indietro; e togliere un
-- `is_transfer` per errore rimetterebbe migliaia di euro di giroconti dentro la
-- spesa, che e' il guasto peggiore possibile qui.

create index if not exists transactions_external_id_idx
  on public.transactions (external_id)
  where external_id is not null;

create or replace function public.rileva_giroconti_strutturali()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marcate integer;
begin
  update public.transactions t
     set is_transfer = true
   where not t.is_transfer
     and not t.manually_categorized
     and t.external_id is not null
     and exists (
       select 1
         from public.transactions altra
        where altra.external_id = t.external_id
          and altra.account_id <> t.account_id
     );

  get diagnostics marcate = row_count;
  return marcate;
end;
$$;

comment on function public.rileva_giroconti_strutturali() is
  'Marca is_transfer dove lo stesso external_id compare su due conti diversi: prova strutturale di un giroconto interno. Additiva: marca, non smarca.';

revoke all on function public.rileva_giroconti_strutturali() from public;
grant execute on function public.rileva_giroconti_strutturali() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. applica_assegnazioni — da 166 viaggi a uno
-- ---------------------------------------------------------------------------
-- L'abbinamento fra etichetta ed esercente resta in TypeScript, dov'e' adesso e
-- dove dev'essere: e' logica con dei test, non una query. Quello che cambia e'
-- **come si consegna il risultato**. Oggi e' una `UPDATE` per esercente in un
-- ciclo `await`; qui e' un `jsonb` solo.
--
-- Tre proprieta', in ordine di importanza:
--
-- 1. **Non tocca le correzioni manuali.** Il filtro c'e' gia' nel chiamante; qui
--    e' ripetuto perche' una regola che protegge un dato dell'utente deve
--    fallire chiusa anche se il chiamante se ne dimentica.
-- 2. **Scrive solo cio' che cambia** (`is distinct from`). E' la differenza fra
--    un giro a vuoto che riscrive duemila righe — e fa scattare duemila volte il
--    trigger di `updated_at` — e uno che non scrive niente. Su un pendolo che
--    batte ogni cinque minuti e' la meta' del guadagno.
-- 3. **Restituisce quante righe ha toccato davvero**, distinte fra assegnate e
--    svuotate: un resoconto che dicesse sempre «2.000» non permetterebbe di
--    accorgersi che il giro non sta facendo niente.

create or replace function public.applica_assegnazioni(
  p_gruppi jsonb default '[]'::jsonb,
  p_da_svuotare uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assegnate integer := 0;
  svuotate  integer := 0;
begin
  if jsonb_typeof(p_gruppi) is distinct from 'array' then
    raise exception 'applica_assegnazioni: p_gruppi deve essere un array jsonb';
  end if;

  with gruppi as (
    select g.merchant_id, g.category_id, g.discretion, g.context, g.ids
      from jsonb_to_recordset(p_gruppi) as g(
             merchant_id uuid,
             category_id uuid,
             discretion  text,
             context     text,
             ids         uuid[]
           )
  ),
  voci as (
    select unnest(g.ids) as id, g.merchant_id, g.category_id, g.discretion, g.context
      from gruppi g
  )
  update public.transactions t
     set merchant_id = v.merchant_id,
         category_id = v.category_id,
         discretion  = v.discretion,
         context     = v.context
    from voci v
   where t.id = v.id
     and not t.manually_categorized
     and (t.merchant_id, t.category_id, t.discretion, t.context)
         is distinct from
         (v.merchant_id, v.category_id, v.discretion, v.context);

  get diagnostics assegnate = row_count;

  update public.transactions t
     set merchant_id = null,
         category_id = null,
         discretion  = null,
         context     = null
   where t.id = any(p_da_svuotare)
     and not t.manually_categorized
     and (t.merchant_id is not null
       or t.category_id is not null
       or t.discretion  is not null
       or t.context     is not null);

  get diagnostics svuotate = row_count;

  return jsonb_build_object('assegnate', assegnate, 'svuotate', svuotate);
end;
$$;

comment on function public.applica_assegnazioni(jsonb, uuid[]) is
  'Applica in una chiamata sola le assegnazioni esercente→transazioni calcolate dagli alias. Non tocca manually_categorized e scrive solo cio che cambia.';

revoke all on function public.applica_assegnazioni(jsonb, uuid[]) from public;
grant execute on function public.applica_assegnazioni(jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';
