/**
 * Reader for the Geoseade municipal limits data: accepts either the raw limite_municipal.zip
 * or the uncompressed LimiteMunicipal.dbf buffer, extracting the 645 municipalities and their
 * respective Government Region (43 RGs) and Administrative Region attributes.
 *
 * @typedef {{
 *   code: string,
 *   name: string,
 *   gidRg: string,
 *   governmentRegionCode: string,
 *   governmentRegionName: string,
 *   gidRa: string,
 *   geoseadeRaName: string
 * }} GeoseadeRow
 *
 * @typedef {{
 *   name: string,
 *   type: string,
 *   len: number
 * }} DbfFieldDescriptor
 */

import zlib from "node:zlib";

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const DBF_HEADER_VERSION = 0x03;
const DBF_HEADER_TERMINATOR = 0x0d;
const DEFLATE_COMPRESSION_METHOD = 8;
const MUNICIPALITY_CODE_PATTERN = /^\d{7}$/;

/**
 * Parses Geoseade rows from zip or dbf binary content.
 * @param {Uint8Array} bytes
 * @returns {GeoseadeRow[]}
 */
export function readGeoseadeRows(bytes) {
  const dbfBuffer = extractDbfBuffer(bytes);
  return parseDbfRecords(dbfBuffer);
}

/**
 * Formats a Government Region code from its numeric identifier.
 * Example: "1" becomes "rg-1".
 * @param {string | number} gidRg
 * @returns {string}
 */
export function formatGovernmentRegionCode(gidRg) {
  return `rg-${String(gidRg).trim()}`;
}

/**
 * Extracts the DBF byte buffer from a ZIP buffer, or returns the buffer if already DBF.
 * @param {Uint8Array} bytes
 * @returns {Buffer}
 */
export function extractDbfBuffer(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 4) {
    throw new Error("Geoseade input buffer is too small");
  }

  const signature = buffer.readUInt32LE(0);
  if (signature !== ZIP_LOCAL_FILE_SIGNATURE) {
    if (buffer[0] === DBF_HEADER_VERSION) {
      return buffer;
    }
    throw new Error("Geoseade input is neither a valid ZIP archive nor a valid DBF file");
  }

  return extractDbfFromZip(buffer);
}

/**
 * Searches local file headers in the ZIP archive for a .dbf entry and decompresses it.
 * @param {Buffer} zipBuffer
 * @returns {Buffer}
 */
function extractDbfFromZip(zipBuffer) {
  let offset = 0;
  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== ZIP_LOCAL_FILE_SIGNATURE) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);

    const nameOffset = offset + 30;
    const fileName = zipBuffer.toString("utf8", nameOffset, nameOffset + fileNameLength);
    const dataOffset = nameOffset + fileNameLength + extraFieldLength;

    if (fileName.toLowerCase().endsWith(".dbf")) {
      const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === DEFLATE_COMPRESSION_METHOD) {
        return zlib.inflateRawSync(compressedData);
      }
      return Buffer.from(compressedData);
    }

    offset = dataOffset + compressedSize;
  }

  throw new Error("No .dbf file found inside the Geoseade ZIP archive");
}

/**
 * Parses dBase III/IV records from a DBF buffer into structured rows.
 * @param {Buffer} dbfBuffer
 * @returns {GeoseadeRow[]}
 */
export function parseDbfRecords(dbfBuffer) {
  if (dbfBuffer.length < 32) {
    throw new Error("DBF buffer too small for header");
  }

  const numRecords = dbfBuffer.readUInt32LE(4);
  const headerLength = dbfBuffer.readUInt16LE(8);
  const recordLength = dbfBuffer.readUInt16LE(10);
  const fields = readFieldDescriptors(dbfBuffer, headerLength);

  /** @type {GeoseadeRow[]} */
  const rows = [];
  for (let recordIndex = 0; recordIndex < numRecords; recordIndex += 1) {
    const recordStart = headerLength + recordIndex * recordLength;
    if (recordStart + recordLength > dbfBuffer.length) {
      break;
    }

    // Byte 0 is deletion flag (' ' = valid, '*' = deleted)
    const deletionFlag = dbfBuffer[recordStart];
    if (deletionFlag === 0x2a) {
      continue;
    }

    let fieldOffset = recordStart + 1;
    /** @type {Record<string, string>} */
    const record = {};
    for (const field of fields) {
      const rawText = dbfBuffer.toString("utf8", fieldOffset, fieldOffset + field.len);
      record[field.name] = normalizeLabel(rawText);
      fieldOffset += field.len;
    }

    const code = record.Cod_ibge ?? "";
    if (!MUNICIPALITY_CODE_PATTERN.test(code)) {
      continue;
    }

    const gidRg = record.GID_RG ?? "";
    rows.push({
      code,
      name: record.Municipio ?? "",
      gidRg,
      governmentRegionCode: formatGovernmentRegionCode(gidRg),
      governmentRegionName: record.RG ?? "",
      gidRa: record.GID_RA ?? "",
      geoseadeRaName: record.RA ?? "",
    });
  }

  return rows;
}

/**
 * Reads field descriptors from the DBF header.
 * @param {Buffer} buffer
 * @param {number} headerLength
 * @returns {DbfFieldDescriptor[]}
 */
function readFieldDescriptors(buffer, headerLength) {
  const fields = [];
  let offset = 32;
  const maxDescriptorOffset = headerLength - 1;

  while (offset < maxDescriptorOffset) {
    if (buffer[offset] === DBF_HEADER_TERMINATOR) {
      break;
    }
    const rawName = buffer.toString("ascii", offset, offset + 11);
    const nullIndex = rawName.indexOf("\0");
    let name = rawName;
    if (nullIndex >= 0) {
      name = rawName.slice(0, nullIndex);
    }
    name = name.trim();

    const type = String.fromCharCode(buffer[offset + 11]);
    const len = buffer[offset + 16];
    fields.push({ name, type, len });
    offset += 32;
  }

  return fields;
}

/**
 * Collapses runs of whitespace into a single space and trims ends.
 * @param {string} text
 * @returns {string}
 */
function normalizeLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}
