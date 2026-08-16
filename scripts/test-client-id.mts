import assert from "node:assert/strict";
import { createClientId } from "../lib/client-id.ts";

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

function setCrypto(cryptoApi: Partial<Crypto>) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoApi,
  });
}

try {
  let nativeCalls = 0;
  const nativeId = "12345678-1234-4123-8123-123456789abc";
  setCrypto({
    randomUUID: () => {
      nativeCalls += 1;
      return nativeId;
    },
    getRandomValues: () => {
      throw new Error("getRandomValues should not be used when randomUUID is available");
    },
  });

  assert.equal(createClientId(), nativeId);
  assert.equal(nativeCalls, 1, "the native randomUUID implementation should be used");

  let seed = 0;
  setCrypto({
    getRandomValues: array => {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = (seed + index) & 0xff;
      }
      seed += array.length;
      return array;
    },
  });

  const firstFallbackId = createClientId();
  const secondFallbackId = createClientId();
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  assert.match(firstFallbackId, uuidV4Pattern);
  assert.match(secondFallbackId, uuidV4Pattern);
  assert.notEqual(firstFallbackId, secondFallbackId);

  console.log("Client ID compatibility tests passed.");
} finally {
  if (originalCrypto) {
    Object.defineProperty(globalThis, "crypto", originalCrypto);
  } else {
    delete (globalThis as { crypto?: Crypto }).crypto;
  }
}
