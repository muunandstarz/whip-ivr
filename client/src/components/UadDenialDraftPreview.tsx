import { UAD_FOOTER, UAD_HEADER, uadDenialContent, validateUadDenialFields, type UadDenialFields } from "@shared/uadDenial";

export default function UadDenialDraftPreview({ fields, logoBase64 }: { fields: UadDenialFields; logoBase64: string }) {
  const content = uadDenialContent(fields);
  const partial = validateUadDenialFields(fields).length > 0;
  return <div className="bg-white text-black p-4 max-h-[600px] overflow-y-auto">
    <p role="status" className="text-xs text-slate-500 mb-4 print:hidden">{partial ? "Partial draft — unresolved fields are marked with placeholders." : "Current draft — all required fields are filled."} Click Preview for the current A4 layout.</p>
    <article aria-label="Unauthorized Driver denial current draft" className="px-5 py-3 text-[11px] leading-[1.65] font-sans font-normal break-words">
      <header className="flex items-start justify-between gap-4 pb-5 border-b border-gray-300 mb-3">
        <img src={`data:image/png;base64,${logoBase64}`} alt="Whip" className="w-[62px] h-[41px] object-contain" />
        <div className="text-right leading-tight text-[9px] text-gray-500"><p className="font-semibold text-black text-[10px]">{UAD_HEADER[0]}</p><p>{UAD_HEADER[1]}</p><p>{UAD_HEADER[2]}</p></div>
      </header>
      <p className="mb-3">{content.letterDate}</p>
      <div className="mb-3 whitespace-pre-wrap">{content.recipient.map((line, index) => <p key={index}>{line}</p>)}</div>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 leading-snug mb-5">{content.identity.map(([label, value]) => <div key={label} className="contents"><dt className="text-gray-500">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
      <p className="mb-3">{content.salutation}</p>
      {content.paragraphs.map((paragraph, index) => paragraph.quote
        ? <blockquote key={index} className="italic ml-7 mb-2 whitespace-pre-wrap">{paragraph.text}</blockquote>
        : <p key={index} className="mb-3 whitespace-pre-wrap">{paragraph.text}</p>)}
      <p className="mb-3">{content.signature[0]}</p>
      <div className="whitespace-pre-wrap">{content.signature.slice(1).map((line, index) => <p key={index}>{line}</p>)}</div>
      <footer className="text-center text-gray-500 text-[8px] border-t border-gray-300 mt-10 pt-2">{UAD_FOOTER}</footer>
    </article>
  </div>;
}
