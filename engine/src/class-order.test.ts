import { describe, expect, test } from 'vitest';
import { classComparator } from './class-order.js';
import { testContent } from './world.test-support.js';

// The Classes' order, as content declares it (v1.1.6-S14, DL-186 item 24).

describe('classComparator', () => {
  test("orders Class keys by the content's declared order, not by name or by the table's keys", () => {
    const keys = ['mage', 'healer', 'warrior', 'rogue'];

    expect([...keys].sort(classComparator(testContent))).toEqual(['warrior', 'rogue', 'mage', 'healer']);
    // The table's own key order does not move it.
    const backwards = { ...testContent, classes: Object.fromEntries(Object.entries(testContent.classes).reverse()) };
    expect([...keys].sort(classComparator(backwards))).toEqual(['warrior', 'rogue', 'mage', 'healer']);
    // The declared order does.
    const declared = { ...testContent, classOrder: ['healer', 'mage', 'rogue', 'warrior'] };
    expect([...keys].sort(classComparator(declared))).toEqual(['healer', 'mage', 'rogue', 'warrior']);
  });

  test('puts a Class the content does not define after the declared ones, by its key', () => {
    expect(['zealot', 'healer', 'archer', 'warrior'].sort(classComparator(testContent))).toEqual(['warrior', 'healer', 'archer', 'zealot']);
  });

  test('is built once for a content set', () => {
    expect(classComparator(testContent)).toBe(classComparator(testContent));
    expect(classComparator({ ...testContent, classOrder: ['mage'] })).not.toBe(classComparator(testContent));
  });
});
