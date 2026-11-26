// DDA domain rules, independent of storage and the application shell.
// The caller supplies the authoritative directory; no demo personnel are seeded.
export const statuses = Object.freeze(['Pending', 'In Progress', 'Completed']);

const clean = value => String(value ?? '').trim();

export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function saveCategory(categories, input, id = '', makeId = () => crypto.randomUUID()) {
  const name = clean(input.name);
  if (!name || name.length > 120) throw new Error('Enter a category name of up to 120 characters.');
  if (id && !categories.some(category => category.id === id)) throw new Error('Category not found.');
  if (categories.some(category => category.id !== id && category.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Category name already exists.');
  }
  const category = {id: id || makeId(), name};
  if (!id && categories.some(item => item.id === category.id)) throw new Error('Category ID already exists.');
  return id ? categories.map(item => item.id === id ? category : item) : [...categories, category];
}

export function saveActivity(records, directory, categories, input, id = '', makeId = () => crypto.randomUUID()) {
  const person = directory.people.find(item => item.id === input.personId);
  const previous = id ? records.find(item => item.id === id) : null;
  if (id && !previous) throw new Error('Activity not found.');
  if (previous && (previous.personId !== input.personId || previous.date !== input.date)) {
    throw new Error('Activity identity and date cannot change during editing.');
  }
  const title = clean(input.title);
  const details = clean(input.details);
  const categoryId = input.categoryId || null;
  if (!person || !validDate(input.date) || !title || !statuses.includes(input.status)) {
    throw new Error('Choose a person, valid date, activity title and status.');
  }
  if (title.length > 160 || details.length > 2000) throw new Error('Activity title or details exceed the allowed length.');
  if (categoryId && !categories.some(category => category.id === categoryId)) throw new Error('Category not found.');
  const departmentId = previous ? previous.departmentId : person.departmentId;
  if (!directory.departments.some(department => department.id === departmentId)) throw new Error('Department not found.');
  const record = {id: id || makeId(), personId: person.id, departmentId, date: input.date, title, details, status: input.status, categoryId};
  if (!id && records.some(item => item.id === record.id)) throw new Error('Activity ID already exists.');
  return id ? records.map(item => item.id === id ? record : item) : [...records, record];
}

// Local projection only. A persistent delete must be acknowledged by the server.
export function deleteActivity(records, id) {
  if (!records.some(record => record.id === id)) throw new Error('Activity not found.');
  return records.filter(record => record.id !== id);
}

export function filterActivities(records, filters = {}, departments = []) {
  const {date, departmentId, personId, status, categoryId, query} = filters;
  const term = clean(query).toLowerCase();
  const scope = new Set([departmentId, ...departments.filter(row => row.parentId === departmentId).map(row => row.id)]);
  return records.filter(record =>
    (!date || record.date === date) &&
    (!departmentId || scope.has(record.departmentId)) &&
    (!personId || record.personId === personId) &&
    (!status || record.status === status) &&
    (!categoryId || record.categoryId === categoryId) &&
    (!term || [record.title, record.details].some(value => clean(value).toLowerCase().includes(term)))
  );
}

export function saveDepartment(directory,input,id='',makeId=()=>crypto.randomUUID()) {
  const name=clean(input.name),parentId=input.parentId||null;
  const {departments}=directory;
  if(!name||name.length>120)throw Error('Enter a department name of up to 120 characters.');
  if(id&&!departments.some(row=>row.id===id))throw Error('Department not found.');
  if(departments.some(row=>row.id!==id&&row.name.toLowerCase()===name.toLowerCase()))throw Error('Department name already exists.');
  const nextId=id||makeId();
  if(!id&&departments.some(row=>row.id===nextId))throw Error('Department ID already exists.');
  if(parentId&&(parentId===nextId||!departments.some(row=>row.id===parentId&&!row.parentId)||
      departments.some(row=>row.parentId===nextId)))throw Error('Invalid department hierarchy.');
  const short = clean(input.short ?? departments.find(row => row.id === id)?.short);
  if (short.length > 8) throw Error('Department abbreviation must be up to 8 characters.');
  return {id:nextId,name,parentId,short};
}

export function savePerson(directory,input) {
  const {people,departments,unassigned=[]}=directory;
  const existing=people.find(row=>row.id===input.id);
  const source=unassigned.find(row=>row.id===input.id);
  if(!existing&&!source)throw Error('Choose an existing workforce or CRM identity.');
  const name=existing?clean(input.name):source.name;
  if(!name||name.length>160)throw Error('Enter a personnel name of up to 160 characters.');
  if(!departments.some(row=>row.id===input.departmentId))throw Error('Department not found.');
  const employeeId = clean(input.employeeId ?? existing?.employeeId);
  const position = clean(input.position ?? existing?.position);
  const company = clean(input.company ?? existing?.company);
  const isHead = input.isHead === undefined ? Boolean(existing?.isHead && existing.departmentId === input.departmentId) : input.isHead === true;
  if (employeeId.length > 80 || position.length > 120 || !['','WASS','WAO','PSTI'].includes(company)) throw Error('Invalid personnel reporting details.');
  if (employeeId && people.some(row => row.id !== input.id && clean(row.employeeId).toLowerCase() === employeeId.toLowerCase())) throw Error('Employee ID already exists.');
  return {id:input.id,name,departmentId:input.departmentId,employeeId,position,company,isHead};
}

// A unit supervisor reports to its parent department supervisor when designated.
export function supervisorFor(person, directory) {
  const direct = directory.people.find(row => row.departmentId === person.departmentId && row.isHead && row.id !== person.id);
  if (direct) return direct;
  const parentId = directory.departments.find(row => row.id === person.departmentId)?.parentId;
  return parentId ? directory.people.find(row => row.departmentId === parentId && row.isHead && row.id !== person.id) : undefined;
}
