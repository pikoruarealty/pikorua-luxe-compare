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
  VARIANT_FIELDS,
  type PropertyFormValues,
} from "@/lib/property-schema";
import { Field, Input, Textarea, Select } from "@/components/portal/FormControls";
import { ImageSlotInput } from "./ImageSlotInput";

type BucketKey = (typeof CONFIG_BUCKETS)[number]["key"];

/** Every plain text field on the form. A blank one can't just be skipped past —
 *  it has to be filled in or explicitly marked "not applicable", so a submission
 *  reflects a decision about each detail rather than an unread form. */
const TRACKED_FIELDS = [
  "name",
  "developer",
  "category",
  "status",
  "possession",
  "possessionAsOf",
  "location",
  "city",
  "state",
  "tagline",
  "expertNote",
  "plotSize",
  "availableBhkTypes",
  "totalTowers",
  "totalFloors",
  "unitsPerFloor",
  "totalUnits",
  "reraId",
  "reraUrl",
  "proposedStartDateRera",
  "parkingLevels",
  "podiumStructure",
  "liftsPerTower",
  "openSpace",
  "geyserHeatPumpProvided",
  "vrvAcProvided",
  "windowGlazing",
  "bathSanitaryFittings",
  "flooringType",
  "unitsPerAcre",
  "constructionQuality",
  "internalCeilingHeight",
  "clubhouseSize",
  "developerExperienceYears",
  "totalDeliveredProjects",
  "ongoingProjects",
  "developerBackground",
  // Only rendered for Plots / Bungalow — excluded below when hidden, since a
  // field nobody can see must never be the thing blocking a submit.
  "plotSuperArea",
  "plotCarpetArea",
] as const;

const PLOT_ONLY_FIELDS = ["plotSuperArea", "plotCarpetArea"] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

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

  const [naFields, setNaFields] = useState<Record<string, boolean>>({});
  const [naError, setNaError] = useState(0);
  const allValues = watch();

  const isBlank = (field: TrackedField) =>
    !String((allValues as Record<string, unknown>)[field] ?? "").trim();
  const unhandled = TRACKED_FIELDS.filter((f) => {
    if (!isPlot && (PLOT_ONLY_FIELDS as readonly string[]).includes(f)) return false;
    return isBlank(f) && !naFields[f];
  });

  /** Wraps Field with the "not applicable" affordance. The toggle only appears
   *  once a field is actually blank — there is nothing to mark N/A about a
   *  field that already has a value. */
  const NaField = ({
    name,
    label,
    error,
    hint,
    children,
  }: {
    name: TrackedField;
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
  }) => {
    const blank = isBlank(name);
    const marked = Boolean(naFields[name]);
    const missed = naError > 0 && blank && !marked;
    return (
      <div
        data-na-field={name}
        className={
          missed ? "rounded-lg ring-2 ring-red-500/60 ring-offset-2 ring-offset-background" : ""
        }
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
            {label}
          </span>
          {blank && (
            <label className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={marked}
                onChange={(e) => setNaFields((s) => ({ ...s, [name]: e.target.checked }))}
                className="h-3 w-3"
              />
              N/A
            </label>
          )}
        </div>
        {children}
        {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
        {error && (
          <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>
        )}
        {missed && (
          <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
            Fill this in, or tick N/A.
          </span>
        )}
      </div>
    );
  };

  const submit = handleSubmit((values) => {
    if (unhandled.length > 0) {
      setNaError((n) => n + 1);
      document
        .querySelector(`[data-na-field="${unhandled[0]}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-10 pb-16">
      <Section title="Basics">
        <Grid>
          <NaField name="name" label="Property name" error={formState.errors.name?.message}>
            <Input {...register("name")} placeholder="e.g. Ikebana" />
          </NaField>
          <NaField name="developer" label="Developer">
            <Input {...register("developer")} placeholder="e.g. Gala" />
          </NaField>
          <Field label="Category">
            <Select {...register("category")}>
              <option value="Apartment">Apartment</option>
              <option value="Bungalow">Bungalow</option>
              <option value="Plots">Plots</option>
            </Select>
          </Field>
          <NaField name="status" label="Status">
            <Input {...register("status")} placeholder="e.g. Near Possession" />
          </NaField>
          <NaField name="possession" label="Possession">
            <Input {...register("possession")} placeholder="e.g. 9 Months or RTMI" />
          </NaField>
          <NaField name="possessionAsOf" label="Possession confirmed as of">
            <Input type="date" {...register("possessionAsOf")} />
          </NaField>
          <NaField name="location" label="Location">
            <Input {...register("location")} placeholder="e.g. Sindhu Bhavan Road" />
          </NaField>
          <NaField name="city" label="City">
            <Input {...register("city")} placeholder="Ahmedabad" />
          </NaField>
          <NaField name="state" label="State">
            <Input {...register("state")} placeholder="Gujarat" />
          </NaField>
        </Grid>
        <NaField name="tagline" label="Tagline">
          <Input {...register("tagline")} placeholder="Shown under the property name" />
        </NaField>
        <NaField name="expertNote" label="Expert note">
          <Textarea {...register("expertNote")} rows={3} />
        </NaField>
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
            <NaField name="plotSuperArea" label="Plot area (sq ft)">
              <Input {...register("plotSuperArea")} placeholder="e.g. 12000" />
            </NaField>
            <NaField name="plotCarpetArea" label="Built-up area (sq ft)">
              <Input {...register("plotCarpetArea")} placeholder="e.g. 8000" />
            </NaField>
          </Grid>
        </Section>
      )}

      <Section title="Project Structure">
        <Grid>
          <NaField name="plotSize" label="Plot size">
            <Input {...register("plotSize")} placeholder="e.g. 5400 sq ft" />
          </NaField>
          <NaField name="availableBhkTypes" label="Available BHK types">
            <Input {...register("availableBhkTypes")} placeholder="e.g. 4, 5, 6 BHK" />
          </NaField>
          <NaField name="totalTowers" label="Total towers">
            <Input {...register("totalTowers")} placeholder="e.g. 3" />
          </NaField>
          <NaField name="totalFloors" label="Total floors">
            <Input {...register("totalFloors")} placeholder="e.g. 24" />
          </NaField>
          <NaField name="unitsPerFloor" label="Units per floor">
            <Input {...register("unitsPerFloor")} placeholder="e.g. 4" />
          </NaField>
          <NaField name="totalUnits" label="Total units">
            <Input {...register("totalUnits")} placeholder="e.g. 96" />
          </NaField>
        </Grid>
      </Section>

      <Section title="RERA & Approvals">
        <Grid>
          <NaField name="reraId" label="RERA ID">
            <Input {...register("reraId")} placeholder="e.g. PR/GJ/AHMEDABAD/..." />
          </NaField>
          <NaField name="reraUrl" label="RERA link">
            <Input {...register("reraUrl")} placeholder="https://gujrera.gujarat.gov.in/..." />
          </NaField>
          <NaField name="proposedStartDateRera" label="Proposed start date (RERA)">
            <Input {...register("proposedStartDateRera")} placeholder="e.g. Jan 2025" />
          </NaField>
        </Grid>
      </Section>

      <Section title="Construction & Amenities">
        <Grid>
          <NaField name="parkingLevels" label="Parking levels">
            <Input {...register("parkingLevels")} placeholder="e.g. 2" />
          </NaField>
          <NaField name="podiumStructure" label="Podium structure">
            <Input {...register("podiumStructure")} placeholder="e.g. 2-Level Podium" />
          </NaField>
          <NaField name="liftsPerTower" label="Lifts per tower">
            <Input {...register("liftsPerTower")} placeholder="e.g. 3" />
          </NaField>
          <NaField name="openSpace" label="Open space">
            <Input {...register("openSpace")} placeholder="e.g. 70% Open Area" />
          </NaField>
          <NaField name="geyserHeatPumpProvided" label="Geyser / heat pump provided">
            <Input
              {...register("geyserHeatPumpProvided")}
              placeholder="e.g. Yes – instant geyser"
            />
          </NaField>
          <NaField name="vrvAcProvided" label="VRV / AC provided">
            <Input {...register("vrvAcProvided")} placeholder="e.g. Yes, all bedrooms" />
          </NaField>
          <NaField name="windowGlazing" label="Window glasses">
            <Input {...register("windowGlazing")} placeholder="e.g. Double-glazed soundproof" />
          </NaField>
          <NaField name="bathSanitaryFittings" label="Bath & sanitary fittings">
            <Input {...register("bathSanitaryFittings")} placeholder="e.g. Kohler, Jaguar" />
          </NaField>
          <NaField name="flooringType" label="Flooring">
            <Input {...register("flooringType")} placeholder="e.g. Italian marble" />
          </NaField>
          <NaField name="unitsPerAcre" label="Density (units per acre)">
            <Input {...register("unitsPerAcre")} placeholder="e.g. 18" />
          </NaField>
          <NaField name="constructionQuality" label="Construction quality">
            <Input {...register("constructionQuality")} placeholder="e.g. RCC framed structure" />
          </NaField>
          <NaField name="internalCeilingHeight" label="Internal ceiling height">
            <Input {...register("internalCeilingHeight")} placeholder="e.g. 10 ft" />
          </NaField>
          <NaField name="clubhouseSize" label="Clubhouse size">
            <Input {...register("clubhouseSize")} placeholder="e.g. 15,000 sq ft" />
          </NaField>
        </Grid>
      </Section>

      <Section title="Developer">
        <Grid>
          <NaField name="developerExperienceYears" label="Experience (years)">
            <Input {...register("developerExperienceYears")} placeholder="e.g. 25" />
          </NaField>
          <NaField name="totalDeliveredProjects" label="Total delivered projects">
            <Input {...register("totalDeliveredProjects")} placeholder="e.g. 40" />
          </NaField>
          <NaField name="ongoingProjects" label="Ongoing projects">
            <Input {...register("ongoingProjects")} placeholder="e.g. 6" />
          </NaField>
        </Grid>
        <NaField name="developerBackground" label="Background">
          <Textarea {...register("developerBackground")} rows={3} />
        </NaField>
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

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-(--rule) bg-background/90 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={submitting}
          className="foil rounded-full px-7 py-3 text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {unhandled.length > 0 && (
          <span
            className={`text-xs ${naError > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
          >
            {unhandled.length} field{unhandled.length > 1 ? "s" : ""} still blank — fill in or tick
            N/A
          </span>
        )}
      </div>
    </form>
  );
}

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
