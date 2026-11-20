import { describe, it, expect } from 'vitest';
import { nodeDefinitions, nodeCategories } from '../data/nodeDefinitions';

describe('Node Definitions Stage 2', () => {
  it('should define all 4 categories: trigger, data, logic, utility', () => {
    const categoryIds = nodeCategories.map((c) => c.id);
    expect(categoryIds).toContain('trigger');
    expect(categoryIds).toContain('data');
    expect(categoryIds).toContain('logic');
    expect(categoryIds).toContain('utility');
  });

  it('should have valid definitions for each of the 6 required core nodes', () => {
    expect(nodeDefinitions.length).toBe(6);

    for (const def of nodeDefinitions) {
      expect(def.type).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(['trigger', 'data', 'logic', 'utility']).toContain(def.category);
      expect(def.icon).toBeTruthy();
      expect(def.color).toMatch(/^#/);
      expect(Array.isArray(def.inputs)).toBe(true);
      expect(Array.isArray(def.outputs)).toBe(true);
      expect(typeof def.defaultConfig).toBe('object');
    }
  });

  it('should include all 6 required nodes: Manual Trigger, HTTP Request, Transform Data, Condition, Delay, Console Output', () => {
    const types = nodeDefinitions.map((d) => d.type);
    expect(types).toContain('manual-trigger');
    expect(types).toContain('http-request');
    expect(types).toContain('transform-data');
    expect(types).toContain('condition');
    expect(types).toContain('delay');
    expect(types).toContain('console-output');
  });
});
