import type { Side } from 'driver.js';

export type TourStepDef = {
  selector: string;
  title: string;
  body: string;
  side?: Side;
};
