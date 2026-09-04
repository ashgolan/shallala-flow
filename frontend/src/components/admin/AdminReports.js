import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import ReadingsTable from './ReadingsTable';

import { getPrice as getP, getBasePrice as getBaseP } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsDiff, cupsPositive } from '../../utils/cups'; // ✅ فرق أكواب موحّد
import { getExtrasNet, getExtrasGross, groupExtrasByLand } from '../../utils/extras'; // ✅ إضافات موحّدة — الآن تابعة للأرض (landId) لا للقراءة

export function AdminReports({ adminRole='admin' }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const isViewer = adminRole === 'viewer';

  const [data, setData]       = useState({ farmers:[], lands:[], readings:[], prices:{}, landExtras:[] });
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [mapModal, setMapModal] = useState(null);

  // فلاتر عامة
  const [filterYear,    setFilterYear]    = useState('');
  const [filterFarmer,  setFilterFarmer]  = useState('');
  const [filterRegion,  setFilterRegion]  = useState('');
  const [filterPaid,    setFilterPaid]    = useState('');
  const [farmerSearch,  setFarmerSearch]  = useState('');
  const [showFarmerList,setShowFarmerList]= useState(false);

  // ✅ فلتر الإضافات غير المدفوعة
  const [activeTab,       setActiveTab]       = useState('main');   // 'main' | 'extras' | 'audit'
  const [filterExtraNote, setFilterExtraNote] = useState('');
  const [extraNoteInput,  setExtraNoteInput]  = useState('');

  // ✅ تدقيق اشتراك/إضافة معينة (داخل تبويب "تدقيق البيانات")
  const [subName,     setSubName]     = useState('');        // اسم الاشتراك (اختياري)
  const [subAmount,   setSubAmount]   = useState('');        // المبلغ
  const [addingAll,   setAddingAll]   = useState(false);     // جاري الإضافة
  const [addedCount,  setAddedCount]  = useState(null);      // نتيجة الإضافة

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rg] = await Promise.all([adminAPI.getReport(), regionsAPI.getRegions()]);
      setData(d);
      setRegions(rg.regions || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { farmers, lands, readings, prices, landExtras } = data;

  // ✅ خريطة landId -> [extras] — الإضافات صارت تابعة للأرض نفسها، تُقرأ مرة واحدة هون وتُستخدم بكل مكان بالملف
  const landExtrasByLand = groupExtrasByLand(landExtras);

  const farmerName = id => farmers.find(f=>String(f.id)===String(id))?.nameHeb
                        || farmers.find(f=>String(f.id)===String(id))?.name || '—';

  const landName = id => {
    const land = lands.find(l => String(l.id) === String(id));
    if (!land) return '—';
    if (land.regionId) {
      const reg = regions.find(r => String(r.id) === String(land.regionId));
      if (reg?.nameHeb && reg.nameHeb !== reg.name) return reg.nameHeb;
      if (reg?.name) return reg.name;
    }
    const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
    if (code) {
      const reg = regions.find(r => r.name?.toUpperCase() === code);
      if (reg?.nameHeb && reg.nameHeb !== reg.name) return reg.nameHeb;
      if (reg?.name) return reg.name;
    }
    return land.stationNumber || '—';
  };

  const regionName = id => id ? (regions.find(r => String(r.id) === String(id))?.name || '') : '';
  const landRegion = lid => {
    const l = lands.find(x => String(x.id) === String(lid));
    return l?.regionId ? regionName(l.regionId) : '';
  };

  // ✅ ملاحظة مهمة: الإضافات صارت تابعة للأرض (landId) وليست للقراءة/السنة. هون لسا
  // منحسب extraNet لكل صف (سطر قراءة) لأغراض العرض فقط (نفس قيمة إضافات الأرض تظهر
  // بجانب كل سنة لنفس الأرض — بالضبط متل ما طلب المستخدم). لكن أي إجمالي/مجموع كلي
  // (grandTotal وغيره) لازم يحسب إضافات كل أرض مرة وحدة بس — مو مرة لكل قراءة/سنة —
  // وإلا رح تتضاعف الأرقام لأي أرض إلها أكثر من قراءة (أكثر من سنة).
  const calcRow = r => {
    const vals = r.readings || [];
    const periods = vals.slice(1).map((v, i) => {
      const cups  = cupsPositive(vals, i);
      const price = getP(prices, r.year, r.landId, i+1);
      return { cups, price, amount: cups * price };
    });
    const totalCups  = periods.reduce((s,p) => s + p.cups, 0);
    const cupsAmount = periods.reduce((s,p) => s + p.amount, 0);
    const extraNet   = getExtrasNet(landExtrasByLand[String(r.landId)] || []); // ✅ رصيد إضافات هذه الأرض (معلوماتي لهذا الصف)
    const total      = cupsAmount + extraNet;
    return { periods, totalCups, cupsAmount, extraNet, total };
  };

  const years = [...new Set(readings.map(r => r.year))].sort((a,b) => b-a);

  // ✅ تدقيق البيانات: فحص كل القراءات عن شذوذ (فرق سالب / إعادة تصفير)
  const dataAnomalies = (() => {
    const negatives = []; // فرق سالب حقيقي — على الأغلب خطأ إدخال
    const resets     = []; // إعادة تصفير عداد (0 بعد قيمة أكبر) — معلومة، مو بالضرورة خطأ
    readings.forEach(r => {
      const vals = r.readings || [];
      vals.slice(1).forEach((_, i) => {
        const a = vals[i], b = vals[i+1];
        if (a == null || a === '' || b == null || b === '') return;
        const fa = parseFloat(a), fb = parseFloat(b);
        if (isNaN(fa) || isNaN(fb)) return;
        const row = {
          readingId: r.id, farmerId: r.farmerId, landId: r.landId, year: r.year,
          period: i+1, from: fa, to: fb, diff: fb - fa,
        };
        if (fb === 0 && fa > 0) resets.push(row);
        else if (fb < fa)       negatives.push(row);
      });
    });
    return { negatives, resets, total: negatives.length + resets.length };
  })();

  // ✅ قراءات لم تُؤخذ بعد (טרם נלקחה) — نفس منطق ReadingsTable بالضبط:
  // أي قيمة null أو '' داخل r.readings بغض النظر عن موقعها (أولى / ثانية / ثالثة...)
  const missingReadings = (() => {
    const rows = [];
    readings.forEach(r => {
      const vals = r.readings || [];
      const missingIndexes = [];
      vals.forEach((v, i) => {
        if (v == null || v === '') missingIndexes.push(i);
      });
      if (missingIndexes.length === 0) return;
      const lastKnown = [...vals].reverse().find(v => v != null && v !== '');
      rows.push({
        readingId: r.id,
        farmerId: r.farmerId,
        landId: r.landId,
        year: r.year,
        missingIndexes, // مصفوفة أرقام الفترات الناقصة (0-indexed)
        lastKnown,
      });
    });
    return rows;
  })();

  const auditTotal = dataAnomalies.total + missingReadings.length;

  // ✅ السنة الحالية + إجمالي أكواب أرض معينة لهذه السنة (لعمود "أكواب هذه السنة" بقسم تدقيق الاشتراك)
  const currentYear = new Date().getFullYear();
  const cupsThisYearForLand = (landId) => {
    const r = readings.find(x => String(x.landId) === String(landId) && x.year === currentYear);
    if (!r) return null;
    const vals = r.readings || [];
    let total = 0;
    vals.slice(1).forEach((_, i) => { total += cupsPositive(vals, i, r.meterChanges||[]); });
    return total;
  };

  // ✅ جمع كل أسماء الإضافات الفريدة — مباشرة من landExtras (تابعة للأرض الآن، لا داعي لتفريغ readings)
  const allExtraNotes = [...new Set(landExtras.map(e => e.note).filter(Boolean))].sort();

  const filtered = readings.filter(r => {
    if (filterYear   && r.year !== parseInt(filterYear)) return false;
    if (filterFarmer && String(r.farmerId) !== filterFarmer) return false;
    if (filterPaid === 'paid'   && !r.paid) return false;
    if (filterPaid === 'unpaid' &&  r.paid) return false;
    if (filterRegion) {
      const land = lands.find(l => String(l.id) === String(r.landId));
      if (!land) return false;
      if (land.regionId && String(land.regionId) !== filterRegion) {
        const reg = regions.find(r2 => String(r2.id) === filterRegion);
        const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
        if (!reg || reg.name?.toUpperCase() !== code) return false;
      } else if (!land.regionId) {
        const reg = regions.find(r2 => String(r2.id) === filterRegion);
        const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
        if (!reg || reg.name?.toUpperCase() !== code) return false;
      }
    }
    return true;
  });

  // ✅ إجمالي الإضافات لهذا الفلتر — أراضي filtered فقط، وكل أرض تُحسب مرة وحدة (بدون تكرار عبر السنوات)
  const filteredLandIds        = [...new Set(filtered.map(r => String(r.landId)))];
  const extrasForFilteredLands = filteredLandIds.flatMap(lid => landExtrasByLand[lid] || []);
  const filteredExtrasNet      = getExtrasNet(extrasForFilteredLands);

  // ✅ فلترة الإضافات غير المدفوعة — الآن مباشرة من landExtras المسطّحة (سجل واحد لكل إضافة، تابع للأرض فقط)
  const searchNote = extraNoteInput.trim() || filterExtraNote;
  const extrasRows = landExtras
    .map(e => {
      const amt  = parseFloat(e.amount)||0;
      const paid = parseFloat(e.paid)||0;
      const rem  = amt - paid;
      if (amt <= 0 || rem <= 0.009) return null; // مدفوعة بالكامل
      if (searchNote && !(e.note||'').toLowerCase().includes(searchNote.toLowerCase())) return null;
      const land = lands.find(l => String(l.id) === String(e.landId));
      return {
        extraId: e.id, landId: e.landId, farmerId: land?.farmerId || '',
        note: e.note || '', amount: amt, paid, rem, createdAt: e.createdAt,
      };
    })
    .filter(Boolean);

  const extrasTotal = extrasRows.reduce((s,row) => s + row.rem, 0);

  const grandCupsAmount = filtered.reduce((s,r) => s + calcRow(r).cupsAmount, 0);
  const grandCups       = filtered.reduce((s,r) => s + calcRow(r).totalCups, 0);
  const grandTotal      = grandCupsAmount + filteredExtrasNet; // ✅ إضافات كل أرض تُحسب مرة وحدة بس
  const paidCount       = filtered.filter(r => r.paid).length;

  // ✅ تدقيق اشتراك/إضافة محددة: من لم يُضف له الاشتراك إطلاقاً، أو أُضيف ولم يُدفع بالكامل
  // الآن الفحص على مستوى الأرض مباشرة (سطر واحد طبيعي لكل أرض، بدون حاجة لتجميع القراءات)
  const missingSubscription = (() => {
    if (!subName.trim()) return [];
    const nameNorm = subName.trim().toLowerCase();
    const hasSub = (landId) => (landExtrasByLand[String(landId)] || []).some(e =>
      (e.note||'').toLowerCase().trim() === nameNorm &&
      (parseFloat(e.amount)||0) > 0 &&
      (parseFloat(e.paid)||0) >= (parseFloat(e.amount)||0)
    );
    // ✅ كل أرض مرتبطة فعلياً بمزارع (farmerId) ولم تدفع هذا الاشتراك بعد
    return lands.filter(l => l.farmerId && !hasSub(l.id));
  })();

  // إضافة الاشتراك لكل الأراضي الناقصة
  const addSubToAll = async () => {
    if (!subName.trim() || !subAmount || missingSubscription.length === 0) return;
    if (!window.confirm(
      (ar
        ? `إضافة "${subName}" (₪${subAmount}) على ${missingSubscription.length} أرض؟`
        : `הוסף "${subName}" (₪${subAmount}) ל-${missingSubscription.length} קרקעות?`)
    )) return;
    setAddingAll(true); setAddedCount(null);
    let count = 0;
    for (const land of missingSubscription) {
      try {
        await adminAPI.createLandExtra({
          landId: land.id,
          note:   subName.trim(),
          amount: parseFloat(subAmount)||0,
          paid:   0,
        });
        count++;
      } catch(e) { console.error(e); }
    }
    setAddedCount(count);
    setAddingAll(false);
    load(); // إعادة تحميل
  };

  // ── Map Modal ──
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl  = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    return (
      <div onClick={() => setMapModal(null)}
        style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background:'#fff', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ padding:'14px 18px', background:'var(--primary-dark)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>📍</span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{name}</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <a href={earthUrl} target="_blank" rel="noopener noreferrer"
                style={{ color:'#a3e635', fontSize:12, fontWeight:700, textDecoration:'none', background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:8 }}>
                🗺️ Google Earth
              </a>
              <button onClick={() => setMapModal(null)}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          </div>
          <div style={{ position:'relative' }}>
            <iframe src={esriUrl} width="100%" height="360" style={{ border:0, display:'block' }}
              allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="map" />
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-100%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
              {(() => {
                const land = lands.find(l => l.stationNumber === name);
                const desc = land?.description;
                if (!desc) return null;
                const lines = desc.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);
                return (
                  <div style={{ background:'rgba(22,163,74,0.95)', color:'#fff', borderRadius:10, padding:'6px 12px', marginBottom:6, boxShadow:'0 3px 12px rgba(0,0,0,0.35)', border:'2px solid #fff', maxWidth:220, textAlign:'center', fontFamily:'Heebo,sans-serif', fontSize:13, fontWeight:700 }}>
                    {lines.join(' • ')}
                  </div>
                );
              })()}
              <svg width="28" height="36" viewBox="0 0 28 36">
                <ellipse cx="14" cy="34" rx="6" ry="2" fill="rgba(0,0,0,0.3)"/>
                <path d="M14 0 C6.3 0 0 6.3 0 14 C0 24.5 14 36 14 36 C14 36 28 24.5 28 14 C28 6.3 21.7 0 14 0Z" fill="#16a34a"/>
                <circle cx="14" cy="14" r="7" fill="#fff"/>
                <circle cx="14" cy="14" r="4" fill="#16a34a"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── طباعة ──
  const handlePrint = () => {
    const date = new Date().toLocaleDateString(ar?'ar-SA':'he-IL');
    const yearLabel = filterYear || (ar?'جميع السنوات':'כל השנים');
    const farmerLabel = filterFarmer ? (farmers.find(f=>f.id===filterFarmer)?.nameHeb||'—') : (ar?'جميع المزارعين':'כל החקלאים');
    const rows = filtered.map(r => {
      const { totalCups, extraNet, total } = calcRow(r);
      const land = lands.find(l => String(l.id) === String(r.landId));
      const isPaid = !!r.paid;
      return `<tr style="background:${isPaid?'#f0fdf4':'#fff5f5'}">
        <td>${farmerName(r.farmerId)}</td>
        <td>${landName(r.landId)}</td>
        <td style="text-align:center">${r.year}</td>
        <td style="text-align:center">${land?.stationNumber||r.stationNumber||'—'}</td>
        <td style="text-align:center">${totalCups.toLocaleString()}</td>
        <td style="text-align:center">${extraNet>0?'+₪'+Math.round(extraNet).toLocaleString():'—'}</td>
        <td style="text-align:center;font-weight:bold">₪${Math.round(total).toLocaleString()}</td>
        <td style="text-align:center;color:${isPaid?'#16a34a':'#dc2626'};font-weight:bold">${isPaid?'✓':'○'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
<title>${ar?'تقرير':'דוח'} — ${yearLabel}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;font-size:12px;direction:rtl;}
table{width:100%;border-collapse:collapse;}th,td{border:1px solid #d1d5db;padding:5px 8px;}
thead tr{background:#166534;color:white;}tfoot tr{background:#14532d;color:white;}
@page{size:landscape;margin:1cm;}</style></head><body>
<h1>🌿 ${ar?'الشلالة — تقرير':'אלשללאלה — דוח'}</h1>
<p>${ar?'تاريخ':'תאריך'}: ${date} | ${yearLabel} | ${farmerLabel}</p>
<table><thead><tr>
  <th>${ar?'المزارع':'חקלאי'}</th><th>${ar?'المنطقة':'אזור'}</th>
  <th>${ar?'السنة':'שנה'}</th><th>${ar?'المحطة':'עמדה'}</th>
  <th>${ar?'الكل':'כלל'}</th><th>${ar?'إضافات':'תוספות'}</th>
  <th>${ar?'الإجمالي':'סה"כ'}</th><th>${ar?'دفع':'תשלום'}</th>
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="4" style="font-weight:bold">${ar?'الإجمالي':'סה"כ'} (${filtered.length})</td>
  <td style="text-align:center;font-weight:bold">${grandCups.toLocaleString()}</td>
  <td></td>
  <td style="text-align:center;font-weight:bold">₪${Math.round(grandTotal).toLocaleString()}</td>
  <td style="text-align:center">${paidCount}/${filtered.length} ✓</td>
</tr></tfoot></table></body></html>`;

    const win = window.open('','_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── طباعة تقرير الإضافات — الآن من extrasRows مباشرة (سجل واحد لكل إضافة تابعة لأرض) ──
  const handlePrintExtras = () => {
    const date = new Date().toLocaleDateString(ar?'ar-SA':'he-IL');
    const rows = extrasRows.map(row => {
      const land = lands.find(l => String(l.id) === String(row.landId));
      const addedDate = row.createdAt ? new Date(row.createdAt).toLocaleDateString(ar?'ar-SA':'he-IL') : '—';
      return `<tr>
        <td>${farmerName(row.farmerId)}</td>
        <td style="text-align:center">${land?.stationNumber||'—'}</td>
        <td>${row.note||'—'}</td>
        <td style="text-align:center">${addedDate}</td>
        <td style="text-align:center;color:#16a34a;font-weight:bold">₪${row.amount.toLocaleString()}</td>
        <td style="text-align:center">₪${row.paid.toLocaleString()}</td>
        <td style="text-align:center;color:#dc2626;font-weight:bold">₪${row.rem.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
<title>${ar?'تقرير الإضافات':'דוח תוספות'}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;font-size:12px;direction:rtl;}
table{width:100%;border-collapse:collapse;}th,td{border:1px solid #d1d5db;padding:5px 8px;}
thead tr{background:#92400e;color:white;}tfoot tr{background:#78350f;color:white;}
@page{size:landscape;margin:1cm;}</style></head><body>
<h1>🌿 ${ar?'تقرير الإضافات غير المدفوعة':'דוח תוספות שלא שולמו'}</h1>
<p>${ar?'تاريخ':'תאריך'}: ${date}${searchNote?' | '+searchNote:''}</p>
<table><thead><tr>
  <th>${ar?'المزارع':'חקלאי'}</th><th>${ar?'المحطة':'עמדה'}</th>
  <th>${ar?'سبب الإضافة':'סיבת התוספת'}</th><th>${ar?'تاريخ الإضافة':'תאריך הוספה'}</th>
  <th>${ar?'المبلغ':'סכום'}</th><th>${ar?'المدفوع':'שולם'}</th>
  <th>${ar?'المتبقي':'נותר'}</th>
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="6" style="font-weight:bold">${ar?'إجمالي المتبقي':'סה"כ נותר'} (${extrasRows.length})</td>
  <td style="text-align:center;font-weight:bold">₪${Math.round(extrasTotal).toLocaleString()}</td>
</tr></tfoot></table></body></html>`;

    const win = window.open('','_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Excel للناطور ──
  const handleWatchmanExcel = () => {
    const year = filterYear || new Date().getFullYear();
    const landReadings = {};
    readings.filter(r => !filterYear || r.year === parseInt(filterYear)).forEach(r => {
      const key = String(r.landId);
      if (!landReadings[key] || r.year > landReadings[key].year) landReadings[key] = r;
    });
    const rows = Object.values(landReadings).map(r => {
      const vals    = r.readings || [];
      const farmer  = farmers.find(f => String(f.id) === String(r.farmerId));
      const land    = lands.find(l => String(l.id) === String(r.landId));
      return {
        'שם החקלאי': farmer?.nameHeb||farmer?.name||'—',
        'אזור':       landName(r.landId),
        'עמדה':       land?.stationNumber||r.stationNumber||'—',
        'טלפון':      farmer?.phone||'—',
        [`קריאה אחרונה (${r.year})`]: vals[vals.length-1]||0,
        'קריאה חדשה': '',
        'הערות':      '',
      };
    }).sort((a,b) => (a['עמדה']||'').localeCompare(b['עמדה']||'','he'));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:20},{wch:16},{wch:8},{wch:14},{wch:16},{wch:14},{wch:16}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `שנה ${year}`);
    XLSX.writeFile(wb, `alshallala-watchman-${year}.xlsx`);
  };

  // ✅ Excel لكل القراءات (قراءة أولى / قراءة ثانية / الفرق) — للتحقق اليدوي من صحة الحسابات
  const handleAuditExcel = () => {
    const rows = [];
    readings.forEach(r => {
      const vals   = r.readings || [];
      const farmer = farmers.find(f => String(f.id) === String(r.farmerId));
      const land   = lands.find(l => String(l.id) === String(r.landId));
      const stationNumber = land?.stationNumber || r.stationNumber || '';
      let running = vals[0];
      vals.slice(1).forEach((v, i) => {
        const cups  = cupsPositive(vals, i);
        const price = getP(prices, r.year, r.landId, i+1);
        rows.push({
          'המזמינה':        farmer?.nameHeb||farmer?.name||'—',
          'עמדה':           stationNumber,
          'שנה':            r.year,
          'תקופה':          i+1,
          'קריאה קודמת':    running,
          'קריאה נוכחית':   v,
          'הפרש (קוב)':      cups,
          'מחיר יחידה (₪)':  price ? Number(price.toFixed(2)) : 0,
          'סכום (₪)':        Math.round(cups*price),
        });
        running = v;
      });
    });

    // ✅ إضافات الأراضي — سطر واحد لكل إضافة (وليس لكل قراءة/سنة) عشان ما تتكرر نفس
    // القيمة عدة مرات بالإكسل ويصير الإجمالي المحسوب أسفل الورقة غلط
    landExtras.forEach(e => {
      const net = (parseFloat(e.amount)||0) - (parseFloat(e.paid)||0);
      if (!net) return;
      const land   = lands.find(l => String(l.id) === String(e.landId));
      const farmer = farmers.find(f => String(f.id) === String(land?.farmerId));
      rows.push({
        'המזמינה': farmer?.nameHeb||farmer?.name||'—',
        'עמדה': land?.stationNumber||'', 'שנה': '', 'תקופה': ar?'إضافات':'תוספות',
        'קריאה קודמת': '', 'קריאה נוכחית': '', 'הפרש (קוב)': '',
        'מחיר יחידה (₪)': '', 'סכום (₪)': Math.round(net),
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:20},{wch:8},{wch:8},{wch:10},{wch:14},{wch:14},{wch:12},{wch:14},{wch:12}];
    const totalRow = rows.length + 2;
    ws[`M1`] = { t:'s', v: ar ? '← إجمالي الأكواب المتوقع (يطابق التطبيق)' : '← סה"כ קובים צפוי (תואם לאפליקציה)' };
    ws[`N${totalRow}`] = { t:'n', f:`H${totalRow}` };
    ws[`O1`] = { t:'s', v: ar ? '← الإجمالي المالي الكلي المتوقع (بعد الضريبة + الإضافات)' : '← סה"כ כספי צפוי (אחרי מע"מ + תוספות)' };
    ws[`O${totalRow}`] = { t:'n', f:`K${totalRow}+L${totalRow}` };
    ws['!ref'] = `A1:O${totalRow}`; // ✅ تمديد النطاق يدوياً ليشمل خلايا الملاحظات خارج نطاق البيانات الأصلي

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تدقيق القراءات');
    XLSX.writeFile(wb, `alshallala-audit-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  if (loading) return <div style={{textAlign:'center',padding:60}}><div className="spinner"/></div>;

  return (
    <div>
      <MapModal />

      {/* ── التبويبات ── */}
      <div className="flex-between mb-16" style={{flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',gap:8}}>
          <button
            onClick={()=>setActiveTab('main')}
            style={{
              padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', border:'none',
              background: activeTab==='main' ? 'var(--primary)' : 'var(--surface-2)',
              color: activeTab==='main' ? '#fff' : 'var(--text-muted)',
            }}>
            📊 {ar?'التقارير':'דוחות'}
          </button>
          <button
            onClick={()=>setActiveTab('audit')}
            style={{
              padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', border:'none',
              background: activeTab==='audit' ? '#dc2626' : 'var(--surface-2)',
              color: activeTab==='audit' ? '#fff' : 'var(--text-muted)',
              position:'relative',
            }}>
            🧪 {ar?'تدقيق البيانات':'ביקורת נתונים'}
            {(auditTotal + allExtraNotes.length) > 0 && (
              <span style={{
                position:'absolute', top:-6, left:-6,
                background:'#dc2626', color:'#fff',
                borderRadius:'50%', width:20, height:20,
                fontSize:11, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center',
                border:'2px solid #fff',
              }}>{auditTotal + allExtraNotes.length}</span>
            )}
          </button>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!isViewer && activeTab==='main' && <>
            <button className="btn btn-outline" onClick={handleWatchmanExcel}>📋 {ar?'Excel للناطور':'Excel לשומר'}</button>
            <button className="btn btn-outline" onClick={handlePrint}>🖨️ {ar?'طباعة':'הדפסה'}</button>
          </>}
          {!isViewer && activeTab==='audit' && !subName.trim() && extrasRows.length > 0 && (
            <button className="btn btn-outline" onClick={handlePrintExtras}>🖨️ {ar?'طباعة الإضافات':'הדפסת תוספות'}</button>
          )}
          {!isViewer && activeTab==='audit' && (
            <button className="btn btn-primary" onClick={handleAuditExcel}>
              📥 {ar?'تحميل Excel (كل القراءات)':'הורד Excel (כל הקריאות)'}
            </button>
          )}
        </div>
      </div>

      {/* ══ تبويب التقارير الرئيسي ══ */}
      {activeTab === 'main' && (
        <>
          {/* ── الفلاتر ── */}
          <div className="card mb-16">
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10, alignItems:'end'}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label style={{fontSize:12}}>{ar?'المزارع':'חקלאי'}</label>
                <div style={{position:'relative'}}>
                  <input type="text" value={farmerSearch}
                    onChange={e=>{setFarmerSearch(e.target.value);setShowFarmerList(true);}}
                    onFocus={()=>setShowFarmerList(true)}
                    onBlur={()=>setTimeout(()=>setShowFarmerList(false),150)}
                    placeholder={filterFarmer
                      ? (farmers.find(f=>f.id===filterFarmer)?.nameHeb||'')
                      : (ar?'🔍 كل المزارعين...':'🔍 כל החקלאים...')}
                    style={{width:'100%', paddingLeft: filterFarmer?28:8}} />
                  {filterFarmer && (
                    <button onClick={()=>{setFilterFarmer('');setFarmerSearch('');}}
                      style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14}}>✕</button>
                  )}
                  {showFarmerList && (
                    <div style={{position:'absolute',top:'100%',right:0,zIndex:100,background:'#fff',border:'1.5px solid var(--border)',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',maxHeight:200,overflowY:'auto',minWidth:220,width:'100%'}}>
                      <div onMouseDown={()=>{setFilterFarmer('');setFarmerSearch('');setShowFarmerList(false);}}
                        style={{padding:'8px 12px',fontSize:13,color:'var(--text-muted)',cursor:'pointer',borderBottom:'1px solid var(--border)'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        {ar?'— الكل —':'— הכל —'}
                      </div>
                      {farmers.filter(f=>{const q=farmerSearch.toLowerCase();return !q||(f.nameHeb||f.name||'').toLowerCase().includes(q);})
                        .map(f=>(
                          <div key={f.id} onMouseDown={()=>{setFilterFarmer(f.id);setFarmerSearch('');setShowFarmerList(false);}}
                            style={{padding:'8px 12px',fontSize:13,cursor:'pointer',fontFamily:'Heebo,sans-serif',fontWeight:600,background:filterFarmer===f.id?'#f0fdf4':''}}
                            onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                            onMouseLeave={e=>e.currentTarget.style.background=filterFarmer===f.id?'#f0fdf4':''}>
                            {f.nameHeb||f.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group" style={{marginBottom:0}}>
                <label style={{fontSize:12}}>{ar?'المنطقة':'אזור'}</label>
                <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)}>
                  <option value="">{ar?'كل المناطق':'כל האזורים'}</option>
                  {regions.map(r=>(
                    <option key={r.id} value={r.id}>
                      {r.name}{r.nameHeb&&r.nameHeb!==r.name?` — ${r.nameHeb}`:''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{marginBottom:0}}>
                <label style={{fontSize:12}}>{ar?'السنة':'שנה'}</label>
                <select value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
                  <option value="">{ar?'كل السنوات':'כל השנים'}</option>
                  {years.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="form-group" style={{marginBottom:0}}>
                <label style={{fontSize:12}}>{ar?'حالة الدفع':'סטטוס'}</label>
                <select value={filterPaid} onChange={e=>setFilterPaid(e.target.value)}>
                  <option value="">{ar?'الكل':'הכל'}</option>
                  <option value="paid">{ar?'مدفوع ✓':'שולם ✓'}</option>
                  <option value="unpaid">{ar?'غير مدفوع ○':'לא שולם ○'}</option>
                </select>
              </div>

              <button className="btn btn-outline btn-sm" style={{alignSelf:'end'}}
                onClick={()=>{setFilterYear('');setFilterFarmer('');setFilterRegion('');setFilterPaid('');setFarmerSearch('');}}>
                {ar?'إعادة ضبط':'אפס'}
              </button>
            </div>
          </div>

          {/* ── ملخص ── */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:16}}>
            {[
              { label:ar?'عدد القراءات':'קריאות', value:filtered.length, icon:'📏' },
              { label:ar?'مدفوع':'שולם', value:`${paidCount}/${filtered.length}`, icon:'✅' },
              { label:ar?'إجمالي الأكواب':'קובים', value:grandCups.toLocaleString(), icon:'🪣' },
              { label:ar?'الإجمالي الكلي':'סה"כ', value:`₪${Math.round(grandTotal).toLocaleString()}`, icon:'💰', accent:true },
            ].map((s,i)=>(
              <div key={i} className={`stat-card ${s.accent?'accent':''}`} style={{padding:'12px 16px'}}>
                <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
                <div style={{fontWeight:900,fontSize:'1.2rem',color:s.accent?'#fff':'var(--primary)'}}>{s.value}</div>
                <div style={{fontSize:11,opacity:0.75,color:s.accent?'#fff':'var(--text-muted)'}}>{s.label}</div>
              </div>
            ))}
          </div>

          <ReadingsTable
            readings={filtered}
            setReadings={() => {}}
            farmerName={farmerName}
            landName={landName}
            landRegion={landRegion}
            onEdit={() => {}}
            onDelete={() => {}}
            lang={lang}
            prices={prices}
            isViewer={true}
            lands={lands}
            regions={regions}
            landExtrasByLand={landExtrasByLand}
          />
        </>
      )}

      {/* ══ تبويب تدقيق البيانات ══ */}
      {activeTab === 'audit' && (
        <div>
          <div className="card mb-16" style={{ borderRight:'4px solid #dc2626' }}>
            <h3 className="mb-8" style={{ color:'#dc2626' }}>
              🧪 {ar?'تدقيق البيانات':'ביקורת נתונים'}
            </h3>
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>
              {ar
                ? 'فحص تلقائي لكل القراءات المسجّلة في النظام (بدون فلاتر) للكشف عن أي فرق سالب بين قراءتين متتاليتين، إعادة تصفير عداد، أو أرقام لم تؤخذ بعد.'
                : 'סריקה אוטומטית של כל הקריאות במערכת (ללא סינון) לאיתור הפרש שלילי בין שתי קריאות רצופות, איפוס מונה, או ספרות שטרם נלקחו.'}
            </p>
          </div>

          {/* ══ قسم: تدقيق الإضافات غير المدفوعة — كل الإضافات، أو إضافة محددة (بما فيها "لم تُضَف إطلاقاً") ══ */}
          <div className="card mb-16" style={{borderRight:'4px solid #1d4ed8'}}>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:13,fontWeight:700,color:'#1d4ed8',display:'block',marginBottom:8}}>
                🔍 {ar?'تدقيق الإضافات غير المدفوعة':'ביקורת תוספות שלא שולמו'}
              </label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,alignItems:'end'}}>
                <div className="form-group" style={{marginBottom:0,position:'relative'}}>
                  <label style={{fontSize:12}}>{ar?'اسم إضافة محددة (اختياري)':'שם תוספת מסוימת (אופציונלי)'}</label>
                  <input value={subName} onChange={e=>setSubName(e.target.value)}
                    list="sub-suggestions"
                    placeholder={ar?'اتركه فارغاً لرؤية كل الإضافات...':'השאר ריק לצפייה בכל התוספות...'}
                    style={{width:'100%'}}/>
                  <datalist id="sub-suggestions">
                    {allExtraNotes.map(n=><option key={n} value={n}/>)}
                  </datalist>
                </div>
                {subName.trim() && (
                  <div className="form-group" style={{marginBottom:0}}>
                    <label style={{fontSize:12}}>₪ {ar?'المبلغ (لإضافتها لمن ينقصه)':'סכום (להוספה למי שחסר)'}</label>
                    <input type="number" value={subAmount} onChange={e=>setSubAmount(e.target.value)}
                      placeholder="0" min="0" style={{fontWeight:700,textAlign:'center'}}/>
                  </div>
                )}
              </div>
            </div>
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 14px',fontSize:12,color:'#1d4ed8'}}>
              {subName.trim()
                ? (ar?`📌 يظهر من لم يُضف له "${subName}" إطلاقاً، أو أُضيف ولم يُدفع بالكامل بعد.`:`📌 מוצגים מי שלא נוסף להם "${subName}" כלל, או שנוסף וטרם שולם במלואו.`)
                : (ar
                    ? '📋 تُعرض هنا كل الإضافات غير المدفوعة (أو غير المسدَّدة بالكامل) في النظام. اكتب اسم إضافة أعلاه لتضييق النتائج على إضافة محددة فقط (بما في ذلك من لم تُضَف له إطلاقاً).'
                    : '📋 מוצגות כל התוספות שלא שולמו (או לא שולמו במלואן) במערכת. הכנס שם תוספת למעלה כדי לצמצם לתוספת מסוימת בלבד (כולל מי שלא נוספה לו כלל).')}
            </div>
          </div>

          {!subName.trim() ? (
            /* ── عرض كل الإضافات غير المدفوعة بالنظام (بدون تحديد اسم) ── */
            extrasRows.length === 0 ? (
              <div className="card mb-16" style={{textAlign:'center',padding:32,color:'#16a34a'}}>
                <div style={{fontSize:40,marginBottom:8}}>✅</div>
                <div style={{fontWeight:700,fontSize:15}}>
                  {ar?'جميع الإضافات مدفوعة بالكامل!':'כל התוספות שולמו במלואן!'}
                </div>
              </div>
            ) : (
              <div className="card mb-16" style={{padding:0}}>
                <div className="tbl-wrap">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#1d4ed8'}}>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#fff',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#bfdbfe',fontWeight:800}}>{ar?'سبب الإضافة':'סיבת התוספת'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>{ar?'تاريخ الإضافة':'תאריך הוספה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>{ar?'المبلغ':'סכום'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>{ar?'المدفوع':'שולם'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fca5a5',fontWeight:800}}>{ar?'المتبقي':'נותר'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrasRows
                      .sort((a,b)=>farmerName(a.farmerId).localeCompare(farmerName(b.farmerId),'ar'))
                      .map((row,i) => {
                        const land = lands.find(l=>String(l.id)===String(row.landId));
                        const addedDate = row.createdAt ? new Date(row.createdAt).toLocaleDateString(ar?'ar-SA':'he-IL') : '—';
                        return (
                          <tr key={row.extraId||i} style={{borderBottom:'1px solid #e5e7eb',background:i%2===0?'#fff':'#eff6ff'}}>
                            <td style={{padding:'10px 14px',fontFamily:'Heebo,sans-serif',fontWeight:700}}>{farmerName(row.farmerId)}</td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              {land?.stationNumber
                                ? <code style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:5,fontWeight:900,color:'#1d4ed8'}}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{padding:'10px 14px',color:'#92400e',fontWeight:600}}>{row.note||'—'}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',color:'var(--text-muted)'}}>{addedDate}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',fontWeight:700}}>₪{row.amount.toLocaleString()}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',color:'#16a34a',fontWeight:700}}>₪{row.paid.toLocaleString()}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',fontWeight:900,color:'#dc2626'}}>₪{row.rem.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'#1e3a8a'}}>
                      <td colSpan={6} style={{padding:'10px 14px',color:'#fff',fontWeight:800}}>
                        {ar?'إجمالي المتبقي':'סה"כ נותר'} ({extrasRows.length})
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'center',color:'#fde68a',fontWeight:900,fontSize:16}}>
                        ₪{Math.round(extrasTotal).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            )
          ) : missingSubscription.length === 0 ? (
            <div className="card mb-16" style={{textAlign:'center',padding:32,color:'#16a34a'}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontWeight:700,fontSize:15}}>
                {ar?'جميع الأراضي النشطة دفعت هذا الاشتراك بالكامل!':'כל הקרקעות הפעילות שילמו מנוי זה במלואו!'}
              </div>
            </div>
          ) : (
            <div className="mb-16">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:16}}>
                <div className="stat-card" style={{padding:'12px 16px',borderRight:'3px solid #dc2626'}}>
                  <div style={{fontSize:20,marginBottom:4}}>⚠️</div>
                  <div style={{fontWeight:900,fontSize:'1.4rem',color:'#dc2626'}}>{missingSubscription.length}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'أرض بدون اشتراك':'קרקעות ללא מנוי'}</div>
                </div>
                {subAmount && (
                  <div className="stat-card accent" style={{padding:'12px 16px'}}>
                    <div style={{fontSize:20,marginBottom:4}}>💰</div>
                    <div style={{fontWeight:900,fontSize:'1.2rem',color:'#fff'}}>
                      ₪{(missingSubscription.length * parseFloat(subAmount)).toLocaleString()}
                    </div>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.75)'}}>{ar?'إجمالي المطلوب':'סה"כ נדרש'}</div>
                  </div>
                )}
              </div>

              {addedCount !== null && (
                <div style={{background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:24}}>✅</span>
                  <div style={{fontWeight:700}}>
                    {ar?`تم إضافة "${subName}" على ${addedCount} أرض!`:`"${subName}" נוסף ל-${addedCount} קרקעות!`}
                  </div>
                </div>
              )}

              {!isViewer && subAmount && (
                <div style={{marginBottom:16,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                  <button
                    onClick={addSubToAll}
                    disabled={addingAll}
                    style={{padding:'10px 24px',borderRadius:10,background:addingAll?'#d1d5db':'#1d4ed8',color:'#fff',border:'none',cursor:addingAll?'wait':'pointer',fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:8}}>
                    {addingAll
                      ? `⏳ ${ar?'جاري الإضافة...':'מוסיף...'}`
                      : `➕ ${ar?`إضافة "${subName}" (₪${subAmount}) على ${missingSubscription.length} أرض`:`הוסף "${subName}" (₪${subAmount}) ל-${missingSubscription.length} קרקעות`}`}
                  </button>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>
                    ⚠️ {ar?'سيُضاف الاشتراك على كل من لم يدفعه دفعة واحدة':'יתווסף המנוי לכל מי שלא שילמו בפעולה אחת'}
                  </span>
                </div>
              )}

              <div className="card" style={{padding:0}}>
                <div className="tbl-wrap">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#1d4ed8'}}>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#fff',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>
                        {ar?`أكواب ${currentYear}`:`קוב ${currentYear}`}
                      </th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fca5a5',fontWeight:800}}>{ar?'الحالة':'סטטוס'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingSubscription
                      .sort((a,b)=>farmerName(a.farmerId).localeCompare(farmerName(b.farmerId),'ar'))
                      .map((l,i) => {
                        const cupsYear = cupsThisYearForLand(l.id);
                        return (
                          <tr key={l.id||i} style={{borderBottom:'1px solid #e5e7eb',background:i%2===0?'#fff':'#eff6ff'}}>
                            <td style={{padding:'10px 14px',fontFamily:'Heebo,sans-serif',fontWeight:700}}>
                              {farmerName(l.farmerId)}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              {l.stationNumber
                                ? <code style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:5,fontWeight:900,color:'#1d4ed8'}}>{l.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center',fontWeight:700}}>
                              {cupsYear != null ? Math.round(cupsYear).toLocaleString() : '—'}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              <span style={{background:'#fff1f2',color:'#dc2626',fontWeight:700,padding:'2px 10px',borderRadius:6,fontSize:12}}>
                                ❌ {ar?'لم يدفع':'לא שולם'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ── فروق سالبة / إعادة تصفير / قراءات ناقصة (بدون أي تغيير عن السابق) ── */}
          {auditTotal === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:32, color:'#16a34a' }}>
              <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
              <div style={{ fontWeight:700, fontSize:15 }}>
                {ar ? 'لا يوجد أي شذوذ! كل القراءات سليمة' : 'אין חריגות! כל הקריאות תקינות'}
              </div>
            </div>
          ) : (
            <>
              {/* ── قراءات لم تُؤخذ بعد (טרם נלקחה) ── */}
              {missingReadings.length > 0 && (
                <div className="card mb-16" style={{ padding:0 }}>
                  <div style={{ background:'#0369a1', color:'#fff', padding:'10px 16px', fontWeight:800, fontSize:14 }}>
                    ⏳ {ar?`عدادات فيها أرقام لم تُؤخذ بعد (${missingReadings.length})`:`מונים עם ספרות שטרם נלקחו (${missingReadings.length})`}
                  </div>
                  <p style={{ padding:'8px 16px', fontSize:12, color:'var(--text-muted)', margin:0, background:'#f0f9ff' }}>
                    {ar
                      ? 'قراءات ناقصة داخل تسلسل القراءة (مو بالضرورة القراءة الأخيرة) — تحتاج متابعة مع الناطور/المزارع لأخذها.'
                      : 'קריאות חסרות בתוך רצף הקריאה (לא בהכרח האחרונה) — דורש מעקב עם השומר/החקלאי לקבלתן.'}
                  </p>
                  <div className="tbl-wrap">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#f0f9ff' }}>
                        <th style={{ padding:'8px 12px', textAlign:'right' }}>{ar?'المزارع':'חקלאי'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'المحطة':'עמדה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'السنة':'שנה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'right' }}>{ar?'الأرقام الناقصة':'ספרות חסרות'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'آخر قراءة معروفة':'קריאה אחרונה ידועה'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingReadings
                        .sort((a,b) => farmerName(a.farmerId).localeCompare(farmerName(b.farmerId),'ar'))
                        .map((row, i) => {
                          const land = lands.find(l => String(l.id) === String(row.landId));
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background:i%2===0?'#fff':'#f0f9ff' }}>
                              <td style={{ padding:'8px 12px', fontFamily:'Heebo,sans-serif', fontWeight:700 }}>{farmerName(row.farmerId)}</td>
                              <td style={{ padding:'8px 12px', textAlign:'center' }}>
                                {land?.stationNumber
                                  ? <code style={{ background:'#f0f9ff', border:'1px solid #7dd3fc', padding:'2px 8px', borderRadius:5, fontWeight:900 }}>{land.stationNumber}</code>
                                  : '—'}
                              </td>
                              <td style={{ padding:'8px 12px', textAlign:'center', color:'var(--text-muted)' }}>{row.year}</td>
                              <td style={{ padding:'8px 12px' }}>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:5, justifyContent:'flex-end' }}>
                                  {row.missingIndexes.map(idx => (
                                    <span key={idx} style={{
                                      background:'#fef3c7', border:'1px solid #fde047', color:'#78350f',
                                      borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700,
                                    }}>
                                      ⏳ {ar?`ق${idx+1}`:`ק${idx+1}`}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>
                                {row.lastKnown != null ? parseFloat(row.lastKnown).toLocaleString() : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* ── فروق سالبة (خطأ إدخال محتمل) ── */}
              {dataAnomalies.negatives.length > 0 && (
                <div className="card mb-16" style={{ padding:0 }}>
                  <div style={{ background:'#dc2626', color:'#fff', padding:'10px 16px', fontWeight:800, fontSize:14 }}>
                    ⚠️ {ar?`فروق سالبة — خطأ إدخال محتمل (${dataAnomalies.negatives.length})`:`הפרשים שליליים — ייתכן טעות הזנה (${dataAnomalies.negatives.length})`}
                  </div>
                  <div className="tbl-wrap">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#fff1f2' }}>
                        <th style={{ padding:'8px 12px', textAlign:'right' }}>{ar?'المزارع':'חקלאי'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'المحطة':'עמדה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'السنة':'שנה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'الفترة':'תקופה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'من':'מ'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'إلى':'עד'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'الفرق':'הפרש'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataAnomalies.negatives.map((row, i) => {
                        const land = lands.find(l => String(l.id) === String(row.landId));
                        return (
                          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background:i%2===0?'#fff':'#fff5f5' }}>
                            <td style={{ padding:'8px 12px', fontFamily:'Heebo,sans-serif', fontWeight:700 }}>{farmerName(row.farmerId)}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>
                              {land?.stationNumber
                                ? <code style={{ background:'#fff1f2', border:'1px solid #fca5a5', padding:'2px 8px', borderRadius:5, fontWeight:900 }}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{ padding:'8px 12px', textAlign:'center', color:'var(--text-muted)' }}>{row.year}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>{ar?`${row.period}←${row.period+1}`:`${row.period}←${row.period+1}`}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{row.from.toLocaleString()}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{row.to.toLocaleString()}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:900, color:'#dc2626' }}>{row.diff.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* ── إعادة تصفير عداد (معلومة فقط) ── */}
              {dataAnomalies.resets.length > 0 && (
                <div className="card" style={{ padding:0 }}>
                  <div style={{ background:'#d97706', color:'#fff', padding:'10px 16px', fontWeight:800, fontSize:14 }}>
                    ℹ️ {ar?`إعادة تصفير عداد — معلومة فقط (${dataAnomalies.resets.length})`:`איפוס מונה — מידע בלבד (${dataAnomalies.resets.length})`}
                  </div>
                  <p style={{ padding:'8px 16px', fontSize:12, color:'var(--text-muted)', margin:0, background:'#fffbeb' }}>
                    {ar
                      ? 'القراءة الحالية = 0 والسابقة أكبر من صفر — هذا طبيعي عند تركيب عداد جديد، لكن يُستثنى تلقائياً من الإجماليات.'
                      : 'הקריאה הנוכחית = 0 והקודמת גדולה מאפס — נורמלי בהתקנת מונה חדש, אך מוחרג אוטומטית מהסיכומים.'}
                  </p>
                  <div className="tbl-wrap">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#fffbeb' }}>
                        <th style={{ padding:'8px 12px', textAlign:'right' }}>{ar?'المزارع':'חקלאי'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'المحطة':'עמדה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'السنة':'שנה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'الفترة':'תקופה'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'من':'מ'}</th>
                        <th style={{ padding:'8px 12px', textAlign:'center' }}>{ar?'إلى':'עד'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataAnomalies.resets.map((row, i) => {
                        const land = lands.find(l => String(l.id) === String(row.landId));
                        return (
                          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background:i%2===0?'#fff':'#fffbeb' }}>
                            <td style={{ padding:'8px 12px', fontFamily:'Heebo,sans-serif', fontWeight:700 }}>{farmerName(row.farmerId)}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>
                              {land?.stationNumber
                                ? <code style={{ background:'#fffbeb', border:'1px solid #fde047', padding:'2px 8px', borderRadius:5, fontWeight:900 }}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{ padding:'8px 12px', textAlign:'center', color:'var(--text-muted)' }}>{row.year}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>{ar?`${row.period}←${row.period+1}`:`${row.period}←${row.period+1}`}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{row.from.toLocaleString()}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:900, color:'#d97706' }}>{row.to.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}