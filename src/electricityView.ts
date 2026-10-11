import { calculateElectricityBill, meterConsumption, type ElectricityCalculation, type ElectricityGuestInput } from './electricity';

type ResidentLike = {
  id?: string; name: string; property: string; propertyId?: string | null; room: string; moveIn?: string;
  checkInDate?: string; checkOutDate?: string; exitDate?: string; joined: string; stayType?: 'Monthly' | 'Day Pass';
  color: string; roomHistory?: { previousProperty: string; previousRoom: string; currentProperty: string; currentRoom: string; switchedAt: string }[];
};
type PropertyLike = { id: string; name: string };
type RoomLike = { id: string; propertyId: string; number: string; floorName: string };
type ReadingLike = { propertyId: string; meterType: 'Main meter' | 'Sub meter'; year: number; month: number; floorName: string; roomId: string | null; roomNumber: string; commonReading: number; reading: number | null; readingMode?: 'readings' | 'direct'; previousReading?: number | null; previousCommonReading?: number | null };
type Allocation = { id: string; name: string; color: string; stayType: 'Monthly' | 'Day Pass'; property: string; floor: string; room: string; days: number; roomPersonDays: number; floorPersonDays: number; roomUnits: number | null; commonUnits: number | null; totalUnits: number | null; rate: number; amount: number | null };
type RoomSummary = ElectricityCalculation['roomSummary'][number] & { room: string };

const isoDay = (value?: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const roomNo = (value: string) => String(value || '').replace(/^Room\s+/i, '').split(/\s+[·-]\s+Bed\s+/i)[0].trim();

function residentSegments(r: ResidentLike): ElectricityGuestInput['segments'] {
  const fromStart = isoDay(r.moveIn || r.checkInDate || r.joined);
  if (!fromStart) return [];
  const history = [...(r.roomHistory || [])].sort((a, b) => a.switchedAt.localeCompare(b.switchedAt));
  let property = history[0]?.previousProperty || r.property;
  let room = roomNo(history[0]?.previousRoom || r.room);
  let from = fromStart;
  const segments: ElectricityGuestInput['segments'] = [];
  for (const event of history) {
    const switched = isoDay(event.switchedAt);
    if (!switched) continue;
    const dayBefore = new Date(`${switched}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const through = dayBefore.toISOString().slice(0, 10);
    if (room && property && through >= from) segments.push({ residentId: r.id || r.name, residentName: r.name, room, property, checkIn: from, checkOut: through });
    property = event.currentProperty;
    room = roomNo(event.currentRoom);
    from = switched;
  }
  const checkOut = isoDay(r.checkOutDate || r.exitDate);
  if (room) segments.push({ residentId: r.id || r.name, residentName: r.name, room, property, checkIn: from, checkOut: checkOut || undefined });
  return segments;
}

export function calculateElectricityView(data: { properties: PropertyLike[]; rooms: RoomLike[]; residents: ResidentLike[]; meterReadings: ReadingLike[] }, propertyScope: string, period: string, rate: number) {
  const [year, month] = period.split('-').map(Number);
  const properties = data.properties.filter(p => propertyScope === 'All properties' || p.name === propertyScope);
  const allocations: Allocation[] = [];
  const roomSummary: RoomSummary[] = [];
  const exceptions: string[] = [];
  let totalRoomUnits = 0, commonUnits = 0, totalUnits = 0, totalCost = 0, allocatedUnits = 0, allocatedCost = 0;

  for (const property of properties) {
    const current = data.meterReadings.filter(r => r.propertyId === property.id && r.meterType === 'Sub meter' && r.year === year && r.month === month);
    const priorDate = new Date(year, month - 2, 1);
    const previous = data.meterReadings.filter(r => r.propertyId === property.id && r.meterType === 'Sub meter' && r.year === priorDate.getFullYear() && r.month === priorDate.getMonth() + 1);
    const roomUnits: Record<string, number> = {};
    const missingRooms = new Set<string>();
    for (const room of data.rooms.filter(r => r.propertyId === property.id)) {
      const row = current.find(r => r.roomId === room.id || r.roomNumber === room.number);
      if (!row || row.reading === null) {
        if (data.residents.some(r => (r.propertyId === property.id || r.property === property.name) && roomNo(r.room) === room.number)) missingRooms.add(room.number);
        continue;
      }
      const prior = previous.find(r => r.roomId === room.id || r.roomNumber === room.number);
      if (row.readingMode !== 'direct' && row.previousReading == null && (!prior || prior.reading === null)) { missingRooms.add(room.number); continue; }
      try { roomUnits[room.number] = row.readingMode === 'direct' ? meterConsumption(Number(row.reading), undefined, 'direct') : meterConsumption(Number(row.reading), Number(row.previousReading ?? prior!.reading)); }
      catch { exceptions.push(`${property.name}, Room ${room.number}: current meter reading is below the previous reading.`); missingRooms.add(room.number); }
    }

    const floors = [...new Set(data.rooms.filter(r => r.propertyId === property.id).map(r => r.floorName || 'Floor not set'))];
    let propertyCommonUnits = 0;
    let missingCommon = false;
    for (const floor of floors) {
      const row = current.find(r => (r.floorName || 'Floor not set') === floor);
      const prior = previous.find(r => (r.floorName || 'Floor not set') === floor);
      if (!row || row.readingMode !== 'direct' && row.previousCommonReading == null && !prior) { missingCommon = true; continue; }
      try { propertyCommonUnits += row.readingMode === 'direct' ? meterConsumption(Number(row.commonReading), undefined, 'direct') : meterConsumption(Number(row.commonReading), Number(row.previousCommonReading ?? prior!.commonReading)); }
      catch { exceptions.push(`${property.name}, ${floor}: common-area reading is below the previous reading.`); missingCommon = true; }
    }

    const guests = data.residents.flatMap(r => {
      const segments = residentSegments(r).filter(segment => segment.property === property.name);
      return segments.length ? [{ id: r.id || r.name, name: r.name, segments }] : [];
    });
    const result = calculateElectricityBill({ year, month, rate, commonUnits: propertyCommonUnits, roomUnits, guests });
    exceptions.push(...result.exceptions);
    for (const room of missingRooms) exceptions.push(`${property.name}, Room ${room}: a valid current and previous meter reading is required.`);
    if (missingCommon) exceptions.push(`${property.name}: one or more occupied floors are missing common-area readings.`);
    totalRoomUnits += result.totalRoomUnits; commonUnits += result.commonUnits; totalUnits += result.totalUnits;
    totalCost += result.totalCost; allocatedUnits += result.allocatedUnits; allocatedCost += result.allocatedCost;
    roomSummary.push(...result.roomSummary.map(row => ({ ...row, room: `${property.name} · ${row.room}` })));
    for (const bill of result.bills) {
      const resident = data.residents.find(r => (r.id || r.name) === bill.residentId);
      const rooms = Object.keys(bill.roomDays);
      const invalidRoom = rooms.some(room => missingRooms.has(room));
      const floorNames = rooms.map(n => data.rooms.find(r => r.propertyId === property.id && r.number === n)?.floorName || 'Floor not set').filter((f, i, all) => all.indexOf(f) === i);
      allocations.push({ id: bill.residentId, name: bill.name, color: resident?.color || 'mint', stayType: resident?.stayType || 'Monthly', property: property.name, floor: floorNames.join(', '), room: bill.room, days: bill.stayDays, roomPersonDays: Object.values(bill.roomDays).reduce((n, d) => n + d, 0), floorPersonDays: result.bills.reduce((n, line) => n + line.stayDays, 0), roomUnits: invalidRoom ? null : bill.roomUnits, commonUnits: missingCommon ? null : bill.commonUnits, totalUnits: invalidRoom || missingCommon ? null : bill.totalUnits, rate, amount: invalidRoom || missingCommon ? null : bill.amount });
    }
  }

  return {
    allocations: allocations.sort((a, b) => a.property.localeCompare(b.property) || a.room.localeCompare(b.room) || a.name.localeCompare(b.name)),
    summary: { totalRoomUnits, commonUnits, totalUnits, totalCost, allocatedUnits, allocatedCost, differenceUnits: Math.abs(totalUnits - allocatedUnits) < 1e-8 ? 0 : totalUnits - allocatedUnits, differenceCost: Math.round((totalCost - allocatedCost) * 100) / 100, roomSummary },
    exceptions: [...new Set(exceptions)],
  };
}
