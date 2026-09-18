export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—_:]/g, ' ')
    .replace(/[^a-z0-9\s']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createDuplicateKey(title: string): string {
  return normalizeTitle(title)
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}
