import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import GroupAdminFloater from '../GroupAdminFloater.jsx';
import { GroupsScreen } from '../../screens/LiveScreens.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';
import { GROUP_POWERS } from '../../linkpoint/services/group-admin-capability-service';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: any } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

function setInputValue(input: HTMLElement | null, value: string) {
  if (!input) return;
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;
  }
  vi.restoreAllMocks();
});

describe('GroupAdminFloater Component', () => {
  const testGroupId = '00000000-0000-0000-0000-000000000001';
  const testGroup = {
    id: testGroupId,
    name: 'Metropolis Architects',
    charter: 'Building the metaverse',
  };

  let mockAdminService: any;

  beforeEach(() => {
    app.groups.replaceGroups([testGroup]);
    app.groups.replaceRoles(testGroupId, [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Everyone',
        title: 'Resident',
        description: 'Base role for all group members',
        powers: '0',
      },
      {
        id: 'role-officer-id',
        name: 'Officers',
        title: 'Officer',
        description: 'Moderation and management staff',
        powers: GROUP_POWERS.MEMBER_INVITE.bit.toString(),
      },
    ]);
    app.groups.replaceMembers(testGroupId, [
      {
        id: 'resident-alice',
        name: 'Alice Resident',
        title: 'Officer',
        onlineStatus: 'Online',
        roleIds: ['role-officer-id'],
      },
      {
        id: 'resident-bob',
        name: 'Bob Builder',
        title: 'Resident',
        onlineStatus: 'Offline',
        roleIds: [],
      },
    ]);

    mockAdminService = {
      createRole: vi.fn().mockResolvedValue({ success: true }),
      updateRole: vi.fn().mockResolvedValue({ success: true }),
      deleteRole: vi.fn().mockResolvedValue({ success: true }),
      assignMemberRoles: vi.fn().mockResolvedValue({ success: true }),
      ejectMember: vi.fn().mockResolvedValue({ success: true }),
      inviteMember: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
  });

  it('renders the floater dialog with header, tabs, and group details', async () => {
    const onClose = vi.fn();
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose,
        adminService: mockAdminService,
      }),
    );

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(host.textContent).toContain('Group Administration: Metropolis Architects');
    expect(host.textContent).toContain('ROLES');
    expect(host.textContent).toContain('MEMBERS');
    expect(host.textContent).toContain('INVITATIONS');
  });

  it('switches between tabs when tab buttons are clicked', async () => {
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    // Initial tab is ROLES
    expect(host.textContent).toContain('ROLE POWERS (BITMASK PERMISSIONS)');

    // Switch to MEMBERS tab
    const membersTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'MEMBERS',
    ) as HTMLElement | undefined;
    expect(membersTabBtn).toBeTruthy();

    await act(async () => {
      membersTabBtn?.click();
    });

    expect(host.textContent).toContain('Alice Resident');
    expect(host.textContent).toContain('ASSIGNED ROLES');

    // Switch to INVITATIONS tab
    const invitesTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'INVITATIONS',
    ) as HTMLElement | undefined;
    expect(invitesTabBtn).toBeTruthy();

    await act(async () => {
      invitesTabBtn?.click();
    });

    expect(host.textContent).toContain('Send Group Invitation');
  });

  it('allows editing role permissions bitmasks and calls updateRole on Apply Changes', async () => {
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    // Select Officers role
    const officerRoleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Officers'),
    ) as HTMLElement | undefined;
    expect(officerRoleBtn).toBeTruthy();

    await act(async () => {
      officerRoleBtn?.click();
    });

    // Check title input
    const titleInput = host.querySelector('input[placeholder="e.g. Officer"]');
    expect(titleInput).toBeTruthy();

    await act(async () => {
      setInputValue(titleInput as HTMLElement, 'Senior Officer');
    });

    // Toggle a power checkbox (e.g. Eject Members)
    const ejectCheckbox = Array.from(host.querySelectorAll('label'))
      .find((l) => l.textContent?.includes('Eject Members'))
      ?.querySelector('input[type="checkbox"]') as HTMLElement | null;

    expect(ejectCheckbox).toBeTruthy();

    await act(async () => {
      ejectCheckbox?.click();
    });

    // Submit Apply Changes
    const submitBtn = host.querySelector('button[type="submit"]') as HTMLElement | null;
    expect(submitBtn?.textContent).toContain('Apply Changes');

    await act(async () => {
      submitBtn?.click();
    });

    expect(mockAdminService.updateRole).toHaveBeenCalledWith(
      testGroupId,
      'role-officer-id',
      expect.objectContaining({
        title: 'Senior Officer',
      }),
    );
  });

  it('creates a new role when Create Role button is used', async () => {
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const createBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Role'),
    ) as HTMLElement | undefined;
    expect(createBtn).toBeTruthy();

    await act(async () => {
      createBtn?.click();
    });

    expect(host.textContent).toContain('New Role Configuration');

    const nameInput = host.querySelector('input[placeholder="e.g. Officers"]');
    expect(nameInput).toBeTruthy();

    await act(async () => {
      setInputValue(nameInput as HTMLElement, 'Event Coordinators');
    });

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLElement | null;
    expect(submitBtn?.textContent).toContain('Create Role');

    await act(async () => {
      submitBtn?.click();
    });

    expect(mockAdminService.createRole).toHaveBeenCalledWith(
      testGroupId,
      expect.objectContaining({
        name: 'Event Coordinators',
      }),
    );
  });

  it('manages member role assignments and member ejection with confirmation', async () => {
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    // Switch to MEMBERS tab
    const membersTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'MEMBERS',
    ) as HTMLElement | undefined;
    await act(async () => {
      membersTabBtn?.click();
    });

    // Select Alice
    const aliceBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Alice Resident'),
    ) as HTMLElement | undefined;
    await act(async () => {
      aliceBtn?.click();
    });

    // Save role assignments
    const saveRolesBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Role Assignments'),
    ) as HTMLElement | undefined;
    expect(saveRolesBtn).toBeTruthy();

    await act(async () => {
      saveRolesBtn?.click();
    });

    expect(mockAdminService.assignMemberRoles).toHaveBeenCalledWith(
      testGroupId,
      'resident-alice',
      expect.any(Array),
    );

    // Click Eject Member
    const ejectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Eject Member'),
    ) as HTMLElement | undefined;
    expect(ejectBtn).toBeTruthy();

    await act(async () => {
      ejectBtn?.click();
    });

    // Confirmation prompt appears
    expect(host.textContent).toContain('Confirm Ejection');
    expect(host.textContent).toContain('Are you sure you want to eject');

    const confirmEjectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Eject'),
    ) as HTMLElement | undefined;
    expect(confirmEjectBtn).toBeTruthy();

    await act(async () => {
      confirmEjectBtn?.click();
    });

    expect(mockAdminService.ejectMember).toHaveBeenCalledWith(
      testGroupId,
      'resident-alice',
      expect.any(Object),
    );
  });

  it('supports touch dismiss and close button', async () => {
    const onClose = vi.fn();
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose,
        adminService: mockAdminService,
      }),
    );

    const closeBtn = host.querySelector('button[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      (closeBtn as HTMLElement)?.click();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('opens floater when Manage Group button in LiveScreens is clicked', async () => {
    vi.spyOn(app, 'loadGroups').mockResolvedValue([testGroup]);
    vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});

    // Mount GroupsScreen
    const host = await mount(createElement(GroupsScreen));

    // Look for Manage Group button
    const manageBtn = host.querySelector('button[aria-label="Manage Group"]');
    expect(manageBtn).toBeTruthy();
    expect(manageBtn?.textContent).toContain('MANAGE GROUP');

    // Floater is not open initially
    expect(host.querySelector('[aria-label="Group Administration Floater"]')).toBeNull();

    // Click MANAGE GROUP button
    await act(async () => {
      (manageBtn as HTMLElement)?.click();
    });

    // Floater dialog is now open!
    const floater = host.querySelector('[aria-label="Group Administration Floater"]');
    expect(floater).toBeTruthy();
    expect(floater?.textContent).toContain('Group Administration: Metropolis Architects');

    // Click close in floater
    const closeBtn = floater?.querySelector('button[aria-label="Close"]');
    await act(async () => {
      (closeBtn as HTMLElement)?.click();
    });

    // Floater is closed
    expect(host.querySelector('[aria-label="Group Administration Floater"]')).toBeNull();
  });

  it('renders inline CrystalLoader in role save button while busy and unmounts cleanly', async () => {
    let resolveUpdate!: (val: { success: boolean }) => void;
    mockAdminService.updateRole.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn?.textContent).toContain('Apply Changes');
    expect(submitBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(submitBtn?.querySelector('svg.lucide')).toBeTruthy();

    await act(async () => {
      submitBtn?.click();
    });

    const loader = submitBtn?.querySelector('[data-testid="crystal-loader"]') as HTMLElement | null;
    expect(loader).toBeTruthy();
    expect(loader?.getAttribute('data-variant')).toBe('inline');
    expect(loader?.style.width).toBe('16px');
    expect(submitBtn?.querySelector('svg.lucide')).toBeNull();
    expect(submitBtn?.textContent).toContain('Applying…');
    expect(submitBtn?.disabled).toBe(true);

    await act(async () => {
      resolveUpdate({ success: true });
    });

    expect(submitBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(submitBtn?.querySelector('svg.lucide')).toBeTruthy();
    expect(submitBtn?.textContent).toContain('Apply Changes');
    expect(submitBtn?.disabled).toBe(false);
  });

  it('renders inline CrystalLoader in role assignment button while busy and unmounts cleanly', async () => {
    let resolveAssign!: (val: { success: boolean }) => void;
    mockAdminService.assignMemberRoles.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveAssign = resolve;
        }),
    );

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const membersTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'MEMBERS',
    ) as HTMLElement | undefined;
    await act(async () => {
      membersTabBtn?.click();
    });

    const saveRolesBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Role Assignments'),
    ) as HTMLButtonElement | undefined;
    expect(saveRolesBtn).toBeTruthy();
    expect(saveRolesBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(saveRolesBtn?.querySelector('svg.lucide')).toBeTruthy();

    await act(async () => {
      saveRolesBtn?.click();
    });

    const loader = saveRolesBtn?.querySelector(
      '[data-testid="crystal-loader"]',
    ) as HTMLElement | null;
    expect(loader).toBeTruthy();
    expect(loader?.getAttribute('data-variant')).toBe('inline');
    expect(loader?.style.width).toBe('16px');
    expect(saveRolesBtn?.querySelector('svg.lucide')).toBeNull();
    expect(saveRolesBtn?.textContent).toContain('Saving…');
    expect(saveRolesBtn?.disabled).toBe(true);

    await act(async () => {
      resolveAssign({ success: true });
    });

    expect(saveRolesBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(saveRolesBtn?.querySelector('svg.lucide')).toBeTruthy();
    expect(saveRolesBtn?.textContent).toContain('Save Role Assignments');
    expect(saveRolesBtn?.disabled).toBe(false);
  });

  it('renders inline CrystalLoader in send invitation button while busy and unmounts cleanly', async () => {
    let resolveInvite!: (val: { success: boolean }) => void;
    mockAdminService.inviteMember.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveInvite = resolve;
        }),
    );

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const invitesTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'INVITATIONS',
    ) as HTMLElement | undefined;
    await act(async () => {
      invitesTabBtn?.click();
    });

    const agentInput = host.querySelector(
      'input[placeholder="e.g. Firstname Lastname or UUID"]',
    ) as HTMLElement | null;
    await act(async () => {
      setInputValue(agentInput, 'Charlie Resident');
    });

    const sendBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(sendBtn).toBeTruthy();
    expect(sendBtn?.textContent).toContain('Send Invitation');
    expect(sendBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(sendBtn?.querySelector('svg.lucide')).toBeTruthy();

    await act(async () => {
      sendBtn?.click();
    });

    const loader = sendBtn?.querySelector('[data-testid="crystal-loader"]') as HTMLElement | null;
    expect(loader).toBeTruthy();
    expect(loader?.getAttribute('data-variant')).toBe('inline');
    expect(loader?.style.width).toBe('16px');
    expect(sendBtn?.querySelector('svg.lucide')).toBeNull();
    expect(sendBtn?.textContent).toContain('Sending…');
    expect(sendBtn?.disabled).toBe(true);

    await act(async () => {
      resolveInvite({ success: true });
    });

    expect(sendBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(sendBtn?.querySelector('svg.lucide')).toBeTruthy();
    expect(sendBtn?.textContent).toContain('Send Invitation');
    expect(sendBtn?.disabled).toBe(false);
  });

  it('renders inline CrystalLoader in eject confirmation button while busy and restores icon on error', async () => {
    let rejectEject!: (reason?: unknown) => void;
    mockAdminService.ejectMember.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((_, reject) => {
          rejectEject = reject;
        }),
    );

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const membersTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent?.trim() === 'MEMBERS',
    ) as HTMLElement | undefined;
    await act(async () => {
      membersTabBtn?.click();
    });

    const ejectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Eject Member'),
    ) as HTMLElement | undefined;
    await act(async () => {
      ejectBtn?.click();
    });

    const confirmEjectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Eject'),
    ) as HTMLButtonElement | undefined;
    expect(confirmEjectBtn).toBeTruthy();
    expect(confirmEjectBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(confirmEjectBtn?.querySelector('svg.lucide')).toBeTruthy();

    await act(async () => {
      confirmEjectBtn?.click();
    });

    const loader = confirmEjectBtn?.querySelector(
      '[data-testid="crystal-loader"]',
    ) as HTMLElement | null;
    expect(loader).toBeTruthy();
    expect(loader?.getAttribute('data-variant')).toBe('inline');
    expect(loader?.style.width).toBe('16px');
    expect(confirmEjectBtn?.querySelector('svg.lucide')).toBeNull();
    expect(confirmEjectBtn?.textContent).toContain('Ejecting…');
    expect(confirmEjectBtn?.disabled).toBe(true);

    await act(async () => {
      rejectEject(new Error('Permission denied to eject member'));
    });

    expect(confirmEjectBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(confirmEjectBtn?.querySelector('svg.lucide')).toBeTruthy();
    expect(confirmEjectBtn?.textContent).toContain('Confirm Eject');
    expect(confirmEjectBtn?.disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Permission denied to eject member',
    );
  });

  it('renders error banner dismiss button as TouchTarget with accessible name and minimum 24x24 dimensions', async () => {
    const longError = `Permission denied while updating role configuration: ${'X'.repeat(280)}`;
    mockAdminService.updateRole.mockRejectedValueOnce(new Error(longError));

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const alertBanner = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alertBanner).not.toBeNull();
    expect(alertBanner.textContent).toContain(longError);

    const dismissBtn = alertBanner.querySelector(
      'button[aria-label="Dismiss error message"]',
    ) as HTMLButtonElement;
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn.type).toBe('button');
    expect(dismissBtn.classList.contains('touch-target')).toBe(true);
    expect(dismissBtn.style.minWidth).toBe('24px');
    expect(dismissBtn.style.minHeight).toBe('24px');
    expect(dismissBtn.style.flexShrink).toBe('0');
    expect(dismissBtn.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await act(async () => {
      dismissBtn.click();
    });

    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders status banner dismiss button as TouchTarget with accessible name and minimum 24x24 dimensions', async () => {
    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      }),
    );

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const statusBanner = host.querySelector('[role="status"]') as HTMLElement;
    expect(statusBanner).not.toBeNull();
    expect(statusBanner.textContent).toContain('updated successfully');

    const dismissBtn = statusBanner.querySelector(
      'button[aria-label="Dismiss status message"]',
    ) as HTMLButtonElement;
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn.type).toBe('button');
    expect(dismissBtn.classList.contains('touch-target')).toBe(true);
    expect(dismissBtn.style.minWidth).toBe('24px');
    expect(dismissBtn.style.minHeight).toBe('24px');
    expect(dismissBtn.style.flexShrink).toBe('0');
    expect(dismissBtn.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await act(async () => {
      dismissBtn.click();
    });

    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('does not suppress focus outlines on modal text inputs and textareas across tabs and light/dark themes', async () => {
    function PaletteFloater({ palette }: { palette: string }) {
      const { actions } = useApp();
      const appliedRef = React.useRef<string | null>(null);
      useEffect(() => {
        if (appliedRef.current !== palette) {
          appliedRef.current = palette;
          actions.setPalette(palette);
        }
      }, [actions, palette]);
      return createElement(GroupAdminFloater, {
        groupId: testGroupId,
        group: testGroup,
        onClose: vi.fn(),
        adminService: mockAdminService,
      });
    }

    for (const palette of ['ink', 'paper']) {
      const host = await mount(createElement(PaletteFloater, { palette }));

      // 1. ROLES tab text inputs and textarea
      const roleControls = Array.from(
        host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input[type="text"], textarea',
        ),
      );
      expect(roleControls.length).toBe(3);

      for (const control of roleControls) {
        expect(control.style.outline).not.toBe('none');
        expect(control.style.outline).toBe('');

        await act(async () => {
          control.focus();
        });
        expect(control.style.outline).toContain('2px solid');
        expect(control.style.outlineOffset).toBe('2px');
        expect(control.getAttribute('data-focused')).toBe('true');

        await act(async () => {
          control.blur();
        });
        expect(control.style.outline).toBe('');
      }

      // 2. MEMBERS tab search input and Eject Member modal input
      const membersTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent?.trim() === 'MEMBERS',
      ) as HTMLButtonElement;
      await act(async () => {
        membersTabBtn.click();
      });

      const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement;
      expect(searchInput).not.toBeNull();
      expect(searchInput.style.outline).not.toBe('none');
      expect(searchInput.style.outline).toBe('');

      await act(async () => {
        searchInput.focus();
      });
      expect(searchInput.style.outline).toContain('2px solid');

      const ejectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Eject Member'),
      ) as HTMLButtonElement;
      await act(async () => {
        ejectBtn.click();
      });

      const ejectReasonInput = host.querySelector(
        'input[placeholder="Reason for ejection…"]',
      ) as HTMLInputElement;
      expect(ejectReasonInput).not.toBeNull();
      expect(ejectReasonInput.style.outline).not.toBe('none');
      expect(ejectReasonInput.style.outline).toBe('');

      await act(async () => {
        ejectReasonInput.focus();
      });
      expect(ejectReasonInput.style.outline).toContain('2px solid');

      // Dismiss eject modal before switching tabs
      const cancelEjectBtn = Array.from(
        host.querySelectorAll('[aria-label="Confirm Member Ejection"] button'),
      ).find((b) => b.textContent?.trim() === 'Cancel') as HTMLButtonElement;
      await act(async () => {
        cancelEjectBtn.click();
      });

      // 3. INVITATIONS tab text input and textarea
      const invitesTabBtn = Array.from(host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent?.trim() === 'INVITATIONS',
      ) as HTMLButtonElement;
      await act(async () => {
        invitesTabBtn.click();
      });

      const inviteControls = Array.from(
        host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input[type="text"], textarea',
        ),
      );
      expect(inviteControls.length).toBe(2);

      for (const control of inviteControls) {
        expect(control.style.outline).not.toBe('none');
        expect(control.style.outline).toBe('');

        await act(async () => {
          control.focus();
        });
        expect(control.style.outline).toContain('2px solid');
      }

      await act(async () => {
        mounted!.root.unmount();
      });
      mounted!.host.remove();
      mounted = null;
    }
  });
});
