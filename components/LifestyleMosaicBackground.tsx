import VerticalMarquee from "@/components/motion/VerticalMarquee";

// 19 Pinterest-style lifestyle photos (cars, jets, yachts) provided by the
// user, split round-robin across 3 columns. 19/3 ≈ 6 images per column
// before the loop repeats — enough that the repetition isn't obvious at a
// glance, same reasoning as any marquee/ticker.
const LIFESTYLE_IMAGES = Array.from(
  { length: 19 },
  (_, i) => `/examples/impress/lifestyle-${String(i + 1).padStart(2, "0")}.webp`
);

function splitRoundRobin(items: string[], columns: number): string[][] {
  const result: string[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => result[i % columns].push(item));
  return result;
}

// Full-bleed photo mosaic behind the hero — explicit request to match a
// reference landing page's "façade" (a wall of lifestyle photos scrolling
// behind the headline, in independently-moving columns). Alternating
// scroll direction per column (like the reference) reads as more dynamic
// than every column moving the same way. A dark gradient overlay keeps the
// existing hero text/CTA legible over busy, high-contrast photos — same
// requirement as any text-over-image hero.
export default function LifestyleMosaicBackground() {
  const columns = splitRoundRobin(LIFESTYLE_IMAGES, 3);

  return (
    <div className="absolute inset-0 -z-20 overflow-hidden">
      <div className="grid h-full grid-cols-3 gap-3 p-3 opacity-70">
        <VerticalMarquee images={columns[0]} duration={38} />
        <VerticalMarquee images={columns[1]} duration={30} reverse />
        <VerticalMarquee images={columns[2]} duration={44} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
    </div>
  );
}
