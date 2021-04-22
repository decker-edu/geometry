export { vec2, len, norm, add, sub, mul, div, dot, perp };

let vec2 = (x, y) => {
  return { x, y };
};
let len = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
let norm = (v) => div(v, len(v));
let add = (a, b, ...vs) => {
  let r = vec2(a.x + b.x, a.y + b.y);
  for (let v of vs) {
    r = vec2(r.x + v.x, r.y + v.y);
  }
  return r;
};
let sub = (a, b) => vec2(a.x - b.x, a.y - b.y);
let mul = (s, v) => vec2(s * v.x, s * v.y);
let div = (v, s) => mul(1 / s, v);
let dot = (a, b) => a.x * b.x + a.y * b.y;
let perp = (a) => norm(vec2(a.y, -a.x));
