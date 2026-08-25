import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-black">Thumb</span>
          AI
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium text-zinc-300">
          <Link href="/#styles" className="hidden hover:text-white sm:block">
            Styles
          </Link>
          <Link href="/pricing" className="hidden hover:text-white sm:block">
            Tarifs
          </Link>
          <Link
            href="/generate"
            className="rounded-full bg-yellow-400 px-4 py-2 font-bold text-black transition hover:bg-yellow-300"
          >
            Essayer gratuitement
          </Link>
        </div>
      </nav>
    </header>
  );
}
