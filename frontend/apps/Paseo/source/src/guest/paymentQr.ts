import type {PaymentMethod} from '../types/domain';

// APSYNTRA publishes only server-managed QR methods from the existing Paseo
// booking API. Do not bundle old unverified recipient names or static QR files.
export const paymentQr = {
  gcash: {name:'GCash',image:'',recipient:''},
  maya: {name:'Maya',image:'',recipient:''},
  bpi: {name:'BPI',image:'',recipient:''},
} satisfies Record<PaymentMethod,{name:string;image:string;recipient:string}>;
