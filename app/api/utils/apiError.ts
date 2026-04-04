export function apiError(status: number, title: string): { errors: { status: string; title: string }[] } {
  return { errors: [{ status: String(status), title }] };
}
