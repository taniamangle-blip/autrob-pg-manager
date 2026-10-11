export type OccupancySegment = {
  residentId: string;
  residentName: string;
  room: string;
  property?: string;
  checkIn: string;
  checkOut?: string;
};

export type ElectricityGuestInput = {
  id: string;
  name: string;
  segments: OccupancySegment[];
};

export type ElectricityBillLine = {
  residentId: string;
  name: string;
  room: string;
  stayDays: number;
  roomUnits: number;
  commonUnits: number;
  totalUnits: number;
  rate: number;
  amount: number;
  roomDays: Record<string, number>;
};

export type ElectricityCalculation = {
  bills: ElectricityBillLine[];
  roomSummary: { room: string; units: number; occupants: number; personDays: number; cost: number; allocatedCommonUnits: number }[];
  totalRoomUnits: number;
  commonUnits: number;
  totalUnits: number;
  totalCost: number;
  allocatedUnits: number;
  allocatedCost: number;
  differenceUnits: number;
  differenceCost: number;
  unallocatedRooms: { room: string; units: number }[];
  exceptions: string[];
};

const parseDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function meterConsumption(current: number, previous?: number | null, mode: 'readings' | 'direct' = 'readings') {
  if (!Number.isFinite(current) || current < 0) throw new Error('Meter values must be zero or more.');
  if (mode === 'direct') return current;
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous < 0) throw new Error('A valid previous meter reading is required.');
  if (current < previous) throw new Error('Current meter reading cannot be lower than previous reading.');
  return current - previous;
}

export function calculateElectricityBill(input: {
  year: number;
  month: number;
  rate: number;
  commonUnits: number;
  roomUnits: Record<string, number>;
  guests: ElectricityGuestInput[];
}): ElectricityCalculation {
  const { year, month, rate } = input;
  if (!Number.isInteger(year) || month < 1 || month > 12) throw new Error('Choose a valid billing month and year.');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Enter a positive electricity rate.');
  if (!Number.isFinite(input.commonUnits) || input.commonUnits < 0) throw new Error('Common-area units cannot be negative.');
  for (const [room, units] of Object.entries(input.roomUnits)) if (!Number.isFinite(units) || units < 0) throw new Error(`Room ${room} units cannot be negative.`);

  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const occupants = new Map<string, Map<string, { name: string; days: Set<string>; roomDays: Map<string, Set<string>> }>>();
  const exceptions: string[] = [];

  for (const guest of input.guests) {
    const uniqueDays = new Set<string>();
    const roomDays = new Map<string, Set<string>>();
    const daysToRoom = new Map<string, string>();
    for (const segment of guest.segments) {
      const start = parseDay(segment.checkIn);
      const end = segment.checkOut ? parseDay(segment.checkOut) : last;
      if (!start || !end) {
        exceptions.push(`${guest.name} has an invalid check-in or check-out date.`);
        continue;
      }
      if (end < start) {
        exceptions.push(`${guest.name} has a check-out date before check-in.`);
        continue;
      }
      const from = start > first ? start : first;
      const to = end < last ? end : last;
      if (to < from) continue;
      for (let date = new Date(from); date <= to; date.setUTCDate(date.getUTCDate() + 1)) {
        const key = dayKey(date);
        const previousRoom = daysToRoom.get(key);
        if (previousRoom && previousRoom !== segment.room) {
          exceptions.push(`${guest.name} is assigned to multiple rooms on ${key}.`);
          continue;
        }
        daysToRoom.set(key, segment.room);
        uniqueDays.add(key);
        const roomSet = roomDays.get(segment.room) || new Set<string>();
        roomSet.add(key);
        roomDays.set(segment.room, roomSet);
      }
    }
    if (uniqueDays.size) occupants.set(guest.id, new Map([[guest.id, { name: guest.name, days: uniqueDays, roomDays }]]));
  }

  const allGuestDays = new Set<string>();
  const roomPersonDays = new Map<string, number>();
  const guestRows: { id: string; name: string; days: number; roomDays: Map<string, Set<string>> }[] = [];
  for (const [id, container] of occupants) {
    const guest = container.get(id)!;
    guest.days.forEach(day => allGuestDays.add(`${id}|${day}`));
    for (const [room, days] of guest.roomDays) roomPersonDays.set(room, (roomPersonDays.get(room) || 0) + days.size);
    guestRows.push({ id, name: guest.name, days: guest.days.size, roomDays: guest.roomDays });
  }

  const totalRoomUnits = Object.values(input.roomUnits).reduce((sum, units) => sum + units, 0);
  const totalPersonDays = allGuestDays.size;
  const unallocatedRooms = Object.entries(input.roomUnits).filter(([room, units]) => units > 0 && !roomPersonDays.get(room)).map(([room, units]) => ({ room, units }));
  for (const row of unallocatedRooms) exceptions.push(`Room ${row.room} has ${row.units} electricity units but no billable occupants.`);
  if (input.commonUnits > 0 && !totalPersonDays) exceptions.push(`${input.commonUnits} common-area units have no billable occupants.`);

  const bills = guestRows.map(guest => {
    let roomUnits = 0;
    const roomDays: Record<string, number> = {};
    for (const [room, days] of guest.roomDays) {
      roomDays[room] = days.size;
      const consumed = input.roomUnits[room] || 0;
      const personDays = roomPersonDays.get(room) || 0;
      if (personDays) roomUnits += consumed * days.size / personDays;
    }
    const commonUnits = totalPersonDays ? input.commonUnits * guest.days / totalPersonDays : 0;
    const totalUnits = roomUnits + commonUnits;
    return { residentId: guest.id, name: guest.name, room: Object.keys(roomDays).join(', '), stayDays: guest.days, roomUnits, commonUnits, totalUnits, rate, amount: cents(totalUnits * rate), roomDays };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const totalUnits = totalRoomUnits + input.commonUnits;
  const totalCost = cents(totalUnits * rate);
  const allocatedUnits = bills.reduce((sum, bill) => sum + bill.totalUnits, 0) + unallocatedRooms.reduce((sum, row) => sum + row.units, 0) + (totalPersonDays ? 0 : input.commonUnits);
  let allocatedCost = bills.reduce((sum, bill) => sum + bill.amount, 0) + unallocatedRooms.reduce((sum, row) => sum + cents(row.units * rate), 0) + (!totalPersonDays ? cents(input.commonUnits * rate) : 0);
  const differenceCost = cents(totalCost - allocatedCost);
  if (bills.length) {
    bills[bills.length - 1].amount = cents(bills[bills.length - 1].amount + differenceCost);
    allocatedCost = cents(allocatedCost + differenceCost);
  }

  const allocatedCommon = new Map<string, number>();
  for (const bill of bills) for (const room of Object.keys(bill.roomDays)) allocatedCommon.set(room, (allocatedCommon.get(room) || 0) + bill.commonUnits * (bill.roomDays[room] / bill.stayDays));
  const roomSummary = Object.entries(input.roomUnits).map(([room, units]) => ({
    room, units, occupants: guestRows.filter(guest => guest.roomDays.has(room)).length,
    personDays: roomPersonDays.get(room) || 0, cost: cents(units * rate),
    allocatedCommonUnits: allocatedCommon.get(room) || 0,
  }));

  const differenceUnits = totalUnits - allocatedUnits;
  return { bills, roomSummary, totalRoomUnits, commonUnits: input.commonUnits, totalUnits, totalCost, allocatedUnits, allocatedCost, differenceUnits: Math.abs(differenceUnits) < 1e-9 ? 0 : differenceUnits, differenceCost: cents(totalCost - allocatedCost), unallocatedRooms, exceptions };
}
