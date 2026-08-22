import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Le tinte delle classi devono restare visibili, e non a occhio.
 * ---------------------------------------------------------------------------
 * L'audit del 22 agosto ha misurato ambra 2,06, verde 2,02 e ciano 1,72 contro
 * le superfici chiare: sotto il 3:1 che WCAG chiede agli elementi grafici, e il
 * colore **e'** la codifica della classe di spesa — quindi la dimensione
 * principale dell'applicazione spariva senza che niente lo segnalasse.
 *
 * Il difetto e' tornato lo stesso giorno in cui l'ambra e' stata resa piu'
 * gialla, che e' esattamente il modo in cui torna: nessuno ricalcola un
 * rapporto di contrasto mentre sceglie un colore. Questa prova lo fa al posto
 * di chi sceglie, e legge i valori da `globals.css` invece di ricopiarli — una
 * copia si aggiorna sempre dopo, e nel frattempo la prova passa su un colore
 * che non e' piu' quello a schermo.
 */

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf-8');

/** I `--nome: #hex;` di un blocco, dal suo inizio alla graffa che lo chiude. */
function tokenDelBlocco(inizio: RegExp): Record<string, string> {
  const m = inizio.exec(CSS);
  if (m === null) throw new Error(`Blocco non trovato: ${inizio}`);
  const corpo = CSS.slice(m.index, CSS.indexOf('\n}', m.index));
  const trovati: Record<string, string> = {};
  for (const m2 of corpo.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    trovati[m2[1]!] = m2[2]!.toLowerCase();
  }
  return trovati;
}

const canale = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function luminanza(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * canale((n >> 16) & 255) + 0.7152 * canale((n >> 8) & 255) + 0.0722 * canale(n & 255)
  );
}

export function contrasto(a: string, b: string): number {
  const [x, y] = [luminanza(a), luminanza(b)];
  const [chiaro, scuro] = x >= y ? [x, y] : [y, x];
  return (chiaro + 0.05) / (scuro + 0.05);
}

const CHIARO = tokenDelBlocco(/^:root \{/m);
const SCURO = tokenDelBlocco(/^:root\[data-tema='scuro'\] \{/m);

const CHIAVI = ['blu', 'ambra', 'rosa', 'verde', 'viola', 'ciano', 'bruno'] as const;

/**
 * Contro quale fondo. Per un colore scuro il bianco e' il caso **facile**: la
 * superficie piu' scura fra quelle chiare e' quella che avvicina le due
 * luminanze, quindi e' li' che va misurato. Sul tema scuro vale il contrario, e
 * il fondo peggiore e' la superficie piu' chiara.
 */
const PEGGIORE_CHIARO = '--s3';
const PEGGIORE_SCURO = '--s3';

describe('le tinte delle classi restano visibili', () => {
  it('trova tutte e sette le chiavi in tutti e due i temi', () => {
    for (const k of CHIAVI) {
      expect(CHIARO[`classe-${k}`], `${k} sul chiaro`).toMatch(/^#[0-9a-f]{6}$/);
      expect(SCURO[`classe-${k}`], `${k} sullo scuro`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(CHIAVI)('%s passa il 3:1 sul tema chiaro', (k) => {
    const r = contrasto(CHIARO[`classe-${k}`]!, CHIARO[PEGGIORE_CHIARO.slice(2)]!);
    expect(
      r,
      `${k} = ${CHIARO[`classe-${k}`]} contro ${CHIARO['s3']}: ${r.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(CHIAVI)('%s passa il 3:1 sul tema scuro', (k) => {
    const r = contrasto(SCURO[`classe-${k}`]!, SCURO[PEGGIORE_SCURO.slice(2)]!);
    expect(
      r,
      `${k} = ${SCURO[`classe-${k}`]} contro ${SCURO['s3']}: ${r.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  /**
   * `--neutro` non e' una scelta fra le sette: e' il colore riservato alla
   * pseudo-classe «non classificato», e sbiadito di proposito. Deve comunque
   * restare distinguibile dal fondo, o l'assenza di classe diventa invisibile
   * invece che sommessa.
   */
  it.each([
    ['chiaro', CHIARO],
    ['scuro', SCURO],
  ] as const)('il neutro resta visibile sul tema %s', (_, t) => {
    expect(contrasto(t['neutro']!, t['s3']!)).toBeGreaterThanOrEqual(3);
  });
});

describe('i tre mestieri semantici hanno un valore proprio', () => {
  /**
   * Erano `var(--classe-rosa)` e compagnia. Finche' lo sono, ricolorare una
   * classe ridipinge gli errori — che e' esattamente cio' che la 0043 diceva di
   * voler evitare quando ha smesso di chiamare i token col nome delle classi.
   */
  it.each(['allarme', 'attenzione', 'conferma'])('%s non e un alias di una classe', (nome) => {
    expect(CHIARO[nome], `${nome} sul chiaro`).toMatch(/^#[0-9a-f]{6}$/);
    expect(SCURO[nome], `${nome} sullo scuro`).toMatch(/^#[0-9a-f]{6}$/);
  });

  /** Sono testo, non pallini: qui il minimo e' 4,5:1, non 3:1. */
  it.each(['allarme', 'attenzione', 'conferma'])('%s e leggibile come testo', (nome) => {
    expect(contrasto(CHIARO[nome]!, CHIARO['s3']!), `${nome} sul chiaro`).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrasto(SCURO[nome]!, SCURO['s3']!), `${nome} sullo scuro`).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
