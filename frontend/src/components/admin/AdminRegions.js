import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

const dmsToDecimal = (deg, min, sec, dir) => {
  let dd = parseFloat(deg) + parseFloat(min)/60 + parseFloat(sec)/3600;
  if (/[SW]/i.test(dir)) dd = -dd;
  return parseFloat(dd.toFixed(6));
};

const parseGoogleCoords = (raw) => {
  if (!raw || raw.trim().length < 3) return null;
  const s = raw.trim();
  const decMatch = s.match(/^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (decMatch) return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
  const dmsP1 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\u2032]\s*(\d{1,2}(?:\.\d+)?)["\u2033]?\s*([NS])/i;
  const dmsP2 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\u2032]\s*(\d{1,2}(?:\.\d+)?)["\u2033]?\s*([EW])/i;
  const latM = s.match(dmsP1);
  const lngM = s.match(dmsP2);
  if (latM && lngM) return {
    lat: dmsToDecimal(latM[1], latM[2], latM[3], latM[4]),
    lng: dmsToDecimal(lngM[1], lngM[2], lngM[3], lngM[4]),
  };
  return null;
};

const EMPTY_FARMER = { firstName:'', lastName:'', idNumber:'', phone:'', notes:'' };
const EMPTY_LAND   = { regionId:'', stationNumber:'', gpsRaw:'', stationLat:'', stationLng:'', description:'' };
const safeFloat = v => { const f = parseFloat(v); return (!isNaN(f) && v !== '' && v !== null) ? f : null; };

export default function AdminFarmers({ adminRole='admin' }) {
  const { lang }  = useLang();
  const ar        = lang === 'ar';
  const isViewer  = adminRole === 'viewer';

  const [farmers,  setFarmers]  = useState([]);
  const [regions,  setRegions]  = useState([]);
  const [allLands, setAllLands] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [readings, setReadings] = useState([]);
  const [prices,   setPrices]   = useState({});
  const [showForm,  setShowForm]  = useState(false);
  const [edit,      setEdit]      = useState(null);
  const [form,      setForm]      = useState(EMPTY_FARMER);
  const [newCode,   setNewCode]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [revealCode, setRevealCode] = useState(null);
  const [mapModal, setMapModal] = useState(null);
  const [expandedFarmer, setExpandedFarmer] = useState(null);
  const [farmerLands,    setFarmerLands]    = useState([]);
  const [loadingLands,   setLoadingLands]   = useState(false);
  const [landForm,       setLandForm]       = useState(null);
  const [editLand,       setEditLand]       = useState(null);
  const [landFormData,   setLandFormData]   = useState(EMPTY_LAND);
  const [savingLand,     setSavingLand]     = useState(false);
  const [landError,      setLandError]      = useState('');
  const [manualMode,     setManualMode]     = useState(false);
  const [pendingLands,   setPendingLands]   = useState([]);
  const [savingBatch,    setSavingBatch]    = useState(false);
  const [askLandFor,     setAskLandFor]     = useState(null); // { id, name } للمزارع الجديد

  // ── Excel Export/Import ──
  const [excelModal,     setExcelModal]     = useState(false);
  const [excelYear,      setExcelYear]      = useState(new Date().getFullYear());
  const [excelPhase,     setExcelPhase]     = useState(1);
  const [excelLoading,   setExcelLoading]   = useState(false);
  const [importPreview,  setImportPreview]  = useState(null);
  const [applyingImport, setApplyingImport] = useState(false);
  const importFileRef = React.useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rg, rd, pr, ld] = await Promise.all([
        adminAPI.getFarmers(), adminAPI.getRegions(),
        adminAPI.getReadings(), adminAPI.getPrices(), adminAPI.getLands(),
      ]);
      setFarmers(d.farmers || []);
      setRegions(rg.regions || []);
      setReadings(rd.readings || []);
      setPrices(pr || {});
      setAllLands(ld.lands || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getPrice = (year, landId, idx) => {
    if (!prices) return 0;
    const lp = prices.landPrices?.[String(landId)];
    if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
    if (lp?.default) return parseFloat(lp.default) || 0;
    const yp = prices.yearPrices?.[String(year)];
    if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
    if (yp?.default) return parseFloat(yp.default) || 0;
    return parseFloat(prices?.globalPrice) || 0;
  };

  const calcUnpaid = farmerId => readings
    .filter(r => String(r.farmerId).trim() === String(farmerId).trim() && !r.paid)
    .reduce((total, r) => {
      const vals = r.readings || [];
      const cups = vals.slice(1).reduce((s,_,i) => { const c = vals[i+1]-vals[i]; return s+(c>0?c*getPrice(r.year,r.landId,i+1):0); }, 0);
      return total + cups + (parseFloat(r.extra)||0) - (parseFloat(r.extraPaid)||0);
    }, 0);

  const openAdd  = () => { setEdit(null); setForm(EMPTY_FARMER); setNewCode(null); setError(''); setShowForm(true); };
  const openEdit = f  => { setEdit(f); setForm({ firstName:f.firstName||'', lastName:f.lastName||'', idNumber:f.idNumber||'', phone:f.phone||'', notes:f.notes||'' }); setNewCode(null); setError(''); setShowForm(true); };

  const submitFarmer = async e => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setError(ar?'الاسم والاسم العائلة مطلوبان':'שם פרטי ושם משפחה חובה'); return; }
    // ✅ إذا رقم الهوية فارغ → يولَّد رقم مؤقت TMP تلقائياً، لا يمكنه تسجيل الدخول حتى يُحدَّث
    const idToUse = form.idNumber.trim() || `TMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    setSaving(true); setError('');
    try {
      if (edit) {
        await adminAPI.updateFarmer(edit.id, { firstName:form.firstName.trim(), lastName:form.lastName.trim(), idNumber:idToUse, phone:form.phone, notes:form.notes });
        setShowForm(false);
      } else {
        const res = await adminAPI.createFarmer({ firstName:form.firstName.trim(), lastName:form.lastName.trim(), idNumber:idToUse, phone:form.phone, notes:form.notes });
        const newFarmerName = `${form.firstName.trim()} ${form.lastName.trim()}`;
        setShowForm(false); setNewCode(res.code || null);
        if (res.id) setAskLandFor({ id: res.id, name: newFarmerName });
      }
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const delFarmer = async (id, name) => {
    if (!window.confirm(`${ar?'حذف':'מחיקה'} "${name}"?`)) return;
    await adminAPI.deleteFarmer(id); load();
  };

  const handleRevealCode = async farmerId => {
    if (revealCode?.id === farmerId) { setRevealCode(null); return; }
    try {
      const res = await adminAPI.getFarmerCode(farmerId);
      setRevealCode({ id: farmerId, code: res.code });
      setTimeout(() => setRevealCode(null), 10000);
    } catch(e) { alert(ar?'خطأ في جلب الكود':'שגיאה'); }
  };

  const loadFarmerLands = async farmerId => {
    setLoadingLands(true);
    try { const d = await adminAPI.getLandsByFarmer(farmerId); setFarmerLands(d.lands || []); }
    catch(e) { setFarmerLands([]); }
    finally { setLoadingLands(false); }
  };

  const toggleFarmerExpand = async farmerId => {
    if (expandedFarmer === farmerId) { setExpandedFarmer(null); setFarmerLands([]); setLandForm(null); setPendingLands([]); return; }
    setExpandedFarmer(farmerId); setLandForm(null); setPendingLands([]);
    await loadFarmerLands(farmerId);
  };

  const openAddLand = farmerId => { setEditLand(null); setLandFormData({...EMPTY_LAND, farmerId}); setLandError(''); setManualMode(false); setLandForm('add'); };

  const openEditLand = land => {
    setEditLand(land);
    setLandFormData({ regionId:land.regionId||'', stationNumber:land.stationNumber||'', gpsRaw:(land.stationLat&&land.stationLng)?`${land.stationLat}, ${land.stationLng}`:'', stationLat:land.stationLat||'', stationLng:land.stationLng||'', description:land.description||'' });
    setLandError(''); setManualMode(false); setLandForm('edit');
  };

  const handleGpsChange = val => {
    setLandFormData(prev => { const result = parseGoogleCoords(val); return {...prev, gpsRaw:val, stationLat:result?.lat||'', stationLng:result?.lng||''}; });
  };

  // ✅ تعديل وصف محطة في قائمة الانتظار
  const updatePendingDesc = (idx, desc) => {
    setPendingLands(prev => prev.map((p, i) => i === idx ? {...p, description: desc} : p));
  };

  const submitLand = async e => {
    e.preventDefault();
    if (!landFormData.stationNumber.trim()) { setLandError(ar?'رقم المحطة مطلوب':'מספר תחנה חובה'); return; }
    setSavingLand(true); setLandError('');
    try {
      const payload = { farmerId:expandedFarmer, regionId:landFormData.regionId||null, name:landFormData.stationNumber.trim(), nameHeb:landFormData.stationNumber.trim(), stationNumber:landFormData.stationNumber.trim(), description:landFormData.description||'', stationLat:safeFloat(landFormData.stationLat), stationLng:safeFloat(landFormData.stationLng) };
      await adminAPI.updateLand(editLand.id, payload);
      setLandForm(null);
      await loadFarmerLands(expandedFarmer);
    } catch(e) { setLandError(e.message); }
    finally { setSavingLand(false); }
  };

  const saveAllPending = async () => {
    if (!pendingLands.length) return;
    setSavingBatch(true);
    for (const p of pendingLands) {
      try {
        await adminAPI.createLand({ farmerId:expandedFarmer, regionId:p.regionId||null, name:p.stationNumber, nameHeb:p.stationNumber, stationNumber:p.stationNumber, description:p.description||'', stationLat:safeFloat(p.stationLat), stationLng:safeFloat(p.stationLng) });
      } catch {}
    }
    setPendingLands([]); setLandForm(null); setSavingBatch(false);
    await loadFarmerLands(expandedFarmer);
  };

  const delLand = async (id, name) => {
    if (!window.confirm(`${ar?'حذف الأرض':'מחיקת קרקע'} "${name}"?`)) return;
    await adminAPI.deleteLand(id); await loadFarmerLands(expandedFarmer);
  };

  const exportExcel = async () => {
    try {
      const rows = await Promise.all(farmers.map(async f => {
        let code = '****';
        try { const r = await adminAPI.getFarmerCode(f.id); code = r.code||'****'; } catch{}
        return { 'שם החקלאי':f.nameHeb||f.name||'', 'מספר ת"ז':f.idNumber||'', 'קוד כניסה':code, 'טלפון':f.phone||'', 'יתרה לתשלום (₪)':calcUnpaid(f.id)>0?Math.round(calcUnpaid(f.id)*100)/100:0 };
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{wch:22},{wch:14},{wch:12},{wch:14},{wch:18}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'חקלאים');
      XLSX.writeFile(wb, `alshallala-farmers-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e) { alert(ar?'خطأ في التصدير':'שגיאה בייצוא'); }
  };

  // ════════════════════════════════════════
  //  تصدير Excel للناطور — مرتب حسب المحطة
  // ════════════════════════════════════════
  const exportReadingsExcel = async () => {
    setExcelLoading(true);
    try {
      const ExcelJS    = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const year         = parseInt(excelYear);
      const phase        = parseInt(excelPhase);
      const prevPhaseIdx = phase - 1;

      const [rdRes, ldRes] = await Promise.all([adminAPI.getReadings(), adminAPI.getLands()]);
      const allReadings    = rdRes.readings  || [];
      const allLandsData   = ldRes.lands     || [];

      const parseStation = s => {
        const m = (s||'').match(/^([A-Za-z]+)(\d+)$/);
        return m ? [m[1].toUpperCase(), parseInt(m[2])] : [s||'', 0];
      };
      const sortedLands = [...allLandsData]
        .filter(l => l.stationNumber && l.farmerId)
        .sort((a,b) => {
          const [aL,aN] = parseStation(a.stationNumber);
          const [bL,bN] = parseStation(b.stationNumber);
          return aL<bL?-1:aL>bL?1:aN-bN;
        });

      if (!sortedLands.length) {
        alert(ar?'لا توجد أراضٍ مسجلة!':'אין קרקעות רשומות!');
        setExcelLoading(false); return;
      }

      // تجميع حسب المحطة
      const stationGroups = {};
      for (const land of sortedLands) {
        if (!stationGroups[land.stationNumber]) stationGroups[land.stationNumber] = [];
        stationGroups[land.stationNumber].push(land);
      }
      const stationKeys = Object.keys(stationGroups);

      const titlePrev = prevPhaseIdx === 0
        ? (ar?'القراءة الأولى':'קריאה ראשונה')
        : (ar?`القراءة م${prevPhaseIdx}`:`קריאה ת${prevPhaseIdx}`);
      const titleNew  = ar?`قراءة جديدة — م${phase}`:`קריאה חדשה — ת${phase}`;
      const pageTitle = ar
        ? `أرقام العدادات  |  ${year}  |  مرحلة ${phase}`
        : `קריאות מונים  |  ${year}  |  תקופה ${phase}`;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'الشلالة';

      const ws = wb.addWorksheet(
        ar?`عدادات ${year} م${phase}`:`מונים ${year} ת${phase}`,
        { views:[{rightToLeft:true, state:'frozen', xSplit:0, ySplit:2}],
          pageSetup:{paperSize:9, orientation:'portrait', fitToPage:true, fitToWidth:1} }
      );

      // ── الألوان: أبيض + أخضر فقط ──
      const GREEN       = '2d6a2d';  // أخضر غامق للعناوين
      const GREEN_LIGHT = 'e8f5e9';  // أخضر فاتح جداً للكتل
      const GREEN_MID   = 'a5d6a7';  // أخضر متوسط لفاصل المحطة
      const WHITE       = 'FFFFFF';
      const TEXT        = '1a1a1a';  // نص قريب من الأسود
      const TEXT_LIGHT  = '555555';  // رمادي للهاتف
      const BORDER_C    = 'c8e6c9';  // حدود خضراء فاتحة

      // ── عرض الأعمدة ──
      ws.columns = [
        {key:'landId',   width:0.1},
        {key:'farmerId', width:0.1},
        {key:'readId',   width:0.1},
        {key:'readIdx',  width:0.1},
        {key:'station',  width:9  },
        {key:'name',     width:26 },
        {key:'phone',    width:15 },
        {key:'prev',     width:18 },
        {key:'newVal',   width:20 },
      ];

      const thinBorder = (color) => ({
        top:    {style:'thin', color:{argb:'FF'+color}},
        bottom: {style:'thin', color:{argb:'FF'+color}},
        left:   {style:'thin', color:{argb:'FF'+color}},
        right:  {style:'thin', color:{argb:'FF'+color}},
      });

      // ══ صف العنوان الرئيسي ══
      ws.addRow(['','','','', pageTitle,'','','','']);
      const r0 = ws.lastRow;
      r0.height = 34;
      ws.mergeCells(r0.number,5, r0.number,9);
      // ✅ إعادة تعيين القيمة بعد الدمج
      const titleMerged = ws.getCell(r0.number, 5);
      titleMerged.value     = pageTitle;
      titleMerged.font      = {name:'Arial', bold:true, size:16, color:{argb:'FF'+WHITE}};
      titleMerged.fill      = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+GREEN}};
      titleMerged.alignment = {horizontal:'center', vertical:'middle', readingOrder:2};
      for (let c=1;c<=4;c++) {
        const cell = r0.getCell(c);
        cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+GREEN}};
        cell.font = {size:1, color:{argb:'FF'+GREEN}};
      }
      for (let c=6;c<=9;c++) {
        const cell = r0.getCell(c);
        cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+GREEN}};
        cell.font = {size:1, color:{argb:'FF'+GREEN}};
      }

      // ══ صف رؤوس الأعمدة ══
      ws.addRow(['','','','',
        ar?'المحطة':'עמדה',
        ar?'اسم المزارع':'שם החקלאי',
        ar?'الهاتف':'טלפון',
        titlePrev,
        titleNew,
      ]);
      const r1 = ws.lastRow;
      r1.height = 24;
      for (let c=1;c<=4;c++) {
        r1.getCell(c).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+WHITE}};
        r1.getCell(c).font = {size:1,color:{argb:'FF'+WHITE}};
      }
      [5,6,7,8,9].forEach(c => {
        const cell = r1.getCell(c);
        cell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+GREEN}};
        cell.font      = {name:'Arial', bold:true, size:11, color:{argb:'FF'+WHITE}};
        cell.alignment = {horizontal: c===6?'right':'center', vertical:'middle', readingOrder:2};
        cell.border    = thinBorder(GREEN_MID);
      });

      // ══ صفوف المحطات ══
      for (let si=0; si<stationKeys.length; si++) {
        const st    = stationKeys[si];
        const lands = stationGroups[st];

        // ── عنوان المحطة: سطر أخضر فاتح بسيط ──
        // عنوان المحطة: رقم المحطة + اسم المنطقة (region.nameHeb)
        const stRegion  = regions.find(r => r.id === lands[0]?.regionId);
        const stRegName = stRegion?.nameHeb || stRegion?.name || '';
        const stLabel   = stRegName ? `${st}  —  ${stRegName}` : st;

        ws.addRow(['','','','', stLabel,'','','','']);
        const stRow = ws.lastRow;
        stRow.height = 24;
        ws.mergeCells(stRow.number,5, stRow.number,9);
        // ✅ يجب إعادة تعيين القيمة بعد الدمج
        const stMergedCell = ws.getCell(stRow.number, 5);
        stMergedCell.value = stLabel;
        stMergedCell.font      = {name:'Arial', bold:true, size:13, color:{argb:'FF'+GREEN}};
        stMergedCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+GREEN_LIGHT}};
        stMergedCell.alignment = {horizontal:'right', vertical:'middle', readingOrder:2};
        stMergedCell.border    = {
          top:    {style:'medium', color:{argb:'FF'+GREEN_MID}},
          bottom: {style:'thin',   color:{argb:'FF'+BORDER_C}},
          left:   {style:'thin',   color:{argb:'FF'+BORDER_C}},
          right:  {style:'thin',   color:{argb:'FF'+BORDER_C}},
        };
        for (let c=1;c<=4;c++) {
          const cell = stRow.getCell(c);
          cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+GREEN_LIGHT}};
          cell.font = {size:1, color:{argb:'FF'+GREEN_LIGHT}};
        }

        // ── أسطر المزارعين ──
        for (let li=0; li<lands.length; li++) {
          const land    = lands[li];
          const farmer  = farmers.find(f=>f.id===land.farmerId);
          if (!farmer) continue;
          const reading = allReadings.find(r=>r.landId===land.id && r.year===year);
          const prevVal = reading ? (reading.readings[prevPhaseIdx]??'') : '';
          const isAlt   = li%2===1;

          ws.addRow([
            land.id, farmer.id, reading?.id||'', phase,
            land.stationNumber,
            `${farmer.lastName||''} ${farmer.firstName||''}`.trim(),
            farmer.phone||'',
            prevVal!==''?prevVal:'',
            '',
          ]);
          const dRow = ws.lastRow;
          dRow.height = 21;

          // A-D مخفية
          for (let c=1;c<=4;c++) {
            dRow.getCell(c).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+WHITE}};
            dRow.getCell(c).font = {size:1,color:{argb:'FF'+WHITE}};
          }

          const rowBg = isAlt ? GREEN_LIGHT : WHITE;

          // E - المحطة
          const eCell = dRow.getCell(5);
          eCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+rowBg}};
          eCell.font      = {name:'Arial', size:11, color:{argb:'FF'+TEXT}, bold:false};
          eCell.alignment = {horizontal:'center', vertical:'middle', readingOrder:2};
          eCell.border    = thinBorder(BORDER_C);

          // F - الاسم
          const fCell = dRow.getCell(6);
          fCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+rowBg}};
          fCell.font      = {name:'Arial', size:11, bold:true, color:{argb:'FF'+TEXT}};
          fCell.alignment = {horizontal:'right', vertical:'middle', readingOrder:2};
          fCell.border    = thinBorder(BORDER_C);

          // G - الهاتف
          const gCell = dRow.getCell(7);
          gCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+rowBg}};
          gCell.font      = {name:'Arial', size:10, color:{argb:'FF'+TEXT_LIGHT}};
          gCell.alignment = {horizontal:'center', vertical:'middle', readingOrder:2};
          gCell.border    = thinBorder(BORDER_C);

          // H - القراءة السابقة
          const hCell = dRow.getCell(8);
          hCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+rowBg}};
          hCell.font      = {name:'Arial', size:11, color:{argb:'FF'+TEXT}};
          hCell.alignment = {horizontal:'center', vertical:'middle', readingOrder:2};
          hCell.border    = {
            top:    {style:'thin',   color:{argb:'FF'+BORDER_C}},
            bottom: {style:'thin',   color:{argb:'FF'+BORDER_C}},
            left:   {style:'thin',   color:{argb:'FF'+BORDER_C}},
            right:  {style:'medium', color:{argb:'FF'+GREEN_MID}},
          };
          if (prevVal!=='') {
            hCell.numFmt = '#,##0';
            hCell.value  = typeof prevVal==='number'?prevVal:parseFloat(prevVal)||prevVal;
          }

          // I - القراءة الجديدة (فارغة + حد أخضر واضح فقط)
          const iCell = dRow.getCell(9);
          iCell.fill      = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+WHITE}};
          iCell.font      = {name:'Arial', size:12, color:{argb:'FF'+TEXT}};
          iCell.alignment = {horizontal:'center', vertical:'middle', readingOrder:2};
          iCell.border    = {
            top:    {style:'thin',   color:{argb:'FF'+BORDER_C}},
            bottom: {style:'thin',   color:{argb:'FF'+BORDER_C}},
            left:   {style:'medium', color:{argb:'FF'+GREEN_MID}},
            right:  {style:'medium', color:{argb:'FF'+GREEN_MID}},
          };
        }

        // ── فاصل شفاف بين المحطات ──
        if (si < stationKeys.length-1) {
          ws.addRow(['','','','','','','','','']);
          const sep = ws.lastRow;
          sep.height = 6;
          for (let c=1;c<=9;c++) {
            sep.getCell(c).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+WHITE}};
          }
        }
      }

      // ── إخفاء أعمدة المعرفات ──
      ws.getColumn(1).hidden = true;
      ws.getColumn(2).hidden = true;
      ws.getColumn(3).hidden = true;
      ws.getColumn(4).hidden = true;

      const buf = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
        `readings-${year}-phase${phase}-${new Date().toISOString().slice(0,10)}.xlsx`
      );
      setExcelModal(false);
    } catch(e) {
      console.error(e);
      alert(ar?'خطأ في التصدير: '+e.message:'שגיאה בייצוא: '+e.message);
    }
    setExcelLoading(false);
  };
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { alert(ar ? 'الملف فارغ' : 'הקובץ ריק'); return; }

      // استخراج السنة والمرحلة من خصائص الملف
      const subject = wb.Props?.Subject || '';
      const yearMatch  = subject.match(/year=(\d+)/);
      const phaseMatch = subject.match(/phase=(\d+)/);
      const year  = yearMatch  ? parseInt(yearMatch[1])  : new Date().getFullYear();
      const phase = phaseMatch ? parseInt(phaseMatch[1]) : 1;
      const readingIdx = phase; // index الخانة في readings[]

      // بناء قائمة الصفوف مع القراءات الجديدة
      const importRows = [];
      for (const row of rows) {
        const landId    = row['__landId']    || '';
        const farmerId  = row['__farmerId']  || '';
        const readingId = row['__readingId'] || '';
        const newValKey = Object.keys(row).find(k => k.includes('جديدة') || k.includes('חדשה'));
        const newValue  = newValKey ? row[newValKey] : '';

        if (!landId || newValue === '' || newValue === null) continue;

        // ابحث عن اسم المزارع وهاتفه
        const stKey   = Object.keys(row).find(k => k.includes('محطة') || k.includes('עמדה'));
        const nameKey = Object.keys(row).find(k => k.includes('مزارع') || k.includes('חקלאי'));
        const telKey  = Object.keys(row).find(k => k.includes('هاتف') || k.includes('טלפון'));

        importRows.push({
          landId,
          farmerId,
          readingId: readingId || null,
          readingIndex: readingIdx,
          newValue,
          stationNumber: stKey   ? row[stKey]   : '',
          farmerName:    nameKey ? row[nameKey]  : '',
          farmerPhone:   telKey  ? row[telKey]   : '',
          year,
        });
      }

      if (!importRows.length) {
        alert(ar ? 'لا توجد قراءات جديدة في الملف' : 'אין קריאות חדשות בקובץ');
        return;
      }

      // إرسال للـ backend للمعاينة
      const res = await adminAPI.previewReadingsImport({ rows: importRows, year });
      if (!res.preview?.length) {
        alert(ar ? 'لا توجد بيانات صالحة للاستيراد' : 'אין נתונים תקינים לייבוא');
        return;
      }

      setImportPreview({ items: res.preview, year, phase });
    } catch(err) {
      console.error(err);
      alert(ar ? 'خطأ في قراءة الملف: ' + err.message : 'שגיאה בקריאת הקובץ: ' + err.message);
    }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    setApplyingImport(true);
    try {
      const res = await adminAPI.applyReadingsImport({ items: importPreview.items });
      alert(ar
        ? `✅ تم تطبيق ${res.applied} قراءة${res.created ? ` وإنشاء ${res.created} جديد` : ''}${res.errors?.length ? `
⚠️ أخطاء: ${res.errors.join(', ')}` : ''}`
        : `✅ עודכנו ${res.applied} קריאות${res.created ? ` ונוצרו ${res.created} חדשות` : ''}${res.errors?.length ? `
⚠️ שגיאות: ${res.errors.join(', ')}` : ''}`
      );
      setImportPreview(null);
      load(); // إعادة تحميل البيانات
    } catch(err) {
      alert(ar ? 'خطأ في التطبيق: ' + err.message : 'שגיאה בהחלה: ' + err.message);
    }
    setApplyingImport(false);
  };

  // ✅ ترتيب: افتراضي أبجدي حسب العائلة، أو حسب الرصيد عند الضغط
  const [sortBalance, setSortBalance] = React.useState(null); // null | 'asc' | 'desc'

  const filtered = farmers.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    const fullName = `${f.firstName||''} ${f.lastName||''} ${f.nameHeb||''} ${f.name||''}`.toLowerCase();
    return fullName.includes(q) || (f.idNumber||'').includes(q) || (f.lastName||'').toLowerCase().includes(q);
  });

  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl  = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    return (
      <div onClick={() => setMapModal(null)} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ padding:'14px 18px', background:'var(--primary-dark)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>📍</span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{name}</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <a href={earthUrl} target="_blank" rel="noopener noreferrer" style={{ color:'#a3e635', fontSize:12, fontWeight:700, textDecoration:'none', background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:8 }}>
                🗺️ {ar ? 'Google Earth' : 'Google Earth'}
              </a>
              <button onClick={() => setMapModal(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          </div>
          <div style={{ position:'relative' }}>
            <iframe src={esriUrl} width="100%" height="380" style={{ border:0, display:'block' }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="map" />
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -100%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
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

  return (
    <>
    <div>
      <MapModal />

      {/* ══ Modal: تصدير ورقة العمل ══ */}
      {excelModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:20,padding:32,maxWidth:400,width:'100%',boxShadow:'0 16px 60px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:20,color:'var(--primary)',display:'flex',alignItems:'center',gap:8}}>
              📥 {ar?'تحميل ورقة عمل الناطور':'הורד גיליון עבודה לשומר'}
            </h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
              <div className="form-group">
                <label style={{fontWeight:700}}>{ar?'السنة':'שנה'}</label>
                <input type="number" value={excelYear} onChange={e=>setExcelYear(e.target.value)}
                  min={2020} max={2099} style={{fontSize:18,fontWeight:900,textAlign:'center'}}/>
              </div>
              <div className="form-group">
                <label style={{fontWeight:700}}>{ar?'رقم المرحلة الجديدة':'תקופה חדשה'}</label>
                <input type="number" value={excelPhase} onChange={e=>setExcelPhase(e.target.value)}
                  min={1} max={10} style={{fontSize:18,fontWeight:900,textAlign:'center'}}/>
              </div>
            </div>
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#15803d',marginBottom:20,lineHeight:1.7}}>
              💡 {ar
                ? <>سيُولَّد ملف Excel مرتب حسب المحطات يحتوي على:<br/>• آخر قراءة مسجلة في النظام<br/>• خانة فارغة للقراءة الجديدة (م{excelPhase})<br/>• معرّفات مخفية للاستيراد لاحقاً</>
                : <>יופק קובץ Excel ממוין לפי תחנות עם:<br/>• קריאה אחרונה מהמערכת<br/>• שדה ריק לקריאה חדשה (ת{excelPhase})<br/>• מזהים נסתרים לייבוא לאחר מכן</>
              }
            </div>
            <div style={{display:'flex',gap:12}}>
              <button className="btn btn-primary" onClick={exportReadingsExcel} disabled={excelLoading} style={{flex:1}}>
                {excelLoading ? '⏳...' : `📥 ${ar?'تحميل':'הורד'}`}
              </button>
              <button className="btn btn-outline" onClick={()=>setExcelModal(false)} style={{flex:1}}>
                {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: معاينة الاستيراد ══ */}
      {importPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:780,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.35)',overflow:'hidden'}}>
            {/* Header */}
            <div style={{padding:'16px 24px',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{color:'#fff',fontWeight:900,fontSize:17}}>
                  🔍 {ar?'معاينة الاستيراد':'תצוגה מקדימה של ייבוא'} — {ar?`السنة ${importPreview.year} / مرحلة ${importPreview.phase}`:`שנה ${importPreview.year} / תקופה ${importPreview.phase}`}
                </div>
                <div style={{color:'rgba(255,255,255,0.75)',fontSize:13,marginTop:2}}>
                  {importPreview.items.length} {ar?'قراءة ستُطبَّق':'קריאות יוחלו'}
                </div>
              </div>
              <button onClick={()=>setImportPreview(null)} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:'50%',cursor:'pointer',fontSize:17,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>

            {/* Table */}
            <div style={{overflowY:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead style={{position:'sticky',top:0}}>
                  <tr style={{background:'#f0fdf4'}}>
                    <th style={{padding:'10px 12px',textAlign:'center',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                    <th style={{padding:'10px 12px',textAlign:'right',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                    <th style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'#64748b'}}>{ar?'القراءة السابقة':'קריאה קודמת'}</th>
                    <th style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'#0ea5e9'}}>{ar?'القراءة الجديدة':'קריאה חדשה'}</th>
                    <th style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'#16a34a'}}>{ar?'الفرق':'הפרש'}</th>
                    <th style={{padding:'10px 12px',textAlign:'center',fontWeight:800}}>{ar?'الحالة':'סטטוס'}</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.items.map((item, i) => (
                    <tr key={i} style={{borderBottom:'1px solid #e5e7eb',background:i%2===0?'#fff':'#f9fafb'}}>
                      <td style={{padding:'8px 12px',textAlign:'center'}}>
                        <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'2px 10px',borderRadius:6,fontWeight:900,fontSize:14}}>{item.stationNumber}</code>
                      </td>
                      <td style={{padding:'8px 12px',fontFamily:'Heebo,sans-serif',fontWeight:700}}>{item.farmerName}</td>
                      <td style={{padding:'8px 12px',textAlign:'center',color:'#64748b',fontWeight:700}}>
                        {item.prevValue !== null ? item.prevValue.toLocaleString() : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'center'}}>
                        <strong style={{fontSize:15,color:'#0369a1'}}>{parseFloat(item.newValue).toLocaleString()}</strong>
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'center'}}>
                        {item.diff !== null
                          ? <span style={{fontWeight:800,fontSize:14,color:item.diff>=0?'#16a34a':'#dc2626'}}>{item.diff>=0?'+':''}{item.diff.toLocaleString()}</span>
                          : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'center'}}>
                        {item.status==='create'
                          ? <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'2px 10px',borderRadius:6,fontSize:11,fontWeight:700}}>{ar?'إنشاء جديد':'יצירה חדשה'}</span>
                          : item.status==='update'
                            ? <span style={{background:'#fef9c3',color:'#854d0e',padding:'2px 10px',borderRadius:6,fontSize:11,fontWeight:700}}>{ar?'تحديث':'עדכון'}</span>
                            : <span style={{background:'#f0fdf4',color:'#16a34a',padding:'2px 10px',borderRadius:6,fontSize:11,fontWeight:700}}>{ar?'إضافة':'הוספה'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{padding:'14px 24px',borderTop:'2px solid #e5e7eb',background:'#f8fafc',display:'flex',gap:12,alignItems:'center',flexShrink:0}}>
              <div style={{flex:1,fontSize:12,color:'var(--text-muted)'}}>
                {ar
                  ? <><strong style={{color:'#dc2626'}}>⚠️ تنبيه:</strong> بعد الضغط على تطبيق ستُحفظ القراءات في قاعدة البيانات ولا يمكن التراجع</>
                  : <><strong style={{color:'#dc2626'}}>⚠️ אזהרה:</strong> לאחר לחיצה על החל, הקריאות יישמרו ולא ניתן לבטל</>}
              </div>
              <button
                className="btn btn-primary"
                onClick={applyImport}
                disabled={applyingImport}
                style={{minWidth:130,fontWeight:800,fontSize:15}}
              >
                {applyingImport ? '⏳...' : `✅ ${ar?'تطبيق الكل':'החל הכל'}`}
              </button>
              <button className="btn btn-outline" onClick={()=>setImportPreview(null)} style={{minWidth:100}}>
                ❌ {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── مودال: هل تريد إضافة أراضي للمزارع الجديد؟ ── */}
      {askLandFor && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:32,maxWidth:380,width:'100%',boxShadow:'0 12px 50px rgba(0,0,0,0.25)',textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>🌱</div>
            <h3 style={{margin:'0 0 8px',fontSize:20,color:'var(--primary)'}}>{ar?'إضافة أراضي':'הוספת קרקעות'}</h3>
            <p style={{color:'var(--text-muted)',fontSize:14,marginBottom:24,lineHeight:1.6}}>
              {ar
                ? <>هل تريد إضافة أراضي للمزارع<br/><strong style={{color:'var(--primary)'}}>{askLandFor.name}</strong> الآن؟</>
                : <>האם ברצונך להוסיף קרקעות לחקלאי<br/><strong style={{color:'var(--primary)'}}>{askLandFor.name}</strong> עכשיו?</>
              }
            </p>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const farmerId = askLandFor.id;
                  setAskLandFor(null);
                  setExpandedFarmer(farmerId);
                  await loadFarmerLands(farmerId);
                  openAddLand(farmerId);
                  // نسكرول لنموذج الأرض بعد أن يكتمل الـ render
                  setTimeout(() => {
                    const el = document.getElementById(`land-form-${farmerId}`);
                    if (el) { const top = el.getBoundingClientRect().top + window.scrollY - 80; window.scrollTo({ top, behavior: 'smooth' }); }
                  }, 350);
                }}
              >
                ✅ {ar?'نعم، أضف الآن':'כן, הוסף עכשיו'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setAskLandFor(null)}
              >
                {ar?'لاحقاً':'מאוחר יותר'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-between mb-20" style={{flexWrap:'wrap',gap:12}}>
        <input type="text" placeholder={`🔍 ${t('search',lang)}`} value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}} />
        <div className="flex-gap gap-8">
          <button className="btn btn-outline" onClick={async()=>{ if(window.confirm(ar?'مزامنة GPS؟':'לסנכרן GPS?')){ const r=await adminAPI.syncGPS(); alert((ar?'تم تحديث ':'עודכנו ')+r.updated+(ar?' قراءة':' קריאות')); } }}>🔄 GPS</button>
          <button className="btn btn-outline" onClick={exportExcel}>📊 Excel</button>
          {!isViewer && (
            <>
              <button
                className="btn btn-outline"
                style={{background:'#f0fdf4',border:'1.5px solid #16a34a',color:'#15803d',fontWeight:700}}
                onClick={()=>setExcelModal(true)}
              >📥 {ar?'ورقة العمل':'גיליון עבודה'}</button>
              <button
                className="btn btn-outline"
                style={{background:'#eff6ff',border:'1.5px solid #3b82f6',color:'#1d4ed8',fontWeight:700}}
                onClick={()=>importFileRef.current?.click()}
              >📤 {ar?'رفع نتائج':'העלה תוצאות'}</button>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportFile}/>
            </>
          )}
          {!isViewer && <button className="btn btn-primary" onClick={openAdd}>+ {ar?'إضافة مزارع':'הוסף חקלאי'}</button>}
        </div>
      </div>

      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{border:'2px solid var(--primary)'}}>
          <h3 className="mb-16">{edit?`✏️ ${ar?'تعديل':'עריכה'}`:`+ ${ar?'مزارع جديد':'חקלאי חדש'}`}</h3>
          <form onSubmit={submitFarmer}>
            <div className="grid-2">
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'الاسم الشخصي':'שם פרטי'} *</label>
                <input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} placeholder={ar?'غسان':'גסאן'} style={{fontFamily:'Heebo,sans-serif',fontSize:15}} autoFocus />
              </div>
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'اسم العائلة':'שם משפחה'} *</label>
                <input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} placeholder={ar?'عمران':'עמראן'} style={{fontFamily:'Heebo,sans-serif',fontSize:15}} />
              </div>
              <div className="form-group">
                <label>{t('idNumber',lang)} <span style={{fontSize:11,color:'var(--text-muted)',fontWeight:400}}>{ar?'(اختياري — سيُولَّد مؤقت إن تُرك فارغاً)':'(אופציונלי — יוגרל זמני אם ריק)'}</span></label>
                <input value={form.idNumber} onChange={e=>setForm({...form,idNumber:e.target.value})} placeholder={ar?'اتركه فارغاً أو أدخل الرقم':"השאר ריק או הכנס ת\"ז"} />
              </div>
              <div className="form-group">
                <label>{t('phone',lang)}</label>
                <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="050-1234567" type="tel" autoComplete="off" />
              </div>
              {!edit && (
                <div className="form-group">
                  <label>{ar?'كود الدخول':'קוד כניסה'}</label>
                  <div style={{background:'#f0fdf4',border:'1.5px dashed #16a34a',borderRadius:10,padding:'10px 16px',textAlign:'center',color:'#15803d',fontSize:13,fontWeight:600}}>🎲 {ar?'سيُولَّد تلقائياً':'יופק אוטומטית'}</div>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('notes',lang)}</label>
              <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?t('saving',lang):`💾 ${t('save',lang)}`}</button>
              <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>{t('cancel',lang)}</button>
            </div>
          </form>
        </div>
      )}

      {newCode && (
        <div className="card mb-16 fade-in" style={{border:'2px solid #16a34a',background:'#f0fdf4',padding:24,textAlign:'center'}}>
          <div style={{fontSize:20,marginBottom:8}}>🎉 {ar?'تمت الإضافة!':'נוסף בהצלחה!'}</div>
          <div style={{display:'inline-block',background:'#fff',border:'3px solid #16a34a',borderRadius:16,padding:'16px 48px',fontSize:52,fontWeight:900,fontFamily:'monospace',letterSpacing:14,color:'#14532d'}}>{newCode}</div>
          <div style={{marginTop:14,color:'var(--text-muted)',fontSize:12}}>{ar?'احفظه وأرسله للمزارع':'שמור ושלח לחקלאי'}</div>
          <button className="btn btn-outline btn-sm" style={{marginTop:14}} onClick={()=>setNewCode(null)}>{ar?'إغلاق':'סגור'}</button>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div>
      ) : (
        <div className="card">
          <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>{filtered.length} {ar?'مزارع':'חקלאים'}</p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{width:30}}></th>
                  <th
                    onClick={()=>setSortBalance(null)}
                    style={{cursor:'pointer',userSelect:'none'}}
                    title={ar?'اضغط للعودة للترتيب الأبجدي':'לחץ למיון אלפביתי'}
                  >
                    {ar?'الاسم':'שם'}{sortBalance !== null ? ' ↺' : ''}
                  </th>
                  <th>{t('idNumber',lang)}</th>
                  <th>{ar?'الكود':'קוד'}</th>
                  <th>{t('phone',lang)}</th>
                  <th
                    onClick={()=>setSortBalance(s => s === 'desc' ? 'asc' : 'desc')}
                    style={{color:'#dc2626',background:'#fff1f2',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}
                    title={ar?'اضغط للترتيب':'לחץ למיון'}
                  >
                    {ar?'غير مدفوع':'יתרה'}
                    {sortBalance === 'desc' ? ' ↓' : sortBalance === 'asc' ? ' ↑' : ' ↕'}
                  </th>
                  <th>{t('notes',lang)}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].sort((a,b) => {
                    if (sortBalance === 'asc')  return calcUnpaid(a.id) - calcUnpaid(b.id);
                    if (sortBalance === 'desc') return calcUnpaid(b.id) - calcUnpaid(a.id);
                    // ✅ ترتيب أبجدي افتراضي حسب اسم العائلة
                    const nameA = (a.lastName || a.name || '').trim();
                    const nameB = (b.lastName || b.name || '').trim();
                    return nameA.localeCompare(nameB, 'ar');
                  }).map(f => {
                  const unpaid = calcUnpaid(f.id);
                  const isOpen = expandedFarmer === f.id;
                  return (
                    <React.Fragment key={f.id}>
                      <tr id={`farmer-row-${f.id}`} style={{background:isOpen?'#f0fdf4':''}}>
                        <td style={{textAlign:'center'}}>
                          <button onClick={()=>toggleFarmerExpand(f.id)} style={{width:26,height:26,borderRadius:6,border:'1px solid var(--border)',background:isOpen?'var(--primary)':'var(--surface-2)',color:isOpen?'#fff':'var(--text-muted)',cursor:'pointer',fontSize:12,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            {isOpen?'▲':'▼'}
                          </button>
                        </td>
                        <td>
                          <div style={{fontFamily:'Heebo,sans-serif'}}>
                            <span style={{fontWeight:900,fontSize:15,color:'var(--primary)'}}>{f.lastName||f.nameHeb||f.name} </span>
                            <span style={{fontWeight:700,fontSize:15}}>{f.firstName||''}</span>
                          </div>
                        </td>
                        <td>
                          {f.idNumber?.startsWith('TMP-')
                            ? <span title={f.idNumber} style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#c2410c',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:700}}>⏳ {ar?'مؤقت':'זמני'}</span>
                            : <code style={{background:'var(--surface-2)',padding:'2px 8px',borderRadius:4,fontSize:12}}>{f.idNumber}</code>
                          }
                        </td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 10px',borderRadius:6,fontSize:13,fontWeight:700,letterSpacing:3,color:'#15803d'}}>{revealCode?.id===f.id?revealCode.code:'••••'}</code>
                            <button onClick={()=>handleRevealCode(f.id)} style={{width:24,height:24,borderRadius:6,border:'1px solid var(--border)',background:'var(--surface-2)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}>{revealCode?.id===f.id?'🙈':'👁'}</button>
                          </div>
                        </td>
                        <td>{f.phone||'—'}</td>
                        <td style={{textAlign:'center'}}>
                          {unpaid>0?<span style={{background:'#fff1f2',color:'#dc2626',padding:'3px 10px',borderRadius:6,fontWeight:700,fontSize:13}}>₪{Math.round(unpaid).toLocaleString()}</span>:<span style={{color:'#16a34a',fontWeight:700}}>✓</span>}
                        </td>
                        <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'var(--text-muted)'}}>{f.notes||'—'}</td>
                        {!isViewer && (
                          <td>
                            <div className="flex-gap gap-4">
                              <button onClick={()=>openEdit(f)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                              <button onClick={()=>delFarmer(f.id,f.nameHeb||f.name)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={isViewer?7:8} style={{padding:0,background:'#f8fffe'}}>
                            <div style={{padding:'12px 16px 16px',borderTop:'2px solid #bbf7d0'}}>
                              <div className="flex-between mb-8">
                                <strong style={{fontSize:13,color:'var(--primary)'}}>🌱 {ar?'أراضي':'קרקעות של'} {f.firstName||''} {f.lastName||f.nameHeb||f.name}</strong>
                                {!isViewer && <button className="btn btn-outline btn-sm" onClick={()=>openAddLand(f.id)}>+ {ar?'إضافة أرض':'הוסף קרקע'}</button>}
                              </div>

                              {landForm && (
                                <div id={`land-form-${f.id}`} style={{background:'#fff',border:'1.5px solid var(--primary)',borderRadius:10,padding:14,marginBottom:12}}>
                                  <h4 style={{margin:'0 0 12px'}}>{editLand?(ar?'✏ تعديل':'✏ עריכה'):(ar?'+ إضافة أراضي':'+ הוסף קרקעות')}</h4>
                                  <form onSubmit={editLand?submitLand:e=>e.preventDefault()}>

                                    {/* زرا الوضع — يظهران في الإضافة والتعديل */}
                                    <div style={{display:'flex',gap:8,marginBottom:14}}>
                                      <button type="button" onClick={()=>{setManualMode(false); if(!editLand) setLandFormData(EMPTY_LAND);}}
                                        style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${!manualMode?'var(--primary)':'var(--border)'}`,background:!manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:!manualMode?'var(--primary)':'var(--text-muted)'}}>
                                        📋 {ar?'اختر من القائمة':'בחר מרשימה'}
                                      </button>
                                      <button type="button" onClick={()=>{setManualMode(true); if(!editLand) setLandFormData(EMPTY_LAND);}}
                                        style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${manualMode?'var(--primary)':'var(--border)'}`,background:manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:manualMode?'var(--primary)':'var(--text-muted)'}}>
                                        ✏️ {ar?'إدخال يدوي':'הזנה ידנית'}
                                      </button>
                                    </div>

                                    {/* ── القائمة ── */}
                                    {!manualMode ? (
                                      <div className="form-group">
                                        <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'اختر محطة':'בחר תחנה'}</label>
                                        <select value={editLand ? landFormData.stationNumber : ""}
                                          onChange={e => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            const s = allLands.find(l => l.stationNumber === val);
                                            if (s) {
                                              if (editLand) {
                                                // في التعديل: نملأ النموذج + ننسخ الوصف من المحطة تلقائياً (قابل للتعديل)
                                                setLandFormData({ regionId:s.regionId||'', stationNumber:s.stationNumber, stationLat:s.stationLat||'', stationLng:s.stationLng||'', gpsRaw:(s.stationLat&&s.stationLng)?`${s.stationLat}, ${s.stationLng}`:'', description: s.description || '' });
                                              } else {
                                                // في الإضافة: نسمح بالتكرار (مزارع يملك أكثر من ساعة في نفس المحطة)
                                                const isDuplicate = pendingLands.some(p => p.stationNumber === val);
                                                setPendingLands(prev => [...prev, {
                                                  regionId: s.regionId||'',
                                                  stationNumber: s.stationNumber,
                                                  stationLat: s.stationLat||'',
                                                  stationLng: s.stationLng||'',
                                                  description: isDuplicate ? '' : (s.description || ''),
                                                  _duplicate: isDuplicate,
                                                }]);
                                                e.target.value='';
                                              }
                                            }
                                          }}
                                          style={{fontSize:15,fontFamily:'monospace',fontWeight:700}}>
                                          <option value="">{editLand ? (landFormData.stationNumber||ar?'— اختر —':'— בחר —') : (ar?`— اختر (${pendingLands.length} في القائمة) —`:`— בחר (${pendingLands.length} בתור) —`)}</option>
                                          {(() => {
                                            const available = allLands.filter(l => l.stationNumber);
                                            const grouped = available.reduce((acc,l)=>{ const code=l.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()||'?'; if(!acc[code])acc[code]=[]; acc[code].push(l); return acc; },{});
                                            return Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([code,lands])=>(
                                              <optgroup key={code} label={`── ${code} ──`}>
                                                {lands.map(l=>{ const reg=regions.find(r=>r.id===l.regionId); return (
                                                  <option key={l.id} value={l.stationNumber}>
                                                    {l.stationNumber}{reg?.nameHeb&&reg.nameHeb!==reg.name?` (${reg.nameHeb})`:reg?.name?` (${reg.name})`:''}{l.stationLat?' 📍':''}
                                                  </option>
                                                );})}
                                              </optgroup>
                                            ));
                                          })()}
                                        </select>
                                        {/* في التعديل: نعرض معاينة + حقل وصف */}
                                        {editLand && landFormData.stationNumber && (
                                          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginTop:8,fontSize:13}}>
                                            <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                                              <strong style={{color:'var(--primary)',fontFamily:'monospace'}}>{landFormData.stationNumber}</strong>
                                              {landFormData.stationLat&&landFormData.stationLng
                                                ? <span style={{color:'#16a34a',fontSize:12}}>✓ GPS: {parseFloat(landFormData.stationLat).toFixed(4)}, {parseFloat(landFormData.stationLng).toFixed(4)}</span>
                                                : <span style={{color:'#ca8a04',fontSize:12}}>⚠️ {ar?'لا GPS':'אין GPS'}</span>}
                                            </div>
                                            <div style={{marginTop:8}}>
                                              <label style={{fontSize:12,color:'var(--text-muted)'}}>📝 {ar?'وصف':'תיאור'}</label>
                                              <input value={landFormData.description} onChange={e=>setLandFormData({...landFormData,description:e.target.value})}
                                                placeholder={ar?'وصف اختياري...':'תיאור אופציונלי...'} style={{width:'100%',marginTop:4,fontSize:12,padding:'5px 8px',borderRadius:6,border:'1px solid #bbf7d0'}}/>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* ── يدوي ── */
                                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:12}}>
                                        <div className="form-group">
                                          <label>עמדה *</label>
                                          <input value={landFormData.stationNumber} onChange={e=>setLandFormData({...landFormData,stationNumber:e.target.value})} placeholder="A14" style={{fontFamily:'monospace',fontWeight:900,textAlign:'center',fontSize:18,letterSpacing:3}} autoFocus={manualMode&&!editLand}/>
                                        </div>
                                        <div className="form-group">
                                          <label>{ar?'المنطقة':'אזור'}</label>
                                          <select value={landFormData.regionId} onChange={e=>setLandFormData({...landFormData,regionId:e.target.value})}>
                                            <option value="">{ar?'— اختر —':'— בחר —'}</option>
                                            {regions.map(r=><option key={r.id} value={r.id}>{r.name}{r.nameHeb&&r.nameHeb!==r.name?` — ${r.nameHeb}`:''}</option>)}
                                          </select>
                                        </div>
                                        <div className="form-group">
                                          <label>📍 GPS</label>
                                          <input value={landFormData.gpsRaw} onChange={e=>handleGpsChange(e.target.value)} placeholder="32.12, 35.12" style={{fontFamily:'monospace',fontSize:12}}/>
                                        </div>
                                        <div className="form-group">
                                          <label>📝 {ar?'وصف':'תיאור'}</label>
                                          <input value={landFormData.description} onChange={e=>setLandFormData({...landFormData,description:e.target.value})} placeholder={ar?'وصف...':'תיאור...'}/>
                                        </div>
                                      </div>
                                    )}

                                    {landError && <div className="alert alert-error mb-8">{landError}</div>}
                                    <div className="flex-gap gap-8">
                                      {editLand ? (
                                        <>
                                          <button type="submit" className="btn btn-primary btn-sm" disabled={savingLand}>{savingLand?'⏳':`💾 ${ar?'حفظ':'שמור'}`}</button>
                                          <button type="button" className="btn btn-outline btn-sm" onClick={()=>setLandForm(null)}>{ar?'إلغاء':'ביטול'}</button>
                                        </>
                                      ) : (
                                        <button type="button" className="btn btn-outline btn-sm" onClick={()=>{setLandForm(null);setPendingLands([]);}}>
                                          {ar?'إلغاء':'ביטול'}
                                        </button>
                                      )}
                                    </div>
                                  </form>

                                  {/* ✅ قائمة الانتظار مع حقل وصف لكل محطة */}
                                  {!editLand && pendingLands.length > 0 && (
                                    <div style={{marginTop:14,background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:10,padding:'12px 14px'}}>
                                      <div className="flex-between mb-10">
                                        <strong style={{fontSize:13,color:'var(--primary)'}}>🗂️ {ar?'قائمة الانتظار':'תור לשמירה'} ({pendingLands.length})</strong>
                                        <button className="btn btn-primary btn-sm" onClick={saveAllPending} disabled={savingBatch}>
                                          {savingBatch?'⏳':`💾 ${ar?`حفظ الكل (${pendingLands.length})`:`שמור הכל (${pendingLands.length})`}`}
                                        </button>
                                      </div>
                                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                        {pendingLands.map((p, i) => (
                                          <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:p._duplicate?'#fffbeb':'#fff',border:`1.5px solid ${p._duplicate?'#fcd34d':'#bbf7d0'}`,borderRadius:8,padding:'6px 10px'}}>
                                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:40}}>
                                              <code style={{fontWeight:900,color:'var(--primary)',fontSize:13}}>{p.stationNumber}</code>
                                              {p._duplicate && <span style={{fontSize:9,color:'#d97706',fontWeight:700}}>{ar?'مكرر':'כפול'}</span>}
                                            </div>
                                            {p.stationLat && <span style={{fontSize:10,color:'#16a34a'}}>📍</span>}
                                            <input
                                              value={p.description}
                                              onChange={e=>updatePendingDesc(i, e.target.value)}
                                              placeholder={p._duplicate ? (ar?'⚠️ أدخل وصفاً للتمييز (مطلوب)...':'⚠️ הכנס תיאור להבחנה (חובה)...') : (ar?'وصف خاص (اختياري)...':'תיאור (אופציונלי)...')}
                                              style={{flex:1,fontSize:12,padding:'3px 8px',borderRadius:5,border:`1px solid ${p._duplicate && !p.description ? '#f59e0b' : '#d1d5db'}`,background:p._duplicate && !p.description?'#fffbeb':'#fff'}}
                                            />
                                            <button onClick={()=>setPendingLands(prev=>prev.filter((_,idx)=>idx!==i))}
                                              style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:16,padding:0,lineHeight:1,flexShrink:0}}>✕</button>
                                          </div>
                                        ))}
                                      </div>
                                      <p style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>
                                        💡 {ar?'اختر محطة → تُضاف فوراً → عدّل الوصف → حفظ الكل':'בחר תחנה → מתווספת מיד → ערוך תיאור → שמור הכל'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {loadingLands ? (
                                <div style={{textAlign:'center',padding:20}}><div className="spinner"/></div>
                              ) : farmerLands.length === 0 ? (
                                <div style={{textAlign:'center',padding:16,color:'var(--text-muted)',fontSize:13}}>{ar?'لا توجد أراضٍ مسجلة':'אין קרקעות רשומות'}</div>
                              ) : (
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                                  <thead>
                                    <tr style={{background:'#e8f5e9'}}>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>עמדה</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>{ar?'المنطقة':'אזור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'right'}}>{ar?'الوصف':'תיאור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>📍</th>
                                      {!isViewer && <th style={{padding:'6px 10px',width:70}}></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {farmerLands.map(l => (
                                      <tr key={l.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                                        <td style={{padding:'7px 10px',textAlign:'center'}}>
                                          {l.stationNumber?<code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 12px',borderRadius:6,fontWeight:900,fontSize:15,letterSpacing:2}}>{l.stationNumber}</code>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:13}}>
                                          {(()=>{ const reg=regions.find(r=>r.id===l.regionId); return reg?<span style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'2px 10px',borderRadius:6,fontWeight:700,color:'var(--primary)'}}>{reg.name}{reg.nameHeb&&reg.nameHeb!==reg.name?` — ${reg.nameHeb}`:''}</span>:<span style={{color:'var(--border)'}}>—</span>; })()}
                                        </td>
                                        <td style={{padding:'7px 10px',fontSize:12,color:'#1e40af',maxWidth:200}}>
                                          {l.description?<span style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:6}}>🏡 {l.description}</span>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:11}}>
                                          {l.stationLat&&l.stationLng?<button onClick={()=>setMapModal({lat:l.stationLat,lng:l.stationLng,name:l.stationNumber||'?'})} style={{background:'none',border:'none',color:'var(--primary)',fontWeight:600,textDecoration:'none',cursor:'pointer',padding:0}}>📍 {parseFloat(l.stationLat).toFixed(4)}, {parseFloat(l.stationLng).toFixed(4)}</button>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        {!isViewer && (
                                          <td style={{padding:'7px 10px'}}>
                                            <div className="flex-gap gap-4">
                                              <button onClick={()=>openEditLand(l)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                                              <button onClick={()=>delLand(l.id,l.stationNumber||'?')} style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length===0&&<div className="empty-state"><span className="icon">👨‍🌾</span><p>{t('noData',lang)}</p></div>}
        </div>
      )}
    </div>

      {/* ── زر العودة للأعلى ── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title={ar ? 'العودة للأعلى' : 'חזור למעלה'}
        style={{
          position: 'fixed',
          bottom: 32,
          left: 32,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(var(--primary-rgb, 22,101,52), 0.75)',
          color: '#fff',
          border: 'none',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 1000,
          transition: 'opacity 0.2s, transform 0.2s',
          opacity: 0.7,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        ↑
      </button>
    </>
  );
}