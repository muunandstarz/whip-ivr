import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import WhipLayout from "@/components/WhipLayout";

function Accordion({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 text-left font-medium transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{icon && <span className="mr-2">{icon}</span>}{title}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>
      {open && <div className="px-4 py-3 text-sm space-y-2 bg-background">{children}</div>}
    </div>
  );
}

export default function LiabilityGuide() {
  return (
    <WhipLayout>
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Liability Reference Guide</h1>
        <p className="text-muted-foreground text-sm">Scenario-based fault guide for claims processors. Click any scenario to expand.</p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Important:</strong> This guide is a reference tool to assist in determining liability — not a substitute for professional judgment. Every accident is different. Use this as a starting point, not a final answer. When facts are unclear or the situation is complex, seek guidance from a senior team member.
        </p>
      </div>

      {/* Always Do This First */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded uppercase tracking-wide">Before Any Determination</span>
          Always Do This First
        </h2>
        <ol className="space-y-3">
          {[
            { n: 1, text: <><strong>Pull the location on Google Maps.</strong> Confirm the location is real, the road layout matches the story, and any traffic controls described actually exist there.</> },
            { n: 2, text: <><strong>Read the full driver statement first.</strong> Note what the driver says happened, what they leave out, and whether the account is clear and consistent. A vague narrative is itself a flag.</> },
            { n: 3, text: <><strong>Match the damage photos to the story.</strong> If the driver says they were hit from behind, damage should be on the rear. If photos and story don't match — stop and flag it.</> },
            { n: 4, text: <><strong>Verify date, time, and location together.</strong> A highway accident at a location that is a residential side street doesn't make sense. Confirm the road type on Maps.</> },
            { n: 5, text: <><strong>Check for flags on the intake form.</strong> Review the CSA intake form's fraud/coverage section. If any flags were checked — note them before making any determination.</> },
          ].map(({ n, text }) => (
            <li key={n} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{n}</span>
              <p className="text-sm pt-0.5">{text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Fault Scenarios */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Fault Scenarios</h2>
        <div className="space-y-1">
          <Accordion title="Rear-End Collision" icon="💥">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">One vehicle drives into the back of the vehicle in front</p>
            <p><strong>General Rule:</strong> The following driver is presumed at fault. Rear-end collisions carry a strong presumption of negligence against the driver who struck from behind.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sudden stop with no warning (brake-check)</li>
              <li>Mechanical failure (brake failure, not driver negligence)</li>
              <li>Third vehicle pushed our vehicle into the one ahead</li>
              <li>Lead vehicle reversed unexpectedly</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location (front of following vehicle, rear of lead vehicle), police report, dashcam, witness statements.</p>
            <p><strong>MD/VA note:</strong> Even 1% fault on our driver = no recovery under contributory negligence. Document thoroughly.</p>
          </Accordion>

          <Accordion title="Merging / Lane Change" icon="↘️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle moves from one lane into another and makes contact</p>
            <p><strong>General Rule:</strong> The merging driver has the duty to yield to traffic in the target lane. Fault typically falls on the vehicle that changed lanes.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Other driver accelerated to block the merge</li>
              <li>Merge was completed and lane was clear — other driver drifted</li>
              <li>Disputed which vehicle was in which lane</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location (side of merging vehicle, front corner of other vehicle), dashcam, witness statements, police report.</p>
          </Accordion>

          <Accordion title="Backing / Reversing" icon="🔄">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle reverses and strikes something or someone</p>
            <p><strong>General Rule:</strong> The reversing driver bears the duty to ensure the path is clear. Fault is typically assigned to the reversing vehicle.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Other vehicle entered the path after reversing had begun</li>
              <li>Obstructed sightlines (parked vehicles, structures)</li>
              <li>Other driver was speeding through a parking lot</li>
            </ul>
            <p><strong>Key evidence:</strong> Rear damage on reversing vehicle, damage to front of other vehicle, parking lot camera footage if available.</p>
          </Accordion>

          <Accordion title="Left Turn / Intersection" icon="↰">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle turns left and is hit by oncoming traffic</p>
            <p><strong>General Rule:</strong> The turning vehicle must yield to oncoming traffic. Fault typically falls on the vehicle making the left turn.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Oncoming vehicle ran a red light or stop sign</li>
              <li>Oncoming vehicle was speeding (turn was safe at legal speed)</li>
              <li>Protected left turn — green arrow was in effect</li>
              <li>Oncoming vehicle came from unexpected direction</li>
            </ul>
            <p><strong>Key evidence:</strong> Traffic signal status, police report, dashcam, damage pattern (front of turning vehicle, front/side of oncoming).</p>
          </Accordion>

          <Accordion title="T-Bone / Broadside" icon="➕">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">The front of one vehicle hits the side of another at an intersection</p>
            <p><strong>General Rule:</strong> Fault depends on right-of-way. The vehicle that failed to yield or ran a control device is typically at fault.</p>
            <p><strong>Key questions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Which vehicle had the green light or right-of-way?</li>
              <li>Was there a stop sign or yield sign?</li>
              <li>Did either driver run a red light?</li>
              <li>Was the intersection controlled or uncontrolled?</li>
            </ul>
            <p><strong>Key evidence:</strong> Traffic signal data, police report, witness statements, dashcam, damage pattern (front of striking vehicle, side of struck vehicle).</p>
          </Accordion>

          <Accordion title="Sideswipe" icon="↔️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Two vehicles traveling side-by-side make scraping contact</p>
            <p><strong>General Rule:</strong> Fault depends on which vehicle drifted or failed to maintain its lane. Often disputed — both vehicles may share fault.</p>
            <p><strong>Key questions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Which vehicle was in its lane and which drifted?</li>
              <li>Was either vehicle merging at the time?</li>
              <li>Was there a construction zone or lane reduction?</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location on both vehicles (driver side vs. passenger side), dashcam, witness statements, police report.</p>
          </Accordion>

          <Accordion title="Parking Lot / Dooring" icon="🅿️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Collision in a parking lot, or a car door opened into a moving vehicle</p>
            <p><strong>Parking Lot:</strong> Vehicles in the travel lane generally have right-of-way over vehicles exiting spaces. The vehicle backing out typically bears fault.</p>
            <p><strong>Dooring:</strong> The person opening the door into traffic is at fault. They have a duty to check for passing vehicles before opening.</p>
            <p><strong>Key evidence:</strong> Parking lot camera, damage location, witness statements. Note: police rarely respond to parking lot accidents — get witness info.</p>
          </Accordion>

          <Accordion title="Single Vehicle" icon="🌳">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Only the Whip vehicle was involved</p>
            <p><strong>General Rule:</strong> Single-vehicle accidents are typically the driver's fault unless an external factor caused the loss.</p>
            <p><strong>Possible defenses / exceptions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Road hazard (pothole, debris, unmarked construction)</li>
              <li>Animal in the road</li>
              <li>Mechanical failure (not driver-caused)</li>
              <li>Hit-and-run by unidentified vehicle</li>
              <li>Weather / road condition (ice, flooding)</li>
            </ul>
            <p><strong>Coverage note:</strong> Single-vehicle accidents may trigger collision coverage. Check TNC period via Argyle — if P1/P2/P3, TNC coverage rules apply.</p>
          </Accordion>
        </div>
      </div>

      {/* Comparative / Contributory Negligence */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Comparative / Contributory Negligence — State Rules</h2>
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Whip Operating States</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50/50 dark:bg-red-950/20">
            <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Pure Contributory — MD &amp; VA</h3>
            <p className="text-sm">If our driver is found to be <strong>even 1% at fault</strong>, our driver cannot recover any damages — regardless of how much more at fault the other driver was. This makes thorough documentation especially important in MD and VA claims.</p>
          </div>
          <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Pure Comparative — FL</h3>
            <p className="text-sm">Fault is assigned as a percentage. Recovery is reduced by that percentage — but never fully eliminated. Even if our driver is 80% at fault, they can still recover 20%. Every percentage point of fault matters.</p>
          </div>
          <div className="border border-green-200 dark:border-green-900 rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20">
            <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">Modified Comparative — 50% Bar (GA)</h3>
            <p className="text-sm">Our driver can recover as long as they are <strong>49% or less at fault</strong>. If 50% or more responsible — no recovery. If eligible, recovery is reduced proportionally.</p>
          </div>
          <div className="border border-purple-200 dark:border-purple-900 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20">
            <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2">Modified Comparative — 51% Bar (IL, MA, PA)</h3>
            <p className="text-sm">Our driver can recover as long as they are <strong>50% or less at fault</strong>. If 51% or more — no recovery. Gives slightly more room than the 50% bar states.</p>
          </div>
        </div>
        <div className="mt-4 bg-muted/40 rounded-lg p-4">
          <p className="text-sm"><strong>Example — Same accident, different outcomes ($10,000 damages, our driver 30% at fault):</strong><br />
          MD/VA: recover $0 (contributory). FL: recover $7,000 (70% of $10K). GA/IL/MA/PA: recover $7,000 (under the bar, reduced proportionally).</p>
        </div>
      </div>
    </div>
    </WhipLayout>
  );
}
