// Fictional starting directory; identity is stable across organizational changes.
export const DIRECTORY_KEY = 'aps.daily-department-directory.v1';
export const companies = ['WASS','WAO','PSTI'];
const seedDepartments = [
  {id:'materials',name:'Materials & Logistics',short:'ML',units:[]},
  {id:'finance',name:'Finance and Accounting',short:'FA',units:[]},
  {id:'hr',name:'HR and Administration',short:'HR',units:[]},
  {id:'sales',name:'Sales and Marketing',short:'SM',units:[]},
  {id:'it',name:'Information Technology',short:'IT',units:[]},
  {id:'engineering',name:'Engineering',short:'EN',units:['Research and Development','iFab']}
];
export function initialDirectory() {
  const departments=structuredClone(seedDepartments);
  const people=departments.flatMap(department=>(department.units.length?department.units:['']).flatMap((unit,index)=>{
    const prefix=department.id+'-'+index;
    const label=unit||department.short;
    return ['head','staff1','staff2'].map((role,i)=>({
      id:prefix+'-'+role,departmentId:department.id,unit,
      name:label+(i===0?' Supervisor (Demo)':' Staff 0'+i+' (Demo)'),
      isHead:i===0,employeeId:'DEMO-'+prefix.toUpperCase()+'-'+role.toUpperCase(),
      position:i===0?'Supervisor':'Staff',company:''
    }));
  }));
  return {departments,people};
}
const initial=initialDirectory();
export const departments=initial.departments;
export const people=initial.people;
export const personById=id=>people.find(person=>person.id===id);
export const departmentById=id=>departments.find(department=>department.id===id);
export const currentDirectory=()=>({departments,people});
export function applyDirectory(data) {
  departments.splice(0,departments.length,...data.departments);
  people.splice(0,people.length,...data.people);
}
const clean=value=>String(value??'').trim();
const normalized=value=>clean(value).toLowerCase();
const unique=values=>new Set(values).size===values.length;
export function validateDirectory(data) {
  if(!data||!Array.isArray(data.departments)||!Array.isArray(data.people)||!data.departments.length||!data.people.length)throw Error('Invalid directory data.');
  const ds=data.departments,ps=data.people;
  if(ds.some(d=>!d||typeof d.id!=='string'||!d.id||typeof d.name!=='string'||!clean(d.name)||typeof d.short!=='string'||!clean(d.short)||!Array.isArray(d.units)||d.units.some(u=>typeof u!=='string'||!clean(u))||!unique(d.units.map(normalized))))throw Error('Invalid department data.');
  if(!unique(ds.map(d=>d.id))||!unique(ds.map(d=>normalized(d.name))))throw Error('Duplicate department.');
  if(ps.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!clean(p.name)||typeof p.employeeId!=='string'||!clean(p.employeeId)||typeof p.position!=='string'||typeof p.company!=='string'||!['',...companies].includes(p.company)||typeof p.unit!=='string'||typeof p.isHead!=='boolean'||!ds.some(d=>d.id===p.departmentId&&(!p.unit||d.units.includes(p.unit)))))throw Error('Invalid personnel data.');
  if(!unique(ps.map(p=>p.id))||!unique(ps.map(p=>normalized(p.employeeId))))throw Error('Duplicate employee ID.');
  if(!unique(ps.filter(p=>p.isHead).map(p=>JSON.stringify([p.departmentId,p.unit]))))throw Error('Duplicate supervisor assignment.');
  return data;
}
export function readDirectory(storage) {
  const raw=storage.getItem(DIRECTORY_KEY);
  return raw===null?initialDirectory():validateDirectory(JSON.parse(raw));
}
export function writeDirectory(storage,data) {
  storage.setItem(DIRECTORY_KEY,JSON.stringify(validateDirectory(data)));
}
export function saveDepartment(data,input,id='',makeId=()=>crypto.randomUUID()) {
  const name=clean(input.name),short=clean(input.short);
  const units=String(input.units??'').split(/\r?\n/).map(clean).filter(Boolean);
  if(!name||!short||name.length>120||short.length>8||units.some(u=>u.length>120))throw Error('Enter a department name, abbreviation and valid unit names.');
  if(!unique(units.map(normalized)))throw Error('Unit names must be unique.');
  if(data.departments.some(d=>d.id!==id&&normalized(d.name)===normalized(name)))throw Error('Department name already exists.');
  if(id&&!data.departments.some(d=>d.id===id))throw Error('Department not found.');
  if(id&&data.people.some(p=>p.departmentId===id&&p.unit&&!units.includes(p.unit)))throw Error('Move personnel out of a unit before removing or renaming it.');
  const record={id:id||makeId(),name,short,units};
  return validateDirectory({...data,departments:id?data.departments.map(d=>d.id===id?record:d):[...data.departments,record]});
}
export function savePerson(data,input,id='',makeId=()=>crypto.randomUUID()) {
  const name=clean(input.name),employeeId=clean(input.employeeId),position=clean(input.position),company=clean(input.company);
  const department=data.departments.find(d=>d.id===input.departmentId);
  const unit=clean(input.unit),isHead=input.isHead===true;
  if(!name||!employeeId||name.length>120||employeeId.length>80||position.length>120||!department||(unit&&!department.units.includes(unit))||!['',...companies].includes(company))throw Error('Enter a name, employee ID and valid organizational assignment.');
  if(data.people.some(p=>p.id!==id&&normalized(p.employeeId)===normalized(employeeId)))throw Error('Employee ID already exists.');
  if(id&&!data.people.some(p=>p.id===id))throw Error('Personnel record not found.');
  const record={id:id||makeId(),name,employeeId,position,company,departmentId:department.id,unit,isHead};
  // A designated head replaces the existing head only within the same organizational scope.
  let next=id?data.people.map(p=>p.id===id?record:p):[...data.people,record];
  if(isHead)next=next.map(p=>p.id!==record.id&&p.departmentId===record.departmentId&&p.unit===record.unit&&p.isHead?{...p,isHead:false}:p);
  return validateDirectory({...data,people:next});
}
export function supervisorFor(person,roster=people) {
  const head=roster.find(p=>p.departmentId===person.departmentId&&p.unit===person.unit&&p.isHead)
    || (person.unit?roster.find(p=>p.departmentId===person.departmentId&&!p.unit&&p.isHead):undefined);
  if(head?.id===person.id)return person.unit?roster.find(p=>p.departmentId===person.departmentId&&!p.unit&&p.isHead):undefined;
  return head;
}
export function searchPersonnel(roster,query='',departmentId='') {
  const term=normalized(query);
  return roster.filter(p=>(!departmentId||p.departmentId===departmentId)&&(!term||[p.name,p.employeeId,p.position,p.company,p.unit].some(value=>normalized(value).includes(term))));
}
