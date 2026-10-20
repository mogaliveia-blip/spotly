export const PROGRAM_PHOTO_MAX_BYTES = 2 * 1024 * 1024

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function validateProgramPhotoFile(file: Pick<File, 'size' | 'type'>): string {
  const extension = extensionByMime[file.type]
  if (!extension) throw new Error('PROGRAM_PHOTO_INVALID_TYPE')
  if (!file.size || file.size > PROGRAM_PHOTO_MAX_BYTES) throw new Error('PROGRAM_PHOTO_INVALID_SIZE')
  return extension
}

export function makeProgramPhotoPath(eventId: string, itemId: string, file: Pick<File, 'size' | 'type'>, id: string): string {
  const extension = validateProgramPhotoFile(file)
  if (!eventId || eventId === '.' || eventId === '..' || eventId.includes('/') ||
      !itemId || itemId === '.' || itemId === '..' || itemId.includes('/') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('PROGRAM_PHOTO_INVALID_PATH')
  }
  const path = `events/${eventId}/program/${itemId}/photo-${id}.${extension}`
  if (path.length > 500) throw new Error('PROGRAM_PHOTO_INVALID_PATH')
  return path
}

export function isOwnProgramPhotoPath(eventId: string, itemId: string, path: string): boolean {
  return path.startsWith(`events/${eventId}/program/${itemId}/`) &&
    /^photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(path.split('/').at(-1) ?? '')
}
