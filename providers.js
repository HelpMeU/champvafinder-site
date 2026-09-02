// providers.js — CHAMPVA Finder provider data & search logic
//
// CHANGES from the original version (see README_CROWDSOURCING.md for the
// full picture):
//   1. escapeHTML() — REQUIRED now that provider fields can come from
//      anonymous public submissions. Every field that used to go straight
//      into a template literal is now escaped before it hits innerHTML.
//      Skipping this on any one field is a stored-XSS hole.
//   2. badgeHTML() supports "Unverified" (CMS-imported, no community
//      confirmation yet) in addition to Expert/Familiar/Learning.
//   3. Rating line hides fake "0.0 ★ (0 reviews)" for un-reviewed records.
//   4. acceptingNew is tri-state (true / false / null-unconfirmed).
//   5. Confirm/Report buttons + a verification ribbon, wired to
//      /.netlify/functions/vote-provider (called from index.html, which
//      owns the merged static+dynamic provider list — this file stays
//      pure data + render functions, same separation as before).
//
// PROVIDERS itself is unchanged below — still the original 15
// community-submitted seed entries. Everything from CMS imports or new
// public submissions is merged in at runtime by index.html.

function escapeHTML(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PROVIDERS = [
  { id:1, name:"Riverside Family Medicine", type:"Primary Care", address:"412 Oak Street", city:"Austin", state:"TX", zip:"78701", phone:"(512) 555-0142", rating:4.8, reviews:34, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Spanish"], notes:"Dedicated CHAMPVA coordinator on staff. Handles all billing in-house.", specialties:["Family Medicine","Preventive Care"], source:"community" },
  { id:2, name:"Lone Star Orthopedics", type:"Specialist", address:"890 Congress Ave", city:"Austin", state:"TX", zip:"78701", phone:"(512) 555-0198", rating:4.5, reviews:19, champvaExperience:"Familiar", acceptingNew:true, telehealth:false, languages:["English"], notes:"Staff familiar with CHAMPVA but may require prior auth documentation.", specialties:["Orthopedics","Sports Medicine"], source:"community" },
  { id:3, name:"HealthBridge Pediatrics", type:"Pediatrics", address:"55 Barton Springs Rd", city:"Austin", state:"TX", zip:"78704", phone:"(512) 555-0231", rating:4.9, reviews:61, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Spanish","Vietnamese"], notes:"Highly recommended by veteran families. Zero billing surprises reported.", specialties:["Pediatrics","Adolescent Medicine"], source:"community" },
  { id:4, name:"Gateway Internal Medicine", type:"Primary Care", address:"2201 W Pecos Rd", city:"Phoenix", state:"AZ", zip:"85029", phone:"(602) 555-0177", rating:4.2, reviews:27, champvaExperience:"Familiar", acceptingNew:false, telehealth:true, languages:["English","Spanish"], notes:"Currently not accepting new CHAMPVA patients but telehealth available.", specialties:["Internal Medicine","Geriatrics"], source:"community" },
  { id:5, name:"Desert Sun Mental Health", type:"Mental Health", address:"7800 N 19th Ave", city:"Phoenix", state:"AZ", zip:"85021", phone:"(602) 555-0109", rating:4.7, reviews:42, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Spanish","Arabic"], notes:"Specializes in veteran family trauma and PTSD support for spouses and dependents.", specialties:["Psychiatry","Counseling","PTSD"], source:"community" },
  { id:6, name:"Cascade Dermatology Group", type:"Specialist", address:"1401 NE Broadway", city:"Portland", state:"OR", zip:"97232", phone:"(503) 555-0163", rating:3.9, reviews:11, champvaExperience:"Learning", acceptingNew:true, telehealth:false, languages:["English"], notes:"New to CHAMPVA billing. Recommend calling ahead to confirm coverage details.", specialties:["Dermatology"], source:"community" },
  { id:7, name:"Pacific Northwest OB/GYN", type:"OB/GYN", address:"3710 SW US Veterans Hosp Rd", city:"Portland", state:"OR", zip:"97239", phone:"(503) 555-0287", rating:4.6, reviews:38, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Mandarin"], notes:"Veteran-owned practice. Deep familiarity with CHAMPVA maternity benefits.", specialties:["Obstetrics","Gynecology","Maternal-Fetal"], source:"community" },
  { id:8, name:"Mile High Cardiology", type:"Specialist", address:"1601 E 19th Ave", city:"Denver", state:"CO", zip:"80218", phone:"(720) 555-0144", rating:4.4, reviews:23, champvaExperience:"Familiar", acceptingNew:true, telehealth:false, languages:["English"], notes:"Strong billing team. Pre-authorization handled proactively.", specialties:["Cardiology","Electrophysiology"], source:"community" },
  { id:9, name:"Front Range Family Dentistry", type:"Dental", address:"6250 Leetsdale Dr", city:"Denver", state:"CO", zip:"80224", phone:"(720) 555-0222", rating:4.1, reviews:16, champvaExperience:"Familiar", acceptingNew:true, telehealth:false, languages:["English","Spanish"], notes:"CHAMPVA covers limited dental. Staff will walk you through what's covered.", specialties:["General Dentistry","Preventive"], source:"community" },
  { id:10, name:"Magnolia Women's Health", type:"OB/GYN", address:"6 Medical Center Blvd", city:"Charlotte", state:"NC", zip:"28262", phone:"(704) 555-0191", rating:4.8, reviews:53, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Spanish","French"], notes:"Top-rated by CHAMPVA families in the Carolinas. Handles all paperwork.", specialties:["OB/GYN","Reproductive Health"], source:"community" },
  { id:11, name:"Triad Behavioral Health", type:"Mental Health", address:"511 N Elam Ave", city:"Greensboro", state:"NC", zip:"27403", phone:"(336) 555-0155", rating:4.5, reviews:29, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English"], notes:"Offers sliding scale for services not covered. Military family specialists on staff.", specialties:["Therapy","Child Psychology","Family Counseling"], source:"community" },
  { id:12, name:"Veterans Village Urgent Care", type:"Urgent Care", address:"8920 Tampa Ave", city:"Northridge", state:"CA", zip:"91324", phone:"(818) 555-0103", rating:4.0, reviews:44, champvaExperience:"Familiar", acceptingNew:true, telehealth:false, languages:["English","Spanish","Tagalog"], notes:"Walk-in friendly. Know your CHAMPVA card number, they verify on-site.", specialties:["Urgent Care","Occupational Medicine"], source:"community" },
  { id:13, name:"Bay Area Neurology Associates", type:"Specialist", address:"2350 Geary Blvd", city:"San Francisco", state:"CA", zip:"94115", phone:"(415) 555-0178", rating:4.3, reviews:18, champvaExperience:"Familiar", acceptingNew:false, telehealth:true, languages:["English","Cantonese","Spanish"], notes:"Waitlist for in-person. Telehealth available for established patients.", specialties:["Neurology","Headache Medicine"], source:"community" },
  { id:14, name:"Heartland Pediatric Therapy", type:"Pediatrics", address:"4500 W 135th St", city:"Overland Park", state:"KS", zip:"66223", phone:"(913) 555-0266", rating:4.7, reviews:31, champvaExperience:"Expert", acceptingNew:true, telehealth:true, languages:["English","Spanish"], notes:"OT, PT, and speech therapy all CHAMPVA-eligible here. Highly organized billing.", specialties:["Pediatric PT","Occupational Therapy","Speech Therapy"], source:"community" },
  { id:15, name:"Peachtree Dermatology & Skin", type:"Specialist", address:"1100 Lake Hearn Dr NE", city:"Atlanta", state:"GA", zip:"30342", phone:"(404) 555-0133", rating:4.6, reviews:22, champvaExperience:"Familiar", acceptingNew:true, telehealth:false, languages:["English"], notes:"Accepts CHAMPVA without hassle. Billing team is responsive.", specialties:["Dermatology","Mohs Surgery"], source:"community" },
];

// Filter + render
function filterProviders(list, { state, type, acceptingNew, telehealth, search }) {
  return list.filter(p => {
    if (state && p.state !== state) return false;
    if (type && p.type !== type) return false;
    if (acceptingNew && !p.acceptingNew) return false;
    if (telehealth && !p.telehealth) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${p.name} ${p.city} ${p.state} ${p.zip} ${p.type} ${(p.specialties||[]).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function starsHTML(rating) {
  return [1,2,3,4,5].map(i =>
    `<span class="${i <= Math.round(rating) ? 'lit' : ''}" style="font-size:13px;color:${i<=Math.round(rating)?'#C9952A':'#d1d5db'}">★</span>`
  ).join('');
}

function badgeHTML(level) {
  const cls = { Expert:'badge-expert', Familiar:'badge-familiar', Learning:'badge-learning', Unverified:'badge-unverified' }[level] || 'badge-unverified';
  const label = level || 'Unverified';
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${escapeHTML(label)}</span>`;
}

// Rating line: real community reviews show stars; records with no reviews
// yet (e.g. freshly imported or freshly submitted) show a plain note
// instead of a misleading "0.0 ★ (0 reviews)".
function ratingLineHTML(p) {
  if (p.reviews && p.reviews > 0) {
    return `<div class="stars">${starsHTML(p.rating)}</div><span style="font-size:13px;color:#6b7280;">${p.rating} (${p.reviews} reviews)</span>`;
  }
  return `<span style="font-size:13px;color:#9ca3af;font-style:italic;">Not yet rated by the community</span>`;
}

// Accepting-new-patients tag: tri-state. true/false are real, confirmed
// answers (from a submission). null/undefined means we don't know — show
// a neutral "call to confirm" tag rather than defaulting to "Waitlist".
function acceptingNewTagHTML(p) {
  if (p.acceptingNew === true) return '<span class="tag tag-green">Accepting New</span>';
  if (p.acceptingNew === false) return '<span class="tag" style="background:#f1f5f9;color:#64748b">Waitlist</span>';
  return '<span class="tag tag-subtle">Status Not Confirmed</span>';
}

// Verification ribbon: shown on anything not yet crowd-confirmed —
// CMS imports (source "cms") and fresh public submissions (source
// "community" with verified:false) alike. p.confirmCount/verified are
// attached by index.html after merging the vote-provider response.
function verificationRibbonHTML(p) {
  if (p.verified) {
    return `<div style="font-size:11px;color:#166534;margin-bottom:8px;">✓ Confirmed accurate by ${p.confirmCount} ${p.confirmCount === 1 ? 'person' : 'people'} in the community</div>`;
  }
  if (p.source === 'cms') {
    return `<div style="font-size:11px;color:#9ca3af;font-style:italic;margin-bottom:8px;">Imported from federal Medicare records — not yet confirmed for CHAMPVA by anyone in the community</div>`;
  }
  if (p.source === 'community') {
    return `<div style="font-size:11px;color:#9ca3af;font-style:italic;margin-bottom:8px;">New submission — not yet confirmed by other community members${p.confirmCount ? ` (${p.confirmCount} so far)` : ''}</div>`;
  }
  return '';
}

function voteButtonsHTML(p) {
  return `
    <div class="vote-row" data-vote-id="${escapeHTML(p.id)}">
      <button type="button" class="vote-btn vote-confirm" onclick="event.stopPropagation(); castVote('${escapeHTML(p.id)}','confirm',this)">👍 Confirm accurate</button>
      <button type="button" class="vote-btn vote-report" onclick="event.stopPropagation(); castVote('${escapeHTML(p.id)}','report',this)">🚩 Report incorrect</button>
      <span class="vote-feedback" style="display:none;"></span>
    </div>`;
}

function providerCardHTML(p) {
  const id = escapeHTML(p.id);
  return `
  <div class="provider-card" data-id="${id}" onclick="showDetail('${id}')">
    <div class="provider-name">${escapeHTML(p.name)}</div>
    <div class="provider-type">${escapeHTML(p.type)} · ${escapeHTML(p.city)}, ${escapeHTML(p.state)} ${escapeHTML(p.zip)}</div>
    <div class="provider-meta">
      ${badgeHTML(p.champvaExperience)}
      ${acceptingNewTagHTML(p)}
      ${p.telehealth ? '<span class="tag">Telehealth ✓</span>' : ''}
    </div>
    ${verificationRibbonHTML(p)}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      ${ratingLineHTML(p)}
    </div>
    <div class="provider-notes">${escapeHTML(p.notes)}</div>
    <div style="margin-top:10px;">
      <a class="provider-phone" href="tel:${escapeHTML((p.phone||'').replace(/\D/g,''))}">📞 ${escapeHTML(p.phone)}</a>
    </div>
    ${voteButtonsHTML(p)}
  </div>`;
}

function detailPanelHTML(p) {
  const id = escapeHTML(p.id);
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <div>
        <h2>${escapeHTML(p.name)}</h2>
        <div style="font-size:13px;color:#6b7280;margin-top:3px;">${escapeHTML(p.type)}</div>
      </div>
      ${badgeHTML(p.champvaExperience)}
    </div>
    ${verificationRibbonHTML(p)}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
      ${acceptingNewTagHTML(p)}
      ${p.telehealth ? '<span class="tag">Telehealth Available</span>' : ''}
      ${(p.languages||[]).map(l=>`<span class="tag tag-subtle">${escapeHTML(l)}</span>`).join('')}
    </div>
    <div style="margin-bottom:14px;">
      ${ratingLineHTML(p)}
    </div>
    <div class="divider"></div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">Address</div>
      <div style="font-size:14px;color:#374151;">${escapeHTML(p.address)}<br>${escapeHTML(p.city)}, ${escapeHTML(p.state)} ${escapeHTML(p.zip)}</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">Phone</div>
      <a class="provider-phone" href="tel:${escapeHTML((p.phone||'').replace(/\D/g,''))}" style="font-size:15px;">📞 ${escapeHTML(p.phone)}</a>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px;">Specialties</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">${(p.specialties||[]).map(s=>`<span class="tag tag-subtle">${escapeHTML(s)}</span>`).join('')}</div>
    </div>
    <div class="divider"></div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px;">Community Notes</div>
    <div style="font-size:14px;color:#374151;line-height:1.6;">${escapeHTML(p.notes)}</div>
    <div class="divider"></div>
    ${voteButtonsHTML(p)}
    <div class="divider"></div>
    <a href="tel:${escapeHTML((p.phone||'').replace(/\D/g,''))}" class="btn btn-navy" style="width:100%;justify-content:center;margin-bottom:8px;">📞 Call This Provider</a>
    <a href="https://www.google.com/maps/search/${encodeURIComponent((p.name||'')+' '+(p.city||'')+' '+(p.state||''))}" target="_blank" class="btn btn-ghost" style="width:100%;justify-content:center;">View on Map ↗</a>`;
}
