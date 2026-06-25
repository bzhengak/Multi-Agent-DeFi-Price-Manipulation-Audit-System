import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('T14: TaskStateManager', () => {
  let taskStates: any;

  beforeEach(async () => {
    const mod = await import('@/app/api/analyze/state');
    taskStates = mod.taskStates;
  });

  it('should be a singleton', () => {
    expect(taskStates).toBeDefined();
    expect(typeof taskStates.set).toBe('function');
    expect(typeof taskStates.get).toBe('function');
    expect(typeof taskStates.subscribe).toBe('function');
  });

  it('should set and get task state', () => {
    const state = taskStates.set('task-test-1', { status: 'pending', progress: 0, stage: 'init' });
    expect(state.status).toBe('pending');

    const retrieved = taskStates.get('task-test-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved.status).toBe('pending');
  });

  it('should merge partial updates', () => {
    taskStates.set('task-test-2', { status: 'pending', progress: 0 });
    taskStates.set('task-test-2', { status: 'analyzing', progress: 50 });

    const state = taskStates.get('task-test-2');
    expect(state.status).toBe('analyzing');
    expect(state.progress).toBe(50);
    expect(state.updatedAt).toBeDefined();
  });

  it('should return null for non-existent task', () => {
    const state = taskStates.get('non-existent-task');
    expect(state).toBeNull();
  });

  it('should subscribe to updates', async () => {
    const updates: any[] = [];

    const unsubscribe = taskStates.subscribe('task-test-3', (state: any) => {
      updates.push(state);
    });

    taskStates.set('task-test-3', { status: 'pending', progress: 0 });
    taskStates.set('task-test-3', { status: 'analyzing', progress: 30 });

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(updates.length).toBeGreaterThanOrEqual(2);
    unsubscribe();
  });

  it('should unsubscribe correctly', async () => {
    const updates: any[] = [];
    const unsubscribe = taskStates.subscribe('task-test-4', (state: any) => {
      updates.push(state);
    });

    taskStates.set('task-test-4', { status: 'pending', progress: 0 });
    unsubscribe();
    taskStates.set('task-test-4', { status: 'analyzing', progress: 50 });

    await new Promise((r) => setTimeout(r, 50));
    // After unsubscribe, no more updates should arrive
    expect(updates.length).toBe(1);
  });

  it('should delete tasks', () => {
    taskStates.set('task-test-5', { status: 'pending', progress: 0 });
    taskStates.delete('task-test-5');
    expect(taskStates.get('task-test-5')).toBeNull();
  });

  it('should notify on completed status', async () => {
    const updates: any[] = [];
    taskStates.subscribe('task-test-6', (state: any) => {
      updates.push(state);
    });

    taskStates.set('task-test-6', { status: 'pending', progress: 0 });
    taskStates.set('task-test-6', { status: 'completed', progress: 100 });

    await new Promise((r) => setTimeout(r, 50));
    expect(updates.some((u) => u.status === 'completed')).toBe(true);
  });

  it('should handle multiple subscribers', async () => {
    const updates1: any[] = [];
    const updates2: any[] = [];

    taskStates.subscribe('task-test-7', (s: any) => updates1.push(s));
    taskStates.subscribe('task-test-7', (s: any) => updates2.push(s));

    taskStates.set('task-test-7', { status: 'pending', progress: 0 });

    await new Promise((r) => setTimeout(r, 50));
    expect(updates1.length).toBeGreaterThanOrEqual(1);
    expect(updates2.length).toBeGreaterThanOrEqual(1);
  });
});
