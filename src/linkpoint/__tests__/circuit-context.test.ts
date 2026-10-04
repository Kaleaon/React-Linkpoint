import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitContextManager } from '../circuit-context';

describe('CircuitContextManager', () => {
  let manager: CircuitContextManager;

  beforeEach(() => {
    manager = new CircuitContextManager();
  });

  it('initializes with empty circuit identity', () => {
    const ctx = manager.getCircuitContext();
    expect(ctx.agentId).toBeNull();
    expect(ctx.sessionId).toBeNull();
    expect(ctx.circuitCode).toBeNull();
    expect(manager.hasValidCircuit()).toBe(false);
  });

  it('updates circuit context parameters and validates non-zero identity', () => {
    manager.updateCircuit({
      agentId: '11111111-2222-3333-4444-555555555555',
      sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      circuitCode: 98765,
      regionName: 'Ahern',
      seedCapability: 'https://sim.example.com/caps/seed',
    });

    expect(manager.hasValidCircuit()).toBe(true);
    const ctx = manager.getCircuitContext();
    expect(ctx.agentId).toBe('11111111-2222-3333-4444-555555555555');
    expect(ctx.sessionId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(ctx.circuitCode).toBe(98765);
    expect(ctx.regionName).toBe('Ahern');
    expect(ctx.seedCapability).toBe('https://sim.example.com/caps/seed');
  });

  it('rejects zeroed or null UUIDs in hasValidCircuit', () => {
    manager.updateCircuit({
      agentId: '00000000-0000-0000-0000-000000000000',
      sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      circuitCode: 1001,
    });
    expect(manager.hasValidCircuit()).toBe(false);
  });

  it('attaches active non-zero AgentData block to outgoing payloads', () => {
    manager.updateCircuit({
      agentId: 'agent-uuid-123',
      sessionId: 'session-uuid-456',
      circuitCode: 2024,
    });

    // Case 1: Empty payload
    const payload1 = manager.attachAgentData({ action: 'ParcelUpdate' });
    expect(payload1.AgentData).toEqual({
      AgentID: 'agent-uuid-123',
      SessionID: 'session-uuid-456',
      CircuitCode: 2024,
    });

    // Case 2: Payload with zeroed AgentData block
    const payload2 = manager.attachAgentData({
      AgentData: {
        AgentID: '00000000-0000-0000-0000-000000000000',
        SessionID: '00000000-0000-0000-0000-000000000000',
        CircuitCode: 0,
      },
      ParcelID: 'parcel-123',
    });

    expect(payload2.AgentData).toEqual({
      AgentID: 'agent-uuid-123',
      SessionID: 'session-uuid-456',
      CircuitCode: 2024,
    });
    expect(payload2.ParcelID).toBe('parcel-123');
  });

  it('validates mutating request and throws error if AgentData is zeroed', () => {
    // Unset circuit should fail validation
    expect(() => manager.validateMutatingRequest({ ParcelID: 'p-1' })).toThrow(
      'Invalid or zeroed circuit identity parameters in AgentData block'
    );

    // Active circuit set
    manager.updateCircuit({
      agentId: 'agent-uuid-123',
      sessionId: 'session-uuid-456',
      circuitCode: 2024,
    });

    // Should pass when circuit is active
    expect(() => manager.validateMutatingRequest({ ParcelID: 'p-1' })).not.toThrow();

    // Zeroed AgentID in request payload should fail
    expect(() =>
      manager.validateMutatingRequest({
        AgentData: { AgentID: '00000000-0000-0000-0000-000000000000' },
      })
    ).toThrow('Zeroed AgentID in mutating request');
  });

  it('preserves user session parameters during network disconnects', () => {
    manager.updateCircuit({
      agentId: 'agent-uuid-123',
      sessionId: 'session-uuid-456',
      circuitCode: 2024,
    });

    manager.handleNetworkDisconnect();
    expect(manager.getDisconnectedState()).toBe(true);
    // Credentials retained
    expect(manager.getCircuitContext().agentId).toBe('agent-uuid-123');
    expect(manager.hasValidCircuit()).toBe(true);

    manager.handleNetworkReconnect();
    expect(manager.getDisconnectedState()).toBe(false);
  });

  it('clears all parameters on reset', () => {
    manager.updateCircuit({
      agentId: 'agent-uuid-123',
      sessionId: 'session-uuid-456',
      circuitCode: 2024,
    });

    manager.reset();
    expect(manager.hasValidCircuit()).toBe(false);
    expect(manager.getCircuitContext().agentId).toBeNull();
  });
});
