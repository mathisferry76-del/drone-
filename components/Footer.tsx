import Link from "next/link";

export default function Footer() {
  return (
    <footer id="contact" className="border-t border-zinc-800 bg-black">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-black">MIN</span>
            IA
          </div>
          <p className="mt-3 max-w-xs text-sm text-zinc-500">
            Transforme n&apos;importe quelle photo en flex bluffant, ou en
            miniature YouTube qui capte le clic — la même IA, pour tout le
            monde.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
            Navigation
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-zinc-500">
            <li><Link href="/impress" className="transition hover:text-white">Impressionne tes potes</Link></li>
            <li><Link href="/#styles" className="transition hover:text-white">Miniatures YouTube</Link></li>
            <li><Link href="/#resultats" className="transition hover:text-white">Nos résultats</Link></li>
            <li><Link href="/#faq" className="transition hover:text-white">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
            Contact
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-zinc-500">
            <li>
              <a href="mailto:contact@min-ia.fr" className="transition hover:text-white">
                contact@min-ia.fr
              </a>
            </li>
            <li className="text-zinc-600">
              Une question, un bug, une demande spéciale ? Écris-nous, on
              répond vite.
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-900 px-6 py-6 text-center text-xs text-zinc-600">
        <p>© {new Date().getFullYear()} MIN IA — Générateur de miniatures pour créateurs.</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/mentions-legales" className="transition hover:text-zinc-300">Mentions légales</Link>
          <Link href="/cgv" className="transition hover:text-zinc-300">CGV</Link>
          <Link href="/confidentialite" className="transition hover:text-zinc-300">Confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
