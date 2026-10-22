export function referenceLabel(reference: { id: number; nama: string }) {
  return reference.nama.trim() ? `${reference.nama} · #${reference.id}` : `ID #${reference.id} (nama tidak tersedia)`
}
