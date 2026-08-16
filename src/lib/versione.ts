/**
 * Quale versione dell'applicazione e' questa.
 *
 * ---------------------------------------------------------------------------
 * A cosa serve, visto che il deploy e' automatico
 * ---------------------------------------------------------------------------
 * Aggiunta alla schermata iniziale, l'applicazione diventa una finestra che
 * resta aperta per giorni: si apre e chiude col gesto, non si ricarica quasi
 * mai, e la pagina che hai davanti puo' essere quella di tre deploy fa senza
 * che nulla lo dica. E' successo davvero — un pulsante nuovo esisteva in
 * produzione e sul telefono non c'era.
 *
 * Con un numero di versione si possono fare due cose che senza sono
 * impossibili: **dire** quale versione stai guardando, e **accorgersi** che ne
 * esiste una piu' recente confrontandola con quella che il server serve
 * adesso.
 *
 * ---------------------------------------------------------------------------
 * Da dove viene
 * ---------------------------------------------------------------------------
 * `VERCEL_GIT_COMMIT_SHA` la mette Vercel a ogni build, ed e' esattamente il
 * commit da cui e' fatto quel deploy: non un numero che qualcuno deve
 * ricordarsi di alzare, che e' il modo in cui i numeri di versione smettono di
 * essere veri.
 *
 * In sviluppo non esiste, e la risposta e' `sviluppo`. Non e' un ripiego: fuori
 * da Vercel non c'e' nessun deploy a cui riferirsi, e inventare un numero
 * significherebbe far scattare l'avviso di aggiornamento a ogni ricarica.
 *
 * Non e' un segreto — e' un hash di commit di un repository privato, e serve al
 * client per confrontarlo. Viaggia come proprieta' di un componente, non come
 * `NEXT_PUBLIC_*`: la regola 2 vieta i segreti nel bundle, e il modo piu'
 * semplice di non violarla mai e' non prendere l'abitudine.
 */
export const VERSIONE: string = process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 7) ?? 'sviluppo';
