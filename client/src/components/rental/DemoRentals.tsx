import { useEffect, useRef, useState } from "react";
import { Card } from "./Controls";
import { FuelGauge } from "./FuelGauge";
import type { RentalDraft } from "@shared/rentalHandoff";
type FuelLevel = RentalDraft["fuelOut"];
import "./DemoRentals.css";

type Scenario = "pending" | "completed";
type Section = "Details" | "Pickup" | "Protection" | "Signatures" | "Return" | "Packets";
const views = [
  ["Front", "/manus-storage/front_0f4c3ab4.png"],
  ["Rear", "/manus-storage/rear_d62d6ac4.png"],
  ["Driver side", "/manus-storage/driver_0b8490b1.png"],
  ["Passenger side", "/manus-storage/passenger_5509d6f2.png"],
  ["Front driver corner", "/manus-storage/cornerFrontDriver_daadfe5b.png"],
  ["Front passenger corner", "/manus-storage/cornerFrontPassenger_b2f0dd11.png"],
  ["Rear driver corner", "/manus-storage/cornerRearDriver_abe77a0b.png"],
  ["Rear passenger corner", "/manus-storage/cornerRearPassenger_c0159e19.png"],
  ["Windshield", "/manus-storage/windshield_42f2da1c.png"],
  ["VIN plate", "/manus-storage/vinPlate_4b0430ff.png"],
] as const;
const packets = [
  ["Pickup packet — renter-safe sample", "/manus-storage/Pickup_Rental_Packet_Compact_Sample_bda3fdb3.pdf"],
  ["Return packet — renter-safe sample", "/manus-storage/Return_Rental_Packet_Compact_Sample_13cf216d.pdf"],
  ["Claims review — separate fictional private appendix", "/manus-storage/Claims_Rental_Review_Compact_Sample_d7b3990c.pdf"],
  ["Original-layout agreement — minimal additions review", "/manus-storage/MetroCars_Original_Layout_Minimal_Additions_Review_fb82798e.pdf"],
] as const;
function Facts({ values }: { values: [string, string][] }) {
  return <dl className="r-demo-facts">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

/** Fictional fixtures, deliberately outside operational records and API mutations.
 * No upload, save, completion, settlement, resend, Gmail or SMS endpoint is called.
 */
export function DemoRentals() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [section, setSection] = useState<Section>("Details");
  const [pickupSimulated, setPickupSimulated] = useState(false);
  const [fuel, setFuel] = useState<FuelLevel>("Full");
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ title: string; url: string } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const reset = () => { setScenario(null); setPickupSimulated(false); setFuel("Full"); setPreview(null); setSection("Details"); };
  useEffect(() => {
    if (!expanded) return;
    close.current?.focus();
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(null); if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); } };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); trigger.current?.focus(); };
  }, [expanded]);
  const complete = scenario === "completed";
  const pickedUp = complete || pickupSimulated;
  const gallery = (phase: "Pickup" | "Return") => <>
    <p className="r-guidance">Eleven dedicated views. Click to enlarge. These are fictional illustrations; exterior images are reused for the return demonstration, not claimed to be actual return evidence.</p>
    <div className="r-demo-gallery">{[...views, ["Dashboard / instrument cluster", phase === "Pickup" ? "/manus-storage/dashboard_090ac8d5.png" : "/manus-storage/return-dashboard_565e0ecc.png"]].map(([title, url]) => <button type="button" key={title} aria-label={`Enlarge ${phase.toLowerCase()} ${title.toLowerCase()}`} onClick={e => { trigger.current = e.currentTarget; setExpanded({ title: `${phase} · ${title} · fictional illustration`, url }); }}><img src={url} alt={`${phase} fictional ${title} illustration`} loading="lazy" /><span>{title}</span></button>)}</div>
  </>;
  return <>
    <div className="r-page-heading"><div><p className="r-eyebrow">SAFE WALKTHROUGHS</p><h1>Demo rentals</h1><p>Two review scenarios, separate from the live rental queue.</p></div>{scenario && <button className="r-button" type="button" onClick={reset}>Back to demo rentals</button>}</div>
    <div className="r-demo-banner" role="note"><strong>DEMO / FICTIONAL — no real rental, coverage, signature or payment.</strong><p>Nothing here can email, text, charge a card, reserve inventory or change a live record. Resetting affects only this browser view. The simulated completed timeline is not evidence that an appointment occurred.</p></div>
    {!scenario ? <div className="r-demo-cards">
      <Card title="Avery Demo" detail="Claims setup complete · awaiting Total Recon pickup"><p>Rockville · scheduled for November 12 at 10:00 AM Eastern. The shop still needs to assign the rental, verify insurance, capture pickup evidence and obtain signatures.</p><button className="r-button r-primary" type="button" onClick={() => { setScenario("pending"); setSection("Details"); }}>Open awaiting-pickup demo</button></Card>
      <Card title="Jordan Taylor" detail="Simulated completed rental · pickup through return"><p>Full example with eleven pickup views, eleven return views, 124 miles driven and pickup/return sample PDFs.</p><button className="r-button r-primary" type="button" onClick={() => { setScenario("completed"); setSection("Details"); }}>Open completed demo</button></Card>
    </div> : <>
      <Card title={complete ? "Jordan Taylor · simulated completed rental" : "Avery Demo · Claims prepared"} detail={complete ? "DEMO-RENTAL-001 · illustrated end-to-end record" : pickupSimulated ? "DEMO-PENDING-002 · pickup simulated locally" : "DEMO-PENDING-002 · waiting for Total Recon"}>
        <nav className="r-demo-sections" aria-label="Demo rental steps">{(["Details", "Pickup", "Protection", "Signatures", "Return", "Packets"] as Section[]).map(name => <button className={`r-chip ${section === name ? "r-chip-active" : ""}`} key={name} type="button" aria-current={section === name ? "step" : undefined} onClick={() => { setSection(name); setPreview(null); }}>{name}</button>)}</nav>
        {section === "Details" && <>
          <Facts values={complete ? [["Renter", "Jordan Taylor — fictional"], ["Mobile", "202-555-0110 — reserved sample number"], ["Renter email", "jordan@example.invalid"], ["Claim email", "claims@example.invalid"], ["Claim", "DEMO-RENTAL-001"], ["Scenario location", "Demo Shop · 100 Demo Way, Demo City, MD 00000"], ["Scenario phone", "202-555-0112 — not a real shop"], ["Scenario pickup", "November 10, 2026 · 15:00 UTC"], ["Simulated return", "November 13, 2026 · 15:00 UTC"], ["Claimant vehicle", "2020 Demo Sedan · DEMA00000LA000002"], ["Rental vehicle", "2023 Camry · DEMA00000PA000001 · DEMO / MD"], ["Settlement", "Completed workflow illustration only; no payment or claim settlement recorded"]] : [["Renter", "Avery Demo — fictional"], ["Mobile", "202-555-0111 — reserved sample number"], ["Renter email", "avery@example.invalid"], ["Claim email", "claim-demo@example.invalid"], ["Appointment", "November 12, 2026 · 10:00 AM Eastern"], ["Location", "Total Recon — Rockville"], ["Address", "627 Southlawn Lane, Rockville, MD 20850"], ["Location phone", "(301) 762-2195"], ["Expected return", "November 15, 2026 · 10:00 AM Eastern"], ["Claimant vehicle", "2021 Demo Sedan · DEMA00000MA000003"], ["Rental vehicle", pickedUp ? "Demo Camry — locally simulated assignment" : "To be assigned at pickup by Total Recon"], ["Claims status", "Setup saved; handoff is not signed or completed"]]} />
          <p className="r-guidance">The completed scenario uses the same fictional Demo Shop facts as its PDFs. The pending scenario demonstrates the actual Rockville address used in reminders.</p>
          {!complete && <button className="r-button r-primary" type="button" onClick={() => setSection("Pickup")}>Walk through Total Recon pickup</button>}
        </>}
        {section === "Pickup" && <>
          <Facts values={[["Assigned vehicle", pickedUp ? "2023 Demo Camry · fictional VIN DEMA00000PA000001" : "Shop assignment pending"], ["Pickup odometer", pickedUp ? "42,610 miles" : "Must be measured at pickup"], ["Keys", pickedUp ? "2 fobs (sample)" : "Shop must record the count"], ["Dashboard", pickedUp ? "Dedicated illustration present; alerts are not automatically interpreted" : "Required parked / ignition-on instrument-cluster photo"]]} />
          <FuelGauge label="Demo pickup fuel level" value={fuel} onChange={setFuel} disabled={complete} />
          {!complete && !pickupSimulated && <><p className="r-guidance">Live pickup requires shop assignment, all eleven photos, measured mileage, verified protection, initials and new signatures. This button loads a fictional example only—it does not bypass those live gates.</p><button className="r-button r-primary" type="button" onClick={() => { setPickupSimulated(true); setFuel("Full"); }}>Load simulated pickup evidence</button></>}
          {pickedUp && gallery("Pickup")}
        </>}
        {section === "Protection" && <>
          <Facts values={[["Sample election", "Option A · $20 per day"], ["Sample insurance", "Liability-only · Demo Harbor · DEMO-AUTO-001"], ["Comprehensive / collision", "Not provided in this fictional scenario"], ["Deductible", "Not applicable"], ["Verification", complete ? "No actual insurer verification asserted; illustration only" : "Total Recon must confirm the actual policy before a live handoff"], ["Protection charge", "$20 × 3 days = $60"], ["Security hold", "$50 separately; not a payment or deductible"], ["Additional drivers", "None"]]} />
          <p className="r-guidance">The ordinary pickup/return packet excludes driver-license images. A separate fictional Claims-review appendix demonstrates the private-record boundary. The original-layout Maryland additions review is available under Packets but is not an issued or signed contract.</p>
        </>}
        {section === "Signatures" && <>
          <Facts values={[["Renter signature", pickedUp ? "Fictional sample only; not a real signature" : "Pending at pickup"], ["Representative", pickedUp ? "Demo Agent — fictional" : "Pending Total Recon representative"], ["Initials", pickedUp ? "JT in the completed sample PDF" : "Pending renter review"], ["Driver license front", pickedUp ? "Fictional private fact card; not valid identification" : "Required capture at pickup"], ["Driver license back", pickedUp ? "Fictional private fact card; not valid identification" : "Required capture at pickup"]]} />
          <p className="r-guidance">If a live agreement's material details change, signatures must be collected again. No demo action records an attestation or signed evidence.</p>
        </>}
        {section === "Return" && (complete ? <>
          <Facts values={[["Pickup odometer", "42,610 miles"], ["Return odometer", "42,734 miles"], ["Miles driven", "124 miles"], ["Return keys", "2 fobs"], ["Condition", "No damage claim in the fictional example"], ["Dashboard notes", "No warning observations recorded; review illustration only"], ["Return signatures", "Fictional renter and Demo Agent samples"], ["Rental charge", "$60 optional protection; $50 hold shown separately"], ["Completion", "Simulated completed review; no transaction, live settlement or closure action"]]} />
          <FuelGauge label="Demo return fuel level" value="3/4" onChange={() => {}} disabled />{gallery("Return")}
        </> : <p className="r-guidance">This scenario is waiting for pickup{pickupSimulated ? " (pickup evidence has been simulated only)" : ""}. No return reading, return photos or return signatures are pre-filled as measured facts. Open the completed demo to inspect the full return record.</p>)}
        {section === "Packets" && <>
          <p className="r-guidance">Watermarked example PDFs—not emailed documents. The completed sample is an illustrative return review, not evidence of a card payment or operational closure. Its source dates and Demo Shop facts match the Details view. The original-layout additions review is a separate proposed version, not the earlier signed-style sample agreement.</p>
          <div className="r-demo-documents">{packets.filter((_, i) => complete || i === 3).map(([title, url]) => <div key={url}><strong>{title}</strong><div className="r-actions"><button className="r-button" type="button" onClick={() => setPreview(url)}>Preview</button><a className="r-button" href={url} target="_blank" rel="noopener noreferrer">Open PDF</a><a className="r-button" href={url} download>Download sample</a></div></div>)}</div>
          {!complete && <p className="r-guidance">A live awaiting-pickup rental has no completed pickup packet yet. Only the leadership agreement draft is available for this pending scenario.</p>}
          {preview && <iframe className="r-demo-pdf" title="Fictional rental packet PDF preview" src={preview} />}
        </>}
      </Card>
    </>}
    {expanded && <div className="r-demo-modal" role="dialog" aria-modal="true" aria-label={expanded.title} onClick={e => { if (e.target === e.currentTarget) setExpanded(null); }}><div><div className="r-demo-modal-heading"><strong>{expanded.title}</strong><button ref={close} className="r-button" type="button" onClick={() => setExpanded(null)}>Close image</button></div><img src={expanded.url} alt={expanded.title} /></div></div>}
  </>;
}
