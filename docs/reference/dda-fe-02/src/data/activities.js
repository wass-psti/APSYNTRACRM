import {personById,departmentById} from './directory.js';

export const STORAGE_KEY = 'aps.daily-department-activity.v1';
export const statuses = ['Pending','In Progress','Completed'];
export function manilaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date+'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0,10) === date;
}
export function saveActivity(records,input,id = '',makeId = () => crypto.randomUUID()) {
  const person = personById(input.personId);
  const title = String(input.title ?? '').trim();
  const details = String(input.details ?? '').trim();
  if (!person || !validDate(input.date) || !title || !statuses.includes(input.status)) throw new Error('Choose a person, valid date, activity title and status.');
  if (title.length > 160 || details.length > 2000) throw new Error('Activity title or details exceed the allowed length.');
  if (id && !records.some(record => record.id === id)) throw new Error('Activity not found.');
  const previous = id ? records.find(record => record.id === id) : null;
  if (previous && (previous.personId !== person.id || previous.date !== input.date)) throw new Error('Activity identity and date cannot change during editing.');
  const record = {id:id || makeId(),personId:person.id,departmentId:previous ? previous.departmentId : person.departmentId,date:input.date,title,details,status:input.status};
  return id ? records.map(item => item.id === id ? record : item) : [...records,record];
}
export function filterActivities(records,{date='',departmentId='',personId='',status=''} = {}) {
  return records.filter(item => (!date || item.date === date) && (!departmentId || item.departmentId === departmentId) && (!personId || item.personId === personId) && (!status || item.status === status));
}
export function summarize(records) {
  return {total:records.length,completed:records.filter(record => record.status === 'Completed').length,inProgress:records.filter(record => record.status === 'In Progress').length,pending:records.filter(record => record.status === 'Pending').length,people:new Set(records.map(record => record.personId)).size};
}
export function readActivities(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.details !== 'string' || !personById(record.personId) || !departmentById(record.departmentId) || !validDate(record.date) || !statuses.includes(record.status)) || new Set(records.map(record => record.id)).size !== records.length) throw new Error('Saved preview data could not be read.');
  return records;
}
export function writeActivities(storage,records) {
  storage.setItem(STORAGE_KEY,JSON.stringify(records));
}
