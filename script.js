/**
* Foto filter aplikacija (brez knjižnic)
* - getUserMedia (privzeto selfie)
* - 9:16 preview "oder"
* - overlay PNG (contain)
* - zajem video+overlay na canvas 1080x1920
* - download PNG, iOS fallback modal (ročno shranjevanje)
*/
const video = document.getElementById("video");
const overlayImg = document.getElementById("overlay");
const btnShot = document.getElementById("btnShot");
const btnFlip = document.getElementById("btnFlip");
const statusEl = document.getElementById("status");
// Modal fallback
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const btnClose = document.getElementById("btnClose");
const previewImg = document.getElementById("previewImg");
const btnOpenNewTab = document.getElementById("btnOpenNewTab");
let stream = null;
let facingMode = "user"; // privzeto selfie
// Končni izhod mora biti 9:16 (npr. 1080x1920)
const OUT_W = 1080;
const OUT_H = 1920;
// --- Pomožne funkcije --------------------------------------------------------
function isIOS() {
 // iOS Safari + iPadOS (včasih se predstavi kot Mac)
 const ua = navigator.userAgent || "";
 const iOSDevice = /iPhone|iPad|iPod/i.test(ua);
 const iPadOS = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
 return iOSDevice || iPadOS;
}
function showStatus(msg, ms = 1600) {
 statusEl.textContent = msg;
 statusEl.classList.add("show");
 window.clearTimeout(showStatus._t);
 showStatus._t = window.setTimeout(() => {
 statusEl.classList.remove("show");
 }, ms);
}
function stopStream() {
 if (stream) {
 stream.getTracks().forEach(t => t.stop());
 stream = null;
 }
}
async function startCamera() {
 stopStream();
 // iOS Safari zna biti občutljiv na "exact", zato naredimo varen fallback.
 const constraintsPrimary = {
 audio: false,
 video: {
 facingMode: { ideal: facingMode },
 width: { ideal: 1280 },
 height: { ideal: 720 }
 }
 };
 const constraintsFallback = {
 audio: false,
 video: {
 facingMode: facingMode, // brez ideal/exact
 width: { ideal: 1280 },
 height: { ideal: 720 }
 }
 };
 try {
 showStatus("Zaganjam kamero …");
 stream = await navigator.mediaDevices.getUserMedia(constraintsPrimary);
 } catch (e1) {
 try {
 stream = await navigator.mediaDevices.getUserMedia(constraintsFallback);
 } catch (e2) {
 console.error(e2);
 showStatus("Ni dostopa do kamere. Preveri dovoljenja v brskalniku.", 3000);
 throw e2;
 }
 }
 video.srcObject = stream;
 // Počakaj, da ima video metadata (dimenzije)
 await new Promise((resolve) => {
 if (video.readyState >= 1) return resolve();
 video.onloadedmetadata = () => resolve();
 });
 // Na nekaterih napravah je dobro eksplicitno poklicati play()
 try { await video.play(); } catch (_) {}
 showStatus(facingMode === "user" ? "Selfie kamera" : "Zadnja kamera");
}
/**
* Izračun "cover" risanja:
* - video se raztegne tako, da popolnoma zapolni cilj (canvas),
* - presežek se obreže (enako kot CSS object-fit: cover).
*/
function drawCover(ctx, src, destW, destH) {
 const srcW = src.videoWidth;
 const srcH = src.videoHeight;
 // Če video še ni pripravljen
 if (!srcW || !srcH) return;
 const srcAR = srcW / srcH;
 const destAR = destW / destH;
 let drawW, drawH, dx, dy;
 if (srcAR > destAR) {
 // vir je "širši" -> prilagodi višini, obreži levo/desno
 drawH = destH;
 drawW = destH * srcAR;
 dx = (destW - drawW) / 2;
 dy = 0;
 } else {
 // vir je "višji" -> prilagodi širini, obreži zgoraj/spodaj
 drawW = destW;
 drawH = destW / srcAR;
 dx = 0;
 dy = (destH - drawH) / 2;
 }
 ctx.drawImage(src, dx, dy, drawW, drawH);
}
/**
* Izračun "contain" risanja:
* - overlay se prilega v celoten okvir brez obrezovanja
* - enako kot CSS object-fit: contain.
*/
function drawContain(ctx, img, destW, destH) {
 const iw = img.naturalWidth;
 const ih = img.naturalHeight;
 if (!iw || !ih) return;
 const imgAR = iw / ih;
 const destAR = destW / destH;
 let drawW, drawH, dx, dy;
 if (imgAR > destAR) {
 // slika je širša -> prilegaj po širini
 drawW = destW;
 drawH = destW / imgAR;
 dx = 0;
 dy = (destH - drawH) / 2;
 } else {
 // slika je višja -> prilegaj po višini
 drawH = destH;
 drawW = destH * imgAR;
 dx = (destW - drawW) / 2;
 dy = 0;
 }
 ctx.drawImage(img, dx, dy, drawW, drawH);
}
/**
* Poskus prenosa (download). Če to ni izvedljivo (zlasti iOS), pokažemo modal.
*/
function tryDownloadOrFallback(dataUrl) {
 // iOS Safari pogosto ignorira download=, zato gremo direktno v fallback
 if (isIOS()) {
 openFallbackModal(dataUrl);
 return;
 }
 try {
 const a = document.createElement("a");
 a.href = dataUrl;
 a.download = `foto-filter-${Date.now()}.png`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 // Če bi download iz kakršnegakoli razloga "odpovedal", vsaj pokažemo modal.
 // (Ne moremo 100% zanesljivo zaznati, ali je uporabnik datoteko dejansko shranil.)
 showStatus("Prenos fotografije …");
 } catch (err) {
 console.warn("Download ni uspel, fallback modal.", err);
 openFallbackModal(dataUrl);
 }
}
/**
* Fallback: prikaže zajeto sliko + gumb za odpiranje v novem zavihku (lažje shranjevanje na iOS).
*/
function openFallbackModal(dataUrl) {
 previewImg.src = dataUrl;
 modal.hidden = false;
 // prepreči "scroll" ozadja
 document.body.style.overflow = "hidden";
 btnOpenNewTab.onclick = () => {
 // Odpri v novem zavihku (na iOS potem Share → Save Image)
 const w = window.open();
 if (!w) {
 showStatus("Popup blokiran. Dovoli odpiranje oken ali shrani prek Share v modalu.", 2500);
 return;
 }
 w.document.write(`<title>Fotografija</title><img src="${dataUrl}" style="width:100%;height:auto;display:block;">`);
 w.document.close();
 };
 showStatus("Predogled pripravljen");
}
function closeModal() {
 modal.hidden = true;
 previewImg.src = "";
 document.body.style.overflow = "";
}
// --- Glavna logika -----------------------------------------------------------
async function ensureOverlayLoaded() {
 // Če overlay še ni naložen, počakamo (da je naturalWidth pravilno)
 if (overlayImg.complete && overlayImg.naturalWidth) return;
 await new Promise((resolve, reject) => {
 overlayImg.onload = () => resolve();
 overlayImg.onerror = () => reject(new Error("Overlay image failed to load."));
 });
}
async function takePhoto() {
 // Ob kliku mora VEDNO biti rezultat: download ali modal
 try {
 btnShot.disabled = true;
 showStatus("Zajemam …");
 await ensureOverlayLoaded();
 // Ustvari canvas 1080x1920 (9:16)
 const canvas = document.createElement("canvas");
 canvas.width = OUT_W;
 canvas.height = OUT_H;
 const ctx = canvas.getContext("2d");
 // 1) Nariši video kot cover (enako kot preview video object-fit: cover)
 drawCover(ctx, video, OUT_W, OUT_H);
 // 2) Nariši overlay kot contain (enako kot preview overlay object-fit: contain)
 drawContain(ctx, overlayImg, OUT_W, OUT_H);
 // 3) Export v PNG DataURL
 const dataUrl = canvas.toDataURL("image/png");
 // 4) Download ali fallback modal (iOS)
 tryDownloadOrFallback(dataUrl);
 } catch (err) {
 console.error(err);
 // Če gre karkoli narobe, vsaj obvesti uporabnika (in ne pusti brez rezultata)
 showStatus("Zajem ni uspel. Preveri dovoljenja kamere in poskusi znova.", 3000);
 } finally {
 btnShot.disabled = false;
 }
}
async function flipCamera() {
 facingMode = (facingMode === "user") ? "environment" : "user";
 btnFlip.disabled = true;
 try {
 await startCamera();
 } finally {
 btnFlip.disabled = false;
 }
}
// --- Eventi ------------------------------------------------------------------
btnShot.addEventListener("click", takePhoto);
btnFlip.addEventListener("click", flipCamera);
btnClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
// iOS: prvi "user gesture" je pomemben, a ker imamo gumbe, je OK.
// Kameri se poskusimo priklopiti takoj ob nalaganju.
window.addEventListener("load", async () => {
 if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
 showStatus("Ta brskalnik ne podpira kamere (getUserMedia).", 3000);
 return;
 }
 try {
 await startCamera();
 } catch (_) {
 // napaka je že obdelana v startCamera()
 }
});
