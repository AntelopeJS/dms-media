import { inflateRawSync } from "node:zlib";

const END_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const END_ENTRY_COUNT_OFFSET = 10;
const END_DIRECTORY_OFFSET = 16;
const CENTRAL_HEADER_SIZE = 46;
const CENTRAL_METHOD_OFFSET = 10;
const CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const CENTRAL_LOCAL_OFFSET = 42;
const LOCAL_HEADER_SIZE = 30;
const LOCAL_NAME_LENGTH_OFFSET = 26;
const LOCAL_EXTRA_LENGTH_OFFSET = 28;
const METHOD_DEFLATE = 8;

/** One file of a zip archive: its path inside the archive and its uncompressed bytes. */
export interface ZipEntry {
  name: string;
  bytes: Buffer;
}

/** The entries of a zip archive, read from its central directory. */
export function readZip(zip: Buffer): ZipEntry[] {
  const end = zip.lastIndexOf(END_SIGNATURE);
  if (end < 0) return [];
  const count = zip.readUInt16LE(end + END_ENTRY_COUNT_OFFSET);
  let offset = zip.readUInt32LE(end + END_DIRECTORY_OFFSET);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = zip.readUInt16LE(offset + CENTRAL_NAME_LENGTH_OFFSET);
    const extraLength = zip.readUInt16LE(offset + CENTRAL_EXTRA_LENGTH_OFFSET);
    const commentLength = zip.readUInt16LE(
      offset + CENTRAL_COMMENT_LENGTH_OFFSET,
    );
    const local = zip.readUInt32LE(offset + CENTRAL_LOCAL_OFFSET);
    const dataStart =
      local +
      LOCAL_HEADER_SIZE +
      zip.readUInt16LE(local + LOCAL_NAME_LENGTH_OFFSET) +
      zip.readUInt16LE(local + LOCAL_EXTRA_LENGTH_OFFSET);
    const compressed = zip.subarray(
      dataStart,
      dataStart + zip.readUInt32LE(offset + CENTRAL_COMPRESSED_SIZE_OFFSET),
    );
    const isDeflated =
      zip.readUInt16LE(offset + CENTRAL_METHOD_OFFSET) === METHOD_DEFLATE;
    const nameStart = offset + CENTRAL_HEADER_SIZE;
    entries.push({
      name: zip.toString("utf8", nameStart, nameStart + nameLength),
      bytes: isDeflated ? inflateRawSync(compressed) : Buffer.from(compressed),
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The entry names of a zip archive. */
export function zipEntryNames(zip: Buffer): string[] {
  return readZip(zip).map((entry) => entry.name);
}
