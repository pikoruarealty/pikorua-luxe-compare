import type { Property } from "@/types/property";

/** Admin-facing shape: the public Property plus row metadata the admin list needs. */
export interface AdminProperty extends Property {
  rowId: string;
  isPublished: boolean;
}
