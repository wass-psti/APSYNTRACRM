/** Read-only native Paseo management projection. The existing Paseo API enforces staff membership. */
const API='https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/pdl-guest-api';

export async function readPaseoManagement(token,{request=fetch,signal}={}){
 if(typeof token!=='string'||!token.trim())return {status:'DENIED'};
 const get=async path=>request(API+path,{
   method:'GET',cache:'no-store',credentials:'omit',signal:signal??AbortSignal.timeout(12000),
   headers:{authorization:'Bearer '+token},
 });
 const session=await get('/v1/admin/session');
 if(session.status===401||session.status===403)return {status:'DENIED'};
 if(!session.ok)throw Error('Paseo management session could not be verified.');
 const [courts,reservations]=await Promise.all([
   get('/v1/admin/courts'),get('/v1/admin/reservations?q='),
 ]);
 if([401,403].includes(courts.status)||[401,403].includes(reservations.status))return {status:'DENIED'};
 if(!courts.ok||!reservations.ok)throw Error('Paseo management records could not be retrieved.');
 const courtData=await courts.json(),bookingData=await reservations.json();
 if(!Array.isArray(courtData.courts)||!Array.isArray(bookingData.reservations))
   throw Error('Paseo management response is not in the expected format.');
 return {
  status:'VERIFIED',
  courtCount:courtData.courts.length,
  enabledCourtCount:courtData.courts.filter(court=>court.enabled===true).length,
  reservations:bookingData.reservations.slice(0,50).map(item=>({
   id:String(item.id||''),name:String(item.full_name||''),
   bookingStatus:String(item.booking_status||''),
   paymentStatus:String(item.payment_status||''),
  })),
 };
}
