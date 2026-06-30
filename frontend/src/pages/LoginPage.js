import React, { useState } from 'react';
import { authAPI } from '../api';
import { useLang } from '../contexts/LangContext';
import LangToggle from '../components/shared/LangToggle';

const STEPS = { IDENTITY: 'identity', CHOICE: 'choice', ADMIN_PASSWORD: 'admin_password' };

export default function LoginPage({ onFarmerLogin, onAdminLogin }) {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [step, setStep] = useState(STEPS.IDENTITY);
  const [idNumber, setIdNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [choiceData, setChoiceData] = useState(null); // { farmerId, farmerName, role, label }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: التحقق من الهوية والكود
  const handleCheckIdentity = async e => {
    e.preventDefault();
    if (!idNumber || !code) { setError(ar ? 'أدخل رقم الهوية والكود' : 'הזן ת"ז וקוד'); return; }
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
    } catch (e) { setError(e.message || (ar ? 'خطأ في الدخول' : 'שגיאה בכניסה')); }
    finally { setLoading(false); }
  };

  // Step 2a: اختار دخول كمزارع
  const handleChooseFarmer = async () => {
    setLoading(true); setError('');
    try {
      const res = await authAPI.farmerLogin(idNumber, code);
      onFarmerLogin(res.token, res.farmer);
    } catch (e) { setError(e.message); }
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
    if (!password) { setError(ar ? 'أدخل كلمة المرور' : 'הזן סיסמה'); return; }
    setLoading(true); setError('');
    try {
      const res = await authAPI.adminLogin(idNumber, code, password);
      if (res.token) {
        onAdminLogin(res.token, res.role || 'admin');
      } else {
        setError(ar ? 'خطأ في الدخول' : 'שגיאה בכניסה');
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const roleLabel = ar
    ? (choiceData?.role === 'admin' ? 'مدير رئيسي' : 'مراقب')
    : (choiceData?.role === 'admin' ? 'מנהל ראשי' : 'צופה');

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* السماء المتحركة */}
      <style>{`
        @keyframes shlBirdFly{0%{left:-100px;top:105px}20%{top:82px}40%{top:112px}60%{top:80px}80%{top:108px}100%{left:calc(100% + 100px);top:100px}}
        @keyframes shlBirdFly2{0%{right:-100px;top:140px}20%{top:120px}40%{top:145px}60%{top:115px}80%{top:142px}100%{right:calc(100% + 100px);top:138px}}
        @keyframes shlWUp{0%,100%{transform:rotate(-20deg) scaleY(1)}50%{transform:rotate(20deg) scaleY(0.6)}}
        @keyframes shlWDn{0%,100%{transform:rotate(20deg) scaleY(1)}50%{transform:rotate(-20deg) scaleY(0.6)}}
        @keyframes shlSpin{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.08)}}
        @keyframes shlC1{0%,100%{transform:translateX(0)}50%{transform:translateX(22px)}}
        @keyframes shlC2{0%,100%{transform:translateX(0)}50%{transform:translateX(-18px)}}
        @keyframes shlC3{0%,100%{transform:translateX(0)}50%{transform:translateX(14px)}}
        .shl-bird{position:absolute;animation:shlBirdFly 12s linear infinite;width:70px;height:50px}
        .shl-wl{transform-origin:32px 26px;animation:shlWUp 0.4s ease-in-out infinite}
        .shl-wr{transform-origin:38px 26px;animation:shlWDn 0.4s ease-in-out infinite}
        .shl-sun{animation:shlSpin 14s linear infinite}
        .shl-c1{position:absolute;top:20px;left:clamp(140px,32%,340px);animation:shlC1 9s ease-in-out infinite}
        .shl-c2{position:absolute;top:8px;left:clamp(62%,65%,72%);animation:shlC2 11s ease-in-out infinite}
        .shl-c3{position:absolute;top:48px;right:clamp(4px,3%,40px);animation:shlC3 7s ease-in-out infinite}
        @media (max-width: 600px) {
  .shl-sun-wrap { width:60px !important; height:60px !important; top:10px !important; left:10px !important; }
  .shl-bird, .shl-bird1 { width:42px !important; height:30px !important; }
  .shl-bird2 { width:42px !important; height:30px !important; }
}
      `}</style>

      {/* الشمس */}
      <div className="shl-sun-wrap" style={{ position: 'absolute', top: 18, left: 16, width: 100, height: 100 }}>        <svg className="shl-sun" style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="-15 -15 120 120">
        <g fill="#FF9800">
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(r => (
            <ellipse key={r} cx="45" cy="-8" rx="6" ry="12" transform={`rotate(${r} 45 45)`} />
          ))}
        </g>
        <circle cx="45" cy="45" r="30" fill="#FFE033" />
        <circle cx="45" cy="45" r="25" fill="#FFD700" />
      </svg>
      </div>

      {/* غيمة 1 */}
      <div className="shl-c1">
        <svg width="150" height="95" viewBox="0 0 150 95" style={{ overflow: 'visible' }}>
          <ellipse cx="75" cy="68" rx="68" ry="24" fill="white" />
          <ellipse cx="48" cy="44" rx="34" ry="32" fill="white" />
          <ellipse cx="82" cy="40" rx="32" ry="30" fill="white" />
          <ellipse cx="114" cy="50" rx="26" ry="24" fill="white" />
          <ellipse cx="20" cy="54" rx="24" ry="22" fill="white" />
          <ellipse cx="28" cy="74" rx="24" ry="22" fill="white" />
          <ellipse cx="55" cy="80" rx="26" ry="23" fill="white" />
          <ellipse cx="84" cy="80" rx="25" ry="22" fill="white" />
          <ellipse cx="112" cy="76" rx="22" ry="20" fill="white" />
          <ellipse cx="136" cy="70" rx="18" ry="17" fill="white" />
        </svg>
      </div>

      {/* غيمة 2 */}
      <div className="shl-c2">
        <svg width="130" height="85" viewBox="0 0 130 85" style={{ overflow: 'visible' }}>
          <ellipse cx="65" cy="62" rx="60" ry="22" fill="white" />
          <ellipse cx="40" cy="38" rx="30" ry="28" fill="white" />
          <ellipse cx="70" cy="34" rx="28" ry="26" fill="white" />
          <ellipse cx="98" cy="44" rx="24" ry="22" fill="white" />
          <ellipse cx="16" cy="46" rx="22" ry="20" fill="white" />
          <ellipse cx="24" cy="68" rx="22" ry="20" fill="white" />
          <ellipse cx="50" cy="74" rx="24" ry="21" fill="white" />
          <ellipse cx="78" cy="74" rx="22" ry="20" fill="white" />
          <ellipse cx="104" cy="69" rx="20" ry="18" fill="white" />
          <ellipse cx="122" cy="63" rx="16" ry="15" fill="white" />
        </svg>
      </div>

      {/* غيمة 3 */}
      <div className="shl-c3">
        <svg width="108" height="72" viewBox="0 0 108 72" style={{ overflow: 'visible' }}>
          <ellipse cx="54" cy="52" rx="50" ry="18" fill="white" />
          <ellipse cx="32" cy="30" rx="24" ry="22" fill="white" />
          <ellipse cx="58" cy="27" rx="22" ry="20" fill="white" />
          <ellipse cx="82" cy="36" rx="20" ry="18" fill="white" />
          <ellipse cx="12" cy="38" rx="18" ry="16" fill="white" />
          <ellipse cx="18" cy="56" rx="18" ry="17" fill="white" />
          <ellipse cx="42" cy="62" rx="20" ry="18" fill="white" />
          <ellipse cx="68" cy="62" rx="19" ry="17" fill="white" />
          <ellipse cx="90" cy="56" rx="16" ry="15" fill="white" />
        </svg>
      </div>

      {/* العصفور الأول — يطير من اليسار لليمين أبيض */}
      <svg className="shl-bird shl-bird1" viewBox="0 0 70 50">
        <ellipse className="shl-wl" cx="20" cy="26" rx="18" ry="9" fill="#e8e8e8" stroke="#ccc" strokeWidth="1" />
        <ellipse className="shl-wr" cx="50" cy="26" rx="18" ry="9" fill="#e8e8e8" stroke="#ccc" strokeWidth="1" />
        <ellipse cx="35" cy="30" rx="16" ry="11" fill="white" stroke="#ddd" strokeWidth="1.2" />
        <ellipse cx="35" cy="33" rx="9" ry="7" fill="#FFD700" />
        <polygon points="20,36 14,44 22,40 18,48 26,42" fill="#e0e0e0" stroke="#ccc" strokeWidth="0.8" />
        <circle cx="47" cy="22" r="11" fill="white" stroke="#ddd" strokeWidth="1.2" />
        <circle cx="50" cy="20" r="3" fill="#222" />
        <circle cx="51" cy="19" r="1" fill="white" />
        <polygon points="57,22 65,24 57,26" fill="#FFA500" />
      </svg>

      {/* العصفور الثاني — يطير من اليمين لليسار برتقالي/ذهبي */}
      <svg className="shl-bird2" style={{ position: 'absolute', animation: 'shlBirdFly2 14s linear infinite', width: 70, height: 50, top: 80, zIndex: 2 }} viewBox="0 0 70 50">        <g style={{ transform: 'scaleX(-1)', transformOrigin: '35px 0' }}>
        <ellipse style={{ transformOrigin: '50px 26px', animation: 'shlWDn 0.4s ease-in-out infinite' }} cx="50" cy="26" rx="18" ry="9" fill="#f4d27f" stroke="#e6c200" strokeWidth="1" />
        <ellipse style={{ transformOrigin: '20px 26px', animation: 'shlWUp 0.4s ease-in-out infinite' }} cx="20" cy="26" rx="18" ry="9" fill="#f4d27f" stroke="#e6c200" strokeWidth="1" />
        <ellipse cx="35" cy="30" rx="16" ry="11" fill="#fff5e1" stroke="#f0e68c" strokeWidth="1.2" />
        <ellipse cx="35" cy="33" rx="9" ry="7" fill="#FF8C00" />
        <polygon points="20,36 14,44 22,40 18,48 26,42" fill="#f0e68c" stroke="#e6c200" strokeWidth="0.8" />
        <circle cx="47" cy="22" r="11" fill="#fff5e1" stroke="#f0e68c" strokeWidth="1.2" />
        <circle cx="50" cy="20" r="3" fill="#333" />
        <circle cx="51" cy="19" r="1" fill="white" />
        <polygon points="57,22 65,24 57,26" fill="#FF6347" />
      </g>
      </svg>

      <style>{`
        [style*="color"] { color: #0d5a0d !important; }
      `}</style>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, color: '#0d5a0d !important' }}>
        <LangToggle />
      </div>

      {/* الأرضية — تلال وأشجار */}
      <style>{`
        @keyframes shlGrowUp{0%{transform:scaleY(0);opacity:0}100%{transform:scaleY(1);opacity:1}}
        @keyframes shlSway {0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
        @keyframes shlSway2{0%,100%{transform:rotate(2.5deg)}50%{transform:rotate(-2.5deg)}}
        .shl-ground{position:absolute;bottom:0;left:0;width:100%;pointer-events:none;z-index:0}
        .shl-tree{position:absolute;bottom:0;transform-origin:bottom center}
      `}</style>

      {/* التلال */}
      <svg className="shl-ground" style={{ height: '38%' }} viewBox="0 0 800 160" preserveAspectRatio="none">
        <path d="M0,160 Q100,60 200,90 Q300,120 400,70 Q500,20 600,80 Q700,130 800,60 L800,160 Z" fill="#6db86d" opacity="0.4" />
        <path d="M0,160 Q80,105 180,118 Q280,132 380,102 Q480,72 580,108 Q680,138 800,98 L800,160 Z" fill="#7dc87d" opacity="0.6" />
        <path d="M0,160 Q120,135 220,142 Q360,152 460,135 Q590,120 700,140 Q760,150 800,138 L800,160 Z" fill="#90d890" />
      </svg>

      {/* شجرة زيتون يسار */}
      <svg className="shl-tree" style={{ left: '5%', width: 'clamp(50px,7vw,80px)', height: 'clamp(75px,11vw,110px)', animation: 'shlGrowUp 1.4s ease-out forwards' }} viewBox="0 0 70 105">
        <rect x="31" y="58" width="8" height="47" rx="3" fill="#8B5E3C" />
        <g style={{ transformOrigin: '35px 58px', animation: 'shlSway 4s ease-in-out infinite' }}>
          <ellipse cx="35" cy="40" rx="28" ry="33" fill="#4a8a2a" />
          <ellipse cx="20" cy="32" rx="18" ry="22" fill="#5a9a3a" />
          <ellipse cx="50" cy="32" rx="18" ry="22" fill="#4a8a2a" />
          <ellipse cx="35" cy="18" rx="16" ry="18" fill="#5aaa3a" />
        </g>
      </svg>

      {/* نخلة يسار وسط */}
      <svg className="shl-tree" style={{ left: '21%', width: 'clamp(55px,8vw,85px)', height: 'clamp(85px,13vw,120px)', animation: 'shlGrowUp 1.7s ease-out 0.3s both' }} viewBox="0 0 80 115">
        <rect x="36" y="42" width="8" height="73" rx="4" fill="#9a6b3a" />
        <g style={{ transformOrigin: '40px 42px', animation: 'shlSway2 3.5s ease-in-out infinite' }}>
          <circle cx="40" cy="40" r="5" fill="#3d6b22" />
          <path d="M40,40 Q16,26 4,34" stroke="#5a9a3a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M40,40 Q64,26 76,34" stroke="#4a8a2a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M40,40 Q14,30 10,16" stroke="#5a9a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M40,40 Q66,30 70,16" stroke="#4a8a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M40,40 Q26,18 30,4" stroke="#4a8a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M40,40 Q54,18 50,4" stroke="#5a9a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      </svg>

      {/* شجرة صغيرة وسط */}
      <svg className="shl-tree" style={{ left: '43%', width: 'clamp(40px,6vw,65px)', height: 'clamp(60px,9vw,88px)', animation: 'shlGrowUp 1.5s ease-out 0.6s both' }} viewBox="0 0 55 82">
        <rect x="24" y="46" width="7" height="36" rx="2" fill="#8B5E3C" />
        <g style={{ transformOrigin: '27px 46px', animation: 'shlSway 5s ease-in-out infinite 0.5s' }}>
          <ellipse cx="27" cy="32" rx="22" ry="27" fill="#4a8a2a" />
          <ellipse cx="15" cy="25" rx="14" ry="17" fill="#5a9a3a" />
          <ellipse cx="39" cy="25" rx="14" ry="17" fill="#4a8a2a" />
          <ellipse cx="27" cy="14" rx="12" ry="14" fill="#5aaa3a" />
        </g>
      </svg>

      {/* شجرة زيتون يمين وسط */}
      <svg className="shl-tree" style={{ right: '22%', width: 'clamp(48px,7vw,72px)', height: 'clamp(70px,10vw,100px)', animation: 'shlGrowUp 1.8s ease-out 0.4s both' }} viewBox="0 0 65 98">
        <rect x="29" y="54" width="8" height="44" rx="3" fill="#8B5E3C" />
        <g style={{ transformOrigin: '33px 54px', animation: 'shlSway2 4.5s ease-in-out infinite' }}>
          <ellipse cx="33" cy="37" rx="26" ry="30" fill="#4a8a2a" />
          <ellipse cx="18" cy="29" rx="16" ry="20" fill="#5a9a3a" />
          <ellipse cx="47" cy="29" rx="16" ry="20" fill="#4a8a2a" />
          <ellipse cx="33" cy="16" rx="14" ry="16" fill="#5aaa3a" />
        </g>
      </svg>

      {/* نخلة يمين */}
      <svg className="shl-tree" style={{ right: '5%', width: 'clamp(52px,7.5vw,80px)', height: 'clamp(80px,12vw,112px)', animation: 'shlGrowUp 2s ease-out 0.7s both' }} viewBox="0 0 75 108">
        <rect x="34" y="40" width="7" height="68" rx="3" fill="#9a6b3a" />
        <g style={{ transformOrigin: '37px 40px', animation: 'shlSway 4.2s ease-in-out infinite 0.8s' }}>
          <circle cx="37" cy="38" r="5" fill="#3d6b22" />
          <path d="M37,38 Q13,24 3,32" stroke="#5a9a3a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M37,38 Q61,24 71,32" stroke="#4a8a2a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M37,38 Q11,28 7,14" stroke="#5a9a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M37,38 Q63,28 67,14" stroke="#4a8a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M37,38 Q23,16 26,2" stroke="#4a8a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M37,38 Q51,16 48,2" stroke="#5a9a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      </svg>

      {/* عشب يسار */}
      <svg className="shl-tree" style={{ left: '13%', width: 'clamp(40px,6vw,65px)', height: 'clamp(20px,3vw,30px)', animation: 'shlGrowUp 1s ease-out 1.2s both' }} viewBox="0 0 60 28">
        <path d="M5,28 Q5,10 8,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M15,28 Q13,8 10,0" stroke="#5aaa3a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M25,28 Q25,6 28,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M35,28 Q33,10 30,0" stroke="#5aaa3a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M48,28 Q48,8 50,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>

      {/* عشب يمين */}
      <svg className="shl-tree" style={{ right: '13%', width: 'clamp(38px,5.5vw,58px)', height: 'clamp(18px,2.8vw,28px)', animation: 'shlGrowUp 1s ease-out 1.5s both' }} viewBox="0 0 55 26">
        <path d="M5,26 Q5,8 7,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M18,26 Q16,8 13,0" stroke="#5aaa3a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M30,26 Q30,6 32,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M42,26 Q40,10 37,0" stroke="#5aaa3a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M52,26 Q52,8 54,0" stroke="#4a9a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>

      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 28px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)', width: '100%', maxWidth: 400,
        position: 'relative', zIndex: 1,
      }}>
        {/* شعار */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🌿</div>
          <h1 style={{ fontFamily: 'Heebo,Tajawal,sans-serif', color: 'var(--primary-dark)', margin: 0, fontSize: 26 }}>
            {ar ? 'الشلالة' : 'אלשללאלה'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>
            {ar ? 'نظام إدارة المياه الزراعيه' : 'מערכת ניהול מים חקלאים'}
          </p>
        </div>

        {/* Step 1: هوية + كود */}
        {step === STEPS.IDENTITY && (
          <form onSubmit={handleCheckIdentity}>
            <div className="form-group">
              <label>{ar ? 'رقم الهوية' : 'מספר ת"ז'}</label>
              <input value={idNumber} onChange={e => setIdNumber(e.target.value)}
                placeholder="012345678" inputMode="numeric" autoFocus />
            </div>
            <div className="form-group">
              <label>{ar ? 'كود الدخول (4 أرقام)' : 'קוד כניסה (4 ספרות)'}</label>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••" inputMode="numeric" maxLength={4}
                type="password"
                style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 8, textAlign: 'center' }} />
            </div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: 16 }}>
              {loading ? '...' : (ar ? 'دخول' : 'כניסה')}
            </button>
          </form>
        )}

        {/* Step 2: اختيار نوع الدخول */}
        {step === STEPS.CHOICE && choiceData && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
              <h3 style={{ fontFamily: 'Heebo,sans-serif', margin: 0 }}>
                {choiceData.farmerName}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                {ar ? 'كيف تريد الدخول؟' : 'כיצד תרצה להיכנס?'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* دخول كمزارع */}
              <button onClick={handleChooseFarmer} disabled={loading}
                style={{
                  padding: '14px 20px', borderRadius: 12, border: '2px solid #16a34a',
                  background: '#f0fdf4', color: '#14532d', cursor: 'pointer',
                  fontSize: 15, fontWeight: 700, fontFamily: 'Heebo,Tajawal,sans-serif',
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}>
                <span style={{ fontSize: 24 }}>🌾</span>
                <div style={{ textAlign: 'right' }}>
                  <div>{ar ? 'دخول كمزارع' : 'כניסה כחקלאי'}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
                    {ar ? 'عرض بياناتي فقط' : 'צפייה בנתונים שלי בלבד'}
                  </div>
                </div>
              </button>

              {/* دخول كمدير/مراقب */}
              <button onClick={handleChooseAdmin} disabled={loading}
                style={{
                  padding: '14px 20px', borderRadius: 12, border: '2px solid #0ea5e9',
                  background: '#f0f9ff', color: '#0c4a6e', cursor: 'pointer',
                  fontSize: 15, fontWeight: 700, fontFamily: 'Heebo,Tajawal,sans-serif',
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#e0f2fe'}
                onMouseLeave={e => e.currentTarget.style.background = '#f0f9ff'}>
                <span style={{ fontSize: 24 }}>{choiceData?.role === 'admin' ? '🔐' : '👁️'}</span>
                <div style={{ textAlign: 'right' }}>
                  <div>{ar ? `دخول ك${roleLabel}` : `כניסה כ${roleLabel}`}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
                    {ar ? 'يتطلب كلمة مرور' : 'דורש סיסמה'}
                  </div>
                </div>
              </button>
            </div>

            {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
            <div onClick={() => { setStep(STEPS.IDENTITY); setError(''); }}
              style={{ marginTop: 16, textAlign: 'center', cursor: 'pointer', fontSize: 24, opacity: 0.7, transition: 'opacity 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
              ↺
            </div>
          </div>
        )}

        {/* Step 3: كلمة مرور الإدارة */}
        {step === STEPS.ADMIN_PASSWORD && (
          <form onSubmit={handleAdminLogin}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {choiceData?.role === 'admin' ? '🔐' : '👁️'}
              </div>
              <h3 style={{ margin: 0, fontFamily: 'Heebo,sans-serif' }}>
                {ar ? `دخول ك${roleLabel}` : `כניסה כ${roleLabel}`}
              </h3>
            </div>
            <div className="form-group">
              <label>{ar ? 'كلمة المرور' : 'סיסמה'}</label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoFocus />
            </div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: 16 }}>
              {loading ? '...' : (ar ? 'دخول' : 'כניסה')}
            </button>
            <button type="button" onClick={() => { setStep(STEPS.CHOICE); setError(''); }}
              style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, width: '100%' }}>
              ← {ar ? 'رجوع' : 'חזור'}
            </button>
          </form>
        )}

        {/* Copyright + A.Shaalan Tech signature */}
        <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
          <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', margin: '0 0 4px' }}>
            © {new Date().getFullYear()} {ar ? 'الشلالة — كل الحقوق محفوظة' : 'אלשללאלה — כל הזכויות שמורות'}
          </p>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', marginBottom: 6, letterSpacing: '0.06em' }}>
            {ar ? 'طُوِّر وصُمِّم بواسطة' : 'פותח ועוצב על ידי'}
          </div>
          <img
            src="/logo-shaalan.png"
            alt="A.Shaalan Tech"
            style={{ height: 45, width: 'auto', display: 'inline-block', filter: 'brightness(0.85)' }}
          />
        </div>
      </div>
    </div>
  );
}