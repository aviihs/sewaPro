/** Minimal byte sequences with the right magic numbers for each upload type. */
export const SAMPLE_FILES = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  webp: Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'),
  pdf: Buffer.from('%PDF-1.7\n'),
  html: Buffer.from('<html><script>alert(1)</script></html>'),
};
