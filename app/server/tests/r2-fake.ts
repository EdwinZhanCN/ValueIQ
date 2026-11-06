// An in-memory R2 bucket for unit tests: only the calls the file modules make.
type Body = string | ArrayBuffer | ArrayBufferView | Blob;

interface Stored {
  bytes: Uint8Array;
  etag: string;
  contentType?: string;
}

async function toBytes(v: Body): Promise<Uint8Array> {
  if (typeof v === "string") return new TextEncoder().encode(v);
  if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
  if (ArrayBuffer.isView(v))
    return new Uint8Array(
      v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength),
    );
  return new Uint8Array(v.slice(0));
}

export class FakeR2 {
  readonly objects = new Map<string, Stored>();
  /** How many times each key was fetched with get() (to prove cache hits skip the source). */
  readonly gets = new Map<string, number>();
  private n = 0;

  async put(
    key: string,
    value: Body,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    const bytes = await toBytes(value);
    this.objects.set(key, {
      bytes,
      etag: `etag-${++this.n}`,
      ...(opts?.httpMetadata?.contentType
        ? { contentType: opts.httpMetadata.contentType }
        : {}),
    });
  }

  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { key, etag: o.etag, size: o.bytes.length } : null;
  }

  async get(key: string) {
    const o = this.objects.get(key);
    this.gets.set(key, (this.gets.get(key) ?? 0) + 1);
    if (!o) return null;
    return {
      key,
      etag: o.etag,
      size: o.bytes.length,
      arrayBuffer: async () => o.bytes.slice().buffer,
      text: async () => new TextDecoder().decode(o.bytes),
      json: async () =>
        JSON.parse(new TextDecoder().decode(o.bytes)) as unknown,
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }

  asBucket(): R2Bucket {
    return this as unknown as R2Bucket;
  }
}
