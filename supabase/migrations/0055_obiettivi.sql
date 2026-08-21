-- ---------------------------------------------------------------------------
-- 0055 — Gli obiettivi
-- ---------------------------------------------------------------------------
-- Da `docs/copilota.md`, punto 5 dell'MVP. E' l'unica delle cinque nature
-- dell'informazione che abbia bisogno di una tabella nuova: le altre stanno
-- gia' nello schema (lo Stato), si ricalcolano (le Misure) o non sopravvivono
-- al messaggio (la Conversazione e le Letture).
--
-- ---------------------------------------------------------------------------
-- Stretta di proposito
-- ---------------------------------------------------------------------------
-- Niente `meta jsonb`, niente campo libero oltre a una nota breve. Non e'
-- purismo: e' l'unica decisione che, presa male oggi, renderebbe impossibile
-- `context_event` domani. Un sacco chiave-valore accoglie qualunque cosa,
-- quindi la prima cosa che non e' un obiettivo — «per tre mesi sto arredando
-- casa» — verrebbe infilata li' dentro come stringa perche' ci sta, e a quel
-- punto avremmo ricostruito la memoria testuale col nome di «obiettivi».
--
-- Quando qualcosa non ci entra deve **fare male**, cosi' si guarda se merita
-- una tabella sua.
--
-- ---------------------------------------------------------------------------
-- `valido_fino_a` e' obbligatoria, ed e' il punto meno ovvio
-- ---------------------------------------------------------------------------
-- Lo Stato si autocorregge: un `episodico` sbagliato si vede subito, perche'
-- sposta un numero che si guarda. Un obiettivo no. «Spendere meno di
-- 300 €/mese nei ristoranti», messo a gennaio e dimenticato, ad agosto e'
-- ancora li' — e il copilota continua a ottimizzare per una cosa che non si
-- vuole piu', con la stessa serenita' di quando la si voleva.
--
-- Alla scadenza **non si cancella**: `stato` diventa `scaduto`, e il copilota
-- lo vede e puo' chiedere se vale ancora. Un obiettivo sopravvive **perche' lo
-- si conferma**, non perche' nessuno l'ha cancellato.

create table if not exists public.obiettivi (
  id uuid primary key default gen_random_uuid(),

  -- I tipi ammessi, in un `check` e non in una tabella: sono pochi, cambiano
  -- di rado, e ognuno ha una forma diversa di bersaglio e di valore. Una
  -- tabella di tipi inviterebbe a crearne di nuovi senza scrivere il codice
  -- che li sa leggere.
  tipo text not null check (tipo in (
    'tetto_di_spesa',    -- meno di X al mese in <bersaglio>
    'liquidita_minima',  -- tenere almeno X sul conto
    'ridurre',           -- spendere meno in <bersaglio>, senza una cifra
    'risparmiare'        -- mettere via X entro una data
  )),

  -- Il bersaglio, quando ce n'e' uno. Due colonne e non una generica: una
  -- categoria e una classe si risolvono in due tabelle diverse, e un uuid
  -- dentro una colonna «bersaglio» non direbbe di quale.
  categoria_id uuid references public.categories(id) on delete cascade,
  classe       text     references public.discretion_classes(slug)
                        on update cascade on delete cascade,

  -- Il valore, quando il tipo ne ha uno. In euro, positivo: e' un limite o una
  -- somma da mettere da parte, non un movimento, quindi la convenzione delle
  -- uscite negative non si applica — e mescolarle sarebbe il modo piu' rapido
  -- di sbagliare un confronto.
  valore numeric(14,2) check (valore is null or valore > 0),

  -- L'unico campo libero, e breve. Serve a ricordare perche', non a
  -- immagazzinare fatti: quelli hanno le loro colonne, altrove.
  nota text check (nota is null or length(nota) <= 280),

  created_at    timestamptz not null default now(),
  valido_fino_a date not null default (current_date + interval '6 months'),

  -- Un tetto di spesa senza cifra non e' un tetto; un obiettivo di liquidita'
  -- con una categoria non vuol dire niente. Il `check` tiene insieme tipo,
  -- bersaglio e valore, che e' la ragione per cui la tabella e' tipizzata.
  constraint obiettivi_forma_coerente check (
    case tipo
      when 'tetto_di_spesa'   then valore is not null
                                   and (categoria_id is not null or classe is not null)
      when 'liquidita_minima' then valore is not null
                                   and categoria_id is null and classe is null
      when 'ridurre'          then categoria_id is not null or classe is not null
      when 'risparmiare'      then valore is not null
                                   and categoria_id is null and classe is null
    end
  )
);

-- `stato` non e' una colonna, ed e' una scelta che Postgres ha anche imposto:
-- una colonna generata dev'essere `immutable`, e `current_date` non lo e'.
-- Va bene cosi', perche' la colonna sarebbe stata la scelta sbagliata comunque:
-- per tenerla vera servirebbe qualcuno che la aggiorni ogni notte, e un lavoro
-- notturno che non gira lascerebbe gli obiettivi «attivi» per sempre — il
-- guasto silenzioso gia' visto col cron della Fase 7, applicato alla cosa che
-- questa migration esiste per evitare.
--
-- Derivandolo in lettura, la scadenza e' vera nel momento in cui la si guarda,
-- e non dipende da niente che debba funzionare.
create or replace view public.v_obiettivi with (security_invoker = on) as
select o.id,
       o.tipo,
       o.categoria_id,
       c.name as categoria,
       o.classe,
       d.nome as classe_nome,
       o.valore,
       o.nota,
       o.created_at,
       o.valido_fino_a,
       case when o.valido_fino_a < current_date then 'scaduto' else 'attivo' end as stato,
       -- Quanto manca. Negativo = scaduto da tanti giorni: il copilota ci
       -- distingue «sta per scadere» da «e' scaduto a marzo».
       (o.valido_fino_a - current_date) as giorni_alla_scadenza
from public.obiettivi o
left join public.categories c on c.id = o.categoria_id
left join public.discretion_classes d on d.slug = o.classe;

comment on view public.v_obiettivi is
  'Gli obiettivi con lo stato derivato in lettura: scaduto significa scaduto adesso, non quando un lavoro notturno se n''e'' accorto.';

-- ---------------------------------------------------------------------------
-- RLS e privilegi, scritti a mano come ogni tabella nuova
-- ---------------------------------------------------------------------------
alter table public.obiettivi enable row level security;
alter table public.obiettivi force row level security;

drop policy if exists obiettivi_utente_app on public.obiettivi;
create policy obiettivi_utente_app on public.obiettivi
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

grant select, insert, update, delete on public.obiettivi to authenticated;
grant select on public.v_obiettivi to authenticated;

comment on table public.obiettivi is
  'Cio'' che l''utente vuole ottenere. Non e'' una memoria: niente campi liberi oltre a una nota, e ogni tipo ha una forma che il check impone.';

notify pgrst, 'reload schema';
