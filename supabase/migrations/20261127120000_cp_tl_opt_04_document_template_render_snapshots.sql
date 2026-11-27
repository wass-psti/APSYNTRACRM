-- CP-TL-OPT-04: immutable company/template versions and per-revision rendering snapshots.
-- Additive only: existing TradeLink document payloads and revision snapshots remain unchanged.
BEGIN;

CREATE TABLE private.tradelink_company_profile_versions (
 profile_id text NOT NULL,
 profile_version integer NOT NULL CHECK (profile_version > 0),
 profile jsonb NOT NULL CHECK (jsonb_typeof(profile)='object'),
 source_template_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (profile_id,profile_version)
);

CREATE TABLE private.tradelink_template_versions (
 template_id text NOT NULL,
 template_version text NOT NULL CHECK (template_version ~ '^v[0-9]+[.][0-9]+[.][0-9]+$'),
 profile_id text NOT NULL,
 profile_version integer NOT NULL,
 template jsonb NOT NULL CHECK (jsonb_typeof(template)='object'),
 default_terms jsonb NOT NULL CHECK (jsonb_typeof(default_terms)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (template_id,template_version),
 FOREIGN KEY (profile_id,profile_version)
  REFERENCES private.tradelink_company_profile_versions(profile_id,profile_version)
  ON DELETE RESTRICT
);

CREATE TABLE private.tradelink_document_render_snapshots (
 document_id uuid NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0),
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('esi','packing','delivery','payment','quotation','po')),
 company_profile_id text NOT NULL,
 company_profile_version integer NOT NULL,
 template_id text NOT NULL,
 template_version text NOT NULL,
 snapshot_source text NOT NULL CHECK (snapshot_source IN ('captured','legacy-derived','legacy-defaulted')),
 render_snapshot jsonb NOT NULL CHECK (jsonb_typeof(render_snapshot)='object'),
 captured_at timestamptz NOT NULL,
 PRIMARY KEY (document_id,revision),
 FOREIGN KEY (document_id,revision)
  REFERENCES private.tradelink_document_revision_snapshots(document_id,revision)
  ON DELETE RESTRICT,
 FOREIGN KEY (company_profile_id,company_profile_version)
  REFERENCES private.tradelink_company_profile_versions(profile_id,profile_version)
  ON DELETE RESTRICT,
 FOREIGN KEY (template_id,template_version)
  REFERENCES private.tradelink_template_versions(template_id,template_version)
  ON DELETE RESTRICT
);

INSERT INTO private.tradelink_company_profile_versions
 (profile_id,profile_version,profile,source_template_version)
VALUES
('watchdog-sales',1,jsonb_build_object(
 'id','watchdog-sales','templateId','watchdog-sales-reference-v1','name','Watchdog Automation Sales & Services',
 'address','Bldg.2 Paseo de Amores Sergio Osmena St.
Gun-ob, Lapu-lapu City 6015','phone','+63 917 7073079','quotationPhone','+63 917 7073079',
 'email','info@watchdogautomation.com.ph','website','www.watchdogautomation.com.ph','tin','211-258-356-00000',
 'logoAsset','profiles/v1/watchdog-sales-ac1c97ed05b379a20caaccdbc3e3f02be8aebf89.png','quotationLogoAsset','profiles/v1/watchdog-sales-quotation-ee2cb021cacdffd5c0240d8ede81ee58892db4b9.png',
 'logoGitBlobSha','ac1c97ed05b379a20caaccdbc3e3f02be8aebf89','quotationLogoGitBlobSha','ee2cb021cacdffd5c0240d8ede81ee58892db4b9'
),'v1.42.0'),
('watchdog-opc',1,jsonb_build_object(
 'id','watchdog-opc','templateId','watchdog-opc-reference-v1','name','Watchdog Automation OPC',
 'address','Bldg.2 Paseo de Amores Sergio Osmena St.
Gun-ob, Lapu-lapu City 6015','phone','+63 917 7073079','quotationPhone','+63 917 7073079',
 'email','info@watchdogautomation.com.ph','website','www.watchdogautomation.com.ph','tin','010-737-641-000',
 'logoAsset','profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png','quotationLogoAsset','profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png',
 'logoGitBlobSha','f55506ddd9b2569658f2eecac7f081cc08ba3a19','quotationLogoGitBlobSha','6d43decfa6a476219c2cae149311c84bd7109c57'
),'v1.42.0'),
('plc-systems',1,jsonb_build_object(
 'id','plc-systems','templateId','plc-systems-reference-v1','name','PLC Systems Technik, Inc.',
 'address','Bldg.2 Paseo de Amores Sergio Osmena St.
Gun-ob, Lapu-lapu City 6015','phone','+63 917 1118818','quotationPhone','+639171118818',
 'email','sales@plcsystems.com.ph','website','www.plcsystems.com.ph','tin','463-678-854-000',
 'logoAsset','profiles/v1/plc-systems-5636a6eafb8cb98994546dc2b7b55c9d0dd506e9.png','quotationLogoAsset','profiles/v1/plc-systems-quotation-62421d422191624fa335e1b6bfaf8fecbdb2cd50.png',
 'logoGitBlobSha','5636a6eafb8cb98994546dc2b7b55c9d0dd506e9','quotationLogoGitBlobSha','62421d422191624fa335e1b6bfaf8fecbdb2cd50'
),'v1.42.0')
ON CONFLICT (profile_id,profile_version) DO NOTHING;

INSERT INTO private.tradelink_template_versions
 (template_id,template_version,profile_id,profile_version,template,default_terms)
VALUES
('watchdog-sales-reference-v1','v1.42.0','watchdog-sales',1,
 jsonb_build_object('id','watchdog-sales-reference-v1','version','v1.42.0',
 'profileId','watchdog-sales','profileVersion',1,'accent','#ef4155',
 'tableBackground','#fce5e7','tableText','#1644a3',
 'ruleColor','#2d65d5','termsMode','new-page',
 'rendererVersion','tradelink-renderer-v1',
 'stylesheetAssets',jsonb_build_array('templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css','templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'),
 'stylesheetGitBlobShas',jsonb_build_array('fc3a9e2dd3626a4b7657ea72c105b042d8128287','866f644ed2f9a5fa569e799351feac19a90325fa')
 ),jsonb_build_object('esi','Terms & Conditions
1. General. This Invoice is governed by the Supplier''s standard Terms & Conditions. Acceptance of delivered goods or services constitutes full acceptance of these Terms. Any Client-imposed terms not expressly approved in writing are void.
2. Quotations & Orders. Prices and scope follow the approved Quotation/Proposal and accepted Purchase Order (PO). POs become binding upon Supplier''s written confirmation and are non-cancellable except as provided under the Supplier''s cancellation rules.
3. Prices & Payment. Prices are based on agreed commercial terms. Payment must follow the terms on the quotation or invoice. Late payments incur 2% monthly interest or the maximum rate permitted by law. Supplier may suspend deliveries or services for delayed or unpaid accounts.
4. Delivery & Risk. Delivery schedules are estimates only. Risk of loss or damage transfers to the Client upon delivery to the carrier or to the Client''s premises, whichever occurs first. Title remains with the Supplier until full payment is settled.
5. Warranty. Products are warranted to be new, free from defects, and compliant with agreed specifications for 12 months from delivery or 6 months from commissioning, whichever comes first. Consumables and wear-and-tear items are excluded. Warranty covers repair, replacement, or refund at Supplier''s discretion. Warranty is void for misuse, improper installation, unauthorized repairs, or force majeure events.
6. Returns. No returns allowed without prior written authorization. Accepted returns may incur restocking, inspection, and shipping charges. NCNR and custom-made items are strictly non-returnable.
7. Cancellation. Client cancellations require Supplier approval. NCNR items are charged at 100%, standard items at ≥50%, and special/custom items at 100%. Supplier may cancel POs for non-payment, breach, insolvency, or force majeure.
8. Liability. Supplier liability is limited to the invoiced value of the affected goods or services. Supplier is not liable for indirect or consequential losses including production downtime or profit loss.
9. Intellectual Property. All drawings, software, technical documents, and related IP remain the Supplier''s property. No license or ownership transfers unless expressly agreed.
10. Confidentiality. All commercial and technical information provided by the Supplier must be kept confidential and not disclosed without written consent.
11. Governing Law. This Invoice and all related transactions shall be governed by Philippine laws. Disputes shall be resolved exclusively by the courts of Lapu-Lapu City, Cebu 6015, Philippines, without prejudice to the Supplier''s right to seek remedies elsewhere when necessary.','delivery','DELIVERY RECEIPT TERMS AND CONDITIONS

1. Receipt of Items
By signing the Delivery Receipt (DR), the Customer confirms that the items were received in good order, complete, and free from visible defects.

2. Inspection Period
The Customer shall inspect all delivered items within 48 hours from receipt. Any discrepancies, shortages, or damages must be formally reported within this period. Failure to do so constitutes acceptance.

3. Warranty
Warranty coverage is limited strictly to manufacturer defects and is subject to the supplier''s standard warranty terms. Misuse, mishandling, incorrect installation, or unauthorized repairs void the warranty.

4. Returns & Replacement
Returned items must be approved in advance. Only unused, unopened, and non-damaged items are eligible for return or replacement unless covered under valid warranty.

5. Ownership & Risk
Ownership transfers to the Customer upon full payment; however, risk of loss or damage transfers upon delivery and signing of the DR.

6. Installation & Commissioning
Unless explicitly included in the sales agreement, installation, programming, and commissioning services are not part of the spare parts delivery and shall be quoted separately.

7. Liability
The Supplier shall not be liable for any indirect, incidental, or consequential damages arising from the use or failure of delivered spare parts.

8. Payment Terms
Payments must follow the agreed billing terms stated in the corresponding quotation or purchase order.','payment','TERMS AND CONDITIONS

1. Purpose
This Electronic Payment Acknowledgement confirms that the Supplier has received payment from the Client via cash, bank transfer, or cheque. It serves only as a record of the transaction and is not a tax or BIR-related document.

2. Payment Validation
Cash payments are considered received once acknowledged.
Bank transfers are subject to confirmation of credit to the Supplier''s account.
Cheque payments are acknowledged subject to bank clearing. If a cheque is returned or dishonored, this acknowledgement becomes void.

3. Reference Documents
This acknowledgement should reference the applicable invoice, purchase order, statement, or other commercial document when available.

4. Accuracy of Information
The Client is responsible for providing accurate payment details. Any correction to the amount, payment instrument, or reference information must be recorded through an updated acknowledgement.

5. Final Settlement
Issuance of this acknowledgement does not waive any remaining balance, charges, or obligations unless expressly stated in the related commercial agreement.

6. Record Retention
Both parties should retain a copy of this acknowledgement together with supporting payment records for reconciliation and audit purposes.','quotation','QUOTATION TERMS AND CONDITIONS

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
Warranty and return conditions follow the Supplier''s applicable standard terms and manufacturer policies. Custom, configured, special-order, and NCNR items may be non-returnable.

9. Confidentiality
Commercial pricing and technical information in this quotation are confidential and intended only for the named Client and related evaluation personnel.

10. Governing Terms
Unless superseded by a signed agreement, this quotation and the Supplier''s standard commercial terms govern the proposed transaction.','po','PURCHASE ORDER TERMS AND CONDITIONS

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
This Purchase Order, together with any expressly incorporated quotation or agreement, constitutes the authorized purchasing instruction. Conflicting supplier terms do not apply unless accepted in writing.','packing','This Packing List identifies the goods packaged for shipment and accompanies the related commercial documents.')),
('watchdog-opc-reference-v1','v1.42.0','watchdog-opc',1,
 jsonb_build_object('id','watchdog-opc-reference-v1','version','v1.42.0',
 'profileId','watchdog-opc','profileVersion',1,'accent','#14b866',
 'tableBackground','#e3f7e9','tableText','#244f78',
 'ruleColor','#2f68c4','termsMode','flow',
 'rendererVersion','tradelink-renderer-v1',
 'stylesheetAssets',jsonb_build_array('templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css','templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'),
 'stylesheetGitBlobShas',jsonb_build_array('fc3a9e2dd3626a4b7657ea72c105b042d8128287','866f644ed2f9a5fa569e799351feac19a90325fa')
 ),jsonb_build_object('esi','Terms & Conditions
1. General. This Invoice is governed by the Supplier''s standard Terms & Conditions. Acceptance of delivered goods or services constitutes full acceptance of these Terms. Any Client-imposed terms not expressly approved in writing are void.
2. Quotations & Orders. Prices and scope follow the approved Quotation/Proposal and accepted Purchase Order (PO). POs become binding upon Supplier''s written confirmation and are non-cancellable except as provided under the Supplier''s cancellation rules.
3. Prices & Payment. Prices are based on agreed commercial terms. Payment must follow the terms on the quotation or invoice. Late payments incur 2% monthly interest or the maximum rate permitted by law. Supplier may suspend deliveries or services for delayed or unpaid accounts.
4. Delivery & Risk. Delivery schedules are estimates only. Risk of loss or damage transfers to the Client upon delivery to the carrier or to the Client''s premises, whichever occurs first. Title remains with the Supplier until full payment is settled.
5. Warranty. Products are warranted to be new, free from defects, and compliant with agreed specifications for 12 months from delivery or 6 months from commissioning, whichever comes first. Consumables and wear-and-tear items are excluded. Warranty covers repair, replacement, or refund at Supplier''s discretion. Warranty is void for misuse, improper installation, unauthorized repairs, or force majeure events.
6. Returns. No returns allowed without prior written authorization. Accepted returns may incur restocking, inspection, and shipping charges. NCNR and custom-made items are strictly non-returnable.
7. Cancellation. Client cancellations require Supplier approval. NCNR items are charged at 100%, standard items at ≥50%, and special/custom items at 100%. Supplier may cancel POs for non-payment, breach, insolvency, or force majeure.
8. Liability. Supplier liability is limited to the invoiced value of the affected goods or services. Supplier is not liable for indirect or consequential losses including production downtime or profit loss.
9. Intellectual Property. All drawings, software, technical documents, and related IP remain the Supplier''s property. No license or ownership transfers unless expressly agreed.
10. Confidentiality. All commercial and technical information provided by the Supplier must be kept confidential and not disclosed without written consent.
11. Governing Law. This Invoice and all related transactions shall be governed by Philippine laws. Disputes shall be resolved exclusively by the courts of Lapu-Lapu City, Cebu 6015, Philippines, without prejudice to the Supplier''s right to seek remedies elsewhere when necessary.','delivery','DELIVERY RECEIPT TERMS AND CONDITIONS

1. Receipt of Items
By signing the Delivery Receipt (DR), the Customer confirms that the items were received in good order, complete, and free from visible defects.

2. Inspection Period
The Customer shall inspect all delivered items within 48 hours from receipt. Any discrepancies, shortages, or damages must be formally reported within this period. Failure to do so constitutes acceptance.

3. Warranty
Warranty coverage is limited strictly to manufacturer defects and is subject to the supplier''s standard warranty terms. Misuse, mishandling, incorrect installation, or unauthorized repairs void the warranty.

4. Returns & Replacement
Returned items must be approved in advance. Only unused, unopened, and non-damaged items are eligible for return or replacement unless covered under valid warranty.

5. Ownership & Risk
Ownership transfers to the Customer upon full payment; however, risk of loss or damage transfers upon delivery and signing of the DR.

6. Installation & Commissioning
Unless explicitly included in the sales agreement, installation, programming, and commissioning services are not part of the spare parts delivery and shall be quoted separately.

7. Liability
The Supplier shall not be liable for any indirect, incidental, or consequential damages arising from the use or failure of delivered spare parts.

8. Payment Terms
Payments must follow the agreed billing terms stated in the corresponding quotation or purchase order.','payment','TERMS AND CONDITIONS

1. Purpose
This Electronic Payment Acknowledgement confirms that the Supplier has received payment from the Client via cash, bank transfer, or cheque. It serves only as a record of the transaction and is not a tax or BIR-related document.

2. Payment Validation
Cash payments are considered received once acknowledged.
Bank transfers are subject to confirmation of credit to the Supplier''s account.
Cheque payments are acknowledged subject to bank clearing. If a cheque is returned or dishonored, this acknowledgement becomes void.

3. Reference Documents
This acknowledgement should reference the applicable invoice, purchase order, statement, or other commercial document when available.

4. Accuracy of Information
The Client is responsible for providing accurate payment details. Any correction to the amount, payment instrument, or reference information must be recorded through an updated acknowledgement.

5. Final Settlement
Issuance of this acknowledgement does not waive any remaining balance, charges, or obligations unless expressly stated in the related commercial agreement.

6. Record Retention
Both parties should retain a copy of this acknowledgement together with supporting payment records for reconciliation and audit purposes.','quotation','QUOTATION TERMS AND CONDITIONS

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
Warranty and return conditions follow the Supplier''s applicable standard terms and manufacturer policies. Custom, configured, special-order, and NCNR items may be non-returnable.

9. Confidentiality
Commercial pricing and technical information in this quotation are confidential and intended only for the named Client and related evaluation personnel.

10. Governing Terms
Unless superseded by a signed agreement, this quotation and the Supplier''s standard commercial terms govern the proposed transaction.','po','PURCHASE ORDER TERMS AND CONDITIONS

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
This Purchase Order, together with any expressly incorporated quotation or agreement, constitutes the authorized purchasing instruction. Conflicting supplier terms do not apply unless accepted in writing.','packing','This Packing List identifies the goods packaged for shipment and accompanies the related commercial documents.')),
('plc-systems-reference-v1','v1.42.0','plc-systems',1,
 jsonb_build_object('id','plc-systems-reference-v1','version','v1.42.0',
 'profileId','plc-systems','profileVersion',1,'accent','#0b9a9d',
 'tableBackground','#e3f6f5','tableText','#2854a4',
 'ruleColor','#4772c7','termsMode','flow',
 'rendererVersion','tradelink-renderer-v1',
 'stylesheetAssets',jsonb_build_array('templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css','templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'),
 'stylesheetGitBlobShas',jsonb_build_array('fc3a9e2dd3626a4b7657ea72c105b042d8128287','866f644ed2f9a5fa569e799351feac19a90325fa')
 ),jsonb_build_object('esi','Terms & Conditions
1. General. This Invoice is governed by the Supplier''s standard Terms & Conditions. Acceptance of delivered goods or services constitutes full acceptance of these Terms. Any Client-imposed terms not expressly approved in writing are void.
2. Quotations & Orders. Prices and scope follow the approved Quotation/Proposal and accepted Purchase Order (PO). POs become binding upon Supplier''s written confirmation and are non-cancellable except as provided under the Supplier''s cancellation rules.
3. Prices & Payment. Prices are based on agreed commercial terms. Payment must follow the terms on the quotation or invoice. Late payments incur 2% monthly interest or the maximum rate permitted by law. Supplier may suspend deliveries or services for delayed or unpaid accounts.
4. Delivery & Risk. Delivery schedules are estimates only. Risk of loss or damage transfers to the Client upon delivery to the carrier or to the Client''s premises, whichever occurs first. Title remains with the Supplier until full payment is settled.
5. Warranty. Products are warranted to be new, free from defects, and compliant with agreed specifications for 12 months from delivery or 6 months from commissioning, whichever comes first. Consumables and wear-and-tear items are excluded. Warranty covers repair, replacement, or refund at Supplier''s discretion. Warranty is void for misuse, improper installation, unauthorized repairs, or force majeure events.
6. Returns. No returns allowed without prior written authorization. Accepted returns may incur restocking, inspection, and shipping charges. NCNR and custom-made items are strictly non-returnable.
7. Cancellation. Client cancellations require Supplier approval. NCNR items are charged at 100%, standard items at ≥50%, and special/custom items at 100%. Supplier may cancel POs for non-payment, breach, insolvency, or force majeure.
8. Liability. Supplier liability is limited to the invoiced value of the affected goods or services. Supplier is not liable for indirect or consequential losses including production downtime or profit loss.
9. Intellectual Property. All drawings, software, technical documents, and related IP remain the Supplier''s property. No license or ownership transfers unless expressly agreed.
10. Confidentiality. All commercial and technical information provided by the Supplier must be kept confidential and not disclosed without written consent.
11. Governing Law. This Invoice and all related transactions shall be governed by Philippine laws. Disputes shall be resolved exclusively by the courts of Lapu-Lapu City, Cebu 6015, Philippines, without prejudice to the Supplier''s right to seek remedies elsewhere when necessary.','delivery','DELIVERY RECEIPT TERMS AND CONDITIONS

1. Receipt of Items
By signing the Delivery Receipt (DR), the Customer confirms that the items were received in good order, complete, and free from visible defects.

2. Inspection Period
The Customer shall inspect all delivered items within 48 hours from receipt. Any discrepancies, shortages, or damages must be formally reported within this period. Failure to do so constitutes acceptance.

3. Warranty
Warranty coverage is limited strictly to manufacturer defects and is subject to the supplier''s standard warranty terms. Misuse, mishandling, incorrect installation, or unauthorized repairs void the warranty.

4. Returns & Replacement
Returned items must be approved in advance. Only unused, unopened, and non-damaged items are eligible for return or replacement unless covered under valid warranty.

5. Ownership & Risk
Ownership transfers to the Customer upon full payment; however, risk of loss or damage transfers upon delivery and signing of the DR.

6. Installation & Commissioning
Unless explicitly included in the sales agreement, installation, programming, and commissioning services are not part of the spare parts delivery and shall be quoted separately.

7. Liability
The Supplier shall not be liable for any indirect, incidental, or consequential damages arising from the use or failure of delivered spare parts.

8. Payment Terms
Payments must follow the agreed billing terms stated in the corresponding quotation or purchase order.','payment','TERMS AND CONDITIONS

1. Purpose
This Electronic Payment Acknowledgement confirms that the Supplier has received payment from the Client via cash, bank transfer, or cheque. It serves only as a record of the transaction and is not a tax or BIR-related document.

2. Payment Validation
Cash payments are considered received once acknowledged.
Bank transfers are subject to confirmation of credit to the Supplier''s account.
Cheque payments are acknowledged subject to bank clearing. If a cheque is returned or dishonored, this acknowledgement becomes void.

3. Reference Documents
This acknowledgement should reference the applicable invoice, purchase order, statement, or other commercial document when available.

4. Accuracy of Information
The Client is responsible for providing accurate payment details. Any correction to the amount, payment instrument, or reference information must be recorded through an updated acknowledgement.

5. Final Settlement
Issuance of this acknowledgement does not waive any remaining balance, charges, or obligations unless expressly stated in the related commercial agreement.

6. Record Retention
Both parties should retain a copy of this acknowledgement together with supporting payment records for reconciliation and audit purposes.','quotation','QUOTATION TERMS AND CONDITIONS

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
Warranty and return conditions follow the Supplier''s applicable standard terms and manufacturer policies. Custom, configured, special-order, and NCNR items may be non-returnable.

9. Confidentiality
Commercial pricing and technical information in this quotation are confidential and intended only for the named Client and related evaluation personnel.

10. Governing Terms
Unless superseded by a signed agreement, this quotation and the Supplier''s standard commercial terms govern the proposed transaction.','po','PURCHASE ORDER TERMS AND CONDITIONS

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
This Purchase Order, together with any expressly incorporated quotation or agreement, constitutes the authorized purchasing instruction. Conflicting supplier terms do not apply unless accepted in writing.','packing','This Packing List identifies the goods packaged for shipment and accompanies the related commercial documents.'))
ON CONFLICT (template_id,template_version) DO NOTHING;

CREATE OR REPLACE FUNCTION private.tl04_reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
 RAISE EXCEPTION 'TradeLink versioned profile, template and render records are immutable'
  USING ERRCODE='55000';
END
$function$;

CREATE TRIGGER tl04_company_profile_version_immutable
 BEFORE UPDATE OR DELETE ON private.tradelink_company_profile_versions
 FOR EACH ROW EXECUTE FUNCTION private.tl04_reject_immutable_change();
CREATE TRIGGER tl04_company_profile_version_no_truncate
 BEFORE TRUNCATE ON private.tradelink_company_profile_versions
 FOR EACH STATEMENT EXECUTE FUNCTION private.tl04_reject_immutable_change();

CREATE TRIGGER tl04_template_version_immutable
 BEFORE UPDATE OR DELETE ON private.tradelink_template_versions
 FOR EACH ROW EXECUTE FUNCTION private.tl04_reject_immutable_change();
CREATE TRIGGER tl04_template_version_no_truncate
 BEFORE TRUNCATE ON private.tradelink_template_versions
 FOR EACH STATEMENT EXECUTE FUNCTION private.tl04_reject_immutable_change();

CREATE TRIGGER tl04_document_render_snapshot_immutable
 BEFORE UPDATE OR DELETE ON private.tradelink_document_render_snapshots
 FOR EACH ROW EXECUTE FUNCTION private.tl04_reject_immutable_change();
CREATE TRIGGER tl04_document_render_snapshot_no_truncate
 BEFORE TRUNCATE ON private.tradelink_document_render_snapshots
 FOR EACH STATEMENT EXECUTE FUNCTION private.tl04_reject_immutable_change();

CREATE OR REPLACE FUNCTION private.tl04_build_document_render_snapshot(
 p_document_type text,p_content jsonb,p_snapshot_source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_profile_id text;
 v_requested_profile_id text:=NULLIF(p_content->>'vendorId','');
 v_requested_template_id text:=NULLIF(p_content->>'templateId','');
 v_template_id text;
 v_profile_version integer;
 v_template_version text;
 v_company jsonb;
 v_template jsonb;
 v_default_terms jsonb;
 v_terms text;
 v_terms_source text;
BEGIN
 IF p_document_type NOT IN ('esi','packing','delivery','payment','quotation','po')
  OR p_content IS NULL OR pg_catalog.jsonb_typeof(p_content)<>'object'
  OR p_snapshot_source NOT IN ('captured','legacy-derived','legacy-defaulted')
 THEN RAISE EXCEPTION 'Invalid TradeLink render snapshot input' USING ERRCODE='22023'; END IF;

 IF v_requested_profile_id IS NOT NULL THEN
  v_profile_id:=v_requested_profile_id;
 ELSIF v_requested_template_id IS NOT NULL THEN
  SELECT t.profile_id INTO v_profile_id
  FROM private.tradelink_template_versions t
  WHERE t.template_id=v_requested_template_id
  ORDER BY t.created_at DESC,t.template_version DESC LIMIT 1;
 ELSE v_profile_id:='watchdog-sales';
 END IF;

 SELECT p.profile_version,p.profile INTO v_profile_version,v_company
 FROM private.tradelink_company_profile_versions p
 WHERE p.profile_id=v_profile_id ORDER BY p.profile_version DESC LIMIT 1;
 IF v_company IS NULL THEN
  RAISE EXCEPTION 'Unknown TradeLink company profile version: %',v_profile_id USING ERRCODE='22023';
 END IF;

 v_template_id:=COALESCE(v_requested_template_id,v_company->>'templateId');
 IF v_template_id IS DISTINCT FROM v_company->>'templateId' THEN
  RAISE EXCEPTION 'TradeLink company profile and template identifiers do not match' USING ERRCODE='22023';
 END IF;

 SELECT t.template_version,t.template,t.default_terms
 INTO v_template_version,v_template,v_default_terms
 FROM private.tradelink_template_versions t
 WHERE t.template_id=v_template_id AND t.profile_id=v_profile_id
  AND t.profile_version=v_profile_version
 ORDER BY t.created_at DESC,t.template_version DESC LIMIT 1;
 IF v_template IS NULL THEN
  RAISE EXCEPTION 'TradeLink template version unavailable: %',v_template_id USING ERRCODE='22023';
 END IF;

 IF pg_catalog.jsonb_typeof(p_content->'terms')='string' THEN
  v_terms:=p_content->>'terms';v_terms_source:='document';
 ELSE
  v_terms:=v_default_terms->>p_document_type;
  IF v_terms IS NULL THEN
   RAISE EXCEPTION 'TradeLink default terms unavailable for module %',p_document_type USING ERRCODE='22023';
  END IF;
  v_terms_source:=CASE WHEN p_snapshot_source IN ('legacy-derived','legacy-defaulted')
   THEN 'legacy-defaulted' ELSE 'template-default' END;
 END IF;

 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'snapshotSource',p_snapshot_source,
  'profileVersion',v_profile_version,'company',v_company,'template',v_template,
  'terms',v_terms,'termsSource',v_terms_source,
  'capturedAt',pg_catalog.clock_timestamp()
 );
END
$function$;

CREATE OR REPLACE FUNCTION private.tl04_capture_document_render_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_source text;v_snapshot jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.revision IS NOT DISTINCT FROM OLD.revision THEN RETURN NEW; END IF;
 v_source:=CASE WHEN NULLIF(NEW.content->>'vendorId','') IS NULL
  AND NULLIF(NEW.content->>'templateId','') IS NULL
  THEN 'legacy-defaulted' ELSE 'captured' END;
 v_snapshot:=private.tl04_build_document_render_snapshot(NEW.document_type,NEW.content,v_source);

 INSERT INTO private.tradelink_document_render_snapshots (
  document_id,revision,board_id,workspace_id,document_type,
  company_profile_id,company_profile_version,template_id,template_version,
  snapshot_source,render_snapshot,captured_at
 )
 SELECT NEW.id,NEW.revision,NEW.board_id,NEW.workspace_id,NEW.document_type,
  v_snapshot->'company'->>'id',(v_snapshot->>'profileVersion')::integer,
  v_snapshot->'template'->>'id',v_snapshot->'template'->>'version',
  v_snapshot->>'snapshotSource',v_snapshot,(v_snapshot->>'capturedAt')::timestamptz
 WHERE EXISTS (SELECT 1 FROM private.tradelink_document_revision_snapshots s
  WHERE s.document_id=NEW.id AND s.revision=NEW.revision
   AND s.board_id=NEW.board_id AND s.workspace_id=NEW.workspace_id AND s.content=NEW.content)
 ON CONFLICT (document_id,revision) DO NOTHING;

 IF NOT EXISTS (SELECT 1 FROM private.tradelink_document_render_snapshots r
  WHERE r.document_id=NEW.id AND r.revision=NEW.revision) THEN
  RAISE EXCEPTION 'TradeLink immutable revision snapshot must exist before render capture' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END
$function$;

INSERT INTO private.tradelink_document_render_snapshots (
 document_id,revision,board_id,workspace_id,document_type,
 company_profile_id,company_profile_version,template_id,template_version,
 snapshot_source,render_snapshot,captured_at
)
SELECT s.document_id,s.revision,s.board_id,s.workspace_id,s.document_type,
 built.payload->'company'->>'id',(built.payload->>'profileVersion')::integer,
 built.payload->'template'->>'id',built.payload->'template'->>'version',
 built.payload->>'snapshotSource',built.payload,(built.payload->>'capturedAt')::timestamptz
FROM private.tradelink_document_revision_snapshots s
CROSS JOIN LATERAL (SELECT private.tl04_build_document_render_snapshot(
 s.document_type,s.content,
 CASE WHEN NULLIF(s.content->>'vendorId','') IS NULL
  AND NULLIF(s.content->>'templateId','') IS NULL
  THEN 'legacy-defaulted' ELSE 'legacy-derived' END
) AS payload) built
ON CONFLICT (document_id,revision) DO NOTHING;

CREATE TRIGGER tl04_document_render_snapshot_capture
 AFTER INSERT OR UPDATE OF revision ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl04_capture_document_render_snapshot();

CREATE OR REPLACE FUNCTION public.tl04_document_render_snapshot(
 p_board_id uuid,p_document_id uuid,p_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_workspace uuid;v_current_revision bigint;v_target_revision bigint;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink document session required' USING ERRCODE='42501';
 END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR p_document_id IS NULL OR (p_revision IS NOT NULL AND p_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink render snapshot request' USING ERRCODE='22023'; END IF;
 IF private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(auth.uid());
 IF v_workspace IS NULL THEN RAISE EXCEPTION 'Signed TradeLink workspace unavailable' USING ERRCODE='42501'; END IF;

 SELECT d.revision INTO v_current_revision FROM public.tradelink_documents d
 WHERE d.id=p_document_id AND d.board_id=p_board_id
  AND d.workspace_id=v_workspace AND d.deleted_at IS NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_target_revision:=COALESCE(p_revision,v_current_revision);
 IF v_target_revision>v_current_revision THEN
  RAISE EXCEPTION 'Requested TradeLink revision is newer than the document' USING ERRCODE='22023';
 END IF;

 SELECT pg_catalog.jsonb_build_object('documentId',r.document_id,'revision',r.revision,
  'snapshot',r.render_snapshot,'snapshotSource',r.snapshot_source,'capturedAt',r.captured_at)
 INTO v_result
 FROM private.tradelink_document_render_snapshots r
 JOIN private.tradelink_document_revision_snapshots s
  ON s.document_id=r.document_id AND s.revision=r.revision
 WHERE r.document_id=p_document_id AND r.revision=v_target_revision
  AND r.board_id=p_board_id AND r.workspace_id=v_workspace
  AND s.board_id=p_board_id AND s.workspace_id=v_workspace AND s.content IS NOT NULL;
 RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION private.tl04_reject_immutable_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.tl04_build_document_render_snapshot(text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.tl04_capture_document_render_snapshot() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tl04_document_render_snapshot(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tl04_document_render_snapshot(uuid,uuid,bigint) TO authenticated;

COMMENT ON TABLE private.tradelink_company_profile_versions IS
 'CP-TL-OPT-04 immutable legal company identity versions used by saved TradeLink render snapshots.';
COMMENT ON TABLE private.tradelink_template_versions IS
 'CP-TL-OPT-04 immutable TradeLink template, stylesheet and default-terms versions.';
COMMENT ON TABLE private.tradelink_document_render_snapshots IS
 'CP-TL-OPT-04 immutable company/template/terms rendering data bound to one saved document revision.';
COMMENT ON FUNCTION public.tl04_document_render_snapshot(uuid,uuid,bigint) IS
 'Returns the immutable rendering snapshot for the exact current or historical TradeLink document revision.';

COMMIT;
