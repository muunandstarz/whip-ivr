import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { AlertTriangle, ChevronRight, Camera, FileText, Wrench, Zap, Info, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Pin data ──────────────────────────────────────────────────────────────────
const PINS: Record<number, { name: string; note: string; severity: "normal" | "critical" | "covered" }> = {
  1:  { name: "Roof / Panoramic Glass",        note: "PP covered — $1,000 cap · ADAS calibration required after any roof or glass work.",                              severity: "covered" },
  2:  { name: "Rear Quarter / Trunk Lid",       note: "Welded structural panel · AIM camera integrated · full assembly replacement required.",                          severity: "normal" },
  3:  { name: "Doors / Sides / Pillars",        note: "A/B pillar is structural — document carefully · side camera calibration required.",                              severity: "normal" },
  4:  { name: "Front Bumper / Hood / Frunk",    note: "OEM parts required · sensor integration · 3-stage pearl white paint add-on.",                                   severity: "normal" },
  5:  { name: "Rear Bumper / Trunk Lid",        note: "OEM required · AIM camera · backup camera integration · 3-stage paint.",                                        severity: "normal" },
  6:  { name: "Battery Pack (HV)",              note: "CRITICAL — any undercarriage impact requires Tesla certified assessment before repair authorization.",             severity: "critical" },
  7:  { name: "Windshield / Glass",             note: "PP covered — $1,000 cap · ADAS calibration required after any glass replacement.",                              severity: "covered" },
  8:  { name: "Headlight Assembly",             note: "OEM only — $900–$1,400 each · Tesla Toolbox calibration required · both sides often replaced together.",         severity: "normal" },
  9:  { name: "Front Bumper Sensors / Autopilot", note: "ADAS calibration required after any front repair — even minor bumper work.",                                   severity: "normal" },
  10: { name: "Tail Lamp Assembly",             note: "Full-width LED bar — both assemblies typically replaced together as a set.",                                     severity: "normal" },
  11: { name: "Rear Bumper / Parking Sensors",  note: "OEM required · license plate integration · sensor calibration required.",                                        severity: "normal" },
  12: { name: "Charge Port",                    note: "Drive-off while charging = member negligence — NOT covered under Protection Plan.",                              severity: "critical" },
};

// ── Component details ─────────────────────────────────────────────────────────
const PARTS: Record<string, { name: string; desc: string; damage: string; estimate: string }> = {
  "front-bumper":       { name:"Front Bumper",                        desc:"Protective structure at the front of the vehicle. Absorbs impact in low-speed collisions. May contain sensors, radar, and parking cameras on newer vehicles.", damage:"Cracks, deformation, broken mounts, missing sections, damage to integrated sensors/cameras.", estimate:"Bumper cover R&R, bumper reinforcement bar, energy absorber, sensors, fog lights, labor 3–8 hours" },
  "rear-bumper":        { name:"Rear Bumper",                         desc:"Protective structure at the rear. Contains tail lights on some vehicles. Often damaged in rear-end collisions.", damage:"Cracks, deformation, punctures, broken brackets, sensor damage.", estimate:"Bumper cover R&R, rear reinforcement, parking sensors, labor 2–5 hours" },
  "hood":               { name:"Hood",                                desc:"Panel covering the engine compartment. Hinged at the rear on most vehicles. Damage indicates significant front-end impact.", damage:"Dents, creases, hinge damage, latch damage, paint damage.", estimate:"Hood R&R or repair, hinge replacement, hood latch, undercoat, labor 3–6 hours" },
  "trunk":              { name:"Trunk / Decklid",                     desc:"Rear panel that covers the cargo area. Rear-end collision damage typically includes this panel along with bumper and tail lights.", damage:"Dents, creases, latch failure, hinge damage.", estimate:"Decklid R&R or repair, latch, hinges, spoiler if equipped, labor 3–5 hours" },
  "windshield":         { name:"Windshield",                          desc:"Front safety glass. Structural component — compromised windshields affect airbag deployment and roof integrity in rollover.", damage:"Chips, cracks, shattering, delamination.", estimate:"Windshield R&R, ADAS recalibration required on newer vehicles, molding, labor 1–2 hours" },
  "rear-window":        { name:"Rear Window",                         desc:"Rear safety glass. May contain heating elements and antenna. Not structural in the same way as windshield.", damage:"Cracks, shattering, delamination of heating element.", estimate:"Rear glass R&R, defroster repair if damaged, labor 1–2 hours" },
  "front-left-fender":  { name:"Front Left Fender (Driver Side)",     desc:"Panel between the front wheel and front door on the driver side. Common in side-swipe and angled front-end collisions.", damage:"Dents, creases, paint damage, wheel arch damage.", estimate:"Fender R&R or repair, trim moldings, liner, labor 3–6 hours" },
  "front-right-fender": { name:"Front Right Fender (Passenger Side)", desc:"Panel between the front wheel and front door on the passenger side.", damage:"Dents, creases, paint damage, wheel arch damage.", estimate:"Fender R&R or repair, trim moldings, liner, labor 3–6 hours" },
  "rear-left-qp":       { name:"Rear Left Quarter Panel (Driver)",    desc:"Large structural panel running from the rear door to the tail. Not easily removable — typically repaired or sectioned. Heavy damage indicates significant lateral impact.", damage:"Dents, creases, rust intrusion, structural bends.", estimate:"Quarter panel R&R or repair, paint, structural work if bent, labor 8–20 hours" },
  "rear-right-qp":      { name:"Rear Right Quarter Panel (Passenger)",desc:"Same as driver side quarter — structural, difficult to replace.", damage:"Dents, creases, structural deformation.", estimate:"Quarter panel R&R or repair, paint, structural work, labor 8–20 hours" },
  "driver-door":        { name:"Front Driver Door",                   desc:"The front door on the driver side. Damage here should correlate with a driver-side impact. Contains window glass, door handle, mirror mount, and potentially side airbag.", damage:"Dents, creases, shell damage, hinge issues, window damage.", estimate:"Door shell R&R or repair, glass, regulator, handle, mirror, labor 4–8 hours" },
  "rear-driver-door":   { name:"Rear Driver Door",                    desc:"The rear door on the driver side. Significant damage here without front door damage may indicate the strike point.", damage:"Dents, creases, hinge damage, glass damage.", estimate:"Door shell or repair, glass, regulator, labor 3–6 hours" },
  "passenger-door":     { name:"Front Passenger Door",                desc:"The front door on the passenger side.", damage:"Dents, creases, glass damage, mirror damage.", estimate:"Door shell R&R or repair, glass, regulator, handle, labor 4–8 hours" },
  "rear-passenger-door":{ name:"Rear Passenger Door",                 desc:"The rear door on the passenger side.", damage:"Dents, creases, hinge issues, glass damage.", estimate:"Door shell or repair, glass, regulator, labor 3–6 hours" },
};

const PP_COVERAGE = [
  { part: "Front / Rear Bumper Cover",  pp: "Yes — $1,000 cap",         oem: "Yes",  ppClass: "text-green-600" },
  { part: "Trunk Lid / Hood / Doors",   pp: "Yes — $1,000 cap",         oem: "Yes",  ppClass: "text-green-600" },
  { part: "Structural (A/B Pillar)",    pp: "Yes — $1,000 cap",         oem: "Yes",  ppClass: "text-green-600" },
  { part: "Windshield / Glass",         pp: "Yes — $1,000 cap",         oem: "Yes",  ppClass: "text-green-600" },
  { part: "Scratches / Cosmetic",       pp: "Yes — $1,000 cap",         oem: "N/A",  ppClass: "text-green-600" },
  { part: "Rim / Wheel Damage",         pp: "No — PP Exclusion",        oem: "No",   ppClass: "text-red-500" },
  { part: "Interior Damage",            pp: "No — PP Exclusion",        oem: "N/A",  ppClass: "text-red-500" },
  { part: "Battery Pack (HV)",          pp: "Escalate — assess first",  oem: "Yes",  ppClass: "text-amber-500" },
  { part: "Tires",                      pp: "Case by case",             oem: "No",   ppClass: "text-amber-500" },
];

const TESLA_REQUIREMENTS = [
  "All repairs at Tesla Certified Collision Center only",
  "Tesla Toolbox Connect required for all mechanical and electrical work",
  "HV battery deactivation / activation: 0.5 Mech hrs",
  "ADAS / camera calibration after any glass, mirror, or front/rear work",
  "3-stage pearl white paint add-on required",
  "OEM parts only — aftermarket voids Tesla warranty",
  "Non-certified shop = valid carrier rebuttal ground",
];

const DAMAGE_TYPES = ["Collision", "Vandalism", "Weather", "Wear & Tear", "Glass Damage", "Mechanical", "Other"];

type Tab = "diagram" | "legend" | "components" | "docguide";

function PinCircle({ n, severity, selected, onClick }: { n: number; severity: string; selected: boolean; onClick: () => void }) {
  const bg = selected ? "#ff6221" : severity === "critical" ? "#dc2626" : severity === "covered" ? "#16a34a" : "#1a5fa8";
  return (
    <button onClick={onClick}
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md transition-transform hover:scale-110 active:scale-95"
      style={{ background: bg, outline: selected ? `3px solid ${bg}` : "none", outlineOffset: "2px" }}>
      {n}
    </button>
  );
}

export default function VehicleAnatomy() {
  const [activeTab, setActiveTab] = useState<Tab>("diagram");
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "diagram",    label: "Diagram" },
    { id: "legend",     label: "Pin Legend" },
    { id: "components", label: "Component Details" },
    { id: "docguide",   label: "Documentation Guide" },
  ];

  const handlePin = (n: number) => {
    setSelectedPin(prev => prev === n ? null : n);
    setActiveTab("diagram");
  };

  return (
    <WhipLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Vehicle Anatomy</h1>
            <p className="text-muted-foreground text-sm mt-1">Use the diagram to identify damage locations and required documentation. Click any numbered pin or legend item for details and claim guidance.</p>
          </div>
          {/* Vehicle selector */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 min-w-[280px]">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle Selector</span>
            <div className="flex gap-2 flex-wrap">
              <select className="flex-1 min-w-[70px] text-sm border border-border rounded-lg px-2 py-1.5 bg-background">
                <option>2023</option><option>2022</option><option>2024</option>
              </select>
              <select className="flex-1 min-w-[80px] text-sm border border-border rounded-lg px-2 py-1.5 bg-background">
                <option>Tesla</option><option>Toyota</option>
              </select>
              <select className="flex-1 min-w-[90px] text-sm border border-border rounded-lg px-2 py-1.5 bg-background">
                <option>Model 3</option><option>Model Y</option><option>Camry</option>
              </select>
            </div>
          </div>
        </div>

        {/* Warning banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 flex gap-2.5 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm"><strong>Under Construction:</strong> Diagram pins are being refined. Use the <strong>Pin Legend</strong> and side panels to access all damage notes — those work fully.</p>
        </div>

        {/* Main 3-column layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px_220px] gap-4">

          {/* Left: tabbed diagram card */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center justify-between border-b border-border px-4">
              <div className="flex">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Maximize2 className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>

            {/* Diagram tab */}
            {activeTab === "diagram" && (
              <div className="p-4 space-y-4">
                {/* Selected pin detail */}
                {selectedPin && (
                  <div className={`rounded-xl border p-3 ${PINS[selectedPin].severity === "critical" ? "border-red-200 bg-red-50 dark:bg-red-950/20" : PINS[selectedPin].severity === "covered" ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-border bg-muted/30"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: PINS[selectedPin].severity === "critical" ? "#dc2626" : PINS[selectedPin].severity === "covered" ? "#16a34a" : "#1a5fa8" }}>
                          {selectedPin}
                        </span>
                        <span className="font-semibold text-sm">{PINS[selectedPin].name}</span>
                        {PINS[selectedPin].severity === "critical" && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                        {PINS[selectedPin].severity === "covered" && <span className="text-xs font-semibold text-green-600">PP Covered</span>}
                      </div>
                      <button onClick={() => setSelectedPin(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{PINS[selectedPin].note}</p>
                  </div>
                )}

                {/* SVG Diagram — Tesla Model 3 three-view */}
                <div className="bg-[#f5f5f3] dark:bg-muted/30 rounded-xl p-4 overflow-x-auto">
                  {/* SIDE VIEW */}
                  <p className="text-xs font-semibold text-center text-muted-foreground mb-2 tracking-widest uppercase">Side View</p>
                  <div className="relative">
                    <svg viewBox="0 0 860 360" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", minWidth: 520, maxWidth: 860, display: "block", margin: "0 auto" }}>
                      {/* Body sill */}
                      <rect x="90" y="190" width="670" height="65" rx="6" fill="#ddddd9" />
                      {/* Hood */}
                      <path d="M90,190 L90,148 Q98,118 148,104 L270,100 L280,190 Z" fill="#e8e8e5" />
                      {/* Cabin */}
                      <path d="M280,190 Q296,190 312,168 Q330,145 365,124 L468,114 Q548,112 578,130 Q606,146 622,170 Q632,183 645,190 Z" fill="#e8e8e5" />
                      {/* Trunk */}
                      <path d="M645,190 L760,190 L760,158 Q748,130 718,120 L645,118 Z" fill="#e2e2de" />
                      {/* Rear bumper */}
                      <path d="M760,190 Q778,190 792,206 L796,240 Q790,256 762,256 L760,256 Z" fill="#ddddd9" />
                      {/* Front bumper */}
                      <path d="M90,190 Q70,190 58,208 L54,240 Q58,256 86,256 L90,256 Z" fill="#ddddd9" />
                      {/* Windshield */}
                      <path d="M280,188 Q297,140 333,122 L403,114 L418,188 Z" fill="#b8d4e8" opacity="0.82" />
                      {/* Roof glass */}
                      <path d="M418,188 L403,114 L548,112 L562,130 L565,188 Z" fill="#c8dff0" opacity="0.72" />
                      {/* Rear window */}
                      <path d="M565,188 L562,130 L615,144 Q638,158 652,188 Z" fill="#b8d4e8" opacity="0.82" />
                      {/* Door lines */}
                      <rect x="418" y="128" width="103" height="62" rx="2" fill="none" stroke="#c0bcb8" strokeWidth="1.5" />
                      <rect x="523" y="128" width="100" height="62" rx="2" fill="none" stroke="#c0bcb8" strokeWidth="1.5" />
                      {/* B-pillar */}
                      <rect x="520" y="120" width="5" height="70" fill="#aaa8a4" opacity="0.6" />
                      {/* Door handles */}
                      <rect x="445" y="155" width="34" height="7" rx="3.5" fill="#c8c4c0" />
                      <rect x="540" y="155" width="34" height="7" rx="3.5" fill="#c8c4c0" />
                      {/* Mirror */}
                      <ellipse cx="400" cy="162" rx="14" ry="8" fill="#d0cecc" transform="rotate(-5,400,162)" />
                      {/* Headlights */}
                      <path d="M56,214 L56,232 Q60,240 90,241 L90,214 Z" fill="#eeeed8" stroke="#ccc" strokeWidth="0.8" />
                      <path d="M62,218 L62,228 L88,232 L88,216 Z" fill="#d8eaf6" opacity="0.7" />
                      {/* Tail lamps */}
                      <rect x="760" y="210" width="32" height="26" rx="3" fill="#cc4444" opacity="0.88" />
                      <rect x="760" y="210" width="32" height="11" rx="3" fill="#ee6666" opacity="0.7" />
                      {/* Charge port */}
                      <rect x="742" y="226" width="11" height="16" rx="3" fill="#777" />
                      {/* Undercarriage */}
                      <rect x="234" y="248" width="382" height="8" rx="3" fill="#555" opacity="0.6" />
                      {/* Front wheel */}
                      <circle cx="192" cy="270" r="44" fill="#1a1a1a" />
                      <circle cx="192" cy="270" r="32" fill="#333" />
                      <circle cx="192" cy="270" r="20" fill="#aaa" />
                      <circle cx="192" cy="270" r="6" fill="#555" />
                      {/* Rear wheel */}
                      <circle cx="648" cy="270" r="44" fill="#1a1a1a" />
                      <circle cx="648" cy="270" r="32" fill="#333" />
                      <circle cx="648" cy="270" r="20" fill="#aaa" />
                      <circle cx="648" cy="270" r="6" fill="#555" />
                      {/* Ground shadow */}
                      <ellipse cx="420" cy="316" rx="340" ry="7" fill="#000" opacity="0.06" />
                      {/* SIDE PINS */}
                      {/* Pin 1: Roof */}
                      <g onClick={() => handlePin(1)} style={{ cursor: "pointer" }}>
                        <line x1="490" y1="116" x2="490" y2="68" stroke={selectedPin === 1 ? "#ff6221" : "#1a5fa8"} strokeWidth="1.5" />
                        <circle cx="490" cy="54" r="15" fill={selectedPin === 1 ? "#ff6221" : "#1a5fa8"} />
                        <text x="490" y="59" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">1</text>
                      </g>
                      {/* Pin 2: Rear quarter */}
                      <g onClick={() => handlePin(2)} style={{ cursor: "pointer" }}>
                        <line x1="700" y1="160" x2="820" y2="55" stroke={selectedPin === 2 ? "#ff6221" : "#1a5fa8"} strokeWidth="1.5" />
                        <circle cx="826" cy="44" r="15" fill={selectedPin === 2 ? "#ff6221" : "#1a5fa8"} />
                        <text x="826" y="49" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">2</text>
                      </g>
                      {/* Pin 3: Doors */}
                      <g onClick={() => handlePin(3)} style={{ cursor: "pointer" }}>
                        <line x1="540" y1="190" x2="680" y2="320" stroke={selectedPin === 3 ? "#ff6221" : "#1a5fa8"} strokeWidth="1.5" />
                        <circle cx="690" cy="326" r="15" fill={selectedPin === 3 ? "#ff6221" : "#1a5fa8"} />
                        <text x="690" y="331" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">3</text>
                      </g>
                      {/* Pin 4: Front bumper/hood */}
                      <g onClick={() => handlePin(4)} style={{ cursor: "pointer" }}>
                        <line x1="148" y1="190" x2="44" y2="320" stroke={selectedPin === 4 ? "#ff6221" : "#1a5fa8"} strokeWidth="1.5" />
                        <circle cx="38" cy="326" r="15" fill={selectedPin === 4 ? "#ff6221" : "#1a5fa8"} />
                        <text x="38" y="331" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">4</text>
                      </g>
                      {/* Pin 5: Rear bumper */}
                      <g onClick={() => handlePin(5)} style={{ cursor: "pointer" }}>
                        <line x1="780" y1="216" x2="820" y2="320" stroke={selectedPin === 5 ? "#ff6221" : "#1a5fa8"} strokeWidth="1.5" />
                        <circle cx="826" cy="326" r="15" fill={selectedPin === 5 ? "#ff6221" : "#1a5fa8"} />
                        <text x="826" y="331" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">5</text>
                      </g>
                      {/* Pin 6: Battery */}
                      <g onClick={() => handlePin(6)} style={{ cursor: "pointer" }}>
                        <line x1="425" y1="252" x2="345" y2="320" stroke={selectedPin === 6 ? "#ff6221" : "#dc2626"} strokeWidth="1.5" />
                        <circle cx="338" cy="326" r="15" fill={selectedPin === 6 ? "#ff6221" : "#dc2626"} />
                        <text x="338" y="331" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">6</text>
                      </g>
                      {/* Pin 7: Windshield */}
                      <g onClick={() => handlePin(7)} style={{ cursor: "pointer" }}>
                        <line x1="350" y1="150" x2="200" y2="68" stroke={selectedPin === 7 ? "#ff6221" : "#16a34a"} strokeWidth="1.5" />
                        <circle cx="192" cy="54" r="15" fill={selectedPin === 7 ? "#ff6221" : "#16a34a"} />
                        <text x="192" y="59" textAnchor="middle" fontSize="13" fill="white" fontWeight="700" fontFamily="-apple-system,sans-serif">7</text>
                      </g>
                    </svg>
                  </div>

                  {/* Front + Rear views */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-xs font-semibold text-center text-muted-foreground mb-2 tracking-widest uppercase">Front View</p>
                      <svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
                        {/* Body */}
                        <rect x="40" y="80" width="220" height="100" rx="8" fill="#e8e8e5" />
                        {/* Roof */}
                        <path d="M80,80 Q90,40 110,30 L190,30 Q210,40 220,80 Z" fill="#e0e0dc" />
                        {/* Windshield */}
                        <path d="M85,78 Q95,44 112,34 L188,34 Q205,44 215,78 Z" fill="#b8d4e8" opacity="0.82" />
                        {/* Hood */}
                        <rect x="40" y="155" width="220" height="25" rx="4" fill="#ddddd9" />
                        {/* Headlights */}
                        <rect x="44" y="158" width="55" height="18" rx="4" fill="#eeeed8" stroke="#ccc" strokeWidth="0.8" />
                        <rect x="201" y="158" width="55" height="18" rx="4" fill="#eeeed8" stroke="#ccc" strokeWidth="0.8" />
                        {/* Grille */}
                        <rect x="110" y="162" width="80" height="10" rx="3" fill="#555" opacity="0.4" />
                        {/* Bumper */}
                        <rect x="40" y="178" width="220" height="20" rx="4" fill="#d8d8d4" />
                        {/* Wheels */}
                        <circle cx="72" cy="210" r="22" fill="#1a1a1a" /><circle cx="72" cy="210" r="14" fill="#333" /><circle cx="72" cy="210" r="7" fill="#aaa" />
                        <circle cx="228" cy="210" r="22" fill="#1a1a1a" /><circle cx="228" cy="210" r="14" fill="#333" /><circle cx="228" cy="210" r="7" fill="#aaa" />
                        {/* Pins */}
                        <g onClick={() => handlePin(8)} style={{ cursor: "pointer" }}>
                          <circle cx="44" cy="152" r="12" fill={selectedPin === 8 ? "#ff6221" : "#1a5fa8"} />
                          <text x="44" y="157" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">8</text>
                        </g>
                        <g onClick={() => handlePin(9)} style={{ cursor: "pointer" }}>
                          <circle cx="150" cy="195" r="12" fill={selectedPin === 9 ? "#ff6221" : "#1a5fa8"} />
                          <text x="150" y="200" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">9</text>
                        </g>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-center text-muted-foreground mb-2 tracking-widest uppercase">Rear View</p>
                      <svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
                        {/* Body */}
                        <rect x="40" y="80" width="220" height="100" rx="8" fill="#e2e2de" />
                        {/* Roof */}
                        <path d="M80,80 Q90,40 110,30 L190,30 Q210,40 220,80 Z" fill="#e0e0dc" />
                        {/* Rear window */}
                        <path d="M85,78 Q95,44 112,34 L188,34 Q205,44 215,78 Z" fill="#b8d4e8" opacity="0.82" />
                        {/* Trunk */}
                        <rect x="40" y="155" width="220" height="25" rx="4" fill="#ddddd9" />
                        {/* Tail lights */}
                        <rect x="40" y="158" width="60" height="18" rx="4" fill="#cc4444" opacity="0.88" />
                        <rect x="200" y="158" width="60" height="18" rx="4" fill="#cc4444" opacity="0.88" />
                        {/* Bumper */}
                        <rect x="40" y="178" width="220" height="20" rx="4" fill="#d8d8d4" />
                        {/* License plate */}
                        <rect x="120" y="182" width="60" height="12" rx="2" fill="#eee" stroke="#ccc" strokeWidth="0.8" />
                        {/* Wheels */}
                        <circle cx="72" cy="210" r="22" fill="#1a1a1a" /><circle cx="72" cy="210" r="14" fill="#333" /><circle cx="72" cy="210" r="7" fill="#aaa" />
                        <circle cx="228" cy="210" r="22" fill="#1a1a1a" /><circle cx="228" cy="210" r="14" fill="#333" /><circle cx="228" cy="210" r="7" fill="#aaa" />
                        {/* Charge port */}
                        <rect x="225" y="160" width="8" height="12" rx="2" fill="#777" />
                        {/* Pins */}
                        <g onClick={() => handlePin(10)} style={{ cursor: "pointer" }}>
                          <circle cx="150" cy="148" r="12" fill={selectedPin === 10 ? "#ff6221" : "#1a5fa8"} />
                          <text x="150" y="153" textAnchor="middle" fontSize="10" fill="white" fontWeight="700">10</text>
                        </g>
                        <g onClick={() => handlePin(11)} style={{ cursor: "pointer" }}>
                          <circle cx="150" cy="192" r="12" fill={selectedPin === 11 ? "#ff6221" : "#1a5fa8"} />
                          <text x="150" y="197" textAnchor="middle" fontSize="10" fill="white" fontWeight="700">11</text>
                        </g>
                        <g onClick={() => handlePin(12)} style={{ cursor: "pointer" }}>
                          <circle cx="236" cy="158" r="12" fill={selectedPin === 12 ? "#ff6221" : "#dc2626"} />
                          <text x="236" y="163" textAnchor="middle" fontSize="10" fill="white" fontWeight="700">12</text>
                        </g>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Tip */}
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Tip: Click any pin or legend item to view documentation requirements and claim notes.
                </p>

                {/* Damage type chips */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Common Damage Types (Examples)</p>
                  <div className="flex flex-wrap gap-2">
                    {DAMAGE_TYPES.map(d => (
                      <span key={d} className="px-3 py-1 rounded-full border border-border text-xs text-muted-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors">{d}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Pin Legend tab */}
            {activeTab === "legend" && (
              <div className="p-4 space-y-2">
                {Object.entries(PINS).map(([n, pin]) => (
                  <button key={n} onClick={() => { setSelectedPin(Number(n)); setActiveTab("diagram"); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left hover:bg-muted/40 ${selectedPin === Number(n) ? "border-primary bg-primary/5" : "border-border"}`}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: pin.severity === "critical" ? "#dc2626" : pin.severity === "covered" ? "#16a34a" : "#1a5fa8" }}>
                      {n}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{pin.name}</span>
                        {pin.severity === "critical" && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                        {pin.severity === "covered" && <span className="text-xs font-semibold text-green-600">PP Covered</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{pin.note}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Component Details tab */}
            {activeTab === "components" && (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {Object.entries(PARTS).map(([key, part]) => (
                    <button key={key} onClick={() => setSelectedPart(prev => prev === key ? null : key)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedPart === key ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"}`}>
                      {part.name}
                    </button>
                  ))}
                </div>
                {selectedPart && PARTS[selectedPart] && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">{PARTS[selectedPart].name}</h3>
                    <p className="text-sm text-muted-foreground">{PARTS[selectedPart].desc}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Common Damage</p>
                        <p className="text-xs">{PARTS[selectedPart].damage}</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Estimate Includes</p>
                        <p className="text-xs">{PARTS[selectedPart].estimate}</p>
                      </div>
                    </div>
                  </div>
                )}
                {!selectedPart && <p className="text-sm text-muted-foreground text-center py-6">Select a component above to view details.</p>}
              </div>
            )}

            {/* Documentation Guide tab */}
            {activeTab === "docguide" && (
              <div className="p-4 space-y-4">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Part / Damage</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">PP?</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">OEM?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PP_COVERAGE.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-sm">{row.part}</td>
                          <td className={`px-3 py-2 text-xs font-semibold ${row.ppClass}`}>{row.pp}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.oem}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Tesla Repair Requirements</h3>
                  <ul className="space-y-1.5">
                    {TESLA_REQUIREMENTS.map((req, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Middle: Pin Legend card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 h-fit">
            <h3 className="font-semibold text-sm">Pin Legend</h3>
            <div className="space-y-1.5">
              {Object.entries(PINS).map(([n, pin]) => (
                <button key={n} onClick={() => { setSelectedPin(Number(n)); setActiveTab("diagram"); }}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left hover:bg-muted/40 ${selectedPin === Number(n) ? "bg-primary/5" : ""}`}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: pin.severity === "critical" ? "#dc2626" : pin.severity === "covered" ? "#16a34a" : "#1a5fa8", fontSize: 10 }}>
                    {n}
                  </span>
                  <span className="text-xs flex-1">{pin.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Right: Quick Info + Resources */}
          <div className="space-y-4 h-fit">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Quick Info</h3>
              {[
                { icon: <Camera className="h-4 w-4 text-primary" />, title: "Click any numbered pin", desc: "View details, required documents, and guidance" },
                { icon: <FileText className="h-4 w-4 text-primary" />, title: "Document requirements", desc: "Vary by component and damage type" },
                { icon: <Info className="h-4 w-4 text-primary" />, title: "General Note", desc: "Only inspect areas related to the reported loss" },
              ].map((item, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-semibold text-sm">Helpful Resources</h3>
              {[
                "Photo Guidelines",
                "Damage Documentation Standards",
                "Estimate Requirements",
                "OEM Repair Standards",
                "ADAS Calibration Guide",
              ].map((r, i) => (
                <button key={i} className="w-full text-left text-xs text-primary hover:underline flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0" />{r}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex gap-2.5">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold">Need help?</p>
                  <p className="text-xs text-muted-foreground">Contact the Claims Team via the Open Assistant button.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
