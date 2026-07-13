import type { ChangeOrder } from "@/types/change-order";
import { redactChangeOrderCosts } from "./redact-costs";

export function redactChangeOrdersCosts(list: ChangeOrder[], canViewCosts: boolean): ChangeOrder[] {
  if (canViewCosts) return list;
  return list.map((co) => redactChangeOrderCosts(co, false));
}
