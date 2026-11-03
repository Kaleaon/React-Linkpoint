import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import {
  GROUP_POWERS,
  powersToBigInt,
  powersToString,
  hasPower,
  togglePower,
} from '../linkpoint/services/group-admin-capability-service';
import Icon from './Icon.jsx';
import FocusTrap from './FocusTrap.jsx';

export default function GroupAdminFloater({
  groupId,
  group,
  onClose,
  adminService: customAdminService,
}) {
  const { V, t } = useTheme();
  const adminService = customAdminService || app.groupAdmin;
  const floaterRef = useRef(null);

  // Position state with initial viewport centering
  const [position, setPosition] = useState(() => {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
    const initialW = Math.min(680, winW - 32);
    const initialH = Math.min(600, winH - 32);
    return {
      x: Math.max(16, Math.round((winW - initialW) / 2)),
      y: Math.max(16, Math.round((winH - initialH) / 2)),
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  // Navigation tab: 'ROLES' | 'MEMBERS' | 'INVITATIONS'
  const [activeTab, setActiveTab] = useState('ROLES');

  // GroupsManager Cache Data
  const [roles, setRoles] = useState(() =>
    app.groups ? Array.from(app.groups.getGroupRoles(groupId).values()) : [],
  );
  const [members, setMembers] = useState(() =>
    app.groups ? Array.from(app.groups.getGroupMembers(groupId).values()) : [],
  );

  // Status feedback
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Roles Tab State
  const [selectedRoleId, setSelectedRoleId] = useState(() => roles[0]?.id || '');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [roleForm, setRoleForm] = useState({
    name: '',
    title: '',
    description: '',
    powers: 0n,
  });

  // Members Tab State
  const [memberFilter, setMemberFilter] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(() => members[0]?.id || '');
  const [memberRoleIds, setMemberRoleIds] = useState([]);
  const [ejectingMember, setEjectingMember] = useState(null);
  const [ejectReason, setEjectReason] = useState('');

  // Invitations Tab State
  const [inviteAgentId, setInviteAgentId] = useState('');
  const [inviteRoleIds, setInviteRoleIds] = useState([]);
  const [inviteMessage, setInviteMessage] = useState('');

  // Refresh roles & members on cache change
  useEffect(() => {
    const handleRolesUpdated = (payload) => {
      if (!payload || payload.groupId === groupId) {
        const nextRoles = Array.from(app.groups.getGroupRoles(groupId).values());
        setRoles(nextRoles);
      }
    };
    const handleMembersUpdated = (payload) => {
      if (!payload || payload.groupId === groupId) {
        const nextMembers = Array.from(app.groups.getGroupMembers(groupId).values());
        setMembers(nextMembers);
      }
    };

    if (app.groups) {
      app.groups.on('roles_updated', handleRolesUpdated);
      app.groups.on('role_updated', handleRolesUpdated);
      app.groups.on('members_updated', handleMembersUpdated);
      app.groups.on('member_ejected', handleMembersUpdated);
    }

    return () => {
      if (app.groups) {
        app.groups.off('roles_updated', handleRolesUpdated);
        app.groups.off('role_updated', handleRolesUpdated);
        app.groups.off('members_updated', handleMembersUpdated);
        app.groups.off('member_ejected', handleMembersUpdated);
      }
    };
  }, [groupId]);

  // Keep selected role synced with form
  useEffect(() => {
    if (isCreatingRole) {
      setRoleForm({
        name: '',
        title: '',
        description: '',
        powers: 0n,
      });
      return;
    }

    const currentRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
    if (currentRole) {
      setSelectedRoleId(currentRole.id);
      setRoleForm({
        name: currentRole.name || '',
        title: currentRole.title || '',
        description: currentRole.description || '',
        powers: powersToBigInt(currentRole.powers),
      });
    } else {
      setSelectedRoleId('');
      setRoleForm({ name: '', title: '', description: '', powers: 0n });
    }
  }, [selectedRoleId, isCreatingRole, roles]);

  // Keep selected member synced with memberRoleIds
  useEffect(() => {
    const currentMember = members.find((m) => m.id === selectedMemberId) || members[0];
    if (currentMember) {
      setSelectedMemberId(currentMember.id);
      const assigned = currentMember.roleIds || currentMember.roles || [];
      setMemberRoleIds(Array.isArray(assigned) ? [...assigned] : []);
    }
  }, [selectedMemberId, members]);

  // Clamp position to viewport bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!floaterRef.current) return;
      const width = floaterRef.current.offsetWidth || 640;
      const height = floaterRef.current.offsetHeight || 560;
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      setPosition((current) => ({
        x: Math.max(0, Math.min(winW - width, current.x)),
        y: Math.max(0, Math.min(winH - height, current.y)),
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draggable header logic
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, select')) return;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const width = floaterRef.current ? floaterRef.current.offsetWidth : 640;
      const height = floaterRef.current ? floaterRef.current.offsetHeight : 560;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 600;

      const newX = Math.max(0, Math.min(winW - width, dragStartRef.current.posX + dx));
      const newY = Math.max(0, Math.min(winH - height, dragStartRef.current.posY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const idMatch = String(m.id || '')
        .toLowerCase()
        .includes(q);
      const nameMatch = String(m.name || '')
        .toLowerCase()
        .includes(q);
      const titleMatch = String(m.title || '')
        .toLowerCase()
        .includes(q);
      return idMatch || nameMatch || titleMatch;
    });
  }, [members, memberFilter]);

  // Role Action Handlers
  const handleTogglePower = (bit) => {
    setRoleForm((prev) => ({
      ...prev,
      powers: togglePower(prev.powers, bit),
    }));
  };

  const handleSaveRole = async (e) => {
    e?.preventDefault();
    if (!roleForm.name.trim()) {
      setErrorMessage('Role name is required');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isCreatingRole) {
        await adminService.createRole(groupId, {
          name: roleForm.name.trim(),
          title: roleForm.title.trim(),
          description: roleForm.description.trim(),
          powers: powersToString(roleForm.powers),
        });
        setSuccessMessage(`Role "${roleForm.name}" created successfully.`);
        setIsCreatingRole(false);
      } else {
        await adminService.updateRole(groupId, selectedRoleId, {
          name: roleForm.name.trim(),
          title: roleForm.title.trim(),
          description: roleForm.description.trim(),
          powers: powersToString(roleForm.powers),
        });
        setSuccessMessage(`Role "${roleForm.name}" updated successfully.`);
      }
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to update role.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRoleId) return;
    const roleToDelete = roles.find((r) => r.id === selectedRoleId);
    if (!roleToDelete) return;

    if (
      roleToDelete.id === '00000000-0000-0000-0000-000000000000' ||
      roleToDelete.name === 'Everyone' ||
      roleToDelete.name === 'Owners'
    ) {
      setErrorMessage('Cannot delete default system roles.');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await adminService.deleteRole(groupId, selectedRoleId);
      setSuccessMessage(`Role "${roleToDelete.name}" deleted successfully.`);
      const remaining = roles.filter((r) => r.id !== selectedRoleId);
      setSelectedRoleId(remaining[0]?.id || '');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to delete role.');
    } finally {
      setBusy(false);
    }
  };

  // Member Action Handlers
  const handleToggleMemberRole = (roleId) => {
    setMemberRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const handleSaveMemberRoles = async () => {
    if (!selectedMemberId) return;
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await adminService.assignMemberRoles(groupId, selectedMemberId, memberRoleIds);
      setSuccessMessage('Member roles updated successfully.');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to assign member roles.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEject = async () => {
    if (!ejectingMember) return;
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await adminService.ejectMember(groupId, ejectingMember.id, { reason: ejectReason });
      setSuccessMessage(
        `Member ${ejectingMember.name || ejectingMember.id} has been ejected from the group.`,
      );
      setEjectingMember(null);
      setEjectReason('');
      const remaining = members.filter((m) => m.id !== ejectingMember.id);
      setSelectedMemberId(remaining[0]?.id || '');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to eject member.');
    } finally {
      setBusy(false);
    }
  };

  // Invitation Action Handler
  const handleSendInvitation = async (e) => {
    e?.preventDefault();
    if (!inviteAgentId.trim()) {
      setErrorMessage('Resident name or UUID is required for invitation');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await adminService.inviteMember(
        groupId,
        inviteAgentId.trim(),
        inviteRoleIds,
        inviteMessage.trim(),
      );
      setSuccessMessage(`Invitation dispatched to ${inviteAgentId}.`);
      setInviteAgentId('');
      setInviteRoleIds([]);
      setInviteMessage('');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to send group invitation.');
    } finally {
      setBusy(false);
    }
  };

  // UI styles
  const buttonStyle = {
    padding: '7px 14px',
    borderRadius: V.rs,
    border: `1px solid ${V.outv}`,
    background: V.surf,
    color: V.ink,
    fontSize: 12,
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    opacity: busy ? 0.6 : 1,
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    background: V.pri,
    borderColor: V.pri,
    color: V.onpri,
  };

  const dangerButtonStyle = {
    ...buttonStyle,
    background: 'transparent',
    borderColor: V.err || '#e53e3e',
    color: V.err || '#e53e3e',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: V.rs,
    border: `1px solid ${V.outv}`,
    background: V.bg,
    color: V.ink,
    fontSize: 13,
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <FocusTrap
      active={true}
      onEscape={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        ref={floaterRef}
        role="dialog"
        aria-modal="true"
        aria-label="Group Administration Floater"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: 'min(720px, calc(100vw - 24px))',
          maxHeight: 'min(640px, calc(100vh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: V.rs,
          background: V.surf,
          color: V.ink,
          border: `1px solid ${V.outv}`,
          boxShadow: '0 16px 36px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          zIndex: 100,
        }}
      >
        {/* Title Bar (Draggable) */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            padding: '10px 14px',
            background: V.bg,
            borderBottom: `1px solid ${V.outv}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Icon name="shield" size={16} style={{ color: V.pri, flexShrink: 0 }} />
            <strong
              style={{
                fontSize: 13,
                fontFamily: t.font,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Group Administration: {group?.name || '—'}
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              width: 32,
              height: 32,
              minWidth: 44,
              minHeight: 44,
              borderRadius: V.rs,
              color: V.ink2,
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            borderBottom: `1px solid ${V.outv}`,
            background: V.bg,
            padding: '0 8px',
          }}
        >
          {['ROLES', 'MEMBERS', 'INVITATIONS'].map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab);
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                style={{
                  all: 'unset',
                  padding: '10px 16px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  cursor: 'pointer',
                  color: active ? V.pri : V.ink2,
                  borderBottom: `2px solid ${active ? V.pri : 'transparent'}`,
                  transition: 'color 0.2s',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Feedback Banners */}
        {errorMessage ? (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: V.err || '#e53e3e',
              borderBottom: `1px solid ${V.err || '#e53e3e'}`,
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert-triangle" size={16} />
            <span style={{ flex: 1 }}>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage('')}
              style={{ all: 'unset', cursor: 'pointer' }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : null}

        {successMessage ? (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              borderBottom: '1px solid #22c55e',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="check-circle" size={16} />
            <span style={{ flex: 1 }}>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage('')}
              style={{ all: 'unset', cursor: 'pointer' }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : null}

        {/* Tab Contents */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex' }}>
          {/* TAB 1: ROLES */}
          {activeTab === 'ROLES' && (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              {/* Role Sidebar */}
              <div
                style={{
                  width: '38%',
                  minWidth: 200,
                  borderRight: `1px solid ${V.outv}`,
                  display: 'flex',
                  flexDirection: 'column',
                  background: V.bg,
                }}
              >
                <div style={{ padding: 10, borderBottom: `1px solid ${V.outv}` }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingRole(true);
                      setSelectedRoleId('');
                      setErrorMessage('');
                    }}
                    style={{ ...primaryButtonStyle, width: '100%', justifyContent: 'center' }}
                  >
                    <Icon name="plus" size={14} /> Create Role
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                  {roles.map((r) => {
                    const isSelected = !isCreatingRole && selectedRoleId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setIsCreatingRole(false);
                          setSelectedRoleId(r.id);
                          setErrorMessage('');
                        }}
                        style={{
                          all: 'unset',
                          display: 'block',
                          width: '100%',
                          padding: '9px 12px',
                          boxSizing: 'border-box',
                          borderRadius: V.rs,
                          marginBottom: 4,
                          background: isSelected ? V.priC || V.surf : 'transparent',
                          color: isSelected ? V.pri : V.ink,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border: `1px solid ${isSelected ? V.pri : 'transparent'}`,
                        }}
                      >
                        <strong
                          style={{
                            display: 'block',
                            fontSize: 13,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.name || '—'}
                        </strong>
                        <span
                          style={{
                            fontSize: 11,
                            color: V.ink2,
                            display: 'block',
                            marginTop: 2,
                          }}
                        >
                          {r.title || '—'}
                        </span>
                      </button>
                    );
                  })}
                  {!roles.length && (
                    <div style={{ padding: 16, color: V.ink2, fontSize: 12 }}>
                      No roles available.
                    </div>
                  )}
                </div>
              </div>

              {/* Role Detail & Bitmask Editor */}
              <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
                <form onSubmit={handleSaveRole}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      {isCreatingRole ? 'New Role Configuration' : `Edit Role: ${roleForm.name}`}
                    </h3>
                    {!isCreatingRole && selectedRoleId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleDeleteRole}
                        style={dangerButtonStyle}
                      >
                        <Icon name="trash-2" size={14} /> Delete
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 700,
                          color: V.ink2,
                          marginBottom: 4,
                        }}
                      >
                        ROLE NAME *
                      </label>
                      <input
                        type="text"
                        required
                        value={roleForm.name}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                        placeholder="e.g. Officers"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 700,
                          color: V.ink2,
                          marginBottom: 4,
                        }}
                      >
                        ROLE TITLE
                      </label>
                      <input
                        type="text"
                        value={roleForm.title}
                        onChange={(e) => setRoleForm({ ...roleForm, title: e.target.value })}
                        placeholder="e.g. Officer"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 700,
                          color: V.ink2,
                          marginBottom: 4,
                        }}
                      >
                        DESCRIPTION
                      </label>
                      <textarea
                        rows={2}
                        value={roleForm.description}
                        onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                        placeholder="Role responsibilities and power descriptions"
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </div>
                  </div>

                  {/* Bitmask Powers Controls */}
                  <div
                    style={{
                      borderTop: `1px solid ${V.outv}`,
                      paddingTop: 14,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: V.ink2,
                          letterSpacing: '.06em',
                        }}
                      >
                        ROLE POWERS (BITMASK PERMISSIONS)
                      </label>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: V.ink2,
                          background: V.bg,
                          padding: '2px 6px',
                          borderRadius: V.rs,
                        }}
                      >
                        0x{powersToBigInt(roleForm.powers).toString(16).toUpperCase()}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        maxHeight: 220,
                        overflowY: 'auto',
                        paddingRight: 6,
                      }}
                    >
                      {Object.values(GROUP_POWERS).map((power) => {
                        const checked = hasPower(roleForm.powers, power.bit);
                        return (
                          <label
                            key={power.key}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                              padding: '6px 8px',
                              borderRadius: V.rs,
                              background: checked ? V.priC || V.bg : V.bg,
                              cursor: 'pointer',
                              border: `1px solid ${checked ? V.pri : V.outv}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePower(power.bit)}
                              style={{ marginTop: 2, cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ display: 'block', fontSize: 12.5 }}>
                                {power.name}
                              </strong>
                              <small style={{ color: V.ink2, fontSize: 11, display: 'block' }}>
                                {power.desc}
                              </small>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setIsCreatingRole(false);
                        setSelectedRoleId(roles[0]?.id || '');
                      }}
                      style={buttonStyle}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} style={primaryButtonStyle}>
                      <Icon name="check" size={14} />
                      {busy ? 'Applying…' : isCreatingRole ? 'Create Role' : 'Apply Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERS */}
          {activeTab === 'MEMBERS' && (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              {/* Member List & Search */}
              <div
                style={{
                  width: '42%',
                  minWidth: 220,
                  borderRight: `1px solid ${V.outv}`,
                  display: 'flex',
                  flexDirection: 'column',
                  background: V.bg,
                }}
              >
                <div style={{ padding: 10, borderBottom: `1px solid ${V.outv}` }}>
                  <input
                    type="search"
                    placeholder="Search members…"
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                  {filteredMembers.map((m) => {
                    const isSelected = selectedMemberId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMemberId(m.id);
                          setErrorMessage('');
                        }}
                        style={{
                          all: 'unset',
                          display: 'block',
                          width: '100%',
                          padding: '9px 12px',
                          boxSizing: 'border-box',
                          borderRadius: V.rs,
                          marginBottom: 4,
                          background: isSelected ? V.priC || V.surf : 'transparent',
                          color: isSelected ? V.pri : V.ink,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border: `1px solid ${isSelected ? V.pri : 'transparent'}`,
                        }}
                      >
                        <strong
                          style={{
                            display: 'block',
                            fontSize: 13,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name || m.id || '—'}
                        </strong>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            color: V.ink2,
                            marginTop: 2,
                          }}
                        >
                          <span>{m.title || 'Member'}</span>
                          <span>{m.onlineStatus || '—'}</span>
                        </div>
                      </button>
                    );
                  })}
                  {!filteredMembers.length && (
                    <div style={{ padding: 16, color: V.ink2, fontSize: 12 }}>
                      No members matched.
                    </div>
                  )}
                </div>
              </div>

              {/* Member Roles & Ejection Pane */}
              <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
                {(() => {
                  const currentMember = members.find((m) => m.id === selectedMemberId);
                  if (!currentMember) {
                    return (
                      <div style={{ padding: 24, textAlign: 'center', color: V.ink2 }}>
                        Select a member from the list to manage roles or eject.
                      </div>
                    );
                  }

                  return (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 16,
                          borderBottom: `1px solid ${V.outv}`,
                          paddingBottom: 12,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0, fontSize: 16 }}>
                            {currentMember.name || currentMember.id}
                          </h3>
                          <span style={{ fontSize: 12, color: V.ink2 }}>
                            {currentMember.title || 'Member'}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEjectingMember(currentMember)}
                          style={dangerButtonStyle}
                        >
                          <Icon name="user-x" size={14} /> Eject Member
                        </button>
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 12,
                            fontWeight: 700,
                            color: V.ink2,
                            marginBottom: 8,
                          }}
                        >
                          ASSIGNED ROLES
                        </label>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {roles.map((r) => {
                            const isAssigned = memberRoleIds.includes(r.id);
                            return (
                              <label
                                key={r.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '8px 12px',
                                  borderRadius: V.rs,
                                  background: isAssigned ? V.priC || V.bg : V.bg,
                                  border: `1px solid ${isAssigned ? V.pri : V.outv}`,
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() => handleToggleMemberRole(r.id)}
                                />
                                <div style={{ flex: 1 }}>
                                  <strong style={{ fontSize: 13 }}>{r.name || '—'}</strong>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: V.ink2,
                                      display: 'block',
                                      marginTop: 1,
                                    }}
                                  >
                                    {r.title || '—'}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleSaveMemberRoles}
                          style={primaryButtonStyle}
                        >
                          <Icon name="check" size={14} />
                          {busy ? 'Saving…' : 'Save Role Assignments'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB 3: INVITATIONS */}
          {activeTab === 'INVITATIONS' && (
            <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
              <form onSubmit={handleSendInvitation} style={{ maxWidth: 540, margin: '0 auto' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Send Group Invitation</h3>

                <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: V.ink2,
                        marginBottom: 4,
                      }}
                    >
                      RESIDENT NAME OR UUID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Firstname Lastname or UUID"
                      value={inviteAgentId}
                      onChange={(e) => setInviteAgentId(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: V.ink2,
                        marginBottom: 6,
                      }}
                    >
                      ASSIGN INITIAL ROLES
                    </label>
                    <div style={{ display: 'grid', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                      {roles.map((r) => {
                        const checked = inviteRoleIds.includes(r.id);
                        return (
                          <label
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              borderRadius: V.rs,
                              background: checked ? V.priC || V.bg : V.bg,
                              border: `1px solid ${checked ? V.pri : V.outv}`,
                              cursor: 'pointer',
                              fontSize: 12.5,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setInviteRoleIds((prev) =>
                                  prev.includes(r.id)
                                    ? prev.filter((id) => id !== r.id)
                                    : [...prev, r.id],
                                )
                              }
                            />
                            <span>{r.name || '—'}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: V.ink2,
                        marginBottom: 4,
                      }}
                    >
                      INVITATION MESSAGE
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Welcome to our group!"
                      value={inviteMessage}
                      onChange={(e) => setInviteMessage(e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="submit" disabled={busy} style={primaryButtonStyle}>
                    <Icon name="send" size={14} />
                    {busy ? 'Sending…' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Eject Confirmation Modal Overlay */}
        {ejectingMember && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Member Ejection"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 110,
              padding: 16,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                background: V.surf,
                borderRadius: V.rs,
                border: `1px solid ${V.outv}`,
                padding: 20,
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              }}
            >
              <h4 style={{ margin: '0 0 10px', fontSize: 15, color: V.err || '#e53e3e' }}>
                Confirm Ejection
              </h4>
              <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
                Are you sure you want to eject{' '}
                <strong>{ejectingMember.name || ejectingMember.id}</strong> from{' '}
                <strong>{group?.name || 'this group'}</strong>?
              </p>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: V.ink2,
                    marginBottom: 4,
                  }}
                >
                  REASON (OPTIONAL)
                </label>
                <input
                  type="text"
                  placeholder="Reason for ejection…"
                  value={ejectReason}
                  onChange={(e) => setEjectReason(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEjectingMember(null)}
                  style={buttonStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmEject}
                  style={dangerButtonStyle}
                >
                  <Icon name="user-x" size={14} />
                  {busy ? 'Ejecting…' : 'Confirm Eject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FocusTrap>
  );
}
