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

export function filterActivities(records, filters = {}) {
  const {date, departmentId, personId, status, categoryId, query} = filters;
  const term = clean(query).toLowerCase();
  return records.filter(record =>
    (!date || record.date === date) &&
    (!departmentId || record.departmentId === departmentId) &&
    (!personId || record.personId === personId) &&
    (!status || record.status === status) &&
    (!categoryId || record.categoryId === categoryId) &&
    (!term || [record.title, record.details].some(value => clean(value).toLowerCase().includes(term)))
  );
}
