// Traverse an object and all nested objects or arrays
export const deepMap = (obj: Record<string, any>, fn: Function) => {
  let output: any[] = [];
  Object.keys(obj).forEach(key => {
    let val = obj[key];
    if (typeof val === 'object' && val !== null) {
      Array.prototype.push.apply(output, deepMap(val, fn));
    } else {
      output.push(fn(key, val));
    }
  });
  return output;
};
