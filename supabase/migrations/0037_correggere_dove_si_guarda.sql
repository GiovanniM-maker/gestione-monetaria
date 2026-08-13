-- 0037_correggere_dove_si_guarda.sql
--
-- `aggiorna_categoria`: rinominare un ramo, spostarlo, cambiargli la
-- discrezionalita' predefinita.
--
-- ---------------------------------------------------------------------------
-- Perche' serve adesso
-- ---------------------------------------------------------------------------
-- Il cruscotto nuovo porta la correzione **dove si guarda il numero**, a ogni
-- livello della discesa. Due dei tre livelli erano gia' raggiungibili come
-- operazioni nominate: `correggi_movimento` per la singola riga (0022) e
-- `aggiornaMerchant` per l'esercente (Fase 4). Il terzo no.
--
-- E' di nuovo la regola della Fase 0 che si paga: se la logica non e'
-- un'operazione nominata, per il copilot non esiste — e qui non esisteva
-- nemmeno come bottone. Si potevano **creare** categorie (`crea_categoria`,
-- 0026) e non correggerle.
--
-- ---------------------------------------------------------------------------
-- Lo slug non segue il nome
-- ---------------------------------------------------------------------------
-- Rinominare e' cambiare un'etichetta; lo slug e' un identificativo, e gli
-- identificativi non inseguono le etichette. Ci si abbina la
-- riclassificazione, e cambiarlo sotto i piedi di chi lo usa romperebbe
-- l'abbinamento in silenzio — che e' esattamente il modo di guastarsi che
-- questa applicazione non si puo' permettere.
--
-- ---------------------------------------------------------------------------
-- Il ciclo e' un guasto vero, non un'ipotesi
-- ---------------------------------------------------------------------------
-- Appendere «Ristoranti» sotto la sua stessa figlia «Pizzeria» si fa con un
-- tocco sbagliato. Le viste hanno un limite di profondita' e non girerebbero
-- all'infinito, ma il roll-up diventerebbe un albero senza radice: la spesa di
-- quel ramo sparirebbe dai totali di primo livello senza nessun errore.
-- Il controllo sta **qui**, cioe' nel punto in cui il ciclo verrebbe creato,
-- e non in ogni vista che dovra' poi sopravvivergli.
--
-- ---------------------------------------------------------------------------
-- Perche' `p_cambia_padre` invece del solo `p_parent_id`
-- ---------------------------------------------------------------------------
-- Con la sola convenzione «nullo = non cambiare», portare una categoria alla
-- radice diventa impossibile: sarebbe la stessa chiamata di «lascia com'e'».
-- Un secondo argomento esplicito costa una riga e rende dicibili tutti e tre i
-- casi.

create or replace function public.aggiorna_categoria(
  p_id              uuid,
  p_nome            text default null,
  p_discrezionalita text default null,
  p_parent_id       uuid default null,
  p_cambia_padre    boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if p_id is null then
    raise exception 'Categoria non indicata.';
  end if;

  if p_discrezionalita is not null
     and p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario') then
    raise exception 'Discrezionalita'' non ammessa: %', p_discrezionalita;
  end if;

  if p_cambia_padre and p_parent_id is not null then
    if p_parent_id = p_id then
      raise exception 'Una categoria non puo'' essere figlia di se stessa.';
    end if;
    -- Il padre nuovo non puo' stare **sotto** la categoria che si sposta: e'
    -- la condizione che crea il ciclo.
    if exists (
      select 1 from public.v_albero_categorie
      where antenato = p_id and discendente = p_parent_id
    ) then
      raise exception 'Non si puo'' appendere una categoria a una delle sue discendenti: si creerebbe un ciclo.';
    end if;
  end if;

  update public.categories
     set name              = coalesce(v_nome, name),
         default_discretion = coalesce(p_discrezionalita, default_discretion),
         parent_id         = case when p_cambia_padre then p_parent_id else parent_id end
   where id = p_id;

  return found;
end;
$$;

comment on function public.aggiorna_categoria(uuid, text, text, uuid, boolean) is
  'Rinomina, sposta o cambia la discrezionalita'' predefinita di una categoria. Lo slug non cambia mai: e'' un identificativo, non un''etichetta.';

revoke all on function public.aggiorna_categoria(uuid, text, text, uuid, boolean) from public;
grant execute on function public.aggiorna_categoria(uuid, text, text, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
