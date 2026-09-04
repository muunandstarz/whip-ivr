import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Claims Workspace navigation and floating panel', () => {
  const layout = fs.readFileSync(path.resolve(process.cwd(), 'client/src/components/WhipLayout.tsx'), 'utf8');
  const floating = fs.readFileSync(path.resolve(process.cwd(), 'client/src/components/FloatingClaimsWorkspace.tsx'), 'utf8');

  it('includes Claims Workspace in both the administrator and handler-side navigation definitions', () => {
    expect(layout.match(/href: "\/claims-workspace", label: "Claims Workspace"/g)).toHaveLength(2);
  });

  it('provides a labelled pointer-drag control and persists the user-selected panel position', () => {
    expect(floating).toContain('aria-label="Move Claims Workspace panel"');
    expect(floating).toContain('onPointerDown={startDrag}');
    expect(floating).toContain('onPointerMove={moveDrag}');
    expect(floating).toContain('whip.claimsWorkspace.floatingOffset');
  });

  it('allows the collapsed floating workpad to be moved or closed and reopened from the sidebar', () => {
    expect(floating).toContain('aria-label="Move Claims Workspace bubble"');
    expect(floating).toContain('aria-label="Close Claims Workspace"');
    expect(floating).toContain('whip.claimsWorkspace.floatingDismissed');
    expect(floating).toContain('reopen from the sidebar');
  });
});
