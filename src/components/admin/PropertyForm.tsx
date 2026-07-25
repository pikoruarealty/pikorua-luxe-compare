import { useState } from "react";
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
import { Field, Input, Textarea, Select } from "@/components/portal/FormControls";
import { ImageSlotInput } from "./ImageSlotInput";

type BucketKey = (typeof CONFIG_BUCKETS)[number]["key"];

export function PropertyForm({
  defaultValues,
  submitLabel,
  onSubmit,
  submitting,
  hidePublishToggle,
}: {
  defaultValues?: PropertyFormValues;
  submitLabel: string;
  onSubmit: (values: PropertyFormValues) => void;
  submitting?: boolean;
  /** Developer submissions don't control publish state directly — that's
   *  decided by the owner on approval, so the toggle would be misleading. */
  hidePublishToggle?: boolean;
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
          <Field label="Possession confirmed as of">
            <Input type="date" {...register("possessionAsOf")} />
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
        {!hidePublishToggle && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" {...register("isPublished")} className="h-4 w-4" />
            Visible on the public website
          </label>
        )}
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

      <Section title="Project Structure">
        <Grid>
          <Field label="Plot size">
            <Input {...register("plotSize")} placeholder="e.g. 5400 sq ft" />
          </Field>
          <Field label="Available BHK types">
            <Input {...register("availableBhkTypes")} placeholder="e.g. 4, 5, 6 BHK" />
          </Field>
          <Field label="Total towers">
            <Input {...register("totalTowers")} placeholder="e.g. 3" />
          </Field>
          <Field label="Total floors">
            <Input {...register("totalFloors")} placeholder="e.g. 24" />
          </Field>
          <Field label="Units per floor">
            <Input {...register("unitsPerFloor")} placeholder="e.g. 4" />
          </Field>
          <Field label="Total units">
            <Input {...register("totalUnits")} placeholder="e.g. 96" />
          </Field>
        </Grid>
      </Section>

      <Section title="RERA & Approvals">
        <Grid>
          <Field label="RERA ID">
            <Input {...register("reraId")} placeholder="e.g. PR/GJ/AHMEDABAD/..." />
          </Field>
          <Field label="RERA link">
            <Input {...register("reraUrl")} placeholder="https://gujrera.gujarat.gov.in/..." />
          </Field>
          <Field label="Proposed start date (RERA)">
            <Input {...register("proposedStartDateRera")} placeholder="e.g. Jan 2025" />
          </Field>
        </Grid>
      </Section>

      <Section title="Construction & Amenities">
        <Grid>
          <Field label="Parking levels">
            <Input {...register("parkingLevels")} placeholder="e.g. 2" />
          </Field>
          <Field label="Podium structure">
            <Input {...register("podiumStructure")} placeholder="e.g. 2-Level Podium" />
          </Field>
          <Field label="Lifts per tower">
            <Input {...register("liftsPerTower")} placeholder="e.g. 3" />
          </Field>
          <Field label="Open space">
            <Input {...register("openSpace")} placeholder="e.g. 70% Open Area" />
          </Field>
          <Field label="Geyser / heat pump provided">
            <Input
              {...register("geyserHeatPumpProvided")}
              placeholder="e.g. Yes – instant geyser"
            />
          </Field>
          <Field label="VRV / AC provided">
            <Input {...register("vrvAcProvided")} placeholder="e.g. Yes, all bedrooms" />
          </Field>
          <Field label="Window glasses">
            <Input {...register("windowGlazing")} placeholder="e.g. Double-glazed soundproof" />
          </Field>
          <Field label="Bath & sanitary fittings">
            <Input {...register("bathSanitaryFittings")} placeholder="e.g. Kohler, Jaguar" />
          </Field>
          <Field label="Flooring">
            <Input {...register("flooringType")} placeholder="e.g. Italian marble" />
          </Field>
          <Field label="Density (units per acre)">
            <Input {...register("unitsPerAcre")} placeholder="e.g. 18" />
          </Field>
          <Field label="Construction quality">
            <Input {...register("constructionQuality")} placeholder="e.g. RCC framed structure" />
          </Field>
          <Field label="Internal ceiling height">
            <Input {...register("internalCeilingHeight")} placeholder="e.g. 10 ft" />
          </Field>
          <Field label="Clubhouse size">
            <Input {...register("clubhouseSize")} placeholder="e.g. 15,000 sq ft" />
          </Field>
        </Grid>
      </Section>

      <Section title="Developer">
        <Grid>
          <Field label="Experience (years)">
            <Input {...register("developerExperienceYears")} placeholder="e.g. 25" />
          </Field>
          <Field label="Total delivered projects">
            <Input {...register("totalDeliveredProjects")} placeholder="e.g. 40" />
          </Field>
          <Field label="Ongoing projects">
            <Input {...register("ongoingProjects")} placeholder="e.g. 6" />
          </Field>
        </Grid>
        <Field label="Background">
          <Textarea {...register("developerBackground")} rows={3} />
        </Field>
        <Field label="Notable delivered projects">
          <StringListEditor
            items={watch("notableDeliveredProjects") ?? []}
            onItemsChange={(next) =>
              setValue("notableDeliveredProjects", next, { shouldDirty: true })
            }
            placeholder="e.g. Godrej Garden City"
          />
        </Field>
      </Section>

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
              className={`rounded-full px-4 py-2 text-xs font-medium tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none ${
                activeBucket === b.key
                  ? "bg-champagne text-lux-black"
                  : "border border-(--rule-strong) text-muted-foreground hover:border-foreground/30 hover:text-foreground"
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

      <div className="sticky bottom-0 z-10 flex gap-3 border-t border-(--rule) bg-background/90 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={submitting}
          className="foil rounded-full px-7 py-3 text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
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
  { name: "builtUpArea", label: "Built-up (sq ft)" },
  { name: "price", label: "Price (Cr)" },
  { name: "rate", label: "Rate (per sq ft)" },
  { name: "bathrooms", label: "Bathrooms" },
  { name: "balconies", label: "Balconies" },
  { name: "servantRoom", label: "Servant room" },
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
        <div key={field.id} className="rounded-xl border border-(--rule) bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-label text-[10px] font-semibold tracking-luxury text-champagne uppercase">
                Variant {index + 1}
              </span>
              <input
                {...register(`configs.${bucketKey}.${index}.type` as const)}
                placeholder="Label (e.g. Type A)"
                className="min-w-0 rounded-lg border border-(--rule-strong) bg-background px-3 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
              title="Remove variant"
              aria-label={`Remove variant ${index + 1}`}
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
        className="inline-flex items-center gap-2 rounded-full border border-(--rule-strong) px-4 py-2 text-xs tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
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
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Remove ${item}`}
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
          className="w-full max-w-sm rounded-lg border border-(--rule-strong) bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-(--rule-strong) px-4 py-2.5 text-xs tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
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
    <section className="rounded-2xl border border-(--rule) bg-card p-5 shadow-(--shadow-lift) sm:p-6">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <span className="h-px w-6 bg-(--rule-strong)" />
          <h2 className="font-label text-[11px] font-semibold tracking-luxury text-champagne uppercase">
            {title}
          </h2>
        </div>
        {hint && <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
