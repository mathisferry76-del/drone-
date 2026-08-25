export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 py-10 text-center text-sm text-zinc-500">
      <p>© {new Date().getFullYear()} ThumbAI — Générateur de miniatures pour créateurs.</p>
    </footer>
  );
}
