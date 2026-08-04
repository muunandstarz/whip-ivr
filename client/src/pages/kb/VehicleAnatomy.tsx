import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";

// ─── Part definitions ─────────────────────────────────────────────────────────
const PARTS = [
  {
    id: 1, label: "Hood", x: 22, y: 28,
    description: "The hood covers the engine compartment. Damage here is documented as 'front hood' with photos of all four corners plus the latch area. Note any creasing, buckling, or hinge damage.",
    docTips: ["Photo all 4 corners", "Check latch & hinges", "Note crease direction (front-to-rear vs lateral)"],
    commonClaims: ["Hail", "Front-end collision", "Pedestrian strike"],
  },
  {
    id: 2, label: "Windshield", x: 36, y: 20,
    description: "The front windshield. Document any chips, cracks, or spiderweb patterns. Note the size, location (driver's line of sight is critical), and whether it is a chip or a crack that has spread.",
    docTips: ["Measure crack length", "Note if in driver's direct line of sight", "Photo from inside and outside"],
    commonClaims: ["Road debris", "Hail", "Vandalism"],
  },
  {
    id: 3, label: "Roof", x: 48, y: 12,
    description: "The roof panel. Hail damage appears as small dents across the surface. Collision damage may cause buckling or deformation. Always photograph from multiple angles — roof damage is easy to miss in standard photos.",
    docTips: ["Use raking light to reveal dents", "Count hail strikes if applicable", "Note any sunroof damage separately"],
    commonClaims: ["Hail", "Falling object", "Rollover"],
  },
  {
    id: 4, label: "Rear Window", x: 65, y: 22,
    description: "The rear windshield (backglass). Document cracks, chips, or complete breakage. Note if the defroster grid is damaged. Rear glass replacement typically does not require recalibration unlike front windshields.",
    docTips: ["Check defroster grid", "Note if broken out vs cracked", "Photo from inside and outside"],
    commonClaims: ["Vandalism", "Rear-end collision", "Hail"],
  },
  {
    id: 5, label: "Trunk / Deck Lid", x: 75, y: 32,
    description: "The trunk lid covers the cargo area. Document dents, creases, and latch/hinge damage. In rear-end collisions, the trunk lid is often the first panel affected. Note if the trunk still opens and closes properly.",
    docTips: ["Test latch operation", "Check hinges for bending", "Note if trunk seal is compromised"],
    commonClaims: ["Rear-end collision", "Hail", "Vandalism"],
  },
  {
    id: 6, label: "Rear Bumper", x: 83, y: 48,
    description: "The rear bumper assembly including the bumper cover, reinforcement bar, and absorber. In low-speed rear impacts, damage may be limited to the cover. Higher-speed impacts affect the reinforcement and frame rails.",
    docTips: ["Check for hidden reinforcement damage", "Note if bumper cover is cracked vs dented", "Look for trailer hitch damage"],
    commonClaims: ["Rear-end collision", "Backing accident", "Parking lot"],
  },
  {
    id: 7, label: "Rear Quarter Panel", x: 72, y: 44,
    description: "The rear quarter panel is the body panel behind the rear door, above the rear wheel arch. It is typically welded (not bolted) and may require sectioning or full replacement. Note any wheel arch damage.",
    docTips: ["Check wheel arch for deformation", "Note if panel is welded or bolted", "Inspect for frame/unibody damage behind panel"],
    commonClaims: ["Sideswipe", "Rear-end collision", "Hail"],
  },
  {
    id: 8, label: "Rear Door", x: 60, y: 44,
    description: "The rear passenger door. Document dents, creases, and damage to the door shell, glass, and hinges. Check that the door opens, closes, and latches properly after impact.",
    docTips: ["Test door operation (open/close/latch)", "Check door glass for cracks", "Note hinge and striker alignment"],
    commonClaims: ["Sideswipe", "Dooring", "Parking lot"],
  },
  {
    id: 9, label: "Front Door", x: 44, y: 44,
    description: "The front driver or passenger door. Pay special attention to the side mirror and any intrusion into the door cavity that could indicate structural damage.",
    docTips: ["Check side mirror", "Test window operation", "Look for intrusion into door cavity"],
    commonClaims: ["Sideswipe", "T-bone", "Dooring"],
  },
  {
    id: 10, label: "Side Mirror", x: 30, y: 35,
    description: "The exterior side mirror. Document if the mirror housing is cracked, the glass is broken, or the mirror is folded/broken off. Note if the mirror has power fold, heated glass, or camera features — these affect replacement cost.",
    docTips: ["Note mirror features (camera, heated, power fold)", "Check if housing vs glass only", "Photo from front and rear angles"],
    commonClaims: ["Sideswipe", "Vandalism", "Parking lot"],
  },
  {
    id: 11, label: "Front Fender", x: 18, y: 38,
    description: "The front fender is the panel over the front wheel. In front-end collisions, fender damage often accompanies hood and bumper damage. Check the wheel arch liner and inner fender for hidden damage.",
    docTips: ["Check inner fender/liner", "Note wheel arch deformation", "Look for headlight housing damage"],
    commonClaims: ["Front-end collision", "Sideswipe", "Hail"],
  },
  {
    id: 12, label: "Front Bumper", x: 10, y: 48,
    description: "The front bumper assembly. In low-speed impacts, only the cover may be damaged. Higher-speed impacts affect the reinforcement bar, crash absorbers, and potentially the radiator support. Always check behind the cover.",
    docTips: ["Check behind cover for reinforcement damage", "Note if airbags deployed (indicates significant impact)", "Look for radiator/condenser damage"],
    commonClaims: ["Front-end collision", "Backing accident", "Parking lot"],
  },
  {
    id: 13, label: "Front Wheel / Tire", x: 22, y: 62,
    description: "The front wheel and tire assembly. Document tire damage (sidewall, tread), wheel/rim damage (bent, cracked, curb rash), and any suspension components visible. Wheel damage often indicates suspension damage.",
    docTips: ["Check for bent rim", "Note tire sidewall vs tread damage", "Check for suspension damage if wheel is impacted"],
    commonClaims: ["Pothole", "Curb strike", "Front-end collision"],
  },
  {
    id: 14, label: "Rear Wheel / Tire", x: 72, y: 62,
    description: "The rear wheel and tire assembly. Rear wheel damage in a side impact may indicate axle or suspension damage. Always check alignment after any wheel impact.",
    docTips: ["Check for axle damage in side impacts", "Note if wheel is tracking straight", "Document any wheel well damage"],
    commonClaims: ["Pothole", "Sideswipe", "Rear-end collision"],
  },
  {
    id: 15, label: "Rocker Panel", x: 48, y: 58,
    description: "The rocker panel (sill) runs along the bottom of the vehicle between the front and rear wheels. Damage here is common in sideswipes and low-speed parking lot impacts. Note any dents, scrapes, or deformation.",
    docTips: ["Check for deformation (structural concern)", "Note length and depth of damage", "Photo from ground level"],
    commonClaims: ["Sideswipe", "Parking lot", "Curb strike"],
  },
] as const;

type Part = typeof PARTS[number];

export default function VehicleAnatomy() {
  const [activePart, setActivePart] = useState<Part | null>(null);

  return (
    <WhipLayout>
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Vehicle Anatomy</h1>
        <p className="text-muted-foreground text-sm">Click any numbered pin on the diagram to view documentation guidance for that vehicle component.</p>
      </div>

      {/* Diagram + Detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Diagram */}
        <div className="lg:col-span-2">
          <div className="border border-border rounded-xl overflow-hidden bg-white dark:bg-zinc-900 p-4">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <img
                src="/manus-storage/sedan-anatomy_c3bdb4de.png"
                alt="Vehicle anatomy diagram — sedan side profile"
                className="absolute inset-0 w-full h-full object-contain"
                draggable={false}
              />
              {PARTS.map(part => (
                <button
                  key={part.id}
                  onClick={() => setActivePart(activePart?.id === part.id ? null : part)}
                  className={`absolute w-7 h-7 rounded-full border-2 text-xs font-bold flex items-center justify-center transition-all duration-150
                    hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary
                    ${activePart?.id === part.id
                      ? "bg-[#ff6221] border-[#ff6221] text-white scale-110 shadow-lg"
                      : "bg-[#171b31] border-white text-white shadow-md hover:bg-[#ff6221] hover:border-[#ff6221]"
                    }`}
                  style={{ left: `${part.x}%`, top: `${part.y}%`, transform: "translate(-50%, -50%)" }}
                  title={part.label}
                >
                  {part.id}
                </button>
              ))}
            </div>
            {/* Pin legend */}
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PARTS.map(part => (
                <button
                  key={part.id}
                  onClick={() => setActivePart(activePart?.id === part.id ? null : part)}
                  className={`text-left px-2 py-1.5 rounded text-xs transition-colors
                    ${activePart?.id === part.id
                      ? "bg-[#ff6221]/10 text-[#ff6221] font-semibold border border-[#ff6221]/30"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                >
                  <span className="font-bold mr-1">{part.id}.</span>{part.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {activePart ? (
            <div className="border border-border rounded-xl p-5 space-y-4 bg-background">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#ff6221] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {activePart.id}
                  </span>
                  <h2 className="text-lg font-bold">{activePart.label}</h2>
                </div>
                <button onClick={() => setActivePart(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none mt-0.5" aria-label="Close">×</button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{activePart.description}</p>
              <div>
                <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Documentation Tips</p>
                <ul className="space-y-1.5">
                  {activePart.docTips.map((tip, i) => (
                    <li key={i} className="text-sm flex gap-2 items-start">
                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Common Claim Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {activePart.commonClaims.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground border border-border">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center text-center min-h-[200px] text-muted-foreground">
              <div className="text-4xl mb-3">🚗</div>
              <p className="text-sm font-medium">Select a part</p>
              <p className="text-xs mt-1">Click any numbered pin on the diagram or a label below it to view documentation guidance.</p>
            </div>
          )}
        </div>
      </div>

      {/* General documentation guide */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/50 px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">General Vehicle Documentation Guide</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground font-mono">Photo Requirements</p>
            <ul className="space-y-1.5">
              {["4-corner overview shots (all 4 sides of vehicle)", "Close-up of each damaged panel", "VIN plate (dashboard + door jamb)", "Odometer reading", "License plate (front and rear)", "Interior if airbags deployed"].map((item, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground font-mono">Damage Description Format</p>
            <ul className="space-y-1.5">
              {["Panel name + location (e.g. driver-side front door)", "Type of damage (dent, crease, scratch, crack, broken)", "Approximate size (small/medium/large or inches)", "Whether part is functional or not", "Any secondary damage (glass, lights, trim)"].map((item, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground font-mono">Red Flags to Note</p>
            <ul className="space-y-1.5">
              {["Damage inconsistent with reported accident type", "Pre-existing damage not noted at vehicle pickup", "Damage on multiple non-adjacent panels", "Airbag deployment without significant structural damage", "Frame or unibody damage (requires specialist assessment)"].map((item, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
    </WhipLayout>
  );
}
