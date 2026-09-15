import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(path.resolve(process.cwd(), "client/public/klutch-policy-declarations.html"), "utf8");

function runRentalCalculation({
  state,
  issued,
  stillInRental,
  lastRental,
  today,
}: {
  state: string;
  issued: string;
  stillInRental: boolean;
  lastRental?: string;
  today: string;
}) {
  const fields = new Map<string, { value: string; checked?: boolean; textContent?: string; classList: { add: (name: string) => void; remove: (name: string) => void } }>();
  const field = (value = "", checked = false) => {
    const classes = new Set<string>();
    return {
      value,
      checked,
      textContent: "",
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
    };
  };
  fields.set("f_market", field(state));
  fields.set("f_eff", field(issued));
  fields.set("f_last_rental", field(lastRental ?? ""));
  fields.set("f_still_rental", field("", stillInRental));
  fields.set("f_exp", field());
  fields.set("rentalHelper", field());

  const scriptStart = html.indexOf("function fmtDate(val)");
  const scriptEnd = html.indexOf("function calcWeeks()", scriptStart);
  const calculatorStart = html.indexOf("function localDate(value)");
  const calculatorEnd = html.indexOf("function calcWeeks()", calculatorStart);
  const FakeDate = class extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(...(args.length ? args : [`${today}T00:00:00`] as unknown as ConstructorParameters<typeof Date>));
    }
  };
  const context = {
    Date: FakeDate,
    document: { getElementById: (id: string) => fields.get(id) },
    calcWeeks: () => undefined,
    applyAll: () => undefined,
  };
  vm.runInNewContext(`${html.slice(scriptStart, scriptEnd)}${html.slice(calculatorStart, calculatorEnd)}`, context);
  vm.runInNewContext("updateRentalExpiration()", context);
  return fields;
}

describe("approved Klutch Policy Declarations HTML", () => {
  it("preserves the approved HTML layout and adds the rental calculator only to the non-printing filler", () => {
    expect(html).toContain('<div class="filler" id="fillerPanel">');
    expect(html).toContain('.no-print, .filler { display: none !important; }');
    expect(html).toContain('id="f_still_rental"');
    expect(html).toContain('id="f_last_rental"');
    expect(html).toContain('function updateRentalExpiration()');
  });

  it("uses one issued and subscription-start date, keeps only supported markets, and identifies Klutch by NAIC", () => {
    expect(html).toContain('Date Issued / Subscription Start Date (Pick-Up Date)');
    expect(html).not.toContain('id="f_issued"');
    expect(html).not.toContain('NJ — New Jersey');
    expect(html).toContain('NAIC 17966');
  });

  it("applies the Maryland 30-day and non-Maryland 12-month terms before weekly renewal", () => {
    expect(html).toContain('state === "MD" ? addCalendarDays(issued, 30) : addCalendarMonths(issued, 12)');
    expect(html).toContain('var renewalWeeks = Math.ceil(elapsedDays / 7);');
    expect(html).toContain('expiration.value = isoDate(expirationDate);');
    expect(html).toContain('if (today < issued)');
  });

  it("calculates the approved HTML’s coverage expiration with the same calendar-date rules as the COI", () => {
    expect(runRentalCalculation({ state: "MD", issued: "2026-05-01", stillInRental: true, today: "2026-08-06" }).get("f_exp")?.value).toBe("2026-08-09");
    expect(runRentalCalculation({ state: "MD", issued: "2026-05-01", stillInRental: true, today: "2026-05-20" }).get("f_exp")?.value).toBe("2026-05-31");
    expect(runRentalCalculation({ state: "GA", issued: "2026-05-01", stillInRental: true, today: "2026-08-06" }).get("f_exp")?.value).toBe("2027-05-01");
    expect(runRentalCalculation({ state: "MD", issued: "2026-05-01", lastRental: "2026-06-05", stillInRental: false, today: "2026-08-06" }).get("f_exp")?.value).toBe("2026-06-05");
  });
});
