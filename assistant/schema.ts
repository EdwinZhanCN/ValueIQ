// Small JSON Schema validator (subset) for tool arguments. Never coerces.

export interface JsonSchema {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  pattern?: string;
}

/** Returns a list of problems (empty = valid). */
export function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path = "$",
): string[] {
  const out: string[] = [];
  const t = schema.type;
  const isObj =
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (t === "object") {
    if (!isObj) return [`${path}: expected object`];
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? [])
      if (!(k in o) || o[k] === undefined) out.push(`${path}.${k}: required`);
    for (const [k, v] of Object.entries(o)) {
      const sub = schema.properties?.[k];
      if (!sub) {
        if (schema.additionalProperties === false)
          out.push(`${path}.${k}: unexpected property`);
        continue;
      }
      out.push(...validateSchema(sub, v, `${path}.${k}`));
    }
    return out;
  }
  if (t === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (schema.minItems !== undefined && value.length < schema.minItems)
      out.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      out.push(`${path}: too many items`);
    if (schema.items)
      value.forEach((v, i) =>
        out.push(
          ...validateSchema(schema.items as JsonSchema, v, `${path}[${i}]`),
        ),
      );
    return out;
  }
  if (t === "string") {
    if (typeof value !== "string") return [`${path}: expected string`];
    if (schema.minLength !== undefined && value.length < schema.minLength)
      out.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      out.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      out.push(`${path}: does not match pattern`);
  } else if (t === "number" || t === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return [`${path}: expected finite number`];
    if (t === "integer" && !Number.isInteger(value))
      out.push(`${path}: expected integer`);
    if (schema.minimum !== undefined && value < schema.minimum)
      out.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum)
      out.push(`${path}: above maximum`);
  } else if (t === "boolean") {
    if (typeof value !== "boolean") return [`${path}: expected boolean`];
  }
  if (schema.enum && !schema.enum.includes(value as string | number))
    out.push(`${path}: not an allowed value`);
  return out;
}

/** Gemini's function-declaration schema subset (uppercase types, no additionalProperties). */
export function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (s.type) o["type"] = s.type.toUpperCase();
  if (s.description) o["description"] = s.description;
  if (s.enum) o["enum"] = s.enum.map(String);
  for (const k of [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "pattern",
  ] as const)
    if (s[k] !== undefined) o[k] = s[k];
  if (s.required?.length) o["required"] = s.required;
  if (s.items) o["items"] = toGeminiSchema(s.items);
  if (s.properties)
    o["properties"] = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  return o;
}
