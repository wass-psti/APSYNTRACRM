/** CP-A12 Phase A: platform module-to-board blueprint, not an operational data source.
 * Source data belongs to domain modules. Board rows are projections, never fabricated records.
 * Restricted fields are excluded until a backend-enforced field authorization contract exists.
 */
const status=['not_started','in_progress','blocked','done'];
export const BOARD_CONTRACT_VERSION=1;
export const BOARD_MODULES=Object.freeze([
  {
    "key": "fueltrans",
    "name": "FuelTrans Standalone",
    "description": "Fuel transfer dispatch and delivery references",
    "recordType": "FuelTrans transaction",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Transaction Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Fuel Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Volume Liters",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Dispatch Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Client Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Driver identity",
      "Client commercial terms"
    ]
  },
  {
    "key": "tools",
    "name": "Tool Traceability",
    "description": "Tool custody, stock and movement references",
    "recordType": "Tool",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Tool Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Inventory Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Quantity",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Tool Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Site Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Custodian identity",
      "Exact tool location"
    ]
  },
  {
    "key": "toolbox",
    "name": "Toolbox Issues",
    "description": "Toolbox incident and resolution records",
    "recordType": "Toolbox issue",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Issue Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Reported Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Priority",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Resolution Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Project Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Injury details",
      "Reporter identity"
    ]
  },
  {
    "key": "frt",
    "name": "Fund Released Tracker",
    "description": "Funding request and release lifecycle",
    "recordType": "Funding request",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Release Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Request Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Release Stage",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Approval Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Project Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Amounts",
      "Banking details"
    ]
  },
  {
    "key": "fueltrack",
    "name": "FuelTrack+ v3",
    "description": "Fuel operations and reconciliation records",
    "recordType": "Fuel event",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Fuel Event Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Event Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Quantity Liters",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Reconcile Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Pump Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Attendant identity",
      "Client fuel account"
    ]
  },
  {
    "key": "tradelink",
    "name": "TradeLink",
    "description": "Trading, sourcing and procurement references",
    "recordType": "Trade request",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Trade Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Trade Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Request Stage",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Trade Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Partner Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Negotiated prices",
      "Partner personal data"
    ]
  },
  {
    "key": "timetracker",
    "name": "TimeTracker Attendance",
    "description": "Attendance summaries under restricted domain authorization",
    "recordType": "Attendance summary",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Attendance Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Attendance Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Hours Total",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Attendance Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Shift Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Employee name and ID",
      "Clock-in/out timestamps",
      "GPS coordinates and location",
      "Attendance history"
    ]
  },
  {
    "key": "orders",
    "name": "Order Intake",
    "description": "Order entry and fulfillment references",
    "recordType": "Order",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Order Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Order Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Units",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Order Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Dispatch Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Customer personal data",
      "Payment terms"
    ]
  },
  {
    "key": "evaluation",
    "name": "Employee Evaluation",
    "description": "Evaluation workflow reference and review periods",
    "recordType": "Evaluation",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Evaluation Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Review Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Review Phase",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Approval Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Period Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Employee performance details",
      "Scores",
      "Reviewer comments"
    ]
  },
  {
    "key": "charter",
    "name": "Charter Navigator",
    "description": "Charter assignment and operations reference",
    "recordType": "Charter",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Charter Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Charter Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Duration Days",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Charter Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Vessel Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Crew identities",
      "Commercial contract terms"
    ]
  },
  {
    "key": "aims",
    "name": "APS AIMS",
    "description": "Inspection and audit management references",
    "recordType": "Inspection",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Inspection Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Inspection Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Finding Count",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Audit Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Site Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Confidential findings",
      "Personnel evidence"
    ]
  },
  {
    "key": "materials",
    "name": "Material Request Hub",
    "description": "Materials request and inventory movement references",
    "recordType": "Material request",
    "fields": [
      {
        "key": "source_record_id",
        "name": "Source Record ID",
        "type": "text",
        "role": "lineage"
      },
      {
        "key": "source_revision",
        "name": "Source Revision",
        "type": "number",
        "role": "lineage"
      },
      {
        "key": "sync_state",
        "name": "Sync State",
        "type": "status",
        "role": "lineage"
      },
      {
        "key": "domain_ref",
        "name": "Request Ref",
        "type": "text",
        "role": "domain"
      },
      {
        "key": "business_date",
        "name": "Request Date",
        "type": "date",
        "role": "domain"
      },
      {
        "key": "metric",
        "name": "Quantity",
        "type": "number",
        "role": "domain"
      },
      {
        "key": "business_status",
        "name": "Approval Status",
        "type": "status",
        "role": "domain"
      },
      {
        "key": "related_ref",
        "name": "Stock Ref",
        "type": "text",
        "role": "domain"
      }
    ],
    "restricted": [
      "Requester identity",
      "Cost and supplier contract"
    ]
  }
]);
export const statusOptions=Object.freeze(status);
export function boardDescription(module){
 return '[APSYNTRA:MODULE:'+module.key+':v'+BOARD_CONTRACT_VERSION+'] '+module.description+
  '. Domain records are not imported by provisioning.';
}
export function boardColumns(module){
 return module.fields.map(f=>({name:f.name,data_type:f.type,config:f.type==='status'?
  {options:f.key==='sync_state'?['Pending','Synchronized','Conflict','Restricted']:['Not started','In progress','Blocked','Done']}:{}}));
}
export function moduleByBoardName(name){return BOARD_MODULES.find(m=>m.name===name)||null;}
export function validateModuleBlueprint(){
 const names=new Set(),keys=new Set();
 for(const module of BOARD_MODULES){
  if(!module.key||keys.has(module.key)||names.has(module.name)||module.fields.length>30)throw Error('Invalid unique module blueprint');
  keys.add(module.key);names.add(module.name);
  if(new Set(module.fields.map(f=>f.name.toLowerCase())).size!==module.fields.length)throw Error('Duplicate board columns: '+module.name);
  if(module.fields.some(f=>!['text','number','status','date'].includes(f.type)))throw Error('Unsupported column type');
  if(module.fields.some(f=>module.restricted.includes(f.name)))throw Error('Restricted field exposed in board blueprint');
 }
 return BOARD_MODULES.length===12;
}
