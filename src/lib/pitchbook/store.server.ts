// In-memory store for generated PPT files (server-only).
const FILES = new Map<string, Uint8Array>();

export function putFile(name: string, data: Uint8Array): void {
  FILES.set(name, data);
}

export function getFile(name: string): Uint8Array | undefined {
  return FILES.get(name);
}