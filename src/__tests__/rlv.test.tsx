import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { ViewerProvider, type ScreenId } from '../viewer/ViewerContext';
import { RLV_REDACTED, RlvProvider, type RlvRestriction } from '../viewer/RlvContext';
import { Shell } from '../components/Shell';

/**
 * RLV enforcement, per TPV_COMPLIANCE.md §4.
 *
 * The requirement is that the UI *prohibits* a restricted action, so these
 * assert on what actually reaches the document: restricted content must be
 * absent from the markup, not merely hidden from view.
 */

/** Applies a set of restrictions, then renders the shell at a screen. */
const Harness: React.FC<{ screen: ScreenId; restrictions: RlvRestriction[] }> = ({ screen, restrictions }) => (
  <ThemeProvider>
    <ViewerProvider initialScreen={screen}>
      {/* The restrictions are seeded up front: a server render runs once, so
          setting them from inside the tree would never take effect. */}
      <RlvProvider initialEnabled={restrictions.length > 0} initialRestrictions={restrictions}>
        <Shell />
      </RlvProvider>
    </ViewerProvider>
  </ThemeProvider>
);

function render(screen: ScreenId, restrictions: RlvRestriction[] = []): string {
  localStorage.setItem('linkpoint_theme', JSON.stringify({ layout: 'terminal', palette: 'ink', device: 'ios' }));
  return renderToString(<Harness screen={screen} restrictions={restrictions} />);
}

describe('RLV is inert until the resident turns it on', () => {
  it('enforces nothing by default', () => {
    // Restrictions are consensual, so an unconsenting resident is unaffected.
    expect(render('Inventory')).toContain('Filter 1,284 items');
    expect(render('Map')).toContain('Find a region by name');
  });
});

describe('@showinv closes the inventory', () => {
  it('does not render inventory contents at all', () => {
    const html = render('Inventory', ['showinv']);
    expect(html).toContain('RESTRICTED');
    expect(html).not.toContain('Filter 1,284 items');
    // The item names must not be sitting in the document waiting to be found.
    expect(html).not.toContain('Sunset Lamp v3');
  });
});

describe('@showworldmap closes the map', () => {
  it('does not render the map or its region list', () => {
    const html = render('Map', ['showworldmap']);
    expect(html).toContain('RESTRICTED');
    expect(html).not.toContain('Find a region by name');
    expect(html).not.toContain('secondlife://');
  });
});

describe('@showminimap closes the radar', () => {
  it('does not render nearby residents', () => {
    const html = render('Radar', ['showminimap']);
    expect(html).toContain('RESTRICTED');
    expect(html).not.toContain('Nyx Vaher');
  });
});

describe('@showloc censors location everywhere it appears', () => {
  it('redacts the region in the status strip', () => {
    const open = render('Chat');
    expect(open).toContain('Da Boom');

    const closed = render('Chat', ['showloc']);
    expect(closed).not.toContain('Da Boom');
    expect(closed).toContain(RLV_REDACTED);
  });

  it('redacts coordinates and real SLURLs on the teleport screen', () => {
    const open = render('Teleport');
    expect(open).toContain('secondlife://Bay%20City');

    const closed = render('Teleport', ['showloc']);
    // The input placeholder still shows the SLURL *format*, which discloses no
    // location; what must not survive is any real destination.
    expect(closed).not.toContain('secondlife://Bay%20City');
    expect(closed).not.toContain('secondlife://Da%20Boom');
    expect(closed).not.toContain('&lt;112, 44, 51&gt;');
  });

  it('redacts the location strip in the 3D view', () => {
    const closed = render('World', ['showloc']);
    expect(closed).not.toContain('Da Boom');
    expect(closed).toContain('location restricted');
  });
});

describe('@shownames censors who is nearby', () => {
  it('keeps the blips but drops the identities', () => {
    const open = render('Radar');
    expect(open).toContain('Nyx Vaher');

    const html = render('Radar', ['shownames']);
    expect(html).not.toContain('Nyx Vaher');
    expect(html).not.toContain('Kit Sandalwood');
    expect(html).toContain(RLV_REDACTED);
    // Distance and bearing survive: the restriction hides who is there, not
    // that someone is. The label is where both are stated together.
    expect(html).toContain('aria-label="(hidden), 8 metres NE"');
  });
});

describe('@sendchat and @sendim block composing', () => {
  it('disables the compose bar on local chat', () => {
    const html = render('Chat', ['sendchat']);
    expect(html).toContain('Restricted by RLV');
    expect(html).toContain('disabled');
  });
});

describe('@tplm and @tploc block teleporting', () => {
  it('removes the teleport action from landmarks', () => {
    // Count the action buttons, since "TELEPORT" is also the screen title.
    const buttons = (html: string) => (html.match(/<button[^>]*>TELEPORT<\/button>/g) ?? []).length;

    const open = render('Teleport');
    expect(buttons(open)).toBeGreaterThan(0);
    expect(open).toContain('GO HOME');

    const closed = render('Teleport', ['tplm']);
    // SHOW ON MAP and SET HOME HERE survive; the teleport actions do not.
    expect(buttons(closed)).toBe(0);
    expect(closed).not.toContain('GO HOME');
    expect(closed).toContain('SHOW ON MAP');
  });

  it('disables the SLURL destination box', () => {
    const html = render('Teleport', ['tploc']);
    expect(html).toContain('Restricted by RLV');
  });
});

describe('@detach locks worn attachments', () => {
  it('removes the close control from a worn HUD', () => {
    const open = render('World');
    expect(open).toContain('Hide ZHAO II');

    const closed = render('World', ['detach']);
    expect(closed).not.toContain('Hide ZHAO II');
  });
});

describe('restrictions can never trap the resident', () => {
  it('leaves Settings reachable under every restriction at once', () => {
    const all: RlvRestriction[] = [
      'detach',
      'showloc',
      'shownames',
      'sendchat',
      'sendim',
      'tplm',
      'tploc',
      'showinv',
      'showworldmap',
      'showminimap',
    ];
    const html = render('Settings', all);
    expect(html).toContain('Layout pack');
    expect(html).not.toContain('RESTRICTED');
  });
});
