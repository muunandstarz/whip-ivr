// Canonical Whip Claims IVR extension directory. This is safe display/contact
// metadata shared by the authenticated handler API and document forms; it does
// not place calls or invoke Aircall.
export type HandlerExtensionDirectoryEntry = {
  aircallUserId: number;
  extension: string;
  names: readonly string[];
};

export const HANDLER_EXTENSION_DIRECTORY: readonly HandlerExtensionDirectoryEntry[] = [
  { aircallUserId: 1794311, extension: "012", names: ["Ana Padilla"] },
  { aircallUserId: 1774596, extension: "175", names: ["Bennet Carlos"] },
  { aircallUserId: 1756923, extension: "325", names: ["Carlito Legarde Jr", "Carlito Legarde Jr.", "Carlito Legarde"] },
  { aircallUserId: 1756924, extension: "326", names: ["Natashia Edulan"] },
  { aircallUserId: 1763684, extension: "011", names: ["Demily Flores", "D'emily", "D'emily Flores"] },
  { aircallUserId: 1827146, extension: "017", names: ["Daryl Ochate"] },
  { aircallUserId: 1836484, extension: "018", names: ["Jovel Villa"] },
  { aircallUserId: 1836944, extension: "019", names: ["Annie Ortiz"] },
  { aircallUserId: 1871743, extension: "040", names: ["Lorraine Tria"] },
  { aircallUserId: 1874373, extension: "041", names: ["Mary Joy Badua", "MJ Badua"] },
  { aircallUserId: 1881559, extension: "309", names: ["Jayla Bernard"] },
  { aircallUserId: 1924606, extension: "048", names: ["Daniel Giono"] },
  { aircallUserId: 1940186, extension: "028", names: ["Tim Chan"] },
  { aircallUserId: 1947062, extension: "996", names: ["Geovanni Cabrera", "Giovanni Cabrera"] },
] as const;

export const AGENT_EXTENSIONS: Record<number, string> = Object.fromEntries(
  HANDLER_EXTENSION_DIRECTORY.map(({ aircallUserId, extension }) => [aircallUserId, extension]),
) as Record<number, string>;

function normalizeHandlerName(name: string | null | undefined) {
  return (name ?? "").trim().toLocaleLowerCase();
}

const HANDLER_EXTENSIONS_BY_NAME: Record<string, string> = Object.fromEntries(
  HANDLER_EXTENSION_DIRECTORY.flatMap(({ names, extension }) =>
    names.map((name) => [normalizeHandlerName(name), extension] as const),
  ),
);

/** Resolves an IVR extension when a legacy handler row has no stored Aircall ID. */
export function getHandlerExtension(name: string | null | undefined): string | null {
  return HANDLER_EXTENSIONS_BY_NAME[normalizeHandlerName(name)] ?? null;
}
