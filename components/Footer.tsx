import Link from "next/link";

export default function Footer() {
  return (
    <footer id="contact" className="border-t border-zinc-800 bg-black">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-black">Thumb</span>
            AI
          </div>
          <p className="mt-3 max-w-xs text-sm text-zinc-500">
            Le générateur de miniatures pour créateurs YouTube, TikTok et
            Reels qui n&apos;ont ni le temps ni les compétences design.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
            Navigation
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-zinc-500">
            <li><Link href="/#styles" className="transition hover:text-white">Styles</Link></li>
            <li><Link href="/#resultats" className="transition hover:text-white">Nos résultats</Link></li>
            <li><Link href="/pricing" className="transition hover:text-white">Tarifs</Link></li>
            <li><Link href="/#faq" className="transition hover:text-white">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
            Contact
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-zinc-500">
            <li>
              <a href="mailto:contact@thumbai.app" className="transition hover:text-white">
                contact@thumbai.app
              </a>
            </li>
            <li className="text-zinc-600">
              Une question, un bug, une demande spéciale ? Écris-nous, on
              répond vite.
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} ThumbAI — Générateur de miniatures pour créateurs.
      </div>
    </footer>
  );
}
