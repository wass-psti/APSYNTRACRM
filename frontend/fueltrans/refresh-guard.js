const EDITABLE_CONTROL_SELECTOR='input,textarea,select,[contenteditable="true"]';

/** Track actual user interaction without comparing controls to HTML defaults.
 * HTMLSelectElement has no defaultValue; input/change events work consistently
 * for selects, checkboxes, radios, text fields and contenteditable controls.
 */
export function createDirtyControlTracker(root){
 const dirty=new WeakSet();
 const markDirty=event=>{
  const control=event?.target;
  if(control?.matches?.(EDITABLE_CONTROL_SELECTOR))dirty.add(control);
 };
 root.addEventListener('input',markDirty,true);
 root.addEventListener('change',markDirty,true);
 return Object.freeze({
  hasDirtyControls(){
   return [...root.querySelectorAll(EDITABLE_CONTROL_SELECTOR)].some(control=>dirty.has(control));
  },
  dispose(){
   root.removeEventListener('input',markDirty,true);
   root.removeEventListener('change',markDirty,true);
  }
 });
}
