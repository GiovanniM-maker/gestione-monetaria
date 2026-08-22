-- ===========================================================================
-- Verifica della 0059 — una categoria nasce con la classe del padre
-- ===========================================================================
-- Sicura in produzione: `begin … rollback`. Semina il caso invece di cercarlo,
-- perche' la riparazione della migration ha gia' sistemato le categorie vere e
-- una funzione corretta non si distinguerebbe da una che non fa niente.
-- ===========================================================================

begin;

insert into public.categories (id, slug, name, default_discretion, sort_order)
values ('00000000-0000-4000-8000-000000005901', 'prova-0059-padre', 'Prova 0059 padre',
        'voluttuario', 9999);

-- 1. Figlia senza classe indicata: eredita quella del padre. E' il gesto del
--    foglio, «Crea "pizzeria"» dentro «Ristorazione».
-- 2. Figlia con una classe indicata: quella vince, perche' e' una scelta.
-- 3. Primo livello senza classe: resta senza — non c'e' nessuno a cui
--    chiederla, e sceglierne una al posto dell'utente la metterebbe su tutta
--    la spesa di quel ramo.
select
  public.crea_categoria('Prova 0059 figlia',   '00000000-0000-4000-8000-000000005901') as figlia,
  public.crea_categoria('Prova 0059 scelta',   '00000000-0000-4000-8000-000000005901',
                        'essenziale')                                                 as scelta,
  public.crea_categoria('Prova 0059 radice',   null)                                  as radice;

select
  name                                            as categoria,
  coalesce(default_discretion, '(nessuna)')       as classe,
  case name
    when 'Prova 0059 figlia' then default_discretion = 'voluttuario'
    when 'Prova 0059 scelta' then default_discretion = 'essenziale'
    else                          default_discretion is null
  end                                             as atteso
from public.categories
where name like 'Prova 0059%' and name <> 'Prova 0059 padre'
order by 1;

-- Nessuna figlia deve restare senza classe mentre suo padre ne ha una: e' la
-- condizione che la riparazione ha chiuso, e che la funzione ora mantiene.
select count(*) as figlie_senza_classe_con_padre_che_ce_l_ha
from public.categories f
join public.categories p on p.id = f.parent_id
where f.default_discretion is null and p.default_discretion is not null;

rollback;
