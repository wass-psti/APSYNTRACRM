/**
 * CP-TL-09B — TradeLink's recovered v1.42 company profiles and document templates.
 * The source quotation PDFs are retained as local design references only; they
 * contain real customer information and are deliberately not published here.
 */
export const TRADELINK_TEMPLATE_VERSION='v1.42.0';
export const TRADELINK_DEFAULT_COMPANY_PROFILE_ID='watchdog-sales';

const PROFILES={
 'watchdog-sales':Object.freeze({
  id:'watchdog-sales',name:'Watchdog Automation Sales & Services',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 7073079',email:'info@watchdogautomation.com.ph',
  website:'www.watchdogautomation.com.ph',tin:'211-258-356-00000',
  logoAsset:'watchdog-logo.png',template:Object.freeze({
   id:'watchdog-sales-reference-v1',accent:'#ef4155',
   tableBackground:'#fce5e7',tableText:'#1644a3',ruleColor:'#2d65d5',
   termsMode:'new-page'
  })
 }),
 'watchdog-opc':Object.freeze({
  id:'watchdog-opc',name:'Watchdog Automation OPC',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 7073079',email:'info@watchdogautomation.com.ph',
  website:'www.watchdogautomation.com.ph',tin:'010-737-641-000',
  logoAsset:'watchdog-opc-logo.png',template:Object.freeze({
   id:'watchdog-opc-reference-v1',accent:'#14b866',
   tableBackground:'#e3f7e9',tableText:'#244f78',ruleColor:'#2f68c4',
   termsMode:'flow'
  })
 }),
 'plc-systems':Object.freeze({
  id:'plc-systems',name:'PLC Systems Technik, Inc.',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 1118818',email:'sales@plcsystems.com.ph',
  website:'www.plcsystems.com.ph',tin:'463-678-854-000',
  logoAsset:'plc-systems-logo.png',template:Object.freeze({
   id:'plc-systems-reference-v1',accent:'#0b9a9d',
   tableBackground:'#e3f6f5',tableText:'#2854a4',ruleColor:'#4772c7',
   termsMode:'flow'
  })
 })
};
export const TRADELINK_COMPANY_PROFILE_OPTIONS=Object.freeze(
 Object.values(PROFILES).map(({id,name})=>Object.freeze([id,name]))
);
export function isTradeLinkCompanyProfileId(value){
 return typeof value==='string'&&Object.hasOwn(PROFILES,value);
}
export function tradeLinkCompanyProfileIdFromTemplateId(templateId){
 if(typeof templateId!=='string')return '';
 return Object.values(PROFILES).find(profile=>profile.template.id===templateId)?.id||'';
}
export function tradeLinkCompanyProfileSnapshot(profileId=TRADELINK_DEFAULT_COMPANY_PROFILE_ID){
 const profile=PROFILES[isTradeLinkCompanyProfileId(profileId)?profileId:
  TRADELINK_DEFAULT_COMPANY_PROFILE_ID];
 return Object.freeze({id:profile.id,name:profile.name,address:profile.address,
  phone:profile.phone,email:profile.email,website:profile.website,tin:profile.tin,
  logoAsset:profile.logoAsset});
}
export function tradeLinkCompanyTemplateSnapshot(profileId=TRADELINK_DEFAULT_COMPANY_PROFILE_ID){
 const profile=PROFILES[isTradeLinkCompanyProfileId(profileId)?profileId:
  TRADELINK_DEFAULT_COMPANY_PROFILE_ID];
 return Object.freeze({version:TRADELINK_TEMPLATE_VERSION,
  ...profile.template});
}
export function resolveTradeLinkOfficialTemplate(content={}){
 const inferred=tradeLinkCompanyProfileIdFromTemplateId(content?.templateId);
 const requested=content?.vendorId||inferred||TRADELINK_DEFAULT_COMPANY_PROFILE_ID;
 const profileValid=isTradeLinkCompanyProfileId(requested);
 const profileId=profileValid?requested:TRADELINK_DEFAULT_COMPANY_PROFILE_ID;
 const company=tradeLinkCompanyProfileSnapshot(profileId);
 const template=tradeLinkCompanyTemplateSnapshot(profileId);
 const templateIdValid=!content?.templateId||content.templateId===template.id;
 return {company,template,legacyDefaulted:!content?.vendorId&&!content?.templateId,
  profileValid,templateIdValid};
}

// Verbatim default terms recovered from the user's TradeLink v1.42.0 source.
export const TRADELINK_DEFAULT_TERMS=Object.freeze({
 esi:`Terms & Conditions
1. General. This Invoice is governed by the Supplier's standard Terms & Conditions. Acceptance of delivered goods or services constitutes full acceptance of these Terms. Any Client-imposed terms not expressly approved in writing are void.
2. Quotations & Orders. Prices and scope follow the approved Quotation/Proposal and accepted Purchase Order (PO). POs become binding upon Supplier's written confirmation and are non-cancellable except as provided under the Supplier's cancellation rules.
3. Prices & Payment. Prices are based on agreed commercial terms. Payment must follow the terms on the quotation or invoice. Late payments incur 2% monthly interest or the maximum rate permitted by law. Supplier may suspend deliveries or services for delayed or unpaid accounts.
4. Delivery & Risk. Delivery schedules are estimates only. Risk of loss or damage transfers to the Client upon delivery to the carrier or to the Client's premises, whichever occurs first. Title remains with the Supplier until full payment is settled.
5. Warranty. Products are warranted to be new, free from defects, and compliant with agreed specifications for 12 months from delivery or 6 months from commissioning, whichever comes first. Consumables and wear-and-tear items are excluded. Warranty covers repair, replacement, or refund at Supplier's discretion. Warranty is void for misuse, improper installation, unauthorized repairs, or force majeure events.
6. Returns. No returns allowed without prior written authorization. Accepted returns may incur restocking, inspection, and shipping charges. NCNR and custom-made items are strictly non-returnable.
7. Cancellation. Client cancellations require Supplier approval. NCNR items are charged at 100%, standard items at ≥50%, and special/custom items at 100%. Supplier may cancel POs for non-payment, breach, insolvency, or force majeure.
8. Liability. Supplier liability is limited to the invoiced value of the affected goods or services. Supplier is not liable for indirect or consequential losses including production downtime or profit loss.
9. Intellectual Property. All drawings, software, technical documents, and related IP remain the Supplier's property. No license or ownership transfers unless expressly agreed.
10. Confidentiality. All commercial and technical information provided by the Supplier must be kept confidential and not disclosed without written consent.
11. Governing Law. This Invoice and all related transactions shall be governed by Philippine laws. Disputes shall be resolved exclusively by the courts of Lapu-Lapu City, Cebu 6015, Philippines, without prejudice to the Supplier's right to seek remedies elsewhere when necessary.`,
 delivery:`DELIVERY RECEIPT TERMS AND CONDITIONS

1. Receipt of Items
By signing the Delivery Receipt (DR), the Customer confirms that the items were received in good order, complete, and free from visible defects.

2. Inspection Period
The Customer shall inspect all delivered items within 48 hours from receipt. Any discrepancies, shortages, or damages must be formally reported within this period. Failure to do so constitutes acceptance.

3. Warranty
Warranty coverage is limited strictly to manufacturer defects and is subject to the supplier's standard warranty terms. Misuse, mishandling, incorrect installation, or unauthorized repairs void the warranty.

4. Returns & Replacement
Returned items must be approved in advance. Only unused, unopened, and non-damaged items are eligible for return or replacement unless covered under valid warranty.

5. Ownership & Risk
Ownership transfers to the Customer upon full payment; however, risk of loss or damage transfers upon delivery and signing of the DR.

6. Installation & Commissioning
Unless explicitly included in the sales agreement, installation, programming, and commissioning services are not part of the spare parts delivery and shall be quoted separately.

7. Liability
The Supplier shall not be liable for any indirect, incidental, or consequential damages arising from the use or failure of delivered spare parts.

8. Payment Terms
Payments must follow the agreed billing terms stated in the corresponding quotation or purchase order.`,
 payment:`TERMS AND CONDITIONS

1. Purpose
This Electronic Payment Acknowledgement confirms that the Supplier has received payment from the Client via cash, bank transfer, or cheque. It serves only as a record of the transaction and is not a tax or BIR-related document.

2. Payment Validation
Cash payments are considered received once acknowledged.
Bank transfers are subject to confirmation of credit to the Supplier's account.
Cheque payments are acknowledged subject to bank clearing. If a cheque is returned or dishonored, this acknowledgement becomes void.

3. Reference Documents
This acknowledgement should reference the applicable invoice, purchase order, statement, or other commercial document when available.

4. Accuracy of Information
The Client is responsible for providing accurate payment details. Any correction to the amount, payment instrument, or reference information must be recorded through an updated acknowledgement.

5. Final Settlement
Issuance of this acknowledgement does not waive any remaining balance, charges, or obligations unless expressly stated in the related commercial agreement.

6. Record Retention
Both parties should retain a copy of this acknowledgement together with supporting payment records for reconciliation and audit purposes.`,
 quotation:`QUOTATION TERMS AND CONDITIONS

1. Validity
This quotation is valid only for the stated validity period. Pricing, delivery commitments, and availability may be reconfirmed after expiry.

2. Scope & Pricing
Quoted prices apply only to the listed goods and services, quantities, specifications, and commercial conditions. Changes in scope may require a revised quotation.

3. Taxes & Currency
Taxes are applied according to the selected VAT classification. Foreign-currency quotations remain subject to the stated currency and any separately agreed exchange-rate provisions.

4. Delivery Commitment
Delivery lead times are estimates unless expressly confirmed in writing and normally commence after receipt of an acceptable purchase order, required down payment, and complete technical information.

5. Payment Terms
Payment shall follow the terms stated in this quotation. Delayed payments may delay delivery, activation, commissioning, or release of goods.

6. Availability & Price Changes
Stock, manufacturer availability, freight, duties, and supplier pricing may change before order acceptance. Material changes will be communicated before confirmation.

7. Order Acceptance
A purchase order is subject to Supplier review and written acceptance. Client purchase-order terms do not override this quotation unless expressly accepted in writing.

8. Warranty & Returns
Warranty and return conditions follow the Supplier's applicable standard terms and manufacturer policies. Custom, configured, special-order, and NCNR items may be non-returnable.

9. Confidentiality
Commercial pricing and technical information in this quotation are confidential and intended only for the named Client and related evaluation personnel.

10. Governing Terms
Unless superseded by a signed agreement, this quotation and the Supplier's standard commercial terms govern the proposed transaction.`,
 po:`PURCHASE ORDER TERMS AND CONDITIONS

1. Order Acceptance
This Purchase Order is subject to supplier confirmation. Any exception to the quantities, specifications, prices, delivery terms, or commercial conditions must be communicated before fulfillment.

2. Scope & Specifications
Only the goods, services, quantities, models, and specifications listed in this Purchase Order are authorized. Substitutions require prior written approval.

3. Pricing & Currency
Prices are stated in the selected currency and are subject only to the taxes, discounts, and adjustments shown in this Purchase Order. Unapproved surcharges will not be accepted.

4. Delivery Commitment
The Supplier shall meet the stated delivery commitment and promptly advise of any risk of delay, shortage, partial shipment, or manufacturer constraint.

5. Packing & Documentation
Goods must be adequately packed and accompanied by applicable delivery receipts, packing lists, invoices, certificates, serial references, and other documents required for receiving.

6. Inspection & Acceptance
Delivered goods remain subject to quantity, condition, specification, and quality inspection. Non-conforming, damaged, short, or incorrect items may be rejected or returned.

7. Warranty
Supplier and manufacturer warranties apply as agreed. Warranty obligations include correction, repair, replacement, or other mutually accepted remedy for valid defects.

8. Payment
Payment follows the stated payment terms and is subject to complete delivery, acceptable documentation, and resolution of discrepancies unless otherwise agreed in writing.

9. Cancellation & Changes
Changes or cancellation require written authorization. Supplier must disclose NCNR, special-order, or cancellation exposure before accepting affected items.

10. Governing Commercial Terms
This Purchase Order, together with any expressly incorporated quotation or agreement, constitutes the authorized purchasing instruction. Conflicting supplier terms do not apply unless accepted in writing.`,
 packing:'This Packing List identifies the goods packaged for shipment and accompanies the related commercial documents.'
});
