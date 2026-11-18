// Operations tools (drivers, vehicles, shifts, services, damages, reminders,
// rosters). Read-only, admin + staff. Money lives in ../money.

import type { AssistantTool } from '../../types';
import { documentsExpiringTool } from './documents';
import { fleetOverviewTool } from './overview';
import { findTool } from './find';
import { getDriverTool } from './driver';
import { getVehicleTool } from './vehicle';
import { shiftsSummaryTool } from './shifts';
import { servicesDueTool } from './services';
import { damagesTool } from './damages';
import { remindersTool } from './reminders';
import { rosterTool } from './roster';

export const OPS_TOOLS: AssistantTool[] = [
  documentsExpiringTool,
  fleetOverviewTool,
  findTool,
  getDriverTool,
  getVehicleTool,
  shiftsSummaryTool,
  servicesDueTool,
  damagesTool,
  remindersTool,
  rosterTool,
];
