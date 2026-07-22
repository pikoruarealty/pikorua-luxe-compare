import { forwardRef, useState } from "react";
import {
  useFieldArray,
  useForm,
  type Control,
  type Resolver,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import {
  CONFIG_BUCKETS,
  emptyConfigDetail,
  emptyPropertyForm,
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/property-schema";
import { ImageSlotInput } from "./ImageSlotInput";

type BucketKey = (typeof CONFIG_BUCKETS)[number]["key"];

export function PropertyForm({
  defaultValues,
  submitLabel,
  onSubmit,
  submitting,
}: {
  defaultValues?: PropertyFormValues;
  submitLabel: string;
  onSubmit: (values: PropertyFormValues) => void;
  submitting?: boolean;
}) {
  const form = useForm<PropertyFormValues>({
    // Cast needed: the schema's `.default()`s make its input type wider than its
    // output type, which the generic resolver signature can't reconcile.
    resolver: zodResolver(propertyFormSchema) as unknown as Resolver<PropertyFormValues>,
    defaultValues: defaultValues ?? emptyPropertyForm(),
  });
  const { register, handleSubmit, control, watch, setValue, formState } = form;
  const category = watch("category");
  const isPlot = category === "Plots" || category === "Bungalow";
  const [activeBucket, setActiveBucket] = useState<BucketKey>("bhk4");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl space-y-10 pb-16">
      <Section title="Basics">
        <Grid>
          <Field label="Property name" error={formState.errors.name?.message}>
            <Input {...register("name")} placeholder="e.g. Ikebana" />
          </Field>
          <Field label="Developer">
            <Input {...register("developer")} placeholder="e.g. Gala" />
          </Field>
          <Field label="Category">
            <Select {...register("category")}>
              <option value="Apartment">Apartment</option>
              <option value="Bungalow">Bungalow</option>
              <option value="Plots">Plots</option>
            </Select>
          </Field>
          <Field label="Status">
            <Input {...register("status")} placeholder="e.g. Near Possession" />
          </Field>
          <Field label="Possession">
            <Input {...register("possession")} placeholder="e.g. 9 Months or RTMI" />
          </Field>
          <Field label="Location">
            <Input {...register("location")} placeholder="e.g. Sindhu Bhavan Road" />
          </Field>
          <Field label="City">
            <Input {...register("city")} placeholder="Ahmedabad" />
          </Field>
          <Field label="State">
            <Input {...register("state")} placeholder="Gujarat" />
          </Field>
        </Grid>
        <Field label="Tagline">
          <Input {...register("tagline")} placeholder="Shown under the property name" />
        </Field>
        <Field label="Expert note">
          <Textarea {...register("expertNote")} rows={3} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" {...register("isPublished")} className="h-4 w-4" />
          Visible on the public website
        </label>
      </Section>

      {isPlot && (
        <Section
          title="Plot / built-up area"
          hint="Used instead of per-configuration areas for Bungalow and Plots."
        >
          <Grid>
            <Field label="Plot area (sq ft)">
              <Input {...register("plotSuperArea")} placeholder="e.g. 12000" />
            </Field>
            <Field label="Built-up area (sq ft)">
              <Input {...register("plotCarpetArea")} placeholder="e.g. 8000" />
            </Field>
          </Grid>
        </Section>
      )}

      <Section
        title="Configurations"
        hint="Add one variant per distinct layout. A BHK with several sizes gets several variants (Type A / Type B …) — all of them show in comparisons."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {CONFIG_BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setActiveBucket(b.key)}
              className={`rounded-full px-4 py-2 text-xs font-medium tracking-[0.1em] uppercase transition-colors ${
                activeBucket === b.key
                  ? "bg-champagne text-lux-black"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {CONFIG_BUCKETS.map((b) => (
          <div key={b.key} hidden={activeBucket !== b.key}>
            <ConfigBucketEditor
              bucketKey={b.key}
              label={b.label}
              control={control}
              register={register}
            />
          </div>
        ))}
      </Section>

      <Section title="Images" hint="Upload a file or paste an image URL.">
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageSlotInput
            label="Cover image"
            value={watch("imageUrl")}
            onChange={(url) => setValue("imageUrl", url, { shouldDirty: true })}
          />
          <ImageSlotInput
            label="Living room"
            value={watch("gallery.livingRoom")}
            onChange={(url) => setValue("gallery.livingRoom", url, { shouldDirty: true })}
          />
          <ImageSlotInput
            label="Master bedroom"
            value={watch("gallery.masterBedroom")}
            onChange={(url) => setValue("gallery.masterBedroom", url, { shouldDirty: true })}
          />
          <ImageSlotInput
            label="Pool"
            value={watch("gallery.pool")}
            onChange={(url) => setValue("gallery.pool", url, { shouldDirty: true })}
          />
          <ImageSlotInput
            label="Clubhouse"
            value={watch("gallery.clubhouse")}
            onChange={(url) => setValue("gallery.clubhouse", url, { shouldDirty: true })}
          />
        </div>
      </Section>

      <Section title="Amenities">
        <StringListEditor
          items={watch("amenities") ?? []}
          onItemsChange={(next) => setValue("amenities", next, { shouldDirty: true })}
          placeholder="e.g. Infinity Pool"
        />
      </Section>

      <Section title="Highlights / advantages">
        <StringListEditor
          items={watch("advantages") ?? []}
          onItemsChange={(next) => setValue("advantages", next, { shouldDirty: true })}
          placeholder="e.g. Handover within months"
        />
      </Section>

      <div className="sticky bottom-0 flex gap-3 border-t border-border bg-background py-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-champagne px-7 py-3 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const VARIANT_FIELDS = [
  { name: "area", label: "Super built-up (sq ft)" },
  { name: "carpet", label: "Carpet (sq ft)" },
  { name: "price", label: "Price (Cr)" },
  { name: "rate", label: "Rate (per sq ft)" },
  { name: "livingArea", label: "Drawing / Living / Dining" },
  { name: "kitchen", label: "Kitchen" },
  { name: "bedroom1", label: "Bedroom 1" },
  { name: "bedroom2", label: "Bedroom 2" },
  { name: "bedroom3", label: "Bedroom 3" },
  { name: "bedroom4", label: "Bedroom 4" },
  { name: "bedroom5", label: "Bedroom 5" },
] as const;

function ConfigBucketEditor({
  bucketKey,
  label,
  control,
  register,
}: {
  bucketKey: BucketKey;
  label: string;
  control: Control<PropertyFormValues>;
  register: UseFormRegister<PropertyFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `configs.${bucketKey}` as const,
  });

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This property doesn't offer {label}. Add a variant if it does.
        </p>
      )}

      {fields.map((field, index) => (
        <div key={field.id} className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.14em] text-champagne uppercase">
                Variant {index + 1}
              </span>
              <input
                {...register(`configs.${bucketKey}.${index}.type` as const)}
                placeholder="Label (e.g. Type A)"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-champagne"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              title="Remove variant"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VARIANT_FIELDS.map((f) => (
              <Field key={f.name} label={f.label}>
                <Input
                  {...register(`configs.${bucketKey}.${index}.${f.name}` as const)}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => append(emptyConfigDetail())}
        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Add {label} variant
      </button>
    </div>
  );
}

// useFieldArray only handles arrays of objects, so plain string lists are driven
// directly off form state instead.
function StringListEditor({
  items,
  onItemsChange,
  placeholder,
}: {
  items: string[];
  onItemsChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onItemsChange([...items, v]);
    setDraft("");
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-2 rounded-full bg-champagne/15 px-3 py-1.5 text-xs text-foreground"
          >
            {item}
            <button
              type="button"
              onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">None added yet.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-border px-4 py-2.5 text-xs tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne";

// forwardRef is required: register() supplies a ref, and dropping it would stop
// react-hook-form from tracking the field.
const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => <input {...props} ref={ref} className={inputClass} />,
);
Input.displayName = "Input";

const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => <textarea {...props} ref={ref} className={inputClass} />,
);
Textarea.displayName = "Textarea";

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  (props, ref) => <select {...props} ref={ref} className={inputClass} />,
);
Select.displayName = "Select";
