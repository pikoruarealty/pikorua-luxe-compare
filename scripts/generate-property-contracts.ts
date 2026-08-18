import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface CanonicalField {
  name: string;
  type: string;
  required: boolean;
  visibility: "public" | "private_commercial" | "gated" | "internal";
  label: string;
  maxLength?: number;
  minimum?: number;
}

interface CanonicalSchema {
  version: number;
  fieldStates: string[];
  configurationKinds: string[];
  propertyTypes: string[];
  areaBases: string[];
  units: string[];
  ceilingHeightBases: string[];
  fields: CanonicalField[];
}

const root = resolve(import.meta.dir, "..");
const sourcePath = resolve(root, "schemas/property.v1.json");
const schema = JSON.parse(await readFile(sourcePath, "utf8")) as CanonicalSchema;

const quoted = (values: string[]) => values.map((value) => JSON.stringify(value)).join(", ");

function zodType(field: CanonicalField): string {
  let expression: string;
  switch (field.type) {
    case "integer":
      expression = "z.number().int()";
      break;
    case "decimal":
      expression = "z.number().finite()";
      break;
    case "date":
      expression = "z.string().date()";
      break;
    case "configurationKind":
      expression = "configurationKindSchema";
      break;
    case "propertyType":
      expression = "propertyTypeSchema";
      break;
    case "areaBasis":
      expression = "areaBasisSchema";
      break;
    case "unit":
      expression = "areaUnitSchema";
      break;
    case "ceilingHeightBasis":
      expression = "ceilingHeightBasisSchema";
      break;
    case "boolean":
      expression = "z.boolean()";
      break;
    case "stringArray":
      expression = "z.array(z.string().trim().max(200)).max(100)";
      break;
    default:
      expression = "z.string().trim()";
  }
  if (field.type !== "stringArray" && field.maxLength) expression += `.max(${field.maxLength})`;
  if (field.type !== "stringArray" && field.minimum !== undefined)
    expression += `.min(${field.minimum})`;
  if (!field.required) expression += ".nullable()";
  return expression;
}

const publicFields = schema.fields.filter((field) => field.visibility === "public");
const commercialFields = schema.fields.filter((field) => field.visibility === "private_commercial");
const gatedFields = schema.fields.filter((field) => field.visibility === "gated");
const metadata = schema.fields.map(({ name, label, required, visibility }) => ({
  name,
  label,
  required,
  visibility,
}));

const tsOutput =
  `// GENERATED from schemas/property.v1.json. Do not edit.\n` +
  `import { z } from "zod";\n\n` +
  `export const PROPERTY_SCHEMA_VERSION = ${schema.version} as const;\n` +
  `export const fieldStateSchema = z.enum([${quoted(schema.fieldStates)}]);\n` +
  `export const configurationKindSchema = z.enum([${quoted(schema.configurationKinds)}]);\n` +
  `export const propertyTypeSchema = z.enum([${quoted(schema.propertyTypes)}]);\n` +
  `export const areaBasisSchema = z.enum([${quoted(schema.areaBases)}]);\n` +
  `export const areaUnitSchema = z.enum([${quoted(schema.units)}]);\n` +
  `export const ceilingHeightBasisSchema = z.enum([${quoted(schema.ceilingHeightBases)}]);\n\n` +
  `export const canonicalPublicPropertySchema = z.object({\n${publicFields
    .map((field) => `  ${field.name}: ${zodType(field)},`)
    .join("\n")}\n}).strict();\n\n` +
  `export const canonicalCommercialTermsSchema = z.object({\n${commercialFields
    .map((field) => `  ${field.name}: ${zodType(field)},`)
    .join("\n")}\n}).strict();\n\n` +
  `export const canonicalGatedPropertySchema = z.object({\n${gatedFields
    .map((field) => `  ${field.name}: ${zodType(field)},`)
    .join("\n")}\n}).strict();\n\n` +
  `export type FieldState = z.infer<typeof fieldStateSchema>;\n` +
  `export type ConfigurationKind = z.infer<typeof configurationKindSchema>;\n` +
  `export type AreaUnit = z.infer<typeof areaUnitSchema>;\n` +
  `export type CanonicalPublicProperty = z.infer<typeof canonicalPublicPropertySchema>;\n` +
  `export type CanonicalCommercialTerms = z.infer<typeof canonicalCommercialTermsSchema>;\n` +
  `export type CanonicalGatedProperty = z.infer<typeof canonicalGatedPropertySchema>;\n\n` +
  `export const propertyFormMetadata = ${JSON.stringify(metadata, null, 2)} as const;\n`;

const pythonType = (field: CanonicalField): string => {
  const base =
    field.type === "integer"
      ? "int"
      : field.type === "decimal"
        ? "Decimal"
        : field.type === "date"
          ? "date"
          : field.type === "configurationKind"
            ? "ConfigurationKind"
            : field.type === "propertyType"
              ? "PropertyType"
              : field.type === "areaBasis"
                ? "AreaBasis"
                : field.type === "unit"
                  ? "AreaUnit"
                  : field.type === "ceilingHeightBasis"
                    ? "CeilingHeightBasis"
                    : field.type === "boolean"
                      ? "bool"
                      : field.type === "stringArray"
                        ? "list[str]"
                        : "str";
  return field.required ? base : `${base} | None`;
};

const enumBlock = (name: string, values: string[]) =>
  `class ${name}(str, Enum):\n${values
    .map((value) => {
      const member = value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
      return `    ${/^\d/.test(member) ? `VALUE_${member}` : member} = ${JSON.stringify(value)}`;
    })
    .join("\n")}\n`;

const pythonOutput =
  `# GENERATED from schemas/property.v1.json. Do not edit.\n` +
  `from datetime import date\nfrom decimal import Decimal\nfrom enum import Enum\n\n` +
  `from pydantic import BaseModel, ConfigDict, Field\n\n` +
  `PROPERTY_SCHEMA_VERSION = ${schema.version}\n\n` +
  enumBlock("FieldState", schema.fieldStates) +
  "\n" +
  enumBlock("ConfigurationKind", schema.configurationKinds) +
  "\n" +
  enumBlock("PropertyType", schema.propertyTypes) +
  "\n" +
  enumBlock("AreaBasis", schema.areaBases) +
  "\n" +
  enumBlock("AreaUnit", schema.units) +
  "\n" +
  enumBlock("CeilingHeightBasis", schema.ceilingHeightBases) +
  "\n" +
  `class CanonicalPublicProperty(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n${publicFields
    .map((field) => `    ${field.name}: ${pythonType(field)}${field.required ? "" : " = None"}`)
    .join("\n")}\n\n` +
  `class CanonicalCommercialTerms(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n${commercialFields
    .map((field) => {
      const constraint =
        field.minimum !== undefined
          ? ` = Field(default=${field.required ? "..." : "None"}, ge=${field.minimum})`
          : field.required
            ? ""
            : " = None";
      return `    ${field.name}: ${pythonType(field)}${constraint}`;
    })
    .join("\n")}\n\n` +
  `class CanonicalGatedProperty(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n${gatedFields
    .map((field) => {
      const constraint =
        field.minimum !== undefined
          ? ` = Field(default=${field.required ? "..." : "None"}, ge=${field.minimum})`
          : field.required
            ? ""
            : " = None";
      return `    ${field.name}: ${pythonType(field)}${constraint}`;
    })
    .join("\n")}\n`;

const outputs = [
  [resolve(root, "src/generated/property-contract.ts"), tsOutput],
  [resolve(root, "property-ocr-suite/backend/app/generated/property_contract.py"), pythonOutput],
] as const;

for (const [path, contents] of outputs) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

console.log(`Generated ${outputs.length} property contracts from schema v${schema.version}.`);
