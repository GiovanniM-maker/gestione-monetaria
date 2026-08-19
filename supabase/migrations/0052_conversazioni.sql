-- ---------------------------------------------------------------------------
-- 0052 — Le conversazioni diventano righe
-- ---------------------------------------------------------------------------
-- Da `docs/copilota.md`, punto 6 dell'MVP. Oggi una conversazione esiste solo
-- come `conversazione_id` ripetuto su `chat_messages`, e `v_conversazioni` la
-- ricostruisce raggruppando. Bastava a riaprirle; non basta a dar loro un
-- titolo, una stella e una scadenza.
--
-- ---------------------------------------------------------------------------
-- Il confine che questa tabella deve rendere vero
-- ---------------------------------------------------------------------------
-- **Una chat non contiene mai niente di duraturo.** Contiene le tracce di come
-- una cosa duratura e' nata. Quindi cancellarla porta via i messaggi e le
-- proposte mai applicate, e **non puo' toccare** le correzioni applicate (che
-- vivono su `transactions`), gli obiettivi, e domani i widget e le regole
-- d'avviso.
--
-- Il modo di sbagliarlo sarebbe una foreign key: se i widget puntassero qui con
-- `on delete cascade`, cancellare una conversazione svuoterebbe la dashboard.
-- Quando arriveranno, `widgets.nato_da_chat_id` sara' **senza vincolo**: serve a
-- raccontare («questo l'hai salvato il 12 agosto»), e quando la chat non c'e'
-- piu' il widget continua a funzionare mostrando solo la data.
--
-- ---------------------------------------------------------------------------
-- Perche' `scade_at` e' una colonna e non un calcolo
-- ---------------------------------------------------------------------------
-- Al contrario di `obiettivi.stato`, qui il valore va **scritto**: la scadenza
-- di una conversazione salvata e poi ri-desalvata non e' una funzione della sua
-- data di creazione, e soprattutto una cancellazione e' distruttiva. Una data
-- esplicita si legge, si verifica e si sposta prima che qualcosa sparisca; una
-- dedotta al momento della cancellazione no.
--
-- `salvata = true` mette `scade_at` a null: non c'e' una data lontanissima da
-- confrontare, c'e' l'assenza di una scadenza.

create table if not exists public.chat_conversations (
  id uuid primary key,

  -- Lo scrive il modello dopo il secondo scambio, poi si congela — un titolo
  -- che si riscrive a ogni messaggio rende l'elenco illeggibile, perche' quello
  -- che si cercava ieri oggi si chiama in un altro modo. Null finche' non c'e':
  -- il ripiego e' la prima domanda troncata, che `v_conversazioni` gia' sa dare.
  titolo text check (titolo is null or length(titolo) <= 120),
  -- Vero se l'ha scritto una persona: da quel momento nessun automatismo lo
  -- tocca. E' la stessa idea di `manually_categorized`, applicata a un'etichetta.
  titolo_manuale boolean not null default false,

  salvata boolean not null default false,

  created_at timestamptz not null default now(),
  ultima_at  timestamptz not null default now(),
  scade_at   timestamptz,

  -- L'invariante in una riga: salvata e con scadenza sono incompatibili.
  constraint chat_conversations_scadenza check (
    (salvata and scade_at is null) or (not salvata and scade_at is not null)
  )
);

comment on table public.chat_conversations is
  'Le conversazioni. Non contengono niente di duraturo: cancellarne una non puo'' togliere correzioni, obiettivi, widget o regole.';
comment on column public.chat_conversations.titolo_manuale is
  'Titolo scritto da una persona: da qui in poi nessun automatismo lo riscrive.';

create index if not exists chat_conversations_recenti_idx
  on public.chat_conversations (ultima_at desc);
-- Parziale: la spazzata cerca solo le scadute, e le salvate non hanno una data.
create index if not exists chat_conversations_scadenza_idx
  on public.chat_conversations (scade_at) where scade_at is not null;

alter table public.chat_conversations enable row level security;
alter table public.chat_conversations force row level security;

drop policy if exists chat_conversations_utente_app on public.chat_conversations;
create policy chat_conversations_utente_app on public.chat_conversations
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.chat_conversations to authenticated;

-- ---------------------------------------------------------------------------
-- Le conversazioni che esistono gia'
-- ---------------------------------------------------------------------------
-- Ci sono messaggi in giro con `conversazione_id` che qui non hanno una riga.
-- Adottarli invece di lasciarli orfani: la scadenza si conta dall'ultimo
-- messaggio, non da adesso, o una conversazione di due mesi fa vivrebbe altri
-- trenta giorni per essere stata adottata oggi.
insert into public.chat_conversations (id, created_at, ultima_at, scade_at)
select m.conversazione_id, min(m.created_at), max(m.created_at),
       max(m.created_at) + interval '30 days'
from public.chat_messages m
group by m.conversazione_id
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- v_conversazioni — stesse colonne di prima, piu' quelle nuove in coda
-- ---------------------------------------------------------------------------
-- Il titolo diventa `coalesce(titolo, prima domanda troncata)`: chi legge la
-- vista non deve sapere se il modello ha gia' scritto un titolo.
create or replace view public.v_conversazioni with (security_invoker = on) as
select m.conversazione_id,
       min(m.created_at) as iniziata_at,
       max(m.created_at) as ultima_at,
       count(*)          as messaggi,
       coalesce(
         c.titolo,
         (array_agg(m.testo order by m.created_at) filter (where m.ruolo = 'utente'))[1]
       )                 as titolo,
       coalesce(c.salvata, false)   as salvata,
       c.scade_at,
       coalesce(c.titolo_manuale, false) as titolo_manuale
from public.chat_messages m
left join public.chat_conversations c on c.id = m.conversazione_id
group by m.conversazione_id, c.titolo, c.salvata, c.scade_at, c.titolo_manuale;

grant select on public.v_conversazioni to authenticated;

-- ---------------------------------------------------------------------------
-- Le tre scritture
-- ---------------------------------------------------------------------------
-- `tocca_conversazione` crea la riga se manca e sposta `ultima_at`. La
-- scadenza si ricalcola dall'ultimo messaggio: una conversazione a cui si torna
-- non deve sparire fra due settimane perche' era stata aperta un mese fa.
create or replace function public.tocca_conversazione(p_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.chat_conversations (id, ultima_at, scade_at)
  values (p_id, now(), now() + interval '30 days')
  on conflict (id) do update set
    ultima_at = now(),
    -- Se e' salvata resta senza scadenza: toccarla non deve rimetterne una.
    scade_at = case when public.chat_conversations.salvata
                    then null else now() + interval '30 days' end;
$$;

create or replace function public.conserva_conversazione(p_id uuid, p_salvata boolean default true)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with fatto as (
    update public.chat_conversations
       set salvata = coalesce(p_salvata, true),
           scade_at = case when coalesce(p_salvata, true)
                           then null else now() + interval '30 days' end
     where id = p_id
    returning 1
  )
  select exists (select 1 from fatto);
$$;

-- Il titolo: lo scrive il modello una volta, oppure una persona quando vuole.
-- `p_manuale` distingue i due casi, e un titolo manuale non si sovrascrive —
-- il modello chiama sempre con `false`, e la clausola `where` fa il resto.
create or replace function public.titola_conversazione(
  p_id uuid, p_titolo text, p_manuale boolean default false
) returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with fatto as (
    update public.chat_conversations
       set titolo = nullif(btrim(p_titolo), ''),
           titolo_manuale = coalesce(p_manuale, false)
     where id = p_id
       and (coalesce(p_manuale, false) or not titolo_manuale)
    returning 1
  )
  select exists (select 1 from fatto);
$$;

-- La spazzata. Non gira da sola: la chiamera' la sequenza quotidiana, che e'
-- gia' il posto dove sta il lavoro periodico. Cancella i messaggi per primi
-- perche' non c'e' una foreign key fra le due tabelle — e non c'e' di
-- proposito: `chat_messages` esisteva prima, e aggiungerne una adesso
-- significherebbe rifiutare messaggi di conversazioni non ancora create.
create or replace function public.pulisci_conversazioni_scadute()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  quante integer;
begin
  create temporary table da_togliere on commit drop as
  select id from public.chat_conversations
   where not salvata and scade_at is not null and scade_at < now();

  delete from public.chat_messages m
   where m.conversazione_id in (select id from da_togliere);

  delete from public.chat_conversations c
   where c.id in (select id from da_togliere);

  get diagnostics quante = row_count;
  return quante;
end;
$$;

comment on function public.pulisci_conversazioni_scadute is
  'Cancella le conversazioni scadute e i loro messaggi. Non tocca nient''altro: cio'' che e'' nato in una chat vive fuori dalla chat.';

revoke all on function public.tocca_conversazione(uuid) from public;
grant execute on function public.tocca_conversazione(uuid) to authenticated;
revoke all on function public.conserva_conversazione(uuid, boolean) from public;
grant execute on function public.conserva_conversazione(uuid, boolean) to authenticated;
revoke all on function public.titola_conversazione(uuid, text, boolean) from public;
grant execute on function public.titola_conversazione(uuid, text, boolean) to authenticated;
revoke all on function public.pulisci_conversazioni_scadute() from public;
grant execute on function public.pulisci_conversazioni_scadute() to authenticated;

notify pgrst, 'reload schema';
