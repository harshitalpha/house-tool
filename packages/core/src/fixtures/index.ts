import { sampleFlat } from "./sampleFlat";
import { openPlan } from "./openPlan";
import { studio } from "./studio";
import { twoBhk } from "./twoBhk";

export { sampleFlat, openPlan, studio, twoBhk };
export const fixtures = { sampleFlat, studio, twoBhk, openPlan } as const;
export type FixtureName = keyof typeof fixtures;
