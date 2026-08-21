-- 0051_conversazioni_salvate.sql
--
-- Il copilota smette di essere una conversazione infinita: diventa un elenco
-- di conversazioni, con un ciclo di vita.
--
-- ---------------------------------------------------------------------------
-- Perche' una tabella, quando le conversazioni esistevano gia'
-- ---------------------------------------------------------------------------
-- Fin qui una conversazione era un fatto implicito: un gruppo di righe di
-- `chat_messages` con lo stesso `conversazione_id`. Bastava, finche' di una
-- conversazione non si doveva DIRE niente. Ora si dice: un titolo scelto
-- dall'utente (il primo messaggio e' un buon titolo finche' non lo e' piu') e
-- soprattutto **salvata** — la stella che la esclude dalla pulizia.
--
-- La riga nasce pigra: si scrive alla prima stella o al primo rinomina. Una
-- conversazione senza riga e' semplicemente non salvata e senza titolo suo,
-- e la vista qui sotto la mostra lo stesso.
--
-- ---------------------------------------------------------------------------
-- Il ciclo di vita: 30 giorni, salvo stella
-- ---------------------------------------------------------------------------
-- Una chat non salvata muore 30 giorni dopo il suo ULTIMO messaggio — non il
-- primo: una conversazione ancora viva non si taglia a meta'. La pulizia gira
-- nella sequenza quotidiana, come quella degli avvisi (0050 lato codice), ed
-- elimina i messaggi E l'eventuale riga qui — che se non e' salvata e' solo
-- un titolo orfano.

create table if not exists public.chat_conversations (
  id         uuid primary key,
  titolo     text,
  salvata    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversations force row level security;

drop policy if exists chat_conversations_app_user on public.chat_conversations;

create policy chat_conversations_app_user on public.chat_conversations
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.chat_conversations to authenticated;

-- ---------------------------------------------------------------------------
-- v_conversazioni impara titolo e stella
-- ---------------------------------------------------------------------------
-- Il titolo dell'utente vince sul primo messaggio; la stella arriva com'e'.
-- `salvata` esce anche per le conversazioni senza riga (falso), cosi' chi
-- legge non deve sapere che la riga e' pigra.

drop view if exists public.v_conversazioni;

create view public.v_conversazioni with (security_invoker = on) as
select m.conversazione_id,
       min(m.created_at) as iniziata_at,
       max(m.created_at) as ultima_at,
       count(*)          as messaggi,
       coalesce(
         c.titolo,
         (array_agg(m.testo order by m.created_at) filter (where m.ruolo = 'utente'))[1]
       ) as titolo,
       coalesce(c.salvata, false) as salvata
from public.chat_messages m
left join public.chat_conversations c on c.id = m.conversazione_id
group by m.conversazione_id, c.titolo, c.salvata;

grant select on public.v_conversazioni to authenticated;

-- ---------------------------------------------------------------------------
-- pulisci_conversazioni — 30 giorni dall'ultimo messaggio, salvo stella
-- ---------------------------------------------------------------------------
-- Restituisce quante conversazioni ha eliminato: il resoconto della sequenza
-- quotidiana ne parla solo quando e' maggiore di zero.

create or replace function public.pulisci_conversazioni(p_giorni integer default 30)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_eliminate integer;
begin
  -- Un'unica istruzione con CTE modificanti, non una tabella temporanea: una
  -- temporanea con `on commit drop` fallirebbe alla seconda chiamata nella
  -- stessa transazione, e una funzione di pulizia deve poter essere chiamata
  -- quando capita.
  with vecchie as (
    select m.conversazione_id
    from public.chat_messages m
    left join public.chat_conversations c on c.id = m.conversazione_id
    group by m.conversazione_id, c.salvata
    having coalesce(c.salvata, false) = false
       and max(m.created_at) < now() - make_interval(days => greatest(1, coalesce(p_giorni, 30)))
  ),
  messaggi as (
    delete from public.chat_messages
    where conversazione_id in (select conversazione_id from vecchie)
    returning conversazione_id
  ),
  -- La riga pigra di una conversazione eliminata e' solo un titolo orfano.
  -- Le salvate non sono in `vecchie` per costruzione.
  righe as (
    delete from public.chat_conversations
    where id in (select conversazione_id from vecchie)
    returning id
  )
  select count(distinct conversazione_id) into v_eliminate from messaggi;

  return coalesce(v_eliminate, 0);
end;
$$;

comment on function public.pulisci_conversazioni(integer) is
  'Elimina le conversazioni del copilota ferme da piu'' di p_giorni giorni, salvo quelle salvate. Restituisce quante ne ha eliminate.';

revoke all on function public.pulisci_conversazioni(integer) from public;
grant execute on function public.pulisci_conversazioni(integer) to authenticated;

notify pgrst, 'reload schema';
