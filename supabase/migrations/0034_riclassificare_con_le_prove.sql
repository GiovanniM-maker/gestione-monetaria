-- 0034_riclassificare_con_le_prove.sql
--
-- Chi va riclassificato ora che il mondo ha risposto.
--
-- ---------------------------------------------------------------------------
-- Perche' serve una vista e non un filtro nel codice
-- ---------------------------------------------------------------------------
-- Qui convivono tre regole, e tenerle in tre `where` sparsi nel TypeScript
-- significa che prima o poi una si perde:
--
-- 1. **Solo chi ha una descrizione trovata.** Senza, non c'e' niente di nuovo
--    da dire al modello e si pagherebbe una chiamata per fargli ripetere lo
--    stesso errore.
-- 2. **Solo chi non e' mai stato confermato da una persona.** E' il patto delle
--    regole di correttezza — «le correzioni manuali dell'utente sono sacre» —
--    applicato agli esercenti invece che alle transazioni. Un esercente che hai
--    guardato e approvato non si tocca, nemmeno se il mondo dice altro.
-- 3. **Solo chi e' garantito dalla carta.** Il nome torna a un LLM, quindi vale
--    la regola 8. Per costruzione lo sono gia' tutti — la descrizione puo'
--    esistere solo se e' passata da `v_esercenti_da_cercare` — ma dedurre una
--    garanzia da un percorso e' fragile: se domani `salva_ricerca` venisse
--    chiamata da un altro posto, il filtro sparirebbe senza che niente lo
--    segnali.
--
-- L'ordine e' per **spesa**: un esercente da 1.080 € classificato male sposta
-- la metrica, uno da 4 € no.

create or replace view public.v_esercenti_da_riclassificare with (security_invoker = on) as
select m.id                          as merchant_id,
       m.canonical_name              as esercente,
       m.descrizione_trovata,
       m.fonte,
       c.slug                        as categoria_attuale,
       m.discretion                  as discrezionalita_attuale,
       m.context                     as contesto_attuale,
       m.is_subscription             as abbonamento_attuale,
       m.motivazione                 as motivazione_attuale,
       t.movimenti,
       t.speso::text                 as speso
from public.merchants m
join public.v_esercenti_da_carta carta on carta.merchant_id = m.id and carta.solo_carta
left join public.categories c on c.id = m.category_id
join lateral (
  select count(*) as movimenti, coalesce(sum(e.amount_eur), 0) as speso
  from public.v_expenses e where e.merchant_id = m.id
) t on true
where m.descrizione_trovata is not null
  -- Mai chi e' stato confermato da una persona.
  and m.confermato_at is null
  and m.origine = 'ai'
  and t.movimenti > 0
order by t.speso;

comment on view public.v_esercenti_da_riclassificare is
  'Esercenti proposti dal modello, mai confermati, per cui la ricerca ha trovato qualcosa. Chi hai approvato non compare.';

grant select on public.v_esercenti_da_riclassificare to authenticated;

-- ---------------------------------------------------------------------------
-- riclassifica_esercente
-- ---------------------------------------------------------------------------
-- Una funzione e non un `update`, per la stessa ragione di `salva_ricerca`:
-- perche' **rifiuti da sola** cio' che non deve passare, invece di sperare che
-- ogni chiamante si ricordi di controllare.
--
-- Il rifiuto piu' importante e' l'ultima riga: se qualcuno ha confermato
-- l'esercente nel frattempo, la scrittura non avviene. Fra la lettura della
-- lista e la scrittura passano i secondi di una chiamata al modello, ed e'
-- esattamente la finestra in cui una persona puo' aver deciso qualcosa dal
-- telefono.
--
-- `origine` resta `ai` e `confermato_at` resta nullo: questa e' pur sempre una
-- proposta del modello, meglio informata ma non approvata da nessuno. Marcarla
-- come confermata sarebbe far dire all'utente una cosa che non ha detto.

create or replace function public.riclassifica_esercente(
  p_merchant_id     uuid,
  p_categoria_slug  text,
  p_discrezionalita text,
  p_contesto        text,
  p_abbonamento     boolean,
  p_motivazione     text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria uuid;
begin
  if p_discrezionalita not in ('essenziale', 'investimento', 'utile', 'voluttuario') then
    raise exception 'Discrezionalita'' non ammessa: %.', p_discrezionalita;
  end if;
  if p_contesto not in ('personale', 'business') then
    raise exception 'Contesto non ammesso: %.', p_contesto;
  end if;

  select id into v_categoria from public.categories where slug = p_categoria_slug;
  if v_categoria is null then
    raise exception 'Categoria inesistente: %.', p_categoria_slug;
  end if;

  update public.merchants
     set category_id     = v_categoria,
         discretion      = p_discrezionalita,
         context         = p_contesto,
         is_subscription = coalesce(p_abbonamento, is_subscription),
         motivazione     = coalesce(nullif(btrim(coalesce(p_motivazione, '')), ''), motivazione)
   where id = p_merchant_id
     -- La corsa che conta: fra la lettura della lista e questa scrittura passa
     -- una chiamata al modello, e in quei secondi l'utente puo' aver confermato
     -- l'esercente dal telefono. In quel caso non si scrive.
     and confermato_at is null
     and origine = 'ai';

  return found;
end;
$$;

comment on function public.riclassifica_esercente(uuid, text, text, text, boolean, text) is
  'Riscrive la classificazione di un esercente proposto dal modello. Restituisce false se nel frattempo e'' stato confermato da una persona.';

revoke all on function public.riclassifica_esercente(uuid, text, text, text, boolean, text) from public;
grant execute on function public.riclassifica_esercente(uuid, text, text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
