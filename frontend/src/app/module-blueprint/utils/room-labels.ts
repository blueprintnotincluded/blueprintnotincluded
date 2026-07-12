import { RoomTypeId } from "../../../../../lib/index";

// Display names for the server-derived room types (RoomTypeId). Shared by the
// editor Room overlay, discover filter options, and blueprint card/detail chips.
export const ROOM_TYPE_LABELS: Record<RoomTypeId, string> = {
  latrine: $localize`:room overlay label:Latrine`,
  washroom: $localize`:room overlay label:Washroom`,
  barracks: $localize`:room overlay label:Barracks`,
  luxuryBarracks: $localize`:room overlay label:Luxury Barracks`,
  privateBedroom: $localize`:room overlay label:Private Bedroom`,
  messHall: $localize`:room overlay label:Mess Hall`,
  greatHall: $localize`:room overlay label:Great Hall`,
  banquetHall: $localize`:room overlay label:Banquet Hall`,
  massageClinic: $localize`:room overlay label:Massage Clinic`,
  hospital: $localize`:room overlay label:Hospital`,
  recreationRoom: $localize`:room overlay label:Recreation Room`,
  park: $localize`:room overlay label:Park`,
  natureReserve: $localize`:room overlay label:Nature Reserve`,
  kitchen: $localize`:room overlay label:Kitchen`,
  powerPlant: $localize`:room overlay label:Power Plant`,
  greenhouse: $localize`:room overlay label:Greenhouse`,
  laboratory: $localize`:room overlay label:Laboratory`,
  stable: $localize`:room overlay label:Stable`,
};

// Rooms arrive as string[] from the API; unknown values (newer server enum)
// fall back to the raw id rather than disappearing.
export function roomTypeLabel(room: string): string {
  return ROOM_TYPE_LABELS[room as RoomTypeId] ?? room;
}
