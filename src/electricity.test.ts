import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateElectricityBill, meterConsumption, type ElectricityGuestInput } from './electricity';

const guest = (id: string, room: string, checkIn: string, checkOut?: string): ElectricityGuestInput => ({ id, name: id, segments: [{ residentId: id, residentName: id, room, checkIn, checkOut }] });

test('meter methods validate nonnegative consumption and monotonic readings', () => {
  assert.equal(meterConsumption(150, 1250, 'direct'), 150);
  assert.equal(meterConsumption(1400, 1250), 150);
  assert.throws(() => meterConsumption(1200, 1250), /lower than previous/);
  assert.throws(() => meterConsumption(-1, 0, 'direct'), /zero or more/);
});

test('full month, check-in, check-out, and one-day stays use inclusive calendar overlap', () => {
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 0, roomUnits: { R1: 31 }, guests: [guest('full', 'R1', '2026-08-01'), guest('late', 'R1', '2026-08-22'), guest('short', 'R1', '2026-08-31', '2026-08-31')] });
  assert.equal(result.bills.find(x => x.name === 'full')?.stayDays, 31);
  assert.equal(result.bills.find(x => x.name === 'late')?.stayDays, 10);
  assert.equal(result.bills.find(x => x.name === 'short')?.stayDays, 1);
  assert.equal(result.differenceUnits, 0);
});

test('multi-guest room person-days allocate all sub-meter units', () => {
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 0, roomUnits: { R1: 150 }, guests: [guest('Jatin', 'R1', '2026-08-04'), guest('Tirankar', 'R1', '2026-08-22'), guest('Akshay', 'R1', '2026-08-27', '2026-08-31')] });
  assert.deepEqual(Object.fromEntries(result.bills.map(x => [x.name, x.stayDays])), { Akshay: 5, Jatin: 28, Tirankar: 10 });
  assert.ok(Math.abs(result.bills.reduce((n, x) => n + x.roomUnits, 0) - 150) < 1e-9);
  assert.equal(result.roomSummary[0].personDays, 43);
});

test('single guest, vacant room exception, and zero consumption reconcile', () => {
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 0, roomUnits: { R1: 0, R2: 35 }, guests: [guest('Jatin', 'R1', '2026-08-01')] });
  assert.equal(result.bills[0].roomUnits, 0);
  assert.equal(result.unallocatedRooms[0].units, 35);
  assert.match(result.exceptions.join(' '), /Room R2 has 35/);
  assert.equal(result.differenceUnits, 0);
});

test('common-area units allocate by unique guest-days across the property', () => {
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 202, roomUnits: {}, guests: [guest('Jatin', 'R1', '2026-08-04'), guest('Tirankar', 'R2', '2026-08-22')] });
  assert.ok(Math.abs(result.bills.reduce((n, x) => n + x.commonUnits, 0) - 202) < 1e-9);
});

test('room transfer allocates both rooms and does not double count common days', () => {
  const moved: ElectricityGuestInput = { id: 'A', name: 'A', segments: [{ residentId: 'A', residentName: 'A', room: 'R1', checkIn: '2026-08-01', checkOut: '2026-08-15' }, { residentId: 'A', residentName: 'A', room: 'R2', checkIn: '2026-08-16', checkOut: '2026-08-31' }] };
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 31, roomUnits: { R1: 15, R2: 16 }, guests: [moved] });
  assert.equal(result.bills[0].stayDays, 31);
  assert.equal(result.bills[0].room, 'R1, R2');
  assert.ok(Math.abs(result.bills[0].commonUnits - 31) < 1e-9);
  assert.equal(result.differenceUnits, 0);
});

test('February, leap year, 30-day month, decimal rate, and cents reconcile', () => {
  const normalFeb = calculateElectricityBill({ year: 2025, month: 2, rate: 8.125, commonUnits: 0, roomUnits: { R1: 28 }, guests: [guest('F', 'R1', '2025-02-01')] });
  const leapFeb = calculateElectricityBill({ year: 2024, month: 2, rate: 8.125, commonUnits: 0, roomUnits: { R1: 29 }, guests: [guest('L', 'R1', '2024-02-01')] });
  const june = calculateElectricityBill({ year: 2026, month: 6, rate: 8.125, commonUnits: 0, roomUnits: { R1: 30 }, guests: [guest('J', 'R1', '2026-06-01')] });
  assert.equal(normalFeb.bills[0].stayDays, 28);
  assert.equal(leapFeb.bills[0].stayDays, 29);
  assert.equal(june.bills[0].stayDays, 30);
  assert.equal(normalFeb.differenceCost, 0);
  assert.equal(leapFeb.allocatedCost, leapFeb.totalCost);
});

test('invalid dates and overlapping room assignments raise review exceptions', () => {
  const invalid: ElectricityGuestInput = { id: 'X', name: 'X', segments: [{ residentId: 'X', residentName: 'X', room: 'R1', checkIn: '2026-08-01' }, { residentId: 'X', residentName: 'X', room: 'R2', checkIn: '2026-08-10' }, { residentId: 'X', residentName: 'X', room: 'R3', checkIn: '2026-08-10', checkOut: '2026-08-01' }] };
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 10, roomUnits: {}, guests: [invalid] });
  assert.ok(result.exceptions.some(x => x.includes('check-out date before check-in')));
  assert.ok(result.exceptions.some(x => x.includes('multiple rooms')));
});

test('August 2026 example reconciles to 1,328 units and ₹10,624', () => {
  const result = calculateElectricityBill({ year: 2026, month: 8, rate: 8, commonUnits: 202, roomUnits: { 'Room 1': 150, 'Room 2': 201, 'Room 3': 766, 'Room 4': 9 }, guests: [guest('Jatin', 'Room 1', '2026-08-04'), guest('Tirankar', 'Room 1', '2026-08-22'), guest('Akshay', 'Room 1', '2026-08-27', '2026-08-31'), guest('Mohit', 'Room 2', '2026-08-01'), guest('Ayush', 'Room 2', '2026-08-01'), guest('Sahil', 'Room 2', '2026-08-01'), guest('Shilok', 'Room 3', '2026-08-01'), guest('Prabjan', 'Room 3', '2026-08-01'), guest('Malhar', 'Room 3', '2026-08-01'), guest('Shreekant Ramesh', 'Room 4', '2026-08-23')] });
  assert.equal(result.totalUnits, 1328);
  assert.equal(result.totalCost, 10624);
  assert.ok(Math.abs(result.differenceUnits) < 1e-9);
  assert.equal(result.allocatedCost, 10624);
});
