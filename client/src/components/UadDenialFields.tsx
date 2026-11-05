import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UAD_ADVISORY, UAD_FIELD_META, type UadDenialField, type UadDenialFields } from "@shared/uadDenial";

export default function UadDenialFields({ fields, onChange }: {
  fields: UadDenialFields;
  onChange: (key: UadDenialField, value: string) => void;
}) {
  return <section className="space-y-4" aria-label="Unauthorized Driver denial inputs">
    <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed print:hidden" role="note">{UAD_ADVISORY}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {UAD_FIELD_META.map(meta => {
        const id = `uad-${meta.key}`;
        const required = !("optional" in meta);
        const common = {
          id, name: meta.key, value: fields[meta.key],
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(meta.key, event.target.value),
          autoComplete: "off", "aria-required": required,
          placeholder: "type" in meta ? undefined : `{{${meta.key}}}`,
        };
        return <div key={meta.key} className={`space-y-1 ${"multiline" in meta ? "md:col-span-2" : ""}`}>
          <Label htmlFor={id} className="text-xs font-semibold text-foreground/80">{meta.label}{required && <span aria-hidden="true" className="text-[#ff6221] ml-0.5">*</span>}</Label>
          {"multiline" in meta
            ? <Textarea {...common} rows={meta.key === "claimant_address" ? 3 : 2} className="text-sm resize-y" />
            : <Input {...common} type={"type" in meta ? meta.type : "text"} className="text-sm h-8" />}
        </div>;
      })}
    </div>
    <p className="text-xs text-muted-foreground print:hidden">Required fields are marked *. Company is optional and its line is omitted when blank. Preview accepts partial drafts with visible placeholders; final download requires all required fields. Letter dates print in Month Day, Year format. Inputs only are saved through Save Draft; completed PDFs are not stored.</p>
  </section>;
}
