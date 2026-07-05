import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import ReadingsTable from './ReadingsTable';

import { getPrice as getP, getBasePrice as getBaseP } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsDiff, cupsPositive } from '../../utils/cups'; // ✅ فرق أكواب موحّد
import { getExtrasNet } from '../../utils/extras'; // ✅ إضافات موحّدة (تدعم extras[] + الحقول القديمة)

export function AdminReports({ adminRole='admin' }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const isViewer = adminRole === 'viewer';

  const [data, setData]       = useState({ farmers:[], lands:[], readings:[], prices:{} });
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
  const [activeTab,       setActiveTab]       = useState('main');   // 'main' | 'extras' | 'missing'
  const [filterExtraNote, setFilterExtraNote] = useState('');
  const [extraNoteInput,  setExtraNoteInput]  = useState('');

  // ✅ تبويب "اشتراكات مفقودة"
  const [subName,     setSubName]     = useState('');        // اسم الاشتراك
  const [subAmount,   setSubAmount]   = useState('');        // المبلغ
  const [subType,     setSubType]     = useState('forever'); // 'forever' | 'yearly'
  const [subYear,     setSubYear]     = useState(new Date().getFullYear());
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

  const { farmers, lands, readings, prices } = data;

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

  const calcRow = r => {
    const vals = r.readings || [];
    const periods = vals.slice(1).map((v, i) => {
      const cups  = cupsPositive(vals, i);
      const price = getP(prices, r.year, r.landId, i+1);
      return { cups, price, amount: cups * price };
    });
    const totalCups  = periods.reduce((s,p) => s + p.cups, 0);
    const cupsAmount = periods.reduce((s,p) => s + p.amount, 0);
    const extraNet   = getExtrasNet(r); // ✅ يشمل extras[] الجديدة + الحقول القديمة معاً
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

  // ✅ جمع كل extraNotes الفريدة الموجودة في النظام
  // ✅ جمع كل أسماء الإضافات من extras[] الجديدة + الحقول القديمة
  const allExtraNotes = [...new Set([
    ...readings.flatMap(r => (r.extras||[]).map(e=>e.note).filter(Boolean)),
    ...readings.filter(r => r.extraNote && parseFloat(r.extra)>0).map(r=>r.extraNote),
  ])].sort();

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

  // ✅ فلترة الإضافات غير المدفوعة
  const searchNote = extraNoteInput.trim() || filterExtraNote;
  // ✅ بناء قائمة موحدة من extras[] + الحقول القديمة
  const extrasRows = readings.flatMap(r => {
    const extras = r.extras || [];
    const rows = [];
    // extras الجديدة
    extras.forEach(e => {
      const amt  = parseFloat(e.amount)||0;
      const paid = parseFloat(e.paid)||0;
      if (amt <= 0) return;
      if (paid >= amt) return; // مدفوعة كاملاً
      if (searchNote && !(e.note||'').toLowerCase().includes(searchNote.toLowerCase())) return;
      rows.push({ readingId:r.id, farmerId:r.farmerId, landId:r.landId, year:r.year,
                  note:e.note||'', amount:amt, paid, rem:amt-paid });
    });
    // الحقل القديم (للتوافق)
    if (extras.length === 0) {
      const extra     = parseFloat(r.extra)||0;
      const extraPaid = parseFloat(r.extraPaid)||0;
      if (extra > 0 && extraPaid < extra) {
        if (!searchNote || (r.extraNote||'').toLowerCase().includes(searchNote.toLowerCase())) {
          rows.push({ readingId:r.id, farmerId:r.farmerId, landId:r.landId, year:r.year,
                      note:r.extraNote||'', amount:extra, paid:extraPaid, rem:extra-extraPaid });
        }
      }
    }
    return rows;
  });

  const extrasFiltered = readings.filter(r => {
    const extras = r.extras||[];
    if (extras.length > 0) {
      return extras.some(e => {
        const amt=parseFloat(e.amount)||0, paid=parseFloat(e.paid)||0;
        if (amt<=0||paid>=amt) return false;
        return !searchNote || (e.note||'').toLowerCase().includes(searchNote.toLowerCase());
      });
    }
    const extra=parseFloat(r.extra)||0, extraPaid=parseFloat(r.extraPaid)||0;
    if (extra<=0||extraPaid>=extra) return false;
    return !searchNote || (r.extraNote||'').toLowerCase().includes(searchNote.toLowerCase());
  });

  const extrasGrouped = extrasFiltered.reduce((acc, r) => {
    const fid = String(r.farmerId);
    if (!acc[fid]) acc[fid] = { farmerId: fid, rows: [] };
    acc[fid].rows.push(r);
    return acc;
  }, {});

  const extrasTotal = extrasRows.reduce((s,row) => s + row.rem, 0);

  const grandTotal = filtered.reduce((s,r) => s + calcRow(r).total, 0);
  const grandCups  = filtered.reduce((s,r) => s + calcRow(r).totalCups, 0);
  const paidCount  = filtered.filter(r => r.paid).length;

  // ── Map Modal ──
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    return (
      <div onClick={() => setMapModal(null)}
        style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background:'#fff', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ padding:'14px 18px', background:'#14532d', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
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
                🌍 Google Earth
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

  // ── طباعة تقرير الإضافات ──
  const handlePrintExtras = () => {
    const date = new Date().toLocaleDateString(ar?'ar-SA':'he-IL');
    const rows = extrasFiltered.map(r => {
      const extra     = parseFloat(r.extra) || 0;
      const extraPaid = parseFloat(r.extraPaid) || 0;
      const rem       = extra - extraPaid;
      const land      = lands.find(l => String(l.id) === String(r.landId));
      return `<tr>
        <td>${farmerName(r.farmerId)}</td>
        <td style="text-align:center">${land?.stationNumber||'—'}</td>
        <td>${r.extraNote||'—'}</td>
        <td style="text-align:center">${r.year}</td>
        <td style="text-align:center;color:#16a34a;font-weight:bold">₪${extra.toLocaleString()}</td>
        <td style="text-align:center">₪${extraPaid.toLocaleString()}</td>
        <td style="text-align:center;color:#dc2626;font-weight:bold">₪${rem.toLocaleString()}</td>
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
  <th>${ar?'سبب الإضافة':'סיבת התוספת'}</th><th>${ar?'السنة':'שנה'}</th>
  <th>${ar?'المبلغ':'סכום'}</th><th>${ar?'المدفوع':'שולם'}</th>
  <th>${ar?'المتبقي':'נותר'}</th>
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="6" style="font-weight:bold">${ar?'إجمالي المتبقي':'סה"כ נותר'} (${extrasFiltered.length})</td>
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
      const extraNet = getExtrasNet(r); // ✅ صافي الإضافات (extras[] + الحقول القديمة) — مرة واحدة فقط لكل قراءة
      let firstRowOfReading = true;
      vals.slice(1).forEach((_, i) => {
        const from = vals[i], to = vals[i+1];
        if (from == null || from === '' || to == null || to === '') return;
        const fa = parseFloat(from), fb = parseFloat(to);
        if (isNaN(fa) || isNaN(fb)) return;
        const price = getP(prices, r.year, r.landId, i+1);
        rows.push({
          'المزارع':                    farmer?.nameHeb || farmer?.name || '—',
          'المحطة':                     land?.stationNumber || r.stationNumber || '—',
          'السنة':                       r.year,
          'الفترة':                      `${i+1}←${i+2}`,
          'القراءة الأولى':              fa,
          'القراءة الثانية':             fb,
          'الفرق (أكواب) - خام':         fb - fa,
          'الفرق المعتمد للمجموع':       fb - fa, // ✅ سيُستبدل بمعادلة MAX(0,...) بالأسفل
          'السعر (قبل الضريبة)':         Math.round(getBaseP(prices, r.year, r.landId, i+1) * 100) / 100,
          'المبلغ قبل الضريبة':          Math.round((fb - fa > 0 ? (fb - fa) : 0) * getBaseP(prices, r.year, r.landId, i+1) * 100) / 100,
          'المبلغ بعد الضريبة':          Math.round((fb - fa > 0 ? (fb - fa) : 0) * price * 100) / 100,
          // ✅ الإضافات تُكتب مرة واحدة فقط في أول فترة لكل قراءة (لتفادي تكرارها بكل مجموع)
          'الإضافات (صافي)':             firstRowOfReading ? Math.round(extraNet * 100) / 100 : 0,
        });
        firstRowOfReading = false;
      });
      // لو القراءة عندها إضافة لكن ما عندها أي فترة صالحة (قراءة واحدة فقط)، أضف صفاً خاصاً لها حتى ما تضيع من المجموع
      if (firstRowOfReading && extraNet) {
        rows.push({
          'المزارع': farmer?.nameHeb || farmer?.name || '—',
          'المحطة':  land?.stationNumber || r.stationNumber || '—',
          'السنة':    r.year,
          'الفترة':   '—',
          'القراءة الأولى': '—', 'القراءة الثانية': '—',
          'الفرق (أكواب) - خام': 0, 'الفرق المعتمد للمجموع': 0,
          'السعر (قبل الضريبة)': 0, 'المبلغ قبل الضريبة': 0, 'المبلغ بعد الضريبة': 0,
          'الإضافات (صافي)': Math.round(extraNet * 100) / 100,
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // A            B        C     D       E              F               G                   H                        I                     J                    K                    L
    // المزارع      المحطة   السنة الفترة  القراءة الأولى القراءة الثانية الفرق(خام)          الفرق المعتمد للمجموع    السعر(قبل الضريبة)   المبلغ قبل الضريبة  المبلغ بعد الضريبة  الإضافات(صافي)
    ws['!cols'] = [{wch:20},{wch:10},{wch:8},{wch:10},{wch:14},{wch:14},{wch:14},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16}];

    // ✅ عمود H: معادلة MAX(0,...) حقيقية — نفس منطق cupsPositive المستخدم في كل حسابات التطبيق بالضبط
    for (let idx = 0; idx < rows.length; idx++) {
      const excelRow = idx + 2;
      ws[`H${excelRow}`] = { t:'n', f:`MAX(0,G${excelRow})` };
    }

    // ✅ صف إجمالي بمعادلة SUM حقيقية (يعيد حسابها Excel نفسه)
    const totalRow = rows.length + 2; // +1 للعنوان +1 لأن Excel 1-indexed
    XLSX.utils.sheet_add_aoa(ws, [['الإجمالي']], { origin: `A${totalRow}` });
    ['H','J','K','L'].forEach(col => {
      ws[`${col}${totalRow}`] = { t:'n', f:`SUM(${col}2:${col}${totalRow-1})` };
    });
    // ✅ خلية توضيحية: الإجمالي الكلي المتوقع (يطابق "الإجمالي الكلي" في التطبيق)
    ws[`N1`] = { t:'s', v: ar ? '← إجمالي الأكواب المتوقع (يطابق التطبيق)' : '← סה"כ קובים צפוי (תואם לאפליקציה)' };
    ws[`N${totalRow}`] = { t:'n', f:`H${totalRow}` };
    ws[`O1`] = { t:'s', v: ar ? '← الإجمالي المالي الكلي المتوقع (بعد الضريبة + الإضافات)' : '← סה"כ כספי צפוי (אחרי מע"מ + תוספות)' };
    ws[`O${totalRow}`] = { t:'n', f:`K${totalRow}+L${totalRow}` };
    ws['!ref'] = `A1:O${totalRow}`; // ✅ تمديد النطاق يدوياً ليشمل خلايا الملاحظات خارج نطاق البيانات الأصلي

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تدقيق القراءات');
    XLSX.writeFile(wb, `alshallala-audit-${new Date().toISOString().slice(0,10)}.xlsx`);
  };


  const missingSubscription = (() => {
    if (!subName.trim()) return [];
    const nameNorm = subName.trim().toLowerCase();

    // من دفع: قراءة عليها الإضافة (مكتملة الدفع أو جزئية — يعني أُضيفت)
    const hasSub = (r) => {
      const exs = r.extras || [];
      if (exs.length > 0) return exs.some(e => e.note?.toLowerCase().trim() === nameNorm);
      return (r.extraNote || '').toLowerCase().trim() === nameNorm && (parseFloat(r.extra)||0) > 0;
    };

    // للأبد: يكفي أي قراءة عليها الاشتراك
    // لفترة: يجب أن تكون قراءة السنة المحددة عليها الاشتراك
    const paidFarmerLands = new Set(); // farmerId_landId
    const targetReadings  = subType === 'yearly'
      ? readings.filter(r => r.year === parseInt(subYear))
      : readings;

    if (subType === 'forever') {
      readings.forEach(r => {
        if (hasSub(r)) paidFarmerLands.add(`${r.farmerId}_${r.landId}`);
      });
    } else {
      targetReadings.forEach(r => {
        if (hasSub(r)) paidFarmerLands.add(`${r.farmerId}_${r.landId}`);
      });
    }

    // العدادات النشطة (لها قراءات) ولم تدفع
    return targetReadings.filter(r => !paidFarmerLands.has(`${r.farmerId}_${r.landId}`));
  })();

  // إضافة الاشتراك لكل المفقودين
  const addSubToAll = async () => {
    if (!subName.trim() || !subAmount || missingSubscription.length === 0) return;
    if (!window.confirm(
      (ar ? `إضافة "${subName}" (₪${subAmount}) على ${missingSubscription.length} قراءة؟`
           : `הוסף "${subName}" (₪${subAmount}) ל-${missingSubscription.length} קריאות?`)
    )) return;
    setAddingAll(true); setAddedCount(null);
    let count = 0;
    for (const r of missingSubscription) {
      try {
        const existing = readings.find(x => x.id === r.id);
        if (!existing) continue;
        const newExtras = [
          ...(existing.extras || []),
          { note: subName.trim(), amount: parseFloat(subAmount)||0, paid: 0 },
        ];
        await adminAPI.updateReading(r.id, {
          farmerId:  r.farmerId, landId: r.landId, year: r.year,
          readings:  r.readings, note: r.note||'',
          extras:    newExtras,
          extra:     r.extra||0, extraPaid: r.extraPaid||0, extraNote: r.extraNote||'',
        });
        count++;
      } catch(e) { console.error(e); }
    }
    setAddedCount(count);
    setAddingAll(false);
    load(); // إعادة تحميل
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
            onClick={()=>setActiveTab('extras')}
            style={{
              padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', border:'none',
              background: activeTab==='extras' ? '#92400e' : 'var(--surface-2)',
              color: activeTab==='extras' ? '#fff' : 'var(--text-muted)',
              position:'relative',
            }}>
            ➕ {ar?'إضافات غير مدفوعة':'תוספות שלא שולמו'}
            {allExtraNotes.length > 0 && (
              <span style={{
                position:'absolute', top:-6, left:-6,
                background:'#dc2626', color:'#fff',
                borderRadius:'50%', width:20, height:20,
                fontSize:11, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>{allExtraNotes.length}</span>
            )}
          </button>
          <button
            onClick={()=>setActiveTab('missing')}
            style={{
              padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', border:'none',
              background: activeTab==='missing' ? '#1d4ed8' : 'var(--surface-2)',
              color: activeTab==='missing' ? '#fff' : 'var(--text-muted)',
            }}>
            🔍 {ar?'عدادات بدون اشتراك':'מונים ללא מנוי'}
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
            {dataAnomalies.total > 0 && (
              <span style={{
                position:'absolute', top:-6, left:-6,
                background:'#dc2626', color:'#fff',
                borderRadius:'50%', width:20, height:20,
                fontSize:11, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center',
                border:'2px solid #fff',
              }}>{dataAnomalies.total}</span>
            )}
          </button>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!isViewer && activeTab==='main' && <>
            <button className="btn btn-outline" onClick={handleWatchmanExcel}>📋 {ar?'Excel للناطور':'Excel לשומר'}</button>
            <button className="btn btn-outline" onClick={handlePrint}>🖨️ {ar?'طباعة':'הדפסה'}</button>
          </>}
          {!isViewer && activeTab==='extras' && extrasFiltered.length > 0 && (
            <button className="btn btn-outline" onClick={handlePrintExtras}>🖨️ {ar?'طباعة':'הדפסה'}</button>
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
          />
        </>
      )}

      {/* ══ تبويب الإضافات غير المدفوعة ══ */}
      {activeTab === 'extras' && (
        <div>
          {/* ── فلتر الإضافات ── */}
          <div className="card mb-16" style={{borderRight:'4px solid #92400e'}}>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'#92400e',display:'block',marginBottom:8}}>
                ➕ {ar?'فلترة حسب سبب الإضافة':'סינון לפי סיבת תוספת'}
              </label>

              {/* الإضافات الموجودة كأزرار سريعة */}
              {allExtraNotes.length > 0 && (
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>
                  <button
                    onClick={()=>{setFilterExtraNote('');setExtraNoteInput('');}}
                    style={{
                      padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
                      border:`2px solid ${!filterExtraNote&&!extraNoteInput?'#92400e':'#d1d5db'}`,
                      background:!filterExtraNote&&!extraNoteInput?'#92400e':'var(--surface-2)',
                      color:!filterExtraNote&&!extraNoteInput?'#fff':'var(--text-muted)',
                    }}>
                    {ar?'الكل':'הכל'} ({extrasFiltered.length})
                  </button>
                  {allExtraNotes.map(note => {
                    const count = readings.filter(r =>
                      r.extraNote?.trim() === note &&
                      parseFloat(r.extra) > 0 &&
                      parseFloat(r.extraPaid||0) < parseFloat(r.extra)
                    ).length;
                    const isActive = filterExtraNote === note;
                    return (
                      <button key={note}
                        onClick={()=>{setFilterExtraNote(isActive?'':note);setExtraNoteInput('');}}
                        style={{
                          padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
                          border:`2px solid ${isActive?'#92400e':'#d1d5db'}`,
                          background:isActive?'#92400e':'#fff7ed',
                          color:isActive?'#fff':'#92400e',
                          display:'flex', alignItems:'center', gap:6,
                        }}>
                        {note}
                        <span style={{
                          background:isActive?'rgba(255,255,255,0.3)':'#fed7aa',
                          borderRadius:10, padding:'0 6px', fontSize:11,
                        }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* بحث حر */}
              <input
                value={extraNoteInput}
                onChange={e=>{setExtraNoteInput(e.target.value);setFilterExtraNote('');}}
                placeholder={ar?'🔍 بحث في سبب الإضافة...':'🔍 חיפוש בסיבת התוספת...'}
                style={{width:'100%',maxWidth:360}}
              />
            </div>

            {allExtraNotes.length === 0 && (
              <div style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
                {ar?'لا توجد إضافات مسجلة في النظام':'אין תוספות רשומות במערכת'}
              </div>
            )}
          </div>

          {/* ── ملخص الإضافات ── */}
          {extrasFiltered.length > 0 && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:16}}>
                <div className="stat-card" style={{padding:'12px 16px',borderRight:'3px solid #92400e'}}>
                  <div style={{fontSize:20,marginBottom:4}}>👥</div>
                  <div style={{fontWeight:900,fontSize:'1.2rem',color:'#92400e'}}>{Object.keys(extrasGrouped).length}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'مزارع مديون':'חקלאים חייבים'}</div>
                </div>
                <div className="stat-card" style={{padding:'12px 16px',borderRight:'3px solid #92400e'}}>
                  <div style={{fontSize:20,marginBottom:4}}>📋</div>
                  <div style={{fontWeight:900,fontSize:'1.2rem',color:'#92400e'}}>{extrasFiltered.length}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'قراءة':'קריאות'}</div>
                </div>
                <div className="stat-card accent" style={{padding:'12px 16px',background:'#92400e'}}>
                  <div style={{fontSize:20,marginBottom:4}}>💰</div>
                  <div style={{fontWeight:900,fontSize:'1.2rem',color:'#fff'}}>₪{Math.round(extrasTotal).toLocaleString()}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.75)'}}>{ar?'إجمالي المتبقي':'סה"כ נותר'}</div>
                </div>
              </div>

              {/* ── جدول الإضافات ── */}
              <div className="card" style={{padding:0}}>
                <div className="tbl-wrap">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#92400e'}}>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#fff',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#fde68a',fontWeight:800}}>{ar?'سبب الإضافة':'סיבת התוספת'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'السنة':'שנה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#a3e635',fontWeight:800}}>{ar?'المبلغ':'סכום'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'المدفوع':'שולם'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fca5a5',fontWeight:800}}>{ar?'المتبقي':'נותר'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrasRows
                      .sort((a,b) => farmerName(a.farmerId).localeCompare(farmerName(b.farmerId),'ar'))
                      .map((row, i) => {
                        const land = lands.find(l => String(l.id) === String(row.landId));
                        return (
                          <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:i%2===0?'#fff':'#fff7ed'}}>
                            <td style={{padding:'10px 14px',fontFamily:'Heebo,sans-serif',fontWeight:700}}>
                              {farmerName(row.farmerId)}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              {land?.stationNumber
                                ? <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'2px 8px',borderRadius:5,fontWeight:900}}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              {row.note
                                ? <span style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#92400e',padding:'2px 10px',borderRadius:6,fontSize:12,fontWeight:700}}>{row.note}</span>
                                : <span style={{color:'var(--text-muted)',fontSize:12}}>—</span>}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center',color:'var(--text-muted)'}}>{row.year}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',fontWeight:700,color:'#16a34a'}}>
                              ₪{row.amount.toLocaleString()}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center',color:'var(--text-muted)'}}>
                              {row.paid > 0 ? `₪${row.paid.toLocaleString()}` : '—'}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              <span style={{background:'#fff1f2',color:'#dc2626',fontWeight:900,padding:'3px 12px',borderRadius:6}}>
                                ₪{row.rem.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'#92400e'}}>
                      <td colSpan={6} style={{padding:'10px 14px',color:'#fff',fontWeight:700}}>
                        {ar?'الإجمالي':'סה"כ'} ({extrasFiltered.length})
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'center',color:'#fca5a5',fontWeight:900,fontSize:16}}>
                        ₪{Math.round(extrasTotal).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            </>
          )}

          {extrasFiltered.length === 0 && allExtraNotes.length > 0 && (
            <div className="card" style={{textAlign:'center',padding:32,color:'#16a34a'}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontWeight:700,fontSize:15}}>
                {ar?'جميع الإضافات مدفوعة!':'כל התוספות שולמו!'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب اشتراكات مفقودة ══ */}
      {activeTab === 'missing' && (
        <div>
          {/* ── إعدادات الاشتراك ── */}
          <div className="card mb-16" style={{borderRight:'4px solid #1d4ed8'}}>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:13,fontWeight:700,color:'#1d4ed8',display:'block',marginBottom:8}}>
                🔍 {ar?'البحث عن عدادات بدون اشتراك معين':'חיפוש מונים ללא מנוי מסוים'}
              </label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,alignItems:'end'}}>

                {/* اسم الاشتراك مع autocomplete */}
                <div className="form-group" style={{marginBottom:0,position:'relative'}}>
                  <label style={{fontSize:12}}>{ar?'اسم الاشتراك':'שם המנוי'} *</label>
                  <input value={subName} onChange={e=>setSubName(e.target.value)}
                    list="sub-suggestions"
                    placeholder={ar?'مثال: اشتراك خط جديد...':'לדוג׳: מנוי קו חדש...'}
                    style={{width:'100%'}}/>
                  <datalist id="sub-suggestions">
                    {allExtraNotes.map(n=><option key={n} value={n}/>)}
                  </datalist>
                </div>

                {/* المبلغ */}
                <div className="form-group" style={{marginBottom:0}}>
                  <label style={{fontSize:12}}>₪ {ar?'المبلغ':'סכום'}</label>
                  <input type="number" value={subAmount} onChange={e=>setSubAmount(e.target.value)}
                    placeholder="0" min="0" style={{fontWeight:700,textAlign:'center'}}/>
                </div>

                {/* نوع الاشتراك */}
                <div className="form-group" style={{marginBottom:0}}>
                  <label style={{fontSize:12}}>{ar?'نوع الاشتراك':'סוג מנוי'}</label>
                  <select value={subType} onChange={e=>setSubType(e.target.value)}>
                    <option value="forever">{ar?'مدفوع مرة واحدة (للأبد)':'תשלום חד פעמי (לצמיתות)'}</option>
                    <option value="yearly">{ar?'سنوي (كل سنة)':'שנתי'}</option>
                  </select>
                </div>

                {/* السنة — فقط للسنوي */}
                {subType === 'yearly' && (
                  <div className="form-group" style={{marginBottom:0}}>
                    <label style={{fontSize:12}}>{ar?'السنة':'שנה'}</label>
                    <select value={subYear} onChange={e=>setSubYear(e.target.value)}>
                      {years.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* شرح المنطق */}
            <div style={{background:subType==='forever'?'#eff6ff':'#f0fdf4',border:`1px solid ${subType==='forever'?'#bfdbfe':'#bbf7d0'}`,borderRadius:8,padding:'8px 14px',fontSize:12,color:subType==='forever'?'#1d4ed8':'#15803d'}}>
              {subType==='forever'
                ? (ar?'📌 من دفع هذا الاشتراك مرة واحدة في أي سنة = معفى. يظهر فقط من لم يدفعه أبداً ولديه قراءات.':'📌 מי ששילם מנוי זה פעם אחת בכל שנה = פטור. יוצגו רק מי שמעולם לא שילמו ויש להם קריאות.')
                : (ar?`📅 يظهر من لديه قراءات في ${subYear} ولم يدفع الاشتراك في ${subYear}.`:`📅 יוצגו מי שיש להם קריאות ב-${subYear} ולא שילמו מנוי ב-${subYear}.`)}
            </div>
          </div>

          {/* ── نتائج ── */}
          {!subName.trim() ? (
            <div className="card" style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
              <div style={{fontSize:32,marginBottom:8}}>🔍</div>
              <div style={{fontSize:14}}>{ar?'اكتب اسم الاشتراك للبحث':'הכנס שם מנוי לחיפוש'}</div>
            </div>
          ) : missingSubscription.length === 0 ? (
            <div className="card" style={{textAlign:'center',padding:32,color:'#16a34a'}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontWeight:700,fontSize:15}}>
                {ar?'جميع العدادات النشطة دفعت هذا الاشتراك!':'כל המונים הפעילים שילמו מנוי זה!'}
              </div>
            </div>
          ) : (
            <div>
              {/* ملخص */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:16}}>
                <div className="stat-card" style={{padding:'12px 16px',borderRight:'3px solid #dc2626'}}>
                  <div style={{fontSize:20,marginBottom:4}}>⚠️</div>
                  <div style={{fontWeight:900,fontSize:'1.4rem',color:'#dc2626'}}>{missingSubscription.length}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'قراءة بدون اشتراك':'קריאות ללא מנוי'}</div>
                </div>
                <div className="stat-card" style={{padding:'12px 16px',borderRight:'3px solid #1d4ed8'}}>
                  <div style={{fontSize:20,marginBottom:4}}>👥</div>
                  <div style={{fontWeight:900,fontSize:'1.4rem',color:'#1d4ed8'}}>
                    {new Set(missingSubscription.map(r=>r.farmerId)).size}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'مزارع':'חקלאים'}</div>
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

              {/* نتيجة الإضافة */}
              {addedCount !== null && (
                <div style={{background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:24}}>✅</span>
                  <div style={{fontWeight:700}}>
                    {ar?`تم إضافة "${subName}" على ${addedCount} قراءة!`:`"${subName}" נוסף ל-${addedCount} קריאות!`}
                  </div>
                </div>
              )}

              {/* زر الإضافة الجماعية */}
              {!isViewer && subAmount && (
                <div style={{marginBottom:16,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                  <button
                    onClick={addSubToAll}
                    disabled={addingAll}
                    style={{padding:'10px 24px',borderRadius:10,background:addingAll?'#d1d5db':'#1d4ed8',color:'#fff',border:'none',cursor:addingAll?'wait':'pointer',fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:8}}>
                    {addingAll
                      ? `⏳ ${ar?'جاري الإضافة...':'מוסיף...'}`
                      : `➕ ${ar?`إضافة "${subName}" (₪${subAmount}) على ${missingSubscription.length} قراءة`:`הוסף "${subName}" (₪${subAmount}) ל-${missingSubscription.length} קריאות`}`}
                  </button>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>
                    ⚠️ {ar?'سيُضاف الاشتراك على كل من لم يدفعه دفعة واحدة':'יתווסף המנוי לכל מי שלא שילמו בפעולה אחת'}
                  </span>
                </div>
              )}

              {/* جدول المفقودين */}
              <div className="card" style={{padding:0}}>
                <div className="tbl-wrap">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#1d4ed8'}}>
                      <th style={{padding:'10px 14px',textAlign:'right',color:'#fff',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fff',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>{ar?'السنة':'שנה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#bfdbfe',fontWeight:800}}>{ar?'آخر قراءة':'קריאה אחרונה'}</th>
                      <th style={{padding:'10px 14px',textAlign:'center',color:'#fca5a5',fontWeight:800}}>{ar?'الحالة':'סטטוס'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingSubscription
                      .sort((a,b)=>farmerName(a.farmerId).localeCompare(farmerName(b.farmerId),'ar'))
                      .map((r,i) => {
                        const land = lands.find(l=>String(l.id)===String(r.landId));
                        const lastVal = r.readings ? r.readings.filter(v=>v!=null&&v!=='').pop() : null;
                        return (
                          <tr key={r.id||i} style={{borderBottom:'1px solid #e5e7eb',background:i%2===0?'#fff':'#eff6ff'}}>
                            <td style={{padding:'10px 14px',fontFamily:'Heebo,sans-serif',fontWeight:700}}>
                              {farmerName(r.farmerId)}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center'}}>
                              {land?.stationNumber
                                ? <code style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:5,fontWeight:900,color:'#1d4ed8'}}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{padding:'10px 14px',textAlign:'center',color:'var(--text-muted)'}}>{r.year}</td>
                            <td style={{padding:'10px 14px',textAlign:'center',fontWeight:700}}>
                              {lastVal != null ? lastVal.toLocaleString() : '—'}
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
        </div>
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
                ? 'فحص تلقائي لكل القراءات المسجّلة في النظام (بدون فلاتر) للكشف عن أي فرق سالب بين قراءتين متتاليتين — عادة يعني خطأ إدخال (رقم أُدخل أصغر من السابق بالغلط). هذه هي القراءات المستثناة من كل الإجماليات في النظام.'
                : 'סריקה אוטומטית של כל הקריאות במערכת (ללא סינון) לאיתור הפרש שלילי בין שתי קריאות רצופות — לרוב טעות הזנה. אלו הקריאות המוחרגות מכל הסיכומים במערכת.'}
            </p>
          </div>

          {dataAnomalies.total === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:32, color:'#16a34a' }}>
              <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
              <div style={{ fontWeight:700, fontSize:15 }}>
                {ar ? 'لا يوجد أي شذوذ! كل القراءات سليمة' : 'אין חריגות! כל הקריאות תקינות'}
              </div>
            </div>
          ) : (
            <>
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
                                ? <code style={{ background:'#fffbeb', border:'1px solid #fde68a', padding:'2px 8px', borderRadius:5, fontWeight:900 }}>{land.stationNumber}</code>
                                : '—'}
                            </td>
                            <td style={{ padding:'8px 12px', textAlign:'center', color:'var(--text-muted)' }}>{row.year}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>{row.period}←{row.period+1}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{row.from.toLocaleString()}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700, color:'#d97706' }}>{row.to.toLocaleString()}</td>
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