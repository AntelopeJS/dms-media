import { crc32 } from "node:zlib";

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const UTF8_NAME_FLAG = 0x0800;
const STORED_METHOD = 0;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const DOS_EPOCH_YEAR = 1980;
const MAX_ZIP32_BYTES = 0xffffffff;

interface CentralEntry {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

export type ZipChunkWriter = (chunk: Buffer) => void;

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), DOS_EPOCH_YEAR);
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - DOS_EPOCH_YEAR) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function localHeader(entry: CentralEntry): Buffer {
  const header = Buffer.alloc(LOCAL_HEADER_SIZE);
  header.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(UTF8_NAME_FLAG, 6);
  header.writeUInt16LE(STORED_METHOD, 8);
  header.writeUInt16LE(entry.time, 10);
  header.writeUInt16LE(entry.date, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  return Buffer.concat([header, entry.name]);
}

function centralHeader(entry: CentralEntry): Buffer {
  const header = Buffer.alloc(CENTRAL_HEADER_SIZE);
  header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(ZIP_VERSION, 6);
  header.writeUInt16LE(UTF8_NAME_FLAG, 8);
  header.writeUInt16LE(STORED_METHOD, 10);
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(END_RECORD_SIZE);
  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
}

/** Gives every entry a distinct name: `photo.jpg`, `photo (2).jpg`, … */
export function uniqueEntryName(name: string, taken: Set<string>): string {
  let candidate = name;
  let index = 1;
  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    const dot = name.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${name.slice(0, dot)} (${index})${name.slice(dot)}`
        : `${name} (${index})`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Writes an uncompressed zip archive entry by entry: files are already compressed media. */
export class ZipWriter {
  private readonly entries: CentralEntry[] = [];
  private offset = 0;

  constructor(private readonly write: ZipChunkWriter) {}

  addFile(name: string, data: Buffer, modifiedAt: Date): void {
    const stamp = dosDateTime(modifiedAt);
    const entry: CentralEntry = {
      name: Buffer.from(name, "utf8"),
      crc: crc32(data),
      size: data.length,
      offset: this.offset,
      time: stamp.time,
      date: stamp.date,
    };
    const header = localHeader(entry);
    if (this.offset + header.length + data.length > MAX_ZIP32_BYTES) {
      throw new Error("Archive exceeds the zip size limit");
    }
    this.write(header);
    this.write(data);
    this.offset += header.length + data.length;
    this.entries.push(entry);
  }

  finish(): void {
    const directory = Buffer.concat(this.entries.map(centralHeader));
    this.write(directory);
    this.write(endRecord(this.entries.length, directory.length, this.offset));
  }
}
