import HeroJourney from "@/components/three/HeroJourney";

// Isolated preview route for the rebuilt 3D journey hero — kept separate
// from the live homepage (app/page.tsx, still on the real-photo version)
// until real .glb models are dropped into public/models/ and the result
// is verified. Delete this route once the swap into the real homepage
// happens.
export default function Preview3DPage() {
  return (
    <div className="bg-black">
      <HeroJourney />
    </div>
  );
}
