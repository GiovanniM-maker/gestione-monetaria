/**
 * Senza, Next tiene a schermo la pagina precedente per tutto il viaggio, e il
 * tocco sulla voce di menu sembra non registrato.
 */
export default function Caricamento() {
  return (
    <div className="space-y-5">
      <div className="scheda h-40 animate-pulse" />
      <div className="scheda h-64 animate-pulse" />
    </div>
  );
}
