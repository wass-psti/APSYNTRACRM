/** Presentation-only native application entry points; existing domain boards remain untouched. */
const definitions=Object.freeze({
 fueltrans:{name:'FuelTrans Standalone',eyebrow:'Fuel operations',description:'A dedicated workspace for fuel transfer dispatch, deliveries, transaction history and operational tracking.',glyph:'⛽',accent:'blue'},
 tools:{name:'Tool Traceability',eyebrow:'Asset visibility',description:'Track tool custody, inventory movement, assignments and traceability in one native experience.',glyph:'⌁',accent:'indigo'},
 toolbox:{name:'Toolbox Issues',eyebrow:'Issue management',description:'A focused experience for raising, assigning, monitoring and resolving toolbox issues.',glyph:'⚒',accent:'orange'},
 orders:{name:'Order Intake',eyebrow:'Order operations',description:'Capture incoming orders, coordinate fulfillment and follow each order through its operational lifecycle.',glyph:'▤',accent:'green'},
 evaluation:{name:'Employee Evaluation',eyebrow:'People operations',description:'Manage employee evaluations, structured assessments and review progress in a dedicated application.',glyph:'✧',accent:'pink'},
 charter:{name:'Charter Navigator',eyebrow:'Charter planning',description:'Organize charter requests, planning details and operational coordination through a unified interface.',glyph:'◇',accent:'teal'},
 aims:{name:'APS AIMS',eyebrow:'Integrated management',description:'Bring AIMS workflows, operational records and status visibility together in a native workspace.',glyph:'◎',accent:'purple'},
 materials:{name:'Material Request Hub',eyebrow:'Material requests',description:'Plan and follow material requests, sourcing activity, approvals and delivery progress in one place.',glyph:'▦',accent:'amber'}
});
export const NATIVE_PLACEHOLDER_KEYS=new Set(Object.keys(definitions));
export const nativePlaceholderHref=key=>NATIVE_PLACEHOLDER_KEYS.has(key)?'#/native/'+key:null;
export function renderNativePlaceholder(key){
 const item=definitions[key];
 if(!item)return '<section class="native-soon" role="alert"><h1>Application unavailable</h1><a href="#/overview">Back to overview</a></section>';
 return `<section class="native-soon" data-native-coming-soon="${key}" aria-labelledby="native-soon-title">
  <div class="native-soon-aura" aria-hidden="true"></div>
  <div class="native-soon-inner">
   <div class="native-soon-top"><span class="native-soon-crumb">APPLICATIONS <span aria-hidden="true">/</span> ${item.eyebrow.toUpperCase()}</span><span class="native-soon-state"><span aria-hidden="true" class="native-soon-pulse"></span> In preparation</span></div>
   <div class="native-soon-symbol native-soon-${item.accent}" aria-hidden="true">${item.glyph}</div>
   <div class="native-soon-kicker">THE NEXT CHAPTER OF YOUR WORKSPACE</div>
   <h1 id="native-soon-title">${item.name}</h1>
   <div class="native-soon-coming">Coming <span>Soon.</span></div>
   <p class="native-soon-description">${item.description}</p>
   <div class="native-soon-divider" aria-hidden="true"></div>
   <div class="native-soon-foot"><span><span class="native-soon-foot-dot" aria-hidden="true"></span> Native standalone experience in development</span><a href="#/overview">Back to dashboard <span aria-hidden="true">→</span></a></div>
  </div>
 </section>`;
}
