import React, { useState } from 'react';
import { authAPI } from '../api';
import { useLang } from '../contexts/LangContext';
import LangToggle from '../components/shared/LangToggle';

const STEPS = { IDENTITY: 'identity', CHOICE: 'choice', ADMIN_PASSWORD: 'admin_password' };

export default function LoginPage({ onFarmerLogin, onAdminLogin }) {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [step,       setStep]       = useState(STEPS.IDENTITY);
  const [idNumber,   setIdNumber]   = useState('');
  const [code,       setCode]       = useState('');
  const [password,   setPassword]   = useState('');
  const [choiceData, setChoiceData] = useState(null); // { farmerId, farmerName, role, label }
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Step 1: التحقق من الهوية والكود
  const handleCheckIdentity = async e => {
    e.preventDefault();
    if (!idNumber || !code) { setError(ar?'أدخل رقم الهوية والكود':'הזן ת"ז וקוד'); return; }
    setLoading(true); setError('');
    try {
      const res = await authAPI.checkIdentity(idNumber, code);
      if (res.type === 'farmer') {
        // مزارع عادي → دخول مباشر
        onFarmerLogin(res.token, res.farmer);
      } else if (res.type === 'choice') {
        // مخول → عرض الخيار
        setChoiceData(res);
        setStep(STEPS.CHOICE);
      }
    } catch(e) { setError(e.message || (ar?'خطأ في الدخول':'שגיאה בכניסה')); }
    finally { setLoading(false); }
  };

  // Step 2a: اختار دخول كمزارع
  const handleChooseFarmer = async () => {
    setLoading(true); setError('');
    try {
      const res = await authAPI.farmerLogin(idNumber, code);
      onFarmerLogin(res.token, res.farmer);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Step 2b: اختار دخول كمدير/مراقب
  const handleChooseAdmin = () => {
    setPassword('');
    setStep(STEPS.ADMIN_PASSWORD);
  };

  // Step 3: إدخال كلمة المرور للدخول كمدير
  const handleAdminLogin = async e => {
    e.preventDefault();
    if (!password) { setError(ar?'أدخل كلمة المرور':'הזן סיסמה'); return; }
    setLoading(true); setError('');
    try {
      const res = await authAPI.adminLogin(idNumber, code, password);
      if (res.token) {
        onAdminLogin(res.token, res.role || 'admin');
      } else {
        setError(ar?'خطأ في الدخول':'שגיאה בכניסה');
      }
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const roleLabel = ar
    ? (choiceData?.role === 'admin' ? 'مدير رئيسي' : 'مراقب')
    : (choiceData?.role === 'admin' ? 'מנהל ראשי' : 'צופה');

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      padding:20,
    }}>
      <div style={{ position:'absolute', top:16, left:16 }}>
        <LangToggle />
      </div>

      <div style={{
        background:'#fff', borderRadius:20, padding:'40px 36px',
        boxShadow:'0 8px 40px rgba(0,0,0,0.12)', width:'100%', maxWidth:400,
      }}>
        {/* شعار */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🌿</div>
          <h1 style={{ fontFamily:'Heebo,Tajawal,sans-serif', color:'var(--primary-dark)', margin:0, fontSize:28 }}>
            {ar ? 'الشلالة' : 'השלאלה'}
          </h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, margin:'4px 0 0' }}>
            {ar ? 'نظام إدارة المياه' : 'מערכת ניהול מים'}
          </p>
        </div>

        {/* Step 1: هوية + كود */}
        {step === STEPS.IDENTITY && (
          <form onSubmit={handleCheckIdentity}>
            <div className="form-group">
              <label>{ar?'رقم الهوية':'מספר ת"ז'}</label>
              <input value={idNumber} onChange={e=>setIdNumber(e.target.value)}
                placeholder="039444682" inputMode="numeric" autoFocus />
            </div>
            <div className="form-group">
              <label>{ar?'كود الدخول (4 أرقام)':'קוד כניסה (4 ספרות)'}</label>
              <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,4))}
                placeholder="••••" inputMode="numeric" maxLength={4}
                type="password"
                style={{ fontFamily:'monospace', fontSize:22, letterSpacing:8, textAlign:'center' }} />
            </div>
            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width:'100%', padding:'12px', fontSize:16 }}>
              {loading ? '...' : (ar?'دخول':'כניסה')}
            </button>
          </form>
        )}

        {/* Step 2: اختيار نوع الدخول */}
        {step === STEPS.CHOICE && choiceData && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👋</div>
              <h3 style={{ fontFamily:'Heebo,sans-serif', margin:0 }}>
                {choiceData.farmerName}
              </h3>
              <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:4 }}>
                {ar?'كيف تريد الدخول؟':'כיצד תרצה להיכנס?'}
              </p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {/* دخول كمزارع */}
              <button onClick={handleChooseFarmer} disabled={loading}
                style={{
                  padding:'14px 20px', borderRadius:12, border:'2px solid #16a34a',
                  background:'#f0fdf4', color:'#14532d', cursor:'pointer',
                  fontSize:15, fontWeight:700, fontFamily:'Heebo,Tajawal,sans-serif',
                  display:'flex', alignItems:'center', gap:10, transition:'all 0.2s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='#dcfce7'}
                onMouseLeave={e=>e.currentTarget.style.background='#f0fdf4'}>
                <span style={{fontSize:24}}>🌾</span>
                <div style={{textAlign:'right'}}>
                  <div>{ar?'دخول كمزارع':'כניסה כחקלאי'}</div>
                  <div style={{fontSize:11, fontWeight:400, opacity:0.7}}>
                    {ar?'عرض بياناتي فقط':'צפייה בנתונים שלי בלבד'}
                  </div>
                </div>
              </button>

              {/* دخول كمدير/مراقب */}
              <button onClick={handleChooseAdmin} disabled={loading}
                style={{
                  padding:'14px 20px', borderRadius:12, border:'2px solid #0ea5e9',
                  background:'#f0f9ff', color:'#0c4a6e', cursor:'pointer',
                  fontSize:15, fontWeight:700, fontFamily:'Heebo,Tajawal,sans-serif',
                  display:'flex', alignItems:'center', gap:10, transition:'all 0.2s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='#e0f2fe'}
                onMouseLeave={e=>e.currentTarget.style.background='#f0f9ff'}>
                <span style={{fontSize:24}}>{choiceData?.role === 'admin' ? '🔐' : '👁️'}</span>
                <div style={{textAlign:'right'}}>
                  <div>{ar ? `دخول ك${roleLabel}` : `כניסה כ${roleLabel}`}</div>
                  <div style={{fontSize:11, fontWeight:400, opacity:0.7}}>
                    {ar?'يتطلب كلمة مرور':'דורש סיסמה'}
                  </div>
                </div>
              </button>
            </div>

            {error && <div className="alert alert-error" style={{marginTop:12}}>{error}</div>}
            <button onClick={()=>{setStep(STEPS.IDENTITY);setError('');}} 
              style={{marginTop:14, background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:13, width:'100%'}}>
              ← {ar?'رجوع':'חזור'}
            </button>
          </div>
        )}

        {/* Step 3: كلمة مرور الإدارة */}
        {step === STEPS.ADMIN_PASSWORD && (
          <form onSubmit={handleAdminLogin}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>
                {choiceData?.role === 'admin' ? '🔐' : '👁️'}
              </div>
              <h3 style={{ margin:0, fontFamily:'Heebo,sans-serif' }}>
                {ar ? `دخول ك${roleLabel}` : `כניסה כ${roleLabel}`}
              </h3>
            </div>
            <div className="form-group">
              <label>{ar?'كلمة المرور':'סיסמה'}</label>
              <input type="password" value={password}
                onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" autoFocus />
            </div>
            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width:'100%', padding:'12px', fontSize:16 }}>
              {loading ? '...' : (ar?'دخول':'כניסה')}
            </button>
            <button type="button" onClick={()=>{setStep(STEPS.CHOICE);setError('');}}
              style={{marginTop:12, background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:13, width:'100%'}}>
              ← {ar?'رجوع':'חזור'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
