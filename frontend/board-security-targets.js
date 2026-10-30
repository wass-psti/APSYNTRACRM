/** CP-A12.2 signed negative access target snapshot.
 * Real 12 canonical board IDs independently verified in PostgreSQL on 2026-10-30.
 * IDs and module names are routing metadata, not access tokens or privileges.
 * They are NEVER accepted as proof of authorization: the server decides.
 */
export const TARGET_WORKSPACE_ID='00000000-0000-4000-8000-000000000001';
export const TARGET_BOARDS=Object.freeze([
  {
    "key": "fueltrans",
    "name": "FuelTrans Standalone",
    "id": "b520cefe-6abb-446a-abec-ae5589329a99"
  },
  {
    "key": "tools",
    "name": "Tool Traceability",
    "id": "47df2cdc-503a-4a22-a35c-06f72be5c56b"
  },
  {
    "key": "toolbox",
    "name": "Toolbox Issues",
    "id": "e761b849-f144-4ad2-a418-af9e68b5cc58"
  },
  {
    "key": "frt",
    "name": "Fund Released Tracker",
    "id": "f36da8fe-8d9d-4629-9938-12533cb3ca39"
  },
  {
    "key": "fueltrack",
    "name": "FuelTrack+ v3",
    "id": "7af78b3f-67bf-4600-9aa1-9006d19d486e"
  },
  {
    "key": "tradelink",
    "name": "TradeLink",
    "id": "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88"
  },
  {
    "key": "timetracker",
    "name": "TimeTracker Attendance",
    "id": "46bf4ee7-368a-4c35-842c-8593ea1f6ac3"
  },
  {
    "key": "orders",
    "name": "Order Intake",
    "id": "d045708b-6e36-4f0a-92fc-f0b8baf93de3"
  },
  {
    "key": "evaluation",
    "name": "Employee Evaluation",
    "id": "d1593528-36a6-4644-82f9-58873d3c136b"
  },
  {
    "key": "charter",
    "name": "Charter Navigator",
    "id": "8219a2a9-be85-479e-af0c-e4a399495f58"
  },
  {
    "key": "aims",
    "name": "APS AIMS",
    "id": "991d8263-fc7d-49f0-9207-387edd51d299"
  },
  {
    "key": "materials",
    "name": "Material Request Hub",
    "id": "617c4c0f-e343-4b3b-8456-50d47dcbaf99"
  }
]);
