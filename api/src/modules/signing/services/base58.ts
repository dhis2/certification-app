const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(58);

export function base58Encode(buffer: Buffer): string {
  if (buffer.length === 0) return '';

  let num = BigInt(`0x${buffer.toString('hex')}`);
  let result = '';

  while (num > 0) {
    const remainder = num % BASE;
    num = num / BASE;
    result = BASE58_ALPHABET.charAt(Number(remainder)) + result;
  }

  for (const byte of buffer) {
    if (byte === 0) {
      result = BASE58_ALPHABET.charAt(0) + result;
    } else {
      break;
    }
  }

  return result;
}

export function base58Decode(encoded: string): Uint8Array {
  if (encoded.length === 0) return new Uint8Array(0);

  const charMap = new Map<string, bigint>();
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    charMap.set(BASE58_ALPHABET[i], BigInt(i));
  }

  let leadingZeros = 0;
  for (const char of encoded) {
    if (char === BASE58_ALPHABET[0]) {
      leadingZeros++;
    } else {
      break;
    }
  }

  let num = BigInt(0);
  for (const char of encoded) {
    const value = charMap.get(char);
    if (value === undefined) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }
    num = num * BASE + value;
  }

  if (num === BigInt(0)) {
    return new Uint8Array(leadingZeros);
  }

  const hex = num.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  const bytes = Buffer.from(paddedHex, 'hex');

  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);

  return result;
}
