# Vehicle Anatomy implementation notes

## Sources reviewed

- Source HTML: `/home/ubuntu/upload/index(7).html`
- Extracted vehicle section: `/tmp/vehicle_section.html`
- Extracted parts object: `/tmp/parts.js`
- Mockup screenshot: `/home/ubuntu/upload/Screenshot2026-08-04at12.30.28PM.png`

## Mockup findings

- Page title: **Vehicle Anatomy**
- Subtitle: identify damage locations and required documentation; click numbered pin or legend item for details and claim guidance.
- Top-right control card: **Vehicle Selector** with Year, Make, Model dropdowns and Reset action.
- Warning banner under header: **Under Construction** message about refined diagram pins and using Pin Legend + side panels.
- Main content uses a three-column layout:
  - Left: large tabbed card with **Diagram / Pin Legend / Component Details / Documentation Guide** tabs.
  - Middle/right: dedicated **Pin Legend** card listing 12 numbered items.
  - Far right: stacked utility cards for **Quick Info**, **Helpful Resources**, and **Need help?**.
- Diagram card includes toggle for **Show Labels** and fullscreen icon.
- Diagram uses three views of a white Tesla Model 3: **side**, **front**, and **rear** with orange numbered pins.
- Bottom section includes **Common Damage Types (Examples)** chips: Collision, Vandalism, Weather, Wear & Tear, Glass Damage, Mechanical, Other.

## Source HTML findings

- Existing source page id is `page-vehicle`.
- Source includes a three-view Tesla Model 3 SVG and a pin-based legend.
- Existing source includes PP coverage quick reference and Tesla repair requirements.

## Pin legend entries from source

1. Roof / Panoramic Glass — PP covered; $1,000 cap; ADAS calibration required
2. Rear Quarter / Trunk Lid — welded panel; AIM camera; full assembly replacement
3. Doors / Sides / Pillars — A/B pillar structural; side camera calibration
4. Front Bumper / Hood / Frunk — OEM required; sensor integration; 3-stage paint
5. Rear Bumper / Trunk Lid — OEM required; AIM camera; backup camera; 3-stage paint
6. Battery Pack (HV) — critical; any undercarriage impact requires Tesla certified assessment
7. Windshield / Glass — PP covered; $1,000 cap; ADAS calibration required
8. Headlight Assembly — OEM only; $900–$1,400 each; Toolbox calibration required
9. Front Bumper Sensors / Autopilot — ADAS calibration required after any front repair
10. Tail Lamp Assembly — full-width LED bar; both assemblies replaced together
11. Rear Bumper / Parking Sensors — OEM required; license plate; sensor calibration
12. Charge Port — drive-off while charging is member negligence; not PP covered

## Component data captured from `PARTS`

- front-bumper
- rear-bumper
- hood
- trunk
- windshield
- rear-window
- front-left-fender
- front-right-fender
- rear-left-qp
- rear-right-qp
- driver-door
- rear-driver-door
- passenger-door
- rear-passenger-door

Each part includes:

- name
- desc
- damage
- estimate

## Additional content from source page

- PP Coverage Quick Reference table rows include bumper cover, trunk lid / hood / doors, structural pillars, windshield / glass, scratches / cosmetic, rim / wheel damage, interior damage, battery pack, and tires.
- Tesla Repair Requirements list includes:
  - Tesla Certified Collision Center only
  - Tesla Toolbox Connect required
  - HV battery activation/deactivation labor
  - ADAS / camera calibration after glass, mirror, or front/rear work
  - 3-stage pearl white paint add-on
  - OEM parts only
  - non-certified shop is a rebuttal point

## Implementation target

- Recreate the screenshot structure in React using Whip styling.
- Prefer a modern tabbed layout that preserves the source data while matching the mockup hierarchy.
- Use orange pins and a clean light-background diagram card.
- Ensure legend click and diagram click both drive the same selected-detail panel.
