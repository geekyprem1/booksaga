import sharp from 'sharp';
import { expect, it } from 'vitest';
import { normalizeImage } from './normalize-image';

it('re-encodes images, limits dimensions and strips appended data', async () => {
  const png = await sharp({ create: { width: 100, height: 200, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const output = await normalizeImage(
    Buffer.concat([png, Buffer.from('<script>untrusted</script>')]),
    50,
  );
  expect(await sharp(output).metadata()).toMatchObject({ format: 'webp', width: 25, height: 50 });
  expect(output.includes(Buffer.from('<script>'))).toBe(false);
});

it('rejects disguised and broken images', async () => {
  await expect(
    normalizeImage(Buffer.from('<svg><script>alert(1)</script></svg>')),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(
    normalizeImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
});
