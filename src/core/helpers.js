/* =========================================================
   RUNEGUN · Math & DOM helpers
   Small pure utilities (rng, clamp, distance, lerp, roman numerals) and the $ element lookup, shared everywhere.
   ========================================================= */
"use strict";


/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const ROMAN = n => { const m=[["L",50],["XL",40],["X",10],["IX",9],["V",5],["IV",4],["I",1]]; let s=""; for(const [r,v] of m){ while(n>=v){s+=r;n-=v;} } return s||"I"; };
const $ = id => document.getElementById(id);
/* short vibration pulse on key combat beats — Android WebView / mobile browsers
   only (navigator.vibrate is absent on desktop → silent no-op). Meta.haptics
   gates it via the settings toggle. */
const haptic = ms => { if (Meta.haptics !== false && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
