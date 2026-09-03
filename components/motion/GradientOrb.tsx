// A soft, drifting colored blur — decorative background accent used to
// break up otherwise flat sections with a bit of color and motion, the same
// trick the hero already uses (see .sci-grid / drift-glow in globals.css)
// but reusable anywhere on the page with any color.
export default function GradientOrb({
  color,
  className = "",
  size = "h-[26rem] w-[26rem]",
  variant = "drift-glow",
}: {
  color: string;
  className?: string;
  size?: string;
  variant?: "drift-glow" | "drift-glow-alt";
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-3xl ${size} ${className}`}
      style={{
        background: `radial-gradient(ellipse at center, ${color}, transparent 70%)`,
        animation: `${variant} ${variant === "drift-glow" ? 14 : 18}s ease-in-out infinite`,
      }}
    />
  );
}
