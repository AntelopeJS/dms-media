const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const CENTRAL_HEADER_SIZE = 46;

/** The entry names of a zip, read from its central directory. */
export function zipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (
    offset >= 0 &&
    zip.readUInt32LE(offset) === CENTRAL_DIRECTORY_SIGNATURE
  ) {
    const nameLength = zip.readUInt16LE(offset + CENTRAL_NAME_LENGTH_OFFSET);
    const extraLength = zip.readUInt16LE(offset + CENTRAL_EXTRA_LENGTH_OFFSET);
    const commentLength = zip.readUInt16LE(
      offset + CENTRAL_COMMENT_LENGTH_OFFSET,
    );
    const start = offset + CENTRAL_HEADER_SIZE;
    names.push(zip.subarray(start, start + nameLength).toString("utf8"));
    offset = start + nameLength + extraLength + commentLength;
  }
  return names;
}
