-- Verifica della 0057. Gira dentro una transazione che finisce in `rollback`:
-- si puo' lanciare in produzione senza lasciare traccia.
--
-- Prova le tre proprieta' che la migration dichiara:
--   1. `applica_assegnazioni` produce lo stesso stato del ciclo di UPDATE;
--   2. rilanciata non scrive niente (`assegnate` = 0);
--   3. non tocca `manually_categorized`;
--   4. `rileva_giroconti_strutturali` marca esattamente i riferimenti condivisi.

begin;

-- ---------------------------------------------------------------------------
-- 1-2-3. applica_assegnazioni
-- ---------------------------------------------------------------------------
create temporary table prima on commit drop as
  select id, merchant_id, category_id, discretion, context
    from public.transactions
   where not manually_categorized;

create temporary table gruppi on commit drop as
  select jsonb_agg(jsonb_build_object(
           'merchant_id', merchant_id,
           'category_id', category_id,
           'discretion',  discretion,
           'context',     context,
           'ids',         ids
         )) as g
    from (
      select merchant_id, category_id, discretion, context, array_agg(id) as ids
        from prima
       where merchant_id is not null
       group by merchant_id, category_id, discretion, context
    ) x;

-- Si azzera tutto, come se la tassonomia non fosse mai stata applicata.
update public.transactions
   set merchant_id = null, category_id = null, discretion = null, context = null
 where not manually_categorized;

select 'prima chiamata' as passo, public.applica_assegnazioni((select g from gruppi), '{}'::uuid[]);

select 'righe diverse dallo stato di partenza (atteso 0)' as controllo,
       count(*) as valore
  from prima p
  join public.transactions t on t.id = p.id
 where (t.merchant_id, t.category_id, t.discretion, t.context)
       is distinct from
       (p.merchant_id, p.category_id, p.discretion, p.context);

select 'seconda chiamata: assegnate deve essere 0' as controllo,
       public.applica_assegnazioni((select g from gruppi), '{}'::uuid[]) as valore;

-- Una riga protetta non deve muoversi, nemmeno se il gruppo la nomina.
-- Si svuota e si marca: se la funzione la toccasse, tornerebbe piena.
with vittima as (
  select id from public.transactions where merchant_id is not null order by id limit 1
)
update public.transactions t
   set manually_categorized = true,
       merchant_id = null, category_id = null, discretion = null, context = null
  from vittima v where t.id = v.id;

select 'terza chiamata, con una riga protetta e vuota' as passo,
       public.applica_assegnazioni((select g from gruppi), '{}'::uuid[]);

select 'la riga protetta e'' rimasta vuota (atteso 1)' as controllo,
       count(*) as valore
  from public.transactions
 where manually_categorized and merchant_id is null;

-- E nemmeno lo svuotamento la tocca: si riempie, resta protetta, si chiede di
-- svuotarla.
with vittima as (
  select id from public.transactions where manually_categorized limit 1
)
update public.transactions t set merchant_id = (select id from public.merchants limit 1)
  from vittima v where t.id = v.id;

select 'svuotamento chiesto su una riga protetta' as passo,
       public.applica_assegnazioni('[]'::jsonb,
         array(select id from public.transactions where manually_categorized));

-- Il numero che conta e' `svuotate`: deve essere 0 anche avendo chiesto di
-- svuotare ogni riga protetta. Contare le righe piene direbbe solo quante ne
-- aveva gia' il database.

-- ---------------------------------------------------------------------------
-- 4. rileva_giroconti_strutturali
-- ---------------------------------------------------------------------------
-- Il caso va **seminato**: se il database non contiene gia' un riferimento
-- condiviso, una funzione che non marca niente e una funzione rotta danno lo
-- stesso risultato. E' la stessa trappola dei rilevatori alla prima esecuzione.
update public.transactions set is_transfer = false where not manually_categorized;

-- Due conti diversi, stesso riferimento: e' un giroconto.
-- Stesso conto, riferimento suo: non lo e' e non va toccato.
--
-- Il secondo conto va **creato qui**: il database di oggi ne ha uno solo, e con
-- un conto solo nessun riferimento puo' essere condiviso — la prova
-- passerebbe anche con la funzione rotta.
insert into public.accounts (connection_id, eb_account_uid, name, currency,
                             account_type, is_active, include_in_totals)
select a.connection_id, 'prova-0057', 'Conto di prova 0057', a.currency,
       a.account_type, true, false
  from public.accounts a order by a.id limit 1;

with conti as (
  select (select id from public.accounts where eb_account_uid <> 'prova-0057'
           order by id limit 1) as primo,
         (select id from public.accounts where eb_account_uid  = 'prova-0057') as secondo
),
uscita as (
  select t.id from public.transactions t, conti c
   where not t.manually_categorized and t.account_id = c.primo
   order by t.id limit 1
),
entrata as (
  select t.id from public.transactions t, conti c
   where not t.manually_categorized and t.account_id = c.primo
     and t.id not in (select id from uscita)
   order by t.id limit 1
),
solitaria as (
  select t.id from public.transactions t, conti c
   where not t.manually_categorized and t.account_id = c.primo
   order by t.id desc limit 1
)
update public.transactions t
   set external_id = case when t.id in (select id from solitaria)
                          then 'PROVA-SOLITARIO' else 'PROVA-CONDIVISO' end,
       -- l'entrata passa sull'altro conto: e' cio' che rende il riferimento
       -- condiviso *fra due conti*, che e' l'unica cosa che la funzione guarda
       account_id = case when t.id in (select id from entrata)
                         then (select secondo from conti) else t.account_id end
 where t.id in (select id from uscita)
    or t.id in (select id from entrata)
    or t.id in (select id from solitaria);

select 'giroconti strutturali marcati (atteso 2)' as controllo,
       public.rileva_giroconti_strutturali() as valore;

select 'la solitaria NON e'' marcata (atteso 0)' as controllo,
       count(*) as valore
  from public.transactions
 where external_id = 'PROVA-SOLITARIO' and is_transfer;

select 'le due condivise sono marcate (atteso 2)' as controllo,
       count(*) as valore
  from public.transactions
 where external_id = 'PROVA-CONDIVISO' and is_transfer;

select 'seconda chiamata: 0 nuove marcature' as controllo,
       public.rileva_giroconti_strutturali() as valore;

rollback;
