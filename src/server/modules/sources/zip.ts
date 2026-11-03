import { inflateRawSync } from "node:zlib";

/**
 * Lector mínimo de ZIP para los archivos de datos abiertos del SMN (un único archivo de texto).
 * Recorre el directorio central y limita el tamaño descomprimido para evitar bombas zip.
 */
export function readZipEntries(buf: Buffer, maxUncompressed = 5_000_000) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP inválido: falta el directorio central");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP inválido");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("latin1");
    if (usize > maxUncompressed) throw new Error("Archivo comprimido demasiado grande");
    const lnlen = buf.readUInt16LE(local + 26), lelen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: maxUncompressed }) : null;
    if (data) out.push({ name, data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
