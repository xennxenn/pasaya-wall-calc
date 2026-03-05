import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Image as ImageIcon, X, Save, 
  Settings, Layout, FileText, ChevronRight, ChevronDown, 
  MousePointer2, SquareSquare, Upload, Home, User, Phone, MapPin, Edit,
  Undo2, Redo2, CheckCircle2, AlertCircle, Printer, LogOut, Users, KeyRound
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// --- Firebase Initialization (แก้ไขสำหรับ Deploy จริง) ---
// นำ Config ของคุณจาก Firebase Console มาวางแทนที่ตรงนี้ครับ
const firebaseConfig = {
  apiKey: "AIzaSyAVXIN5Z6NtJYgRS2JJ_f_sKnUjtXzp7rQ",
  authDomain: "pasaya-wall-calc.firebaseapp.com",
  projectId: "pasaya-wall-calc",
  storageBucket: "pasaya-wall-calc.firebasestorage.app",
  messagingSenderId: "965023362319",
  appId: "1:965023362319:web:ee2407270f502bf4ca227a",
  measurementId: "G-ETEZYKKDY3"
};

let app, auth, db;
const appId = 'pasaya-wall-app'; // ชื่ออ้างอิงของ App

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error", e);
}

// --- Utility Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatNum = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatMoney = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ceil1 = (num) => Math.ceil(num * 10) / 10;

// --- Calculation Logic ---
const calculateShapeSqm = (shape) => {
  const w = Number(shape.overallW) || 0;
  const h = Number(shape.overallH) || 0;
  return (w * h) / 10000;
};

const calcPiecesYardage = (pieces, fabric) => {
  const vRepeat = Number(fabric.vRepeat) || 0;
  const effFabricWidth = Number(fabric.width) - 10;
  let totalYards = 0;
  let totalWidths = 0;
  let narrowPieces = [];

  pieces.forEach(p => {
    if (p.w + 10 > fabric.width) {
      const widths = Math.ceil(p.w / effFabricWidth);
      let repeats = vRepeat >= 10 ? Math.ceil((p.h + 20) / vRepeat) : p.h + 20;
      let yards = vRepeat >= 10 ? (repeats * vRepeat * widths) / 91.44 : (repeats * widths) / 91.44;
      totalYards += ceil1(yards);
      totalWidths += widths;
    } else {
      narrowPieces.push(p);
    }
  });

  if (narrowPieces.length > 0) {
    const totalNarrowW = narrowPieces.reduce((sum, p) => sum + (p.w + 10), 0);
    const sharedWidths = Math.ceil(totalNarrowW / effFabricWidth);
    const maxH = Math.max(...narrowPieces.map(p => p.h));
    let repeats = vRepeat >= 10 ? Math.ceil((maxH + 20) / vRepeat) : maxH + 20;
    let yards = vRepeat >= 10 ? (repeats * vRepeat * sharedWidths) / 91.44 : (repeats * sharedWidths) / 91.44;
    totalYards += ceil1(yards);
    totalWidths += sharedWidths;
  }
  return { yards: totalYards, widths: totalWidths };
};

const calculateWall = (wall, fabric) => {
  if (!fabric) return { yards: 0, sqm: 0, fabricCost: 0, installCost: 0, requiredWidths: 0, methodText: '', availableMethods: {} };

  const shapes = wall.shapes || [];
  const installShapes = shapes.filter(s => s.type === 'install');
  const excludeShapes = shapes.filter(s => s.type === 'exclude');

  const rawInstallSqm = installShapes.reduce((sum, s) => sum + ceil1(calculateShapeSqm(s)), 0);
  const excludeSqm = excludeShapes.reduce((sum, s) => sum + ceil1(calculateShapeSqm(s)), 0);
  const totalSqm = ceil1(Math.max(0, rawInstallSqm - excludeSqm));

  const wholePieces = installShapes.map(s => ({ w: Number(s.overallW)||0, h: Number(s.overallH)||0 }));
  const wholeResult = calcPiecesYardage(wholePieces, fabric);

  let splitResult = null;
  let isSplitAvailable = false;

  if (installShapes.length > 0 && excludeShapes.length > 0) {
    const main = installShapes[0];
    const ex = excludeShapes[0];

    if (ex.margins && ex.margins.left && ex.margins.right && ex.margins.top && ex.margins.bottom) {
      const W = Number(main.overallW)||0;
      const H = Number(main.overallH)||0;
      const L = Number(ex.margins.left);
      const R = Number(ex.margins.right);
      const T = Number(ex.margins.top);
      const B = Number(ex.margins.bottom);

      const splitPieces = [
        { w: L, h: H },
        { w: R, h: H },
        { w: W - L - R, h: T },
        { w: W - L - R, h: B }
      ].filter(p => p.w > 0 && p.h > 0);

      splitResult = calcPiecesYardage(splitPieces, fabric);
      isSplitAvailable = true;
    }
  }

  let appliedMethod = wall.calcMethod || 'auto';
  let finalYards, finalWidths, methodText;

  if (isSplitAvailable) {
    const recommended = wholeResult.yards <= splitResult.yards ? 'whole' : 'split';
    if (appliedMethod === 'auto') appliedMethod = recommended;

    if (appliedMethod === 'whole') {
      finalYards = wholeResult.yards;
      finalWidths = wholeResult.widths;
      methodText = 'แบบคิดรวม (ติดทับช่องว่าง)';
    } else {
      finalYards = splitResult.yards;
      finalWidths = splitResult.widths;
      methodText = 'แบบคิดแยกช่วง (บน,ล่าง,ซ้าย,ขวา)';
    }
  } else {
    appliedMethod = 'whole';
    finalYards = wholeResult.yards;
    finalWidths = wholeResult.widths;
    methodText = 'แบบคิดพื้นที่รวมทั้งหมด';
  }

  finalYards = ceil1(finalYards);

  return {
    yards: finalYards,
    sqm: totalSqm,
    fabricCost: finalYards * Number(fabric.pricePerYard),
    installCost: totalSqm * Number(fabric.installPricePerSqm),
    requiredWidths: finalWidths,
    methodText,
    appliedMethod,
    availableMethods: { whole: wholeResult, split: splitResult }
  };
};

// --- Main App Component ---
export default function App() {
  const [fbUser, setFbUser] = useState(null);
  const [appUser, setAppUser] = useState(null); 
  const [isInitializing, setIsInitializing] = useState(true);
  const [dbError, setDbError] = useState(''); // ดักจับ Error จาก Firebase

  const [dbUsers, setDbUsers] = useState([]);
  const [dbFabrics, setDbFabrics] = useState([]);
  const [dbProjects, setDbProjects] = useState([]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [saveStatus, setSaveStatus] = useState('');
  
  const [newUserForm, setNewUserForm] = useState(null);
  const [newUserError, setNewUserError] = useState('');

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeWallId, setActiveWallId] = useState(null);

  // --- 1. Initialize Firebase Auth ---
  useEffect(() => {
    if (!auth) { setIsInitializing(false); return; }
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth init failed", e);
        setDbError('เชื่อมต่อล้มเหลว: กรุณาไปที่ Firebase Console > Authentication > Sign-in method แล้วเปิดใช้งานเมนู "Anonymous" ก่อนครับ');
        setIsInitializing(false);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
    });
    return () => unsub();
  }, []);

  // --- 2. Sync Firestore Data ---
  useEffect(() => {
    if (!fbUser || !db) return;

    const handleDbError = (err) => {
      console.error("DB Error:", err);
      if (err.code === 'permission-denied') {
        setDbError('สิทธิ์เข้าถึงถูกปฏิเสธ: กรุณาไปที่ Firebase Console > Firestore Database > Rules แล้วแก้ไขบรรทัด allow read, write เป็น if true; ก่อนครับ');
        setIsInitializing(false);
      }
    };

    // Users
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersRef, (snap) => {
      const loaded = [];
      snap.forEach(doc => loaded.push(doc.data()));
      if (!loaded.find(u => u.username === 'Admin')) {
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'Admin'), {
          username: 'Admin', name: 'Administrator', password: '1234', role: 'admin'
        }).catch(handleDbError);
      }
      setDbUsers(loaded);
      setDbError(''); // ลบแจ้งเตือนเมื่อดึงข้อมูลได้สำเร็จ
    }, handleDbError);

    // Fabrics
    const fabricsRef = collection(db, 'artifacts', appId, 'public', 'data', 'fabrics');
    const unsubFabrics = onSnapshot(fabricsRef, (snap) => {
      const loaded = [];
      snap.forEach(doc => loaded.push(doc.data()));
      if (loaded.length === 0) {
        const f1 = { id: 'f1', name: 'PASAYA Wall Elegance', width: 137, vRepeat: 35, pricePerYard: 1250, installPricePerSqm: 350 };
        const f2 = { id: 'f2', name: 'PASAYA Smooth Solid', width: 137, vRepeat: 0, pricePerYard: 950, installPricePerSqm: 350 };
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fabrics', f1.id), f1).catch(handleDbError);
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fabrics', f2.id), f2).catch(handleDbError);
        loaded.push(f1, f2);
      }
      setDbFabrics(loaded);
    }, handleDbError);

    // Projects
    const projectsRef = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    const unsubProjects = onSnapshot(projectsRef, (snap) => {
      const loaded = [];
      snap.forEach(doc => loaded.push(doc.data()));
      setDbProjects(loaded);
    }, handleDbError);

    return () => { unsubUsers(); unsubFabrics(); unsubProjects(); };
  }, [fbUser]);

  // --- 3. Handle Auto-Login ---
  useEffect(() => {
    if (dbUsers.length > 0 && isInitializing) {
      const savedUserStr = localStorage.getItem('pasaya_appUser');
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        const dbUser = dbUsers.find(u => u.username === savedUser.username && u.password === savedUser.password);
        if (dbUser) {
          setAppUser(dbUser);
          setActiveTab(localStorage.getItem('pasaya_activeTab') || 'dashboard');
          setActiveProjectId(localStorage.getItem('pasaya_activeProjectId') || null);
        } else {
          localStorage.removeItem('pasaya_appUser');
        }
      }
      setIsInitializing(false);
    }
  }, [dbUsers, isInitializing]);

  // --- 4. Sync Local Projects ---
  useEffect(() => {
    if (!appUser) return;
    let viewableProjects = dbProjects;
    if (appUser.role !== 'admin') {
      viewableProjects = dbProjects.filter(p => p.ownerId === appUser.username);
    }
    
    setProjects(viewableProjects);
    
    if (activeProjectId && !viewableProjects.find(p => p.id === activeProjectId)) {
      setActiveProjectId(viewableProjects[0]?.id || null);
    }
    // ปิดแจ้งเตือน eslint เพื่อป้องกัน loop ของ Vercel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbProjects, appUser]);

  useEffect(() => {
    if (appUser) {
      localStorage.setItem('pasaya_activeTab', activeTab);
      if (activeProjectId) localStorage.setItem('pasaya_activeProjectId', activeProjectId);
    }
  }, [activeTab, activeProjectId, appUser]);

  // --- Helpers ---
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeRoom = activeProject?.rooms.find(r => r.id === activeRoomId);
  const activeWall = activeRoom?.walls.find(w => w.id === activeWallId);

  const updateProject = (updates) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...updates } : p));
  };

  const updateActiveWall = (updates) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      return {
        ...p,
        rooms: p.rooms.map(r => {
          if (r.id !== activeRoomId) return r;
          return {
            ...r,
            walls: r.walls.map(w => w.id === activeWallId ? { ...w, ...updates } : w)
          };
        })
      };
    }));
  };

  const createNewProject = () => {
    const newProj = {
      id: generateId(),
      ownerId: appUser.username,
      name: `งานติดตั้งหน้างาน ${new Date().toLocaleDateString('th-TH')}`,
      customer: { name: '', phone: '', address: '' },
      rooms: [{ id: generateId(), name: 'Master Bedroom', isExpanded: true, walls: [] }],
      globalDiscount: 0,
      extraExpenses: [
        { id: generateId(), name: 'ค่านั่งร้าน', amount: 0 },
        { id: generateId(), name: 'ค่าเดินทาง', amount: 0 }
      ],
      createdAt: new Date().toISOString()
    };
    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', newProj.id), newProj);
    setActiveProjectId(newProj.id);
    setActiveTab('project');
  };

  const saveToCloud = async () => {
    if (!fbUser || !appUser) return;
    try {
      if (activeProject) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', activeProject.id), activeProject);
      }
      if (appUser.role === 'admin') {
        for (const f of dbFabrics) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fabrics', f.id), f);
        }
      }
      setSaveStatus('บันทึกขึ้น Cloud สำเร็จ!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (e) {
      console.error("Save error", e);
      setSaveStatus('บันทึกผิดพลาด! อาจเกิดจากสิทธิ์ Firebase');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  // --- Render Login ---
  const [loginForm, setLoginForm] = useState({ user: '', pass: '', remember: true });
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const user = dbUsers.find(u => u.username === loginForm.user && u.password === loginForm.pass);
    if (user) {
      setAppUser(user);
      if (loginForm.remember) {
        localStorage.setItem('pasaya_appUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('pasaya_appUser');
      }
      setLoginError('');
    } else {
      setLoginError('รหัสพนักงาน หรือ รหัสผ่าน ไม่ถูกต้อง');
    }
  };

  if (isInitializing && !dbError) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100 font-sans">กำลังเชื่อมต่อฐานข้อมูล Firebase...</div>;
  }

  if (!appUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          
          {dbError && (
             <div className="mb-6 p-4 bg-red-100 text-red-800 text-xs rounded-lg border border-red-300 shadow-sm leading-relaxed">
               <h3 className="font-bold mb-1 text-sm flex items-center gap-1"><AlertCircle size={16}/> ข้อผิดพลาดจาก Firebase</h3>
               {dbError}
             </div>
          )}

          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-blue-900 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg">P</div>
            <h1 className="text-2xl font-bold text-gray-800">PASAYA Wall Fabric</h1>
            <p className="text-sm text-gray-500 mt-1">เข้าสู่ระบบเพื่อจัดการหน้างาน</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสพนักงาน (Username)</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-3 text-gray-400" />
                <input 
                  type="text" required value={loginForm.user} disabled={!!dbError}
                  onChange={e => setLoginForm({...loginForm, user: e.target.value})}
                  className="w-full border pl-10 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสผ่าน (Password)</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-3 top-3 text-gray-400" />
                <input 
                  type="password" required value={loginForm.pass} disabled={!!dbError}
                  onChange={e => setLoginForm({...loginForm, pass: e.target.value})}
                  className="w-full border pl-10 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100" 
                />
              </div>
            </div>
            {loginError && <div className="text-xs text-red-500 text-center font-medium bg-red-50 py-2 rounded">{loginError}</div>}
            <div className="flex items-center">
              <input 
                type="checkbox" id="remember" checked={loginForm.remember} disabled={!!dbError}
                onChange={e => setLoginForm({...loginForm, remember: e.target.checked})}
                className="mr-2 cursor-pointer w-4 h-4 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">จดจำการเข้าสู่ระบบ</label>
            </div>
            <button type="submit" disabled={!!dbError} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('pasaya_appUser');
    localStorage.removeItem('pasaya_activeTab');
    localStorage.removeItem('pasaya_activeProjectId');
    setAppUser(null);
  };

  // --- Render Admin Users Management ---
  const renderUsersManage = () => {
    if (appUser.role !== 'admin') return null;

    const handleSaveNewUser = () => {
      const uname = newUserForm.username.trim();
      if (!uname) {
        setNewUserError('กรุณากรอกรหัสพนักงาน (Username)');
        return;
      }
      if (dbUsers.find(u => u.username.toLowerCase() === uname.toLowerCase())) {
        setNewUserError('รหัสพนักงานนี้มีอยู่ในระบบแล้ว');
        return;
      }
      setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uname), {
        ...newUserForm, username: uname
      });
      setNewUserForm(null);
      setNewUserError('');
    };

    return (
      <div className="p-6 max-w-5xl mx-auto animate-fadeIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">จัดการพนักงาน (Users)</h2>
          <button 
            onClick={() => {
              setNewUserForm({ username: '', name: '', password: '', role: 'employee' });
              setNewUserError('');
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            disabled={newUserForm !== null}
          >
            <Plus size={18} /> เพิ่มพนักงาน
          </button>
        </div>
        {newUserError && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm border border-red-200 flex items-center gap-2"><AlertCircle size={16}/> {newUserError}</div>}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 text-sm font-semibold text-gray-600 w-1/5">รหัส (Username)</th>
                <th className="p-4 text-sm font-semibold text-gray-600 w-1/4">ชื่อ-นามสกุล</th>
                <th className="p-4 text-sm font-semibold text-gray-600 w-1/4">รหัสผ่าน</th>
                <th className="p-4 text-sm font-semibold text-gray-600 w-1/5">สิทธิ์ (Role)</th>
                <th className="p-4 text-center text-sm font-semibold text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {newUserForm && (
                <tr className="border-b bg-blue-50/50">
                  <td className="p-3">
                    <input type="text" placeholder="กำหนด Username" value={newUserForm.username} onChange={e => setNewUserForm({...newUserForm, username: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white" autoFocus />
                  </td>
                  <td className="p-3">
                    <input type="text" placeholder="ชื่อพนักงาน" value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                  </td>
                  <td className="p-3">
                    <input type="text" placeholder="รหัสผ่าน" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                  </td>
                  <td className="p-3">
                    <select value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value})} className="border p-2 rounded outline-none w-full bg-white">
                      <option value="employee">พนักงาน (Employee)</option>
                      <option value="admin">แอดมิน (Admin)</option>
                    </select>
                  </td>
                  <td className="p-3 text-center flex justify-center gap-2 mt-1">
                    <button onClick={handleSaveNewUser} className="bg-green-500 text-white p-1.5 rounded hover:bg-green-600 transition shadow-sm" title="บันทึก">
                      <CheckCircle2 size={18} />
                    </button>
                    <button onClick={() => { setNewUserForm(null); setNewUserError(''); }} className="bg-gray-400 text-white p-1.5 rounded hover:bg-gray-500 transition shadow-sm" title="ยกเลิก">
                      <X size={18} />
                    </button>
                  </td>
                </tr>
              )}
              {dbUsers.map(u => (
                <tr key={u.username} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{u.username}</td>
                  <td className="p-3">
                    <input type="text" value={u.name} onChange={(e) => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.username), { ...u, name: e.target.value })} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                  </td>
                  <td className="p-3">
                    <input type="text" value={u.password} onChange={(e) => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.username), { ...u, password: e.target.value })} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                  </td>
                  <td className="p-3">
                    <select value={u.role} disabled={u.username === 'Admin'} onChange={(e) => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.username), { ...u, role: e.target.value })} className="border p-2 rounded outline-none">
                      <option value="employee">พนักงาน (Employee)</option>
                      <option value="admin">แอดมิน (Admin)</option>
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    {u.username !== 'Admin' && (
                      <button onClick={() => {
                        if(window.confirm('ต้องการลบพนักงานนี้?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.username));
                      }} className="text-red-500 hover:text-red-700 p-2">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="p-6 max-w-6xl mx-auto animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">รายการงานทั้งหมด</h2>
          <p className="text-sm text-gray-500">
            {appUser.role === 'admin' ? 'แสดงงานของพนักงานทุกคน' : 'แสดงเฉพาะงานของคุณ'}
          </p>
        </div>
        <button 
          onClick={createNewProject}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> สร้างหน้างานใหม่
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300 text-gray-500">
          ยังไม่มีข้อมูลหน้างาน คลิกปุ่มสร้างหน้างานใหม่เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(proj => (
            <div key={proj.id} className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition relative">
              <h3 className="text-lg font-bold text-gray-800 mb-2 truncate">{proj.name}</h3>
              <div className="text-sm text-gray-600 space-y-1 mb-4">
                <p className="flex items-center gap-2"><User size={14}/> {proj.customer?.name || 'ไม่ได้ระบุชื่อลูกค้า'}</p>
                <p className="flex items-center gap-2"><Home size={14}/> {proj.rooms.length} ห้อง</p>
              </div>
              
              {appUser.role === 'admin' && (
                <div className="absolute top-4 right-4 bg-blue-100 text-blue-800 text-[10px] px-2 py-1 rounded font-bold uppercase">
                  {proj.ownerId}
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="text-xs text-gray-400">สร้างเมื่อ {new Date(proj.createdAt).toLocaleDateString('th-TH')}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={async () => {
                      if(window.confirm('ต้องการลบโปรเจกต์นี้ถาวรใช่หรือไม่?')) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', proj.id));
                        if (activeProjectId === proj.id) setActiveProjectId(projects[0]?.id);
                      }
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="ลบ"
                  >
                    <Trash2 size={16}/>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveProjectId(proj.id);
                      setActiveTab('project');
                    }}
                    className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-1"
                  >
                    <Edit size={14}/> จัดการ
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFabricDB = () => (
    <div className="p-6 max-w-5xl mx-auto animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">ฐานข้อมูลผ้า (Fabric Database)</h2>
        {appUser.role === 'admin' && (
          <button 
            onClick={() => setDbFabrics([...dbFabrics, { id: generateId(), name: 'New Fabric', width: 137, vRepeat: 0, pricePerYard: 0, installPricePerSqm: 350 }])}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} /> เพิ่มข้อมูลผ้า
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">ชื่อรุ่นผ้า (Fabric Name)</th>
              <th className="p-4 text-sm font-semibold text-gray-600">หน้าผ้า (ซม.)</th>
              <th className="p-4 text-sm font-semibold text-gray-600">V. Repeat (ซม.)</th>
              <th className="p-4 text-sm font-semibold text-gray-600">ราคา/หลา (฿)</th>
              <th className="p-4 text-sm font-semibold text-gray-600">ค่าติดตั้ง/ตร.ม. (฿)</th>
              {appUser.role === 'admin' && <th className="p-4 text-center text-sm font-semibold text-gray-600">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {dbFabrics.map((fabric, idx) => (
              <tr key={fabric.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-3">
                  <input type="text" value={fabric.name} disabled={appUser.role !== 'admin'}
                    onChange={(e) => { const newF = [...dbFabrics]; newF[idx].name = e.target.value; setDbFabrics(newF); }} 
                    className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-transparent disabled:border-transparent" />
                </td>
                <td className="p-3">
                  <input type="number" value={fabric.width} disabled={appUser.role !== 'admin'}
                    onChange={(e) => { const newF = [...dbFabrics]; newF[idx].width = e.target.value; setDbFabrics(newF); }} 
                    className="w-24 border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-transparent disabled:border-transparent" />
                </td>
                <td className="p-3">
                  <input type="number" value={fabric.vRepeat} disabled={appUser.role !== 'admin'}
                    onChange={(e) => { const newF = [...dbFabrics]; newF[idx].vRepeat = e.target.value; setDbFabrics(newF); }} 
                    className="w-24 border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-transparent disabled:border-transparent" />
                </td>
                <td className="p-3">
                  <input type="number" value={fabric.pricePerYard} disabled={appUser.role !== 'admin'}
                    onChange={(e) => { const newF = [...dbFabrics]; newF[idx].pricePerYard = e.target.value; setDbFabrics(newF); }} 
                    className="w-28 border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-transparent disabled:border-transparent" />
                </td>
                <td className="p-3">
                  <input type="number" value={fabric.installPricePerSqm} disabled={appUser.role !== 'admin'}
                    onChange={(e) => { const newF = [...dbFabrics]; newF[idx].installPricePerSqm = e.target.value; setDbFabrics(newF); }} 
                    className="w-28 border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-transparent disabled:border-transparent" />
                </td>
                {appUser.role === 'admin' && (
                  <td className="p-3 text-center">
                    <button onClick={() => {
                      if(window.confirm('ลบรุ่นผ้านี้?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fabrics', fabric.id));
                    }} className="text-red-500 hover:text-red-700 p-2">
                      <Trash2 size={18} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {appUser.role !== 'admin' && (
          <div className="bg-yellow-50 text-yellow-700 text-xs p-3 text-center border-t">
            สิทธิ์การแก้ไขฐานข้อมูลผ้าสงวนไว้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น
          </div>
        )}
      </div>
    </div>
  );

  const renderProjectSetup = () => {
    if(!activeProject) return <div className="p-6 text-center text-gray-500">กรุณาเลือกหรือสร้างหน้างานจากเมนู "หน้ารายการงาน" ก่อน</div>;
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden animate-fadeIn">
        <div className="bg-white border-b px-6 py-4 shadow-sm z-10 flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-4 flex-1">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1"><Home size={12}/> ชื่องาน</label>
              <input 
                type="text" value={activeProject.name} 
                onChange={e => updateProject({ name: e.target.value })}
                className="w-full font-bold text-gray-800 border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 outline-none py-1 bg-transparent"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1"><User size={12}/> ชื่อลูกค้า</label>
              <input 
                type="text" value={activeProject.customer?.name} placeholder="กรอกชื่อลูกค้า"
                onChange={e => updateProject({ customer: { ...activeProject.customer, name: e.target.value } })}
                className="w-full text-sm border p-2 rounded outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="w-48">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1"><Phone size={12}/> เบอร์โทร</label>
              <input 
                type="text" value={activeProject.customer?.phone} placeholder="เบอร์โทรศัพท์"
                onChange={e => updateProject({ customer: { ...activeProject.customer, phone: e.target.value } })}
                className="w-full text-sm border p-2 rounded outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[250px]">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1"><MapPin size={12}/> ที่อยู่ / สถานที่ติดตั้ง</label>
              <input 
                type="text" value={activeProject.customer?.address} placeholder="ที่อยู่สถานที่ติดตั้ง"
                onChange={e => updateProject({ customer: { ...activeProject.customer, address: e.target.value } })}
                className="w-full text-sm border p-2 rounded outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 bg-white border-r flex flex-col h-full">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-700">รายการพื้นที่</h3>
              <button 
                onClick={() => {
                  const newRoom = { id: generateId(), name: `ห้องใหม่ ${activeProject.rooms.length + 1}`, isExpanded: true, walls: [] };
                  updateProject({ rooms: [...activeProject.rooms, newRoom] });
                  setActiveRoomId(newRoom.id);
                  setActiveWallId(null);
                }}
                className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="เพิ่มห้อง"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {activeProject.rooms.map(room => (
                <div key={room.id} className="mb-2">
                  <div 
                    className={`flex items-center justify-between p-2 rounded cursor-pointer ${activeRoomId === room.id && !activeWallId ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
                    onClick={() => { setActiveRoomId(room.id); setActiveWallId(null); }}
                  >
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => {
                        e.stopPropagation();
                        updateProject({ rooms: activeProject.rooms.map(r => r.id === room.id ? { ...r, isExpanded: !r.isExpanded } : r) });
                      }}>
                        {room.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <input 
                        type="text" value={room.name} 
                        onChange={(e) => updateProject({ rooms: activeProject.rooms.map(r => r.id === room.id ? { ...r, name: e.target.value } : r) })}
                        onClick={e => e.stopPropagation()}
                        className="bg-transparent outline-none font-medium w-32"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if(window.confirm('ยืนยันการลบห้องนี้?')) {
                            updateProject({ rooms: activeProject.rooms.filter(r => r.id !== room.id) });
                            if(activeRoomId === room.id) { setActiveRoomId(null); setActiveWallId(null); }
                          }
                        }}
                        className="text-gray-300 hover:text-red-500 p-1" title="ลบห้อง"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          updateProject({ rooms: activeProject.rooms.map(r => r.id === room.id ? { ...r, walls: [...r.walls, { 
                            id: generateId(), name: `ผนัง ${r.walls.length + 1}`, shapes: [], fabricId: dbFabrics[0]?.id || '', color: '', discount: 0, image: null 
                          }] } : r) });
                        }}
                        className="text-gray-400 hover:text-blue-600 p-1" title="เพิ่มผนัง"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {room.isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {room.walls.map(wall => (
                        <div 
                          key={wall.id}
                          onClick={() => { setActiveRoomId(room.id); setActiveWallId(wall.id); }}
                          className={`flex items-center justify-between p-2 text-sm rounded cursor-pointer ${activeWallId === wall.id ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500' : 'text-gray-600 hover:bg-gray-50 border-l-2 border-transparent'}`}
                        >
                          <input 
                            type="text" value={wall.name} 
                            onChange={(e) => updateProject({ rooms: activeProject.rooms.map(r => r.id === room.id ? { ...r, walls: r.walls.map(w => w.id === wall.id ? { ...w, name: e.target.value } : w) } : r) })}
                            onClick={e => e.stopPropagation()}
                            className="bg-transparent outline-none w-28"
                          />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if(window.confirm('ลบผนังนี้?')) {
                                updateProject({ rooms: activeProject.rooms.map(r => r.id === room.id ? { ...r, walls: r.walls.filter(w => w.id !== wall.id) } : r) });
                                if(activeWallId === wall.id) setActiveWallId(null);
                              }
                            }}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {room.walls.length === 0 && <div className="text-xs text-gray-400 px-2 py-1">ยังไม่มีผนัง</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-gray-50 overflow-y-auto relative">
            {!activeWall ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Layout size={48} className="mb-4 text-gray-300" />
                <p>เลือกผนังจากเมนูด้านซ้าย หรือเพิ่มห้อง/ผนังใหม่เพื่อเริ่มการคำนวณ</p>
              </div>
            ) : (
              <WallEditor 
                wall={activeWall} 
                fabrics={dbFabrics} 
                updateWall={updateActiveWall} 
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderReport = () => {
    if(!activeProject) return <div className="p-6 text-center text-gray-500">กรุณาเลือกหรือสร้างหน้างานจากเมนู "หน้ารายการงาน" ก่อน</div>;
    let grandTotalYards = 0;
    let grandTotalSqm = 0;
    let totalFabricCost = 0;
    let totalWallDiscounts = 0;
    let totalInstallCost = 0;

    const handlePrint = () => {
      const originalTitle = document.title;
      const customerName = activeProject.customer?.name || 'ไม่ระบุ';
      document.title = `รายงานสรุปงาน Wall ลูกค้าคุณ${customerName}`;
      window.print();
      document.title = originalTitle;
    };

    return (
      <div className="p-6 max-w-6xl mx-auto animate-fadeIn pb-24 print:p-0 print:m-0 print:w-full">
        <div className="flex justify-between items-center mb-6 print:mb-4">
          <h2 className="text-2xl font-bold text-gray-800">รายงานสรุปงาน (Summary Report)</h2>
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition print:hidden"
          >
            <Printer size={18} /> พิมพ์ / บันทึก PDF
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl border shadow-sm mb-6 flex flex-wrap gap-6 text-sm">
          <div><span className="text-gray-500">ชื่องาน:</span> <span className="font-bold">{activeProject.name}</span></div>
          <div><span className="text-gray-500">ลูกค้า:</span> <span className="font-bold">{activeProject.customer?.name || '-'}</span></div>
          <div><span className="text-gray-500">เบอร์โทร:</span> <span>{activeProject.customer?.phone || '-'}</span></div>
          <div className="w-full"><span className="text-gray-500">สถานที่ติดตั้ง:</span> <span>{activeProject.customer?.address || '-'}</span></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-sm font-semibold text-gray-600">พื้นที่ (ห้อง/ผนัง)</th>
                <th className="p-3 text-sm font-semibold text-gray-600">รุ่นผ้า / สี</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-600">ปริมาณผ้า (หลา)</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-600">พื้นที่ (ตร.ม.)</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-600">ค่าผ้า (฿)</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-600">ค่าติดตั้ง (฿)</th>
                <th className="p-3 text-right text-sm font-semibold text-red-600">ส่วนลดค่าผ้า (%)</th>
              </tr>
            </thead>
            <tbody>
              {activeProject.rooms.map(room => (
                <React.Fragment key={room.id}>
                  <tr className="bg-blue-50/50 border-b">
                    <td colSpan="7" className="p-3 font-semibold text-blue-800">
                      {room.name}
                    </td>
                  </tr>
                  {room.walls.map(wall => {
                    const fabric = dbFabrics.find(f => f.id === wall.fabricId);
                    const calc = calculateWall(wall, fabric);
                    const discountPercent = Number(wall.discount) || 0;
                    const discountAmt = (calc.fabricCost * discountPercent) / 100;

                    grandTotalYards += calc.yards;
                    grandTotalSqm += calc.sqm;
                    totalFabricCost += calc.fabricCost;
                    totalInstallCost += calc.installCost;
                    totalWallDiscounts += discountAmt;

                    return (
                      <tr key={wall.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 pl-8 text-sm text-gray-700 flex items-center gap-2">
                          <ChevronRight size={14} className="text-gray-400" /> {wall.name}
                        </td>
                        <td className="p-3 text-sm">
                          {fabric ? `${fabric.name} ${wall.color ? `(${wall.color})` : ''}` : '-'}
                        </td>
                        <td className="p-3 text-right text-sm font-medium">{formatNum(calc.yards)}</td>
                        <td className="p-3 text-right text-sm font-medium">{formatNum(calc.sqm)}</td>
                        <td className="p-3 text-right text-sm">{formatMoney(calc.fabricCost)}</td>
                        <td className="p-3 text-right text-sm">{formatMoney(calc.installCost)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input 
                              type="number" 
                              value={wall.discount} 
                              onChange={e => {
                                updateProject({
                                  rooms: activeProject.rooms.map(r => r.id === room.id ? {
                                    ...r, walls: r.walls.map(w => w.id === wall.id ? { ...w, discount: e.target.value } : w)
                                  } : r)
                                });
                              }}
                              className="w-16 border p-1 rounded text-right text-sm focus:ring-1 focus:ring-red-500 outline-none text-red-600 print:border-none print:p-0 print:w-auto"
                            />
                            <span className="text-gray-500">%</span>
                          </div>
                          {discountAmt > 0 && <div className="text-[10px] text-red-500 mt-1">-{formatMoney(discountAmt)} ฿</div>}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border rounded-xl shadow-sm p-5 h-fit">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <Plus size={18} className="text-gray-500" /> ค่าใช้จ่ายอื่นๆ (ไม่ร่วมส่วนลด)
            </h3>
            <div className="space-y-3">
              {activeProject.extraExpenses?.map((exp, idx) => (
                <div key={exp.id} className="flex items-center gap-3">
                  <input 
                    type="text" value={exp.name} placeholder="ชื่อรายการ"
                    onChange={e => {
                      const newExp = [...activeProject.extraExpenses];
                      newExp[idx].name = e.target.value;
                      updateProject({ extraExpenses: newExp });
                    }}
                    className="flex-1 border p-2 text-sm rounded focus:ring-1 focus:ring-blue-500 outline-none print:border-none print:p-0"
                  />
                  <input 
                    type="number" value={exp.amount} placeholder="จำนวนเงิน"
                    onChange={e => {
                      const newExp = [...activeProject.extraExpenses];
                      newExp[idx].amount = e.target.value;
                      updateProject({ extraExpenses: newExp });
                    }}
                    className="w-32 border p-2 text-sm text-right rounded focus:ring-1 focus:ring-blue-500 outline-none print:border-none print:p-0 print:w-auto"
                  />
                  <button 
                    onClick={() => updateProject({ extraExpenses: activeProject.extraExpenses.filter(e => e.id !== exp.id) })}
                    className="text-gray-400 hover:text-red-500 print:hidden"
                  ><Trash2 size={16}/></button>
                </div>
              ))}
              <button 
                onClick={() => updateProject({ extraExpenses: [...(activeProject.extraExpenses || []), { id: generateId(), name: '', amount: 0 }] })}
                className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded flex items-center gap-1 print:hidden"
              >
                + เพิ่มรายการค่าใช้จ่ายอื่น
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-5 space-y-3 ml-auto w-full max-w-md">
            <h3 className="font-semibold text-gray-800 mb-2 border-b pb-2">สรุปยอดรวม</h3>
            <div className="flex justify-between text-sm text-gray-600">
              <span>รวมปริมาณผ้าทั้งหมด:</span><span className="font-medium">{formatNum(grandTotalYards)} หลา</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>รวมพื้นที่ติดตั้งทั้งหมด:</span><span className="font-medium">{formatNum(grandTotalSqm)} ตร.ม.</span>
            </div>
            
            <div className="border-t pt-3 mt-3 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>รวมค่าผ้า:</span><span>{formatMoney(totalFabricCost)} ฿</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>รวมส่วนลดค่าผ้า (รายผนัง):</span><span className="text-red-500">-{formatMoney(totalWallDiscounts)} ฿</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>ส่วนลด On-top (เฉพาะค่าผ้า):</span>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    value={activeProject.globalDiscount} 
                    onChange={e => updateProject({ globalDiscount: e.target.value })}
                    className="w-16 border p-1 rounded text-right focus:ring-1 focus:ring-red-500 outline-none text-red-600 print:border-none print:p-0 print:w-auto"
                  />
                  <span>%</span>
                </div>
              </div>
              
              {(()=>{
                 const globalDiscountPercent = Number(activeProject.globalDiscount) || 0;
                 const globalDiscountAmt = ((totalFabricCost - totalWallDiscounts) * globalDiscountPercent) / 100;
                 const netFabric = Math.max(0, totalFabricCost - totalWallDiscounts - globalDiscountAmt);
                 const effectiveInstall = Math.max(3000, totalInstallCost); 
                 const extraTotal = (activeProject.extraExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
                 const grandTotal = netFabric + effectiveInstall + extraTotal;

                 return (
                   <>
                    {globalDiscountAmt > 0 && (
                      <div className="flex justify-between text-sm text-red-500">
                        <span>หักส่วนลด On-top:</span><span>-{formatMoney(globalDiscountAmt)} ฿</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold text-gray-800 bg-gray-50 p-2 rounded mt-2">
                      <span>ยอดสุทธิค่าผ้า:</span><span>{formatMoney(netFabric)} ฿</span>
                    </div>
                    <div className="pt-3 flex justify-between text-sm text-gray-600">
                      <span>รวมค่าติดตั้ง {totalInstallCost < 3000 ? <span className="text-orange-500 text-xs">(ปรับเป็นขั้นต่ำ 3,000)</span> : ''}:</span>
                      <span>{formatMoney(effectiveInstall)} ฿</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>รวมค่าใช้จ่ายอื่นๆ:</span><span>{formatMoney(extraTotal)} ฿</span>
                    </div>
                    <div className="border-t-2 border-gray-800 pt-3 flex justify-between items-center mt-3">
                      <span className="font-bold text-gray-800 text-lg">ยอดรวมสุทธิทั้งสิ้น:</span>
                      <span className="text-2xl font-bold text-blue-700">{formatMoney(grandTotal)} ฿</span>
                    </div>
                   </>
                 );
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans print:bg-white">
      <div className="bg-white border-b shadow-sm z-20 relative print:hidden">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center text-white font-bold">P</div>
            <h1 className="text-xl font-bold text-gray-800 hidden lg:block">PASAYA Wall Fabric</h1>
          </div>
          <div className="flex space-x-1 items-center overflow-x-auto">
            {appUser.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('users')}
                className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'users' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users size={18} /> จัดการพนักงาน
              </button>
            )}
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Home size={18} /> หน้ารายการงาน
            </button>
            <button 
              onClick={() => setActiveTab('fabrics')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'fabrics' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Settings size={18} /> ฐานข้อมูลผ้า
            </button>
            <button 
              onClick={() => setActiveTab('project')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'project' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Layout size={18} /> จัดการหน้างาน
            </button>
            <button 
              onClick={() => setActiveTab('report')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'report' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <FileText size={18} /> รายงานสรุป
            </button>
            
            <div className="h-6 border-l border-gray-300 mx-2"></div>
            
            <button 
              onClick={saveToCloud}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700 transition relative"
            >
              <Save size={18} /> บันทึกข้อมูล (Cloud)
              {saveStatus && (
                <span className="absolute -bottom-8 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap animate-fadeIn flex items-center gap-1 shadow-lg">
                  <CheckCircle2 size={12}/> {saveStatus}
                </span>
              )}
            </button>
            
            <div className="flex items-center gap-3 ml-4 pl-4 border-l">
               <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-gray-800">{appUser.name}</div>
                  <div className="text-[10px] text-gray-500 uppercase">{appUser.role}</div>
               </div>
               <button onClick={handleLogout} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition" title="ออกจากระบบ">
                 <LogOut size={18} />
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'users' && renderUsersManage()}
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'fabrics' && renderFabricDB()}
        {activeTab === 'project' && renderProjectSetup()}
        {activeTab === 'report' && renderReport()}
      </div>
    </div>
  );
}

// --- Wall Editor Sub-component ---
function WallEditor({ wall, fabrics, updateWall }) {
  const [activeDrawType, setActiveDrawType] = useState('install'); 
  const fileInputRef = useRef(null);
  const imageRef = useRef(null);
  
  const [draftPoints, setDraftPoints] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null); 

  const [draftCalcMethod, setDraftCalcMethod] = useState(null);
  const [isEditingMethod, setIsEditingMethod] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    setDraftCalcMethod(wall.calcMethod || null);
    setIsEditingMethod(false);
  }, [wall.id, wall.calcMethod]);

  const [history, setHistory] = useState([wall.shapes || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // แก้ไข 1: ไม่เอา wall.shapes มาผูกกับ useEffect นี้แล้ว เพื่อไม่ให้ History รีเซ็ตตัวเอง
  useEffect(() => {
    setHistory([wall.shapes || []]);
    setHistoryIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall.id]); 

  const shapes = wall.shapes || [];
  const selectedFabric = fabrics.find(f => f.id === wall.fabricId);
  const calculations = useMemo(() => calculateWall(wall, selectedFabric), [wall, selectedFabric]);

  const commitToHistory = (newShapes) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    updateWall({ shapes: newShapes });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      updateWall({ shapes: history[historyIndex - 1] });
      setDraftPoints([]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      updateWall({ shapes: history[historyIndex + 1] });
      setDraftPoints([]);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageError('');
      const reader = new FileReader();
      reader.onloadend = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1200;
          let w = img.width, h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            if (w > h) { h *= MAX_DIM / w; w = MAX_DIM; }
            else { w *= MAX_DIM / h; h = MAX_DIM; }
          }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6); 
          updateWall({ image: compressedDataUrl, shapes: [] });
          setHistory([[]]);
          setHistoryIndex(0);
        };
        img.onerror = () => {
          setImageError('เบราว์เซอร์ไม่รองรับไฟล์รูปภาพนี้ (เช่น ไฟล์ HEIC จากมือถือบางรุ่น) กรุณาใช้ไฟล์ JPG หรือ PNG ครับ');
          setTimeout(() => setImageError(''), 7000);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBgClick = (e) => {
    if (!imageRef.current || draggingNode) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (draftPoints.length === 0) {
      setDraftPoints([{ x, y }]);
      return;
    }

    const startPt = draftPoints[0];
    const dx = x - startPt.x;
    const dy = y - startPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (draftPoints.length >= 3 && dist < 3) {
      const newShape = {
        id: generateId(),
        type: activeDrawType,
        points: [...draftPoints],
        overallW: 100, 
        overallH: 100, 
        segments: {}, 
        margins: { top: '', bottom: '', left: '', right: '' }
      };
      draftPoints.forEach((_, idx) => { newShape.segments[idx] = ''; });

      commitToHistory([...shapes, newShape]);
      setDraftPoints([]);
      setMousePos(null);
    } else {
      setDraftPoints([...draftPoints, { x, y }]);
    }
  };

  const handleSvgMouseMove = (e) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (draggingNode) {
      const newShapes = shapes.map(s => {
        if (s.id === draggingNode.shapeId) {
          const newPoints = [...s.points];
          newPoints[draggingNode.pIdx] = { x, y };
          return { ...s, points: newPoints };
        }
        return s;
      });
      updateWall({ shapes: newShapes });
    } else if (draftPoints.length > 0) {
      setMousePos({ x, y });
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingNode) {
      commitToHistory(shapes);
      setDraggingNode(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDraftPoints([]);
        setMousePos(null);
        setDraggingNode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const updateShape = (id, updates) => commitToHistory(shapes.map(s => s.id === id ? { ...s, ...updates } : s));
  const deleteShape = (id) => commitToHistory(shapes.filter(s => s.id !== id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-wrap gap-6">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผนัง</label>
          <input 
            type="text" value={wall.name} 
            onChange={(e) => updateWall({ name: e.target.value })}
            className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex-1 min-w-[250px]">
          <label className="block text-sm font-semibold text-gray-700 mb-1">เลือกรุ่นผ้า</label>
          <select 
            value={wall.fabricId} 
            onChange={(e) => updateWall({ fabricId: e.target.value })}
            className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">-- กรุณาเลือกผ้า --</option>
            {fabrics.map(f => <option key={f.id} value={f.id}>{f.name} (หน้ากว้าง {f.width}ซม. | V-Repeat {f.vRepeat}ซม.)</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="block text-sm font-semibold text-gray-700 mb-1">สีผ้า (Color)</label>
          <input 
            type="text" value={wall.color} placeholder="เช่น สีเบจ"
            onChange={(e) => updateWall({ color: e.target.value })}
            className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-5 rounded-xl border shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <ImageIcon size={18}/> รูปหน้างานและการกำหนดพื้นที่
            </h3>
            
            <div className="flex items-center gap-4">
              <div className="flex border rounded-lg overflow-hidden shadow-sm">
                <button 
                  onClick={handleUndo} disabled={historyIndex === 0}
                  className="p-1.5 px-3 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:bg-gray-100 flex items-center border-r" title="เลิกทำ"
                >
                  <Undo2 size={16}/>
                </button>
                <button 
                  onClick={handleRedo} disabled={historyIndex === history.length - 1}
                  className="p-1.5 px-3 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:bg-gray-100 flex items-center" title="ทำซ้ำ"
                >
                  <Redo2 size={16}/>
                </button>
              </div>

              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if(window.confirm('ต้องการเคลียร์พื้นที่ทั้งหมด (ทั้งพื้นที่ติดตั้งและเว้นว่าง) หรือไม่?')) {
                      setDraftPoints([]);
                      setMousePos(null);
                      setDraggingNode(null);
                      commitToHistory([]);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border flex items-center gap-1 bg-white text-red-600 hover:bg-red-50 border-red-200 shadow-sm"
                  title="ลบพื้นที่ทั้งหมด"
                >
                  <Trash2 size={16} /> ลบทั้งหมด
                </button>
                {wall.image && (
                  <button 
                    onClick={() => {
                      if(window.confirm('ต้องการเปลี่ยนรูปภาพหน้างานหรือไม่?')) {
                        updateWall({ image: null, shapes: [] });
                        setDraftPoints([]);
                        setHistory([[]]);
                        setHistoryIndex(0);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border flex items-center gap-1 bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
                  >
                    <Upload size={16} /> เปลี่ยนรูปภาพ
                  </button>
                )}
                <button 
                  onClick={() => setActiveDrawType('install')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border flex items-center gap-1 ${activeDrawType === 'install' ? 'bg-green-50 border-green-500 text-green-700 shadow-inner' : 'bg-gray-50 text-gray-600'}`}
                >
                  <SquareSquare size={16} /> พื้นที่ติดตั้ง (บวก)
                </button>
                <button 
                  onClick={() => setActiveDrawType('exclude')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border flex items-center gap-1 ${activeDrawType === 'exclude' ? 'bg-red-50 border-red-500 text-red-700 shadow-inner' : 'bg-gray-50 text-gray-600'}`}
                >
                  <X size={16} /> พื้นที่เว้นว่าง (ลบ)
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 relative overflow-hidden flex items-center justify-center min-h-[500px]">
            {!wall.image ? (
              <div className="flex flex-col items-center justify-center text-gray-500">
                <ImageIcon size={48} className="mb-3 text-gray-400" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <Upload size={18} /> เลือกรูปภาพหน้างาน
                </button>
                {imageError && <p className="text-red-500 text-sm mt-3 bg-red-50 px-3 py-1.5 rounded border border-red-200 text-center max-w-xs">{imageError}</p>}
                <input type="file" accept="image/*,.heic,.heif,.webp,.svg,.bmp" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
              </div>
            ) : (
              <div className="relative inline-block shadow-sm">
                <img 
                  ref={imageRef}
                  src={wall.image} 
                  alt="Wall" 
                  className="max-h-[600px] w-auto block select-none pointer-events-none" 
                  draggable={false}
                />
                
                <div 
                  className="absolute top-0 left-0 w-full h-full cursor-crosshair"
                  onMouseMove={handleSvgMouseMove}
                  onMouseUp={handleSvgMouseUp}
                  onMouseLeave={handleSvgMouseUp}
                >
                  <div className="absolute w-full h-full" onClick={handleBgClick}></div>
                  
                  <svg className="absolute w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {shapes.map((shape) => {
                      const color = shape.type === 'install' ? '#22c55e' : '#ef4444';
                      const fillColor = shape.type === 'install' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
                      const pts = shape.points.map(p => `${p.x},${p.y}`).join(' ');
                      return <polygon key={`poly-${shape.id}`} points={pts} fill={fillColor} stroke={color} vectorEffect="non-scaling-stroke" strokeWidth="3" />;
                    })}
                  </svg>

                  <svg className="absolute w-full h-full pointer-events-none" width="100%" height="100%">
                    {shapes.map((shape, idx) => {
                      const color = shape.type === 'install' ? '#22c55e' : '#ef4444';
                      const label = `${shape.type === 'install' ? 'A' : 'E'}${idx + 1}`;

                      return (
                        <g key={`texts-${shape.id}`}>
                          <text 
                            x={`${shape.points[0].x + 1.5}%`} 
                            y={`${shape.points[0].y - 1.5}%`} 
                            fill={color} fontSize="18" fontWeight="900" 
                            textAnchor="start" alignmentBaseline="bottom"
                            style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '4px' }}
                          >
                             {label}
                          </text>

                          {shape.points.map((p1, pIdx) => {
                            const p2 = shape.points[(pIdx + 1) % shape.points.length];
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;
                            const segLen = shape.segments[pIdx];
                            if(!segLen) return null;
                            return (
                              <text key={`seg-${pIdx}`} x={`${midX}%`} y={`${midY}%`} fill="#1f2937" fontSize="13" fontWeight="bold" textAnchor="middle" alignmentBaseline="middle" style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '4px' }}>
                                {segLen} cm
                              </text>
                            );
                          })}

                          {shape.points.map((p, pIdx) => (
                            <circle 
                              key={`pt-${pIdx}`} cx={`${p.x}%`} cy={`${p.y}%`} r="6" fill={color} stroke="white" strokeWidth="2"
                              className="cursor-move pointer-events-auto hover:r-8 transition-all"
                              onMouseDown={(e) => { e.stopPropagation(); setDraggingNode({ shapeId: shape.id, pIdx }); }}
                            />
                          ))}
                        </g>
                      );
                    })}

                    {draftPoints.length > 0 && (
                      <g>
                        {draftPoints.length > 1 && (
                          <polyline 
                            points={draftPoints.map(p => `${p.x}%,${p.y}%`).join(' ')} 
                            fill="none" stroke={activeDrawType === 'install' ? '#22c55e' : '#ef4444'} strokeWidth="3" strokeDasharray="6 4"
                          />
                        )}
                        {mousePos && (
                          <line 
                            x1={`${draftPoints[draftPoints.length - 1].x}%`} y1={`${draftPoints[draftPoints.length - 1].y}%`} 
                            x2={`${mousePos.x}%`} y2={`${mousePos.y}%`} 
                            stroke={activeDrawType === 'install' ? '#22c55e' : '#ef4444'} strokeWidth="3" strokeDasharray="6 4"
                          />
                        )}
                        {draftPoints.map((p, idx) => (
                          <circle key={`draft-${idx}`} cx={`${p.x}%`} cy={`${p.y}%`} r={idx === 0 ? "8" : "5"} fill={idx === 0 ? '#eab308' : (activeDrawType === 'install' ? '#22c55e' : '#ef4444')} stroke="white" strokeWidth="2" />
                        ))}
                      </g>
                    )}
                  </svg>
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-3 bg-blue-50 p-2 rounded-lg border border-blue-100 flex items-start gap-2">
            <MousePointer2 size={16} className="text-blue-500 mt-0.5 min-w-[16px]" />
            <div className="space-y-1">
              <p><strong>วาดพื้นที่:</strong> คลิกทีละจุดตามมุม และ <u>คลิกซ้ำที่จุดแรกสุด</u> เพื่อให้เส้นบรรจบกัน (กด ESC เพื่อยกเลิกวาด)</p>
              <p><strong>แก้ไขจุด:</strong> เมื่อวาดเสร็จแล้ว สามารถ <u className="font-semibold">คลิกค้างที่จุดกลมๆ แล้วลาก</u> เพื่อปรับแต่งขนาดและรูปทรงได้อิสระ</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 max-h-[calc(100vh-160px)] overflow-y-auto">
          <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col">
            <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">รายการพื้นที่ (Shapes)</h3>
            <div className="space-y-4 pr-1">
              {shapes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">ยังไม่ได้วาดพื้นที่</p>}
              
              {shapes.map((shape, idx) => (
                <div key={shape.id} className={`p-3 rounded-lg border shadow-sm ${shape.type === 'install' ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm ${shape.type === 'install' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                      {shape.type === 'install' ? `ติดตั้ง (A${idx+1})` : `เว้นว่าง (E${idx+1})`}
                    </span>
                    <button onClick={() => deleteShape(shape.id)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded border shadow-sm">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 bg-white p-2 rounded border">
                    <div>
                      <label className="text-[10px] text-gray-500 font-semibold uppercase">กว้างรวม (Overall W)</label>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" value={shape.overallW} 
                          onChange={(e) => updateShape(shape.id, { overallW: e.target.value })}
                          className="w-full border-b px-1 py-0.5 text-sm outline-none focus:border-blue-500 font-medium" placeholder="ซม." 
                        />
                        <span className="text-xs text-gray-400">ซม.</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-semibold uppercase">สูงรวม (Overall H)</label>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" value={shape.overallH} 
                          onChange={(e) => updateShape(shape.id, { overallH: e.target.value })}
                          className="w-full border-b px-1 py-0.5 text-sm outline-none focus:border-blue-500 font-medium" placeholder="ซม." 
                        />
                        <span className="text-xs text-gray-400">ซม.</span>
                      </div>
                    </div>
                  </div>

                  {shape.type === 'exclude' && (
                    <div className="mb-3 bg-red-100/50 p-2 rounded border border-red-200">
                      <label className="text-[10px] text-red-700 font-semibold uppercase block mb-1">ระยะขอบเชื่อมกับวงกบ (จะแบ่งคำนวณแยกช่วงให้)</label>
                      <div className="grid grid-cols-4 gap-1">
                        {['top', 'bottom', 'left', 'right'].map(pos => (
                          <div key={pos} className="text-center">
                            <label className="text-[9px] text-gray-600 block">{pos === 'top'?'บน':pos==='bottom'?'ล่าง':pos==='left'?'ซ้าย':'ขวา'}</label>
                            <input 
                              type="number" value={shape.margins[pos]} 
                              onChange={(e) => updateShape(shape.id, { margins: { ...shape.margins, [pos]: e.target.value } })}
                              className="w-full border p-0.5 rounded text-xs text-center outline-none bg-white font-medium" 
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <details className="group mt-2">
                    <summary className="text-xs font-semibold text-gray-700 cursor-pointer flex justify-between items-center bg-white border p-2 rounded shadow-sm hover:bg-gray-50">
                      <span>ระบุขนาดแต่ละช่วงเส้น ({shape.points.length} เส้น)</span>
                      <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="grid grid-cols-2 gap-2 mt-2 bg-white p-2 rounded border">
                      {shape.points.map((p, pIdx) => {
                        const nextIdx = (pIdx + 1) % shape.points.length;
                        return (
                          <div key={pIdx} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 w-12 text-right pr-1 font-medium text-[10px]">P{pIdx+1}-P{nextIdx+1}:</span>
                            <div className="flex-1 flex items-center border rounded px-1 bg-gray-50 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-400">
                              <input 
                                type="number" 
                                value={shape.segments[pIdx]} 
                                onChange={(e) => updateShape(shape.id, { 
                                  segments: { ...shape.segments, [pIdx]: e.target.value } 
                                })}
                                className="w-full p-1 outline-none text-right bg-transparent font-medium" placeholder="0"
                              />
                              <span className="text-[9px] text-gray-400 pl-1">ซม.</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-900 text-white p-5 rounded-xl shadow-lg mt-auto sticky bottom-0">
            <h3 className="font-semibold text-blue-100 mb-3 border-b border-blue-800 pb-2">ผลการคำนวณผนังนี้</h3>
            
            {!selectedFabric ? (
              <p className="text-sm text-blue-300">กรุณาเลือกรุ่นผ้าเพื่อดูผลคำนวณ</p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-blue-200 text-sm">ปริมาณผ้าที่ต้องใช้:</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{formatNum(calculations.yards)}</span>
                    <span className="text-sm ml-1 text-blue-300">หลา</span>
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-blue-200 text-sm">พื้นที่ติดตั้งสุทธิ:</span>
                  <div className="text-right">
                    <span className="text-xl font-bold">{formatNum(calculations.sqm)}</span>
                    <span className="text-sm ml-1 text-blue-300">ตร.ม.</span>
                  </div>
                </div>

                {calculations.availableMethods.split && (() => {
                  const activeDraftMethod = draftCalcMethod || calculations.appliedMethod;
                  const isConfirmed = wall.calcMethod === activeDraftMethod;
                  const showOptions = !isConfirmed || isEditingMethod;
                  
                  if (!showOptions) {
                    return (
                      <div className="mt-3 flex justify-between items-center bg-blue-800/80 p-2.5 rounded-lg border border-blue-700 shadow-inner">
                         <div className="text-xs">
                            <span className="text-blue-300">รูปแบบการคิดผ้า: </span>
                            <span className="font-semibold text-green-300 ml-1">
                               {activeDraftMethod === 'whole' ? 'คิดรวมติดทับช่องว่าง' : 'คิดแยกช่วง (บน,ล่าง,ซ้าย,ขวา)'}
                            </span>
                         </div>
                         <button 
                           onClick={() => setIsEditingMethod(true)} 
                           className="text-xs text-blue-200 bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded transition border border-blue-600"
                         >
                           เปลี่ยน
                         </button>
                      </div>
                    );
                  }

                  return (
                  <div className="mt-4 p-3 bg-blue-800/80 rounded-lg text-sm border border-blue-700 shadow-inner">
                     <div className="flex items-center justify-between mb-3 border-b border-blue-700/50 pb-2">
                       <p className="font-semibold text-blue-100 flex items-center gap-1">
                          <AlertCircle size={16} className="text-yellow-400" /> เลือกรูปแบบการคิดผ้า:
                       </p>
                       <div className="flex gap-2">
                         {isEditingMethod && isConfirmed && (
                           <button 
                             onClick={() => {
                               setIsEditingMethod(false);
                               setDraftCalcMethod(wall.calcMethod);
                             }}
                             className="text-blue-200 hover:text-white px-2 py-1 rounded text-xs transition"
                           >
                              ยกเลิก
                           </button>
                         )}
                         <button 
                            onClick={() => {
                              updateWall({ calcMethod: activeDraftMethod });
                              setIsEditingMethod(false);
                            }}
                            className="bg-yellow-500 hover:bg-yellow-400 text-yellow-900 px-3 py-1 rounded text-xs font-bold shadow transition flex items-center gap-1 animate-pulse"
                         >
                            กดยืนยัน
                         </button>
                       </div>
                     </div>
                     <div className="space-y-3">
                        <label className={`flex items-start gap-2 cursor-pointer p-2 rounded border transition ${activeDraftMethod === 'whole' ? 'bg-blue-700 border-blue-400 shadow-md' : 'border-transparent hover:bg-blue-800'}`}>
                           <input type="radio" name={`calc-${wall.id}`}
                              checked={activeDraftMethod === 'whole'}
                              onChange={() => setDraftCalcMethod('whole')}
                              className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500" />
                           <div className="flex-1">
                              <div className={`font-medium ${calculations.availableMethods.whole.yards <= calculations.availableMethods.split.yards ? 'text-green-300' : 'text-blue-200'}`}>
                                 คิดรวมติดทับช่องว่าง (ใช้ {formatNum(calculations.availableMethods.whole.yards)} หลา)
                                 {calculations.availableMethods.whole.yards <= calculations.availableMethods.split.yards && ' ✨ แนะนำ'}
                              </div>
                              <div className="text-[10px] text-blue-200 opacity-80 mt-0.5">นำชิ้นใหญ่มาคิดรวม (ลดปัญหาการต่อลาย)</div>
                           </div>
                        </label>
                        <label className={`flex items-start gap-2 cursor-pointer p-2 rounded border transition ${activeDraftMethod === 'split' ? 'bg-blue-700 border-blue-400 shadow-md' : 'border-transparent hover:bg-blue-800'}`}>
                           <input type="radio" name={`calc-${wall.id}`}
                              checked={activeDraftMethod === 'split'}
                              onChange={() => setDraftCalcMethod('split')}
                              className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500" />
                           <div className="flex-1">
                              <div className={`font-medium ${calculations.availableMethods.split.yards < calculations.availableMethods.whole.yards ? 'text-green-300' : 'text-blue-200'}`}>
                                 คิดแยกช่วง บน,ล่าง,ซ้าย,ขวา (ใช้ {formatNum(calculations.availableMethods.split.yards)} หลา)
                                 {calculations.availableMethods.split.yards < calculations.availableMethods.whole.yards && ' ✨ แนะนำ'}
                              </div>
                              <div className="text-[10px] text-blue-200 opacity-80 mt-0.5">แบ่งคำนวณแยกเพื่อประหยัดพื้นที่</div>
                           </div>
                        </label>
                     </div>
                     {!isConfirmed && (
                       <div className="mt-3 text-[10px] text-yellow-300 text-center font-medium bg-yellow-900/30 p-1.5 rounded">
                         * ยอดรวมด้านบนและในรายงาน จะอัปเดตเมื่อกดยืนยันแล้วเท่านั้น
                       </div>
                     )}
                  </div>
                  );
                })()}

                <div className="text-[11px] text-blue-300 border-t border-blue-800 pt-3 mt-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span>จำนวนหน้าผ้า (Widths):</span><span className="font-semibold text-white">{calculations.requiredWidths}</span>
                  </div>
                  {!calculations.availableMethods.split && (
                    <div className="flex justify-between items-center mt-1">
                      <span>รูปแบบการคำนวณ:</span>
                      <span className="font-semibold text-white bg-blue-800 px-2 py-0.5 rounded">{calculations.methodText}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}