# Illustrazioni — gli originali

Questa cartella riceve i **PNG originali a 1024×1024** generati per le testate,
l'accesso, il consenso e l'icona dell'app. Sta su un ramo suo e **non si fonde
in `main`**: nel repository entrano solo i WebP ottimizzati, che vengono
prodotti da qui.

## Come si usa

1. Trascina qui i file dall'interfaccia web di GitHub (Add file → Upload files),
   scegliendo **questo ramo** (`illustrazioni-originali`).
2. Nomina i file esattamente così — il collaudo e la conversione li cercano per
   nome:

   | file              | dove va                                        |
   | ----------------- | ---------------------------------------------- |
   | `oggi.png`        | testata del cruscotto (sfera con la linea)     |
   | `conferma.png`    | testata di «Da confermare» (spunta viola)      |
   | `dove.png`        | testata di «Dove» (le tre lastre)              |
   | `chiedi.png`      | testata del copilota (la scintilla)            |
   | `abbonamenti.png` | scheda abbonamenti (le carte a ventaglio)      |
   | `abitudini.png`   | scheda abitudini (la casa)                     |
   | `report.png`      | testata dei report (il foglio)                 |
   | `sei-in-pari.png` | stato vuoto della conferma (spunta verde)      |
   | `accesso.png`     | schermata di accesso (il lucchetto)            |
   | `consenso.png`    | rinnovo del consenso bancario (i due anelli)   |
   | `icona-app.png`   | icona dell'app — l'unica **senza** trasparenza |

3. Fatto l'upload, avvisa in chat: da lì partono collaudo (trasparenza vera,
   niente testo dentro, entrambi i temi) e conversione (WebP ≤ 40 KB in
   `public/illustrazioni/`, più i quattro formati dell'icona).

I criteri di collaudo e i prompt con cui sono state generate stanno in
`docs/aspetto.md`, §6.
