-- 0007_unifica_conti_duplicati.sql
--
-- Riparazione: la riautorizzazione Enable Banking dell'11 agosto 2026 ha
-- assegnato agli stessi conti degli `eb_account_uid` nuovi.
--
-- `registerSessionAccounts` cerca un conto esistente per uid, non lo trova, e
-- ne crea uno nuovo: da tre conti se ne sono ritrovati sei, ognuno con la sua
-- meta' di storico. Nessun errore, nessun avviso.
--
-- Il danno non e' la riga in piu'. E' che il riconoscimento strutturale dei
-- giroconti marca come giroconto ogni `entry_reference` che compare su due
-- conti diversi — ed e' esattamente cio' che il periodo scaricato due volte
-- produce. Risultato: 1.487 giroconti su 2.538 movimenti, cioe' il 59%, contro
-- il 24% reale. Meta' delle spese vere sparita dalle analisi, in silenzio.
--
-- Niente e' andato perso: `raw_transactions` e' immutabile e contiene entrambe
-- le meta'. `transactions` e' derivato e si ricostruisce.
--
-- ---------------------------------------------------------------------------
-- Come si riconosce quale conto vecchio corrisponde a quale nuovo
-- ---------------------------------------------------------------------------
-- Non dall'IBAN: i pocket ce l'hanno nullo. Non dal nome: sono tutti
-- l'intestatario. Si riconosce dai **payload identici**.
--
-- I due scarichi si sovrappongono nel tempo, quindi lo stesso movimento e'
-- stato salvato due volte, con lo stesso `payload_hash`. Due conti DIVERSI non
-- condividono mai un payload: i due lati di un giroconto hanno lo stesso
-- `entry_reference` ma `credit_debit_indicator` opposto e controparti diverse,
-- quindi hash diversi. Il payload condiviso e' identita', non parentela.
--
-- Su questa migration passa un database vuoto senza fare niente: senza
-- duplicati non ci sono coppie, e ogni istruzione tocca zero righe.

begin;

-- ---------------------------------------------------------------------------
-- Guardia: le correzioni manuali sono sacre (CLAUDE.md, regola di correttezza)
-- ---------------------------------------------------------------------------
-- Questa riparazione ricostruisce `transactions` da zero. Se ci fossero righe
-- con `manually_categorized`, le cancellerebbe — e una correzione manuale non
-- si ricostruisce da nessuna parte. Meglio fallire rumorosamente.

do $$
declare
  manuali integer;
begin
  select count(*) into manuali from public.transactions where manually_categorized;
  if manuali > 0 then
    raise exception
      'Ci sono % transazioni con correzione manuale. Questa riparazione le perderebbe: fermati.',
      manuali;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Le coppie vecchio → nuovo
-- ---------------------------------------------------------------------------

create temporary table coppie_conti on commit drop as
with sovrapposizioni as (
  select vecchio.id as id_vecchio,
         nuovo.id   as id_nuovo,
         count(*)   as payload_condivisi
  from public.raw_transactions rv
  join public.accounts vecchio on vecchio.id = rv.account_id
  join public.raw_transactions rn
    on rn.payload_hash = rv.payload_hash
   and rn.account_id <> rv.account_id
  join public.accounts nuovo on nuovo.id = rn.account_id
  -- La direzione la da' l'anagrafica, non i dati: il conto creato dopo e'
  -- quello che la sessione corrente conosce, ed e' quello da tenere.
  where vecchio.created_at < nuovo.created_at
  group by 1, 2
)
select distinct on (id_vecchio) id_vecchio, id_nuovo, payload_condivisi
from sovrapposizioni
order by id_vecchio, payload_condivisi desc;

-- Un conto nuovo rivendicato da due vecchi significa che l'accoppiamento non
-- ha funzionato, e proseguire fonderebbe insieme conti distinti.
do $$
declare
  ambigui integer;
begin
  select count(*) into ambigui
  from (select id_nuovo from coppie_conti group by 1 having count(*) > 1) t;
  if ambigui > 0 then
    raise exception
      '% conti nuovi risultano abbinati a piu'' conti vecchi: accoppiamento non affidabile, fermati.',
      ambigui;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fusione
-- ---------------------------------------------------------------------------

-- Le righe del vecchio scarico gia' presenti nel nuovo: stesso conto, stesso
-- payload. Vanno tolte prima dello spostamento, o violerebbero
-- UNIQUE (account_id, payload_hash).
delete from public.raw_transactions rv
using coppie_conti c, public.raw_transactions rn
where rv.account_id = c.id_vecchio
  and rn.account_id = c.id_nuovo
  and rn.payload_hash = rv.payload_hash;

-- Quel che resta e' storico che solo il vecchio scarico ha visto: si sposta,
-- non si butta.
update public.raw_transactions rv
   set account_id = c.id_nuovo
  from coppie_conti c
 where rv.account_id = c.id_vecchio;

-- `include_in_totals` e' una scelta dell'utente, non un dato della banca:
-- segue il conto attraverso la fusione.
update public.accounts n
   set include_in_totals = v.include_in_totals
  from coppie_conti c
  join public.accounts v on v.id = c.id_vecchio
 where n.id = c.id_nuovo;

-- Il conto vecchio ora e' vuoto. Cancellarlo porta via in cascata le sue
-- `transactions`, che sono comunque da ricostruire.
delete from public.accounts a
using coppie_conti c
where a.id = c.id_vecchio;

-- ---------------------------------------------------------------------------
-- `transactions` si ricostruisce da capo
-- ---------------------------------------------------------------------------
-- Non basta rinormalizzare sopra: `rileva_giroconti_speculari` sa solo mettere
-- `is_transfer` a true, mai toglierlo, e le righe marcate per sbaglio
-- resterebbero marcate. Il registro grezzo e' la fonte di verita' e non e'
-- stato toccato, quindi ripartire da zero non costa niente.

delete from public.transactions;

commit;
