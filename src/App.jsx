import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, serverTimestamp, getDocs } from 'firebase/firestore'; 
import { Clock, User, LogOut, CheckCircle, AlertTriangle, XCircle, Home, send, Activity, Users, Truck, Pill, TestTube, Edit, Plus, MessageSquare, Clipboard, MapPin, FolderOpen, Loader } from 'lucide-react';

// --- CONFIGURATION AND INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyD2thRhMrLmBL60ZJjd3quhhFVnF50X6aY",
  authDomain: "hems-project-3283b.firebaseapp.com",
  projectId: "hems-project-3283b",
  storageBucket: "hems-project-3283b.firebasestorage.app",
  messagingSenderId: "290561313018",
  appId: "1:290561313018:web:c008eca93fc7b61fcaa143"
};

const appId = firebaseConfig.projectId;
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const generatePatientId = () => `PID-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

// --- ROLE DEFINITIONS AND PERMISSIONS ---
const RolePermissions = {
    'طبيب': { canTriage: false, canTreat: true, canClose: true, canViewAll: false, pharmacy: true, nursing: true, lab: true, title: 'طبيب طوارئ' },
    'ممرض': { canTriage: false, canTreat: false, canClose: false, canViewAll: false, pharmacy: false, nursing: true, lab: true, title: 'ممرض' },
    'استقبال/فرز': { canTriage: true, canTreat: false, canClose: false, canViewAll: false, pharmacy: false, nursing: false, lab: false, title: 'استقبال' },
    'صيدلي': { canTriage: false, canTreat: false, canClose: false, canViewAll: false, pharmacy: true, nursing: false, lab: false, title: 'صيدلي' },
    'إدارة (لوحة تحكم)': { canTriage: false, canTreat: false, canClose: false, canViewAll: true, pharmacy: true, nursing: true, lab: true, title: 'مدير النظام' },
};

// --- UTILITY COMPONENTS ---
const StatusBadge = ({ status, className = '' }) => {
    let style = "text-xs font-semibold px-2.5 py-0.5 rounded-full ";
    let icon;

    switch (status) {
        case 'Available':
        case 'متفرغ':
            style += "bg-green-100 text-green-800";
            icon = <CheckCircle size={14} />;
            break;
        case 'Busy':
        case 'مشغول':
            style += "bg-yellow-100 text-yellow-800";
            icon = <AlertTriangle size={14} />;
            break;
        case 'On-Call':
        case 'مناوبة':
            style += "bg-blue-100 text-blue-800";
            icon = <Clock size={14} />;
            break;
        case 'Unavailable':
        case 'غير متوفر':
            style += "bg-red-100 text-red-800";
            icon = <XCircle size={14} />;
            break;
        default:
            style += "bg-gray-100 text-gray-800";
            icon = <Loader size={14} className="animate-spin" />;
    }

    return (
        <span className={`${style} flex items-center gap-1 ${className}`}>
            {icon}
            {status}
        </span>
    );
};

const PriorityBadge = ({ level }) => {
    let style = "px-3 py-1 text-sm font-bold text-white rounded-full ";
    let icon;

    switch (level) {
        case 'أحمر':
            style += "bg-red-600 animate-pulse";
            icon = <AlertTriangle size={16} />;
            break;
        case 'أصفر':
            style += "bg-yellow-600";
            icon = <AlertTriangle size={16} />;
            break;
        case 'أخضر':
            style += "bg-green-600";
            icon = <CheckCircle size={16} />;
            break;
        default:
            style += "bg-gray-500";
            icon = <Clock size={16} />;
    }

    return (
        <span className={`${style} flex items-center gap-1`}>
            {icon}
            {level}
        </span>
    );
};

const ProcessStatusBadge = ({ status }) => {
    let style = "text-xs font-semibold px-2.5 py-0.5 rounded-full ";
    let icon;

    switch (status) {
        case 'Received':
        case 'تم الاستلام':
            style += "bg-blue-100 text-blue-800";
            icon = <Clipboard size={12} />;
            break;
        case 'In Progress':
        case 'قيد التنفيذ':
            style += "bg-yellow-100 text-yellow-800";
            icon = <Activity size={12} />;
            break;
        case 'Done':
        case 'مكتمل':
            style += "bg-green-100 text-green-800";
            icon = <CheckCircle size={12} />;
            break;
        case 'متواجد':
            style += "bg-green-200 text-green-800";
            icon = <MapPin size={12} />;
            break;
        case 'غير متواجد':
            style += "bg-red-200 text-red-800";
            icon = <XCircle size={12} />;
            break;
        default:
            style += "bg-gray-100 text-gray-800";
            icon = <Loader size={12} className="animate-spin" />;
    }

    return (
        <span className={`${style} flex items-center gap-1`}>
            {icon}
            {status}
        </span>
    );
};

// --- CORE FIREBASE HOOKS ---
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userInfo, setUserInfo] = useState(null);
    const [isUserSetup, setIsUserSetup] = useState(false);

    const fetchUserInfo = useCallback(async (uid) => {
        if (!uid) {
            setUserInfo(null);
            setIsUserSetup(false);
            return;
        }
        try {
            const docRef = doc(db, `artifacts/${appId}/public/data/users`, uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setUserInfo(docSnap.data());
                setIsUserSetup(true);
            } else {
                setUserInfo(null);
                setIsUserSetup(false);
            }
        } catch (error) {
            console.error("Error fetching user info:", error);
            setUserInfo(null);
            setIsUserSetup(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                fetchUserInfo(currentUser.uid);
            } else {
                setUser(null);
                setUserInfo(null);
                setIsUserSetup(false);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [fetchUserInfo]);

    const login = async (email, password) => {
        try {
            setIsLoading(true);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await fetchUserInfo(userCredential.user.uid);
        } catch (error) {
            throw new Error('خطأ في تسجيل الدخول. تأكد من الإيميل وكلمة المرور.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const setupUser = async (name, role) => {
        if (!user || isUserSetup) return;
        try {
            const userRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
            const userData = {
                id: user.uid,
                email: user.email,
                name: name,
                role: role,
                status: 'Unavailable',
                isClockedIn: false,
                createdAt: serverTimestamp(),
            };
            await setDoc(userRef, userData);
            setUserInfo(userData);
            setIsUserSetup(true);
        } catch (error) {
            throw new Error('خطأ في إعداد ملف المستخدم بعد تسجيل الدخول.');
        }
    };

    const logout = async () => {
        try {
            if (user?.uid && userInfo?.isClockedIn) {
                 const userRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
                 await updateDoc(userRef, { status: 'Unavailable', isClockedIn: false });
            }
            await signOut(auth);
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    const userRole = userInfo?.role;
    const permissions = RolePermissions[userRole] || {};

    return { user, userInfo, userRole, permissions, isLoading, login, logout, db, auth, isUserSetup, setupUser };
};

const useFirestoreCollections = (userId, permissions) => {
    const [cases, setCases] = useState([]);
    const [users, setUsers] = useState([]);
    const [beds, setBeds] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (!userId || !permissions.title) return;

        setIsLoadingData(true);
        let casesQuery;

        if (permissions.canViewAll) {
            casesQuery = collection(db, `artifacts/${appId}/public/data/cases`);
        } else if (permissions.canTreat) {
            casesQuery = query(collection(db, `artifacts/${appId}/public/data/cases`), where('status', 'in', ['Triage', 'Active']));
        } else {
            casesQuery = query(collection(db, `artifacts/${appId}/public/data/cases`), where('status', 'in', ['Active']));
        }

        const unsubscribe = onSnapshot(casesQuery, (snapshot) => {
            const fetchedCases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            let filteredCases = fetchedCases;
            if (permissions.canTreat && !permissions.canViewAll) {
                filteredCases = fetchedCases.filter(c => c.assignedToId === userId || !c.assignedToId);
            }

            filteredCases.sort((a, b) => {
                const priorityOrder = { 'أحمر': 1, 'أصفر': 2, 'أخضر': 3 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                return b.timestamp?.toMillis() - a.timestamp?.toMillis(); 
            });

            setCases(filteredCases);
            setIsLoadingData(false);
        }, (error) => {
            console.error("Error fetching cases:", error);
            setIsLoadingData(false);
        });

        return () => unsubscribe();
    }, [userId, permissions]);

    useEffect(() => {
        if (!userId) return;
        const usersQuery = collection(db, `artifacts/${appId}/public/data/users`);
        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
            const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(fetchedUsers);
        }, (error) => {
            console.error("Error fetching users:", error);
        });

        return () => unsubscribe();
    }, [userId]);

    useEffect(() => {
        const bedsQuery = collection(db, `artifacts/${appId}/public/data/beds`);
        const unsubscribe = onSnapshot(bedsQuery, async (snapshot) => {
            if (snapshot.empty) {
                for (let i = 1; i <= 10; i++) {
                    const bedId = `bed_${i}`;
                    const bedRef = doc(db, `artifacts/${appId}/public/data/beds`, bedId);
                    await setDoc(bedRef, { isOccupied: false, bedNumber: i, currentCaseId: null, id: bedId })
                        .catch(err => console.error("Bed init error:", err));
                }
                const newSnapshot = await getDocs(bedsQuery);
                const fetchedBeds = newSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setBeds(fetchedBeds.sort((a, b) => a.bedNumber - b.bedNumber));
            } else {
                 const fetchedBeds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                 setBeds(fetchedBeds.sort((a, b) => a.bedNumber - b.bedNumber));
            }
        }, (error) => {
            console.error("Error fetching beds:", error);
        });

        return () => unsubscribe();
    }, []);

    return { cases, users, beds, isLoadingData };
};

const updateProcessStatus = async (caseId, processType, newStatus) => {
    try {
        const caseRef = doc(db, `artifacts/${appId}/public/data/cases`, caseId);
        await updateDoc(caseRef, {
            [`processes.${processType}.status`]: newStatus,
            [`processes.${processType}.lastUpdated`]: serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating process status:", error);
    }
};

// --- VIEWS ---
const UserProfileSetup = ({ user, setupUser, isLoading }) => {
    const [name, setName] = useState('');
    const [role, setRole] = useState('طبيب');
    const [error, setError] = useState(null);
    const roles = Object.keys(RolePermissions);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!name || !role) {
            setError('الرجاء إدخال الاسم واختيار الدور.');
            return;
        }
        try {
            await setupUser(name, role);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h1 className="text-3xl font-extrabold text-red-700 text-center mb-2">إعداد الملف الشخصي</h1>
                <p className="text-lg text-gray-600 text-center mb-8">أكمل بياناتك لتحديد الصلاحيات</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 text-lg"
                            placeholder="معتز عاطف"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-gray-700">الدور الوظيفي</label>
                        <select
                            id="role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 text-lg bg-white"
                            required
                        >
                            {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-lg font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {isLoading ? <Loader size={24} className="animate-spin" /> : 'حفظ وتسجيل الدخول'}
                    </button>
                </form>
                {error && <div className="mt-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">{error}</div>}
            </div>
        </div>
    );
};

const LoginScreen = ({ login, isLoading }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!email || !password) {
            setError('الرجاء إدخال الإيميل وكلمة المرور.');
            return;
        }
        try {
            await login(email, password);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h1 className="text-4xl font-extrabold text-red-700 text-center mb-2">نظام إدارة طوارئ (HEMS)</h1>
                <p className="text-lg text-gray-600 text-center mb-8">تسجيل الدخول عبر الإيميل والباسورد</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">البريد الإلكتروني</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 text-lg"
                            placeholder="example@hosp.com"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">كلمة المرور</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 text-lg"
                            placeholder="******"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-lg font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {isLoading ? <Loader size={24} className="animate-spin" /> : 'تسجيل الدخول'}
                    </button>
                </form>
                {error && <div className="mt-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">{error}</div>}
                <div className="mt-8 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm text-center">
                    **ملاحظة الأمان:** لا يمكن إنشاء حسابات من هنا. يجب على الإدارة إنشاء الحسابات أولاً عبر لوحة تحكم Firebase.
                </div>
            </div>
        </div>
    );
};

const TimeClock = ({ userInfo, db, userId, onStatusUpdate }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState('');
    const [isClockedIn, setIsClockedIn] = useState(userInfo?.isClockedIn === true);
    const [isInsideHospital, setIsInsideHospital] = useState(true);

    useEffect(() => {
        setIsClockedIn(userInfo?.isClockedIn === true);
    }, [userInfo]);

    const handleClock = async (action) => {
        try {
            setIsProcessing(true);
            setMessage('');

            if (!userId) {
                setMessage('لا يوجد مستخدم مسجل دخول.');
                return;
            }

            if (action === 'in' && !isInsideHospital) {
                setMessage('لا يمكنك تسجيل الحضور وأنت خارج المستشفى.');
                return;
            }

            const timestamp = serverTimestamp();
            const location = isInsideHospital ? 'داخل المستشفى' : 'خارج المستشفى';

            await addDoc(collection(db, `artifacts/${appId}/public/data/attendance`), {
                userId,
                userName: userInfo?.name,
                action,
                timestamp,
                role: userInfo?.role,
                location,
                isSuccessful: true,
            });

            const userRef = doc(db, `artifacts/${appId}/public/data/users`, userId);
            const newIsClockedIn = action === 'in';
            const statusUpdate = {
                isClockedIn: newIsClockedIn,
                lastClockAction: newIsClockedIn ? 'Clocked In' : 'Clocked Out',
                status: newIsClockedIn ? 'Available' : 'Unavailable',
                lastClockUpdate: timestamp,
            };

            await setDoc(userRef, statusUpdate, { merge: true });
            onStatusUpdate(statusUpdate.status, newIsClockedIn);
            setIsClockedIn(newIsClockedIn);
            setMessage(newIsClockedIn ? 'تم تسجيل الحضور بنجاح. أنت الآن متواجد.' : 'تم تسجيل الانصراف بنجاح. أنت الآن غير متواجد.');
        } catch (error) {
            console.error("Error during clock:", error);
            setMessage('حدث خطأ أثناء العملية.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-xl max-w-lg mx-auto my-10 border border-gray-200">
            <h2 className="text-3xl font-extrabold text-gray-800 border-b pb-3 mb-5 flex items-center gap-3">
                <Clock size={28} className="text-red-600" /> ساعة الحضور والانصراف
            </h2>
            <div className="text-center mb-6">
                <p className="text-lg text-gray-600 mb-2">حالياً أنت: <strong className={isClockedIn ? "text-green-600" : "text-red-600"}>{isClockedIn ? 'مسجل حضور' : 'غير مسجل حضور'}</strong></p>
                <p className="text-2xl font-mono text-red-700">{new Date().toLocaleTimeString('ar-SA')}</p>
            </div>
            <div className="space-y-4">
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => setIsInsideHospital(prev => !prev)}
                        className={`text-sm px-3 py-1 rounded-full font-semibold transition ${isInsideHospital ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                    >
                        {isInsideHospital ? 'محاكاة: داخل المستشفى' : 'محاكاة: خارج المستشفى'}
                    </button>
                </div>
                {!isClockedIn ? (
                    <button
                        className="w-full py-4 text-xl font-bold rounded-lg shadow-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        onClick={() => handleClock('in')}
                        disabled={isProcessing || !isInsideHospital}
                    >
                        {isProcessing ? <Loader size={24} className="animate-spin" /> : <MapPin size={24} />} تسجيل دخول (بصمة الموقع)
                    </button>
                ) : (
                    <button
                        className="w-full py-4 text-xl font-bold rounded-lg shadow-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        onClick={() => handleClock('out')}
                        disabled={isProcessing}
                    >
                        {isProcessing ? <Loader size={24} className="animate-spin" /> : <LogOut size={24} />} تسجيل انصراف (خروج)
                    </button>
                )}
            </div>
            {message && <div className={`mt-6 p-4 rounded-lg text-center font-medium ${message.includes('خطأ') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message}</div>}
        </div>
    );
};

{!caseData.assignedToId && permissions.canTreat && (
    <button
        onClick={async () => {
            try {
                // 1. تحديد المسار المباشر للمستند بدقة
                const caseDocRef = doc(db, `artifacts/${appId}/public/data/cases`, caseData.id);

                // 2. تحديث الحقول الأساسية للحالة فقط لتجنب تعارض قواعد الحماية
                await updateDoc(caseDocRef, {
                    assignedToId: userId,
                    assignedToName: users.find(u => u.id === userId)?.name || "طبيب الطوارئ",
                    status: "Active"
                });

                alert("تم استلام الحالة بنجاح وبدء المعاينة 🎉");
                onClose();
            } catch (err) {
                console.error("Firebase Update Error:", err);
                // عرض تفاصيل الخطأ القادم من فايربيس في التنبيه لمعرفة السبب الحقيقي
                alert(`حدث خطأ أثناء استلام الحالة!\nالسبب التقني: ${err.message}`);
            }
        }}
        className="mt-4 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 font-bold text-lg shadow transition w-full"
    >
        اضغط هنا لاستلام الحالة والبدء بالمعاينة
    </button>
)}

    useEffect(() => {
        const fetchEMR = async () => {
            if (!caseData.patientId) return;
            try {
                const patientCasesQuery = query(collection(db, `artifacts/${appId}/public/data/closed_cases`), where('patientId', '==', caseData.patientId));
                const snapshot = await getDocs(patientCasesQuery);
                setPatientEMR(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (error) {
                console.error("Error fetching patient EMR:", error);
            }
        };
        fetchEMR();
    }, [caseData.patientId]);

    const handleDrugChange = (index, field, value) => {
        const newDrugs = [...drugs];
        newDrugs[index][field] = value;
        if (index === newDrugs.length - 1 && (value.trim() !== '' || newDrugs[index].name.trim() !== '' || newDrugs[index].dosage.trim() !== '')) {
             setDrugs(newDrugs.filter(d => d.name || d.dosage).concat({ name: '', dosage: '' }));
        } else {
             setDrugs(newDrugs);
        }
    };

    const handleLabChange = (index, value) => {
        const newLabs = [...labRequests];
        newLabs[index] = value;
        if (index === newLabs.length - 1 && value.trim() !== '') {
            setLabRequests(newLabs.filter(l => l.trim() !== '').concat(''));
        } else {
            setLabRequests(newLabs);
        }
    };

    const saveTreatmentAndRequests = async () => {
        if (!permissions.canTreat) return;
        setIsSaving(true);
        try {
            const caseRef = doc(db, `artifacts/${appId}/public/data/cases`, caseData.id);
            const pharmacyItems = drugs.filter(d => d.name && d.dosage);
            const labItems = labRequests.filter(l => l);

            const updates = {
                diagnosis: diagnosis,
                notes: notes,
                lastUpdatedBy: users.find(u => u.id === userId)?.name,
                lastUpdateTime: serverTimestamp(),
                'processes.pharmacy.items': pharmacyItems,
                'processes.lab.items': labItems,
                status: caseData.status === 'Triage' ? 'Active' : caseData.status 
            };
            
            if (pharmacyItems.length > 0 && (!caseData.processes?.pharmacy?.status || caseData.processes.pharmacy.status === 'Not Requested')) {
                updates['processes.pharmacy.status'] = 'تم الاستلام';
            }
            if (labItems.length > 0 && (!caseData.processes?.lab?.status || caseData.processes.lab.status === 'Not Requested')) {
                updates['processes.lab.status'] = 'تم الاستلام';
            }

            await updateDoc(caseRef, updates);
            alert('تم حفظ التشخيص وطلبات العلاج بنجاح.');
        } catch (error) {
            console.error("Error saving treatment:", error);
            alert('خطأ في حفظ العلاج.');
        } finally {
            setIsSaving(false);
        }
    };

    const closeCase = async () => {
        if (!permissions.canClose || !caseData.assignedToId) return;
        if (!diagnosis) {
            alert('الرجاء إدخال التشخيص النهائي قبل إنهاء الحالة.');
            return;
        }

        const confirmClose = window.confirm('هل أنت متأكد من إنهاء الحالة؟ سيتم تحويلك إلى "متفرغ".');
        if (!confirmClose) return;

        setIsSaving(true);
        try {
            const finalCaseRecord = {
                ...caseData,
                diagnosis,
                notes,
                finalDisposition: 'Treated and Released',
                closedBy: users.find(u => u.id === userId)?.name,
                closeTime: serverTimestamp(),
                status: 'Closed'
            };
            delete finalCaseRecord.id;
            await addDoc(collection(db, `artifacts/${appId}/public/data/closed_cases`), finalCaseRecord);

            await deleteDoc(doc(db, `artifacts/${appId}/public/data/cases`, caseData.id));
            await updateDoc(doc(db, `artifacts/${appId}/public/data/users`, userId), { status: 'Available' });

            if (caseData.bedNumber) {
                 await updateDoc(doc(db, `artifacts/${appId}/public/data/beds`, `bed_${caseData.bedNumber}`), { isOccupied: false, currentCaseId: null });
            }

            alert('تم إنهاء الحالة بنجاح.');
            onClose();
        } catch (error) {
            console.error("Error closing case:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const isAssignedToMe = caseData.assignedToId === userId;
    const canEdit = permissions.canTreat && isAssignedToMe;
    
    const renderProcesses = (type, icon, rolePermission) => {
        const process = caseData.processes?.[type];
        const items = process?.items || [];
        const status = process?.status || 'لم يتم الطلب';
        const canUpdate = permissions[rolePermission];
        const isProcessActive = items.length > 0;

        return (
            <div className="border p-4 rounded-lg bg-white shadow-sm">
                <h4 className="text-lg font-bold mb-3 flex items-center gap-2 text-gray-700">
                    {icon} طلبات {type === 'pharmacy' ? 'الصيدلية' : type === 'lab' ? 'المختبر' : 'التمريض'}
                    <ProcessStatusBadge status={status} />
                </h4>
                {items.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                        {items.map((item, index) => (
                            <li key={index} className="flex justify-between border-b last:border-b-0 py-1">
                                <span>{item.name || item}</span>
                                <span className="text-gray-500 text-xs">{item.dosage && `(${item.dosage})`}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-gray-500">لم يتم طلب أي شيء بعد.</p>}

                {canUpdate && isProcessActive && (
                    <div className="mt-4 pt-3 border-t flex gap-2 justify-end">
                        <button onClick={() => updateProcessStatus(caseData.id, type, 'مكتمل')} className="text-xs px-3 py-1 bg-green-500 text-white rounded-full">تم الإكمال</button>
                        <button onClick={() => updateProcessStatus(caseData.id, type, 'قيد التنفيذ')} className="text-xs px-3 py-1 bg-yellow-500 text-white rounded-full">قيد التنفيذ</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto" onClick={onClose}>
            <div className="bg-gray-50 w-full max-w-5xl mx-auto my-10 rounded-xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b pb-4 mb-4">
                    <div className="w-full">
                        <h2 className="text-3xl font-extrabold text-red-700 flex items-center gap-3">
                            <Activity size={30} /> حالة طوارئ {caseData.bedNumber ? `#${caseData.bedNumber}` : ''}
                        </h2>
                        {!caseData.assignedToId && permissions.canTreat && (
                            <button
                                onClick={async () => {
                                    try {
                                        // تحديث مستند المريض وتعيين الطبيب بشكل صحيح
                                        await updateDoc(doc(db, `artifacts/${appId}/public/data/cases`, caseData.id), {
                                            assignedToId: userId,
                                            assignedToName: users.find(u => u.id === userId)?.name || "طبيب الطوارئ",
                                            status: "Active"
                                        });
                                        // تحديث حالة الطبيب الشخصية إلى مشغول
                                        await updateDoc(doc(db, `artifacts/${appId}/public/data/users`, userId), { status: 'Busy' });
                                        alert("تم استلام الحالة وبدء المعاينة بنجاح 🎉");
                                        onClose();
                                    } catch (err) {
                                        console.error("Error accepting case:", err);
                                        alert("حدث خطأ أثناء استلام الحالة!");
                                    }
                                }}
                                className="mt-4 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 font-bold text-lg shadow transition"
                            >
                                اضغط هنا لاستلام الحالة والبدء بالمعاينة
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200"><XCircle size={24} /></button>
                </div>

                <div className="flex flex-wrap gap-4 mb-6 text-sm font-medium">
                    <div>المريض: <span className="font-bold text-gray-800">{caseData.patientName}</span></div>
                    <div>سرير: <span className="font-bold text-gray-800">{caseData.bedNumber || 'غير محدد'}</span></div>
                    <div>الأولوية: <PriorityBadge level={caseData.priority} /></div>
                    <div>الطبيب المسؤول: <span className="font-bold text-gray-800">{caseData.assignedToName || 'غير محدد'}</span></div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mt-4 border border-blue-200">
                    <h4 className="text-xl font-bold text-blue-700 mb-3 flex items-center gap-2"><Clipboard size={20}/> السجل الطبي الموحد (EMR)</h4>
                    <p className="font-medium">الحساسية المعروفة: <span className="text-gray-700">{caseData.allergies || 'لا توجد'}</span></p>
                    <h5 className="text-lg font-semibold mt-4 mb-2 border-t pt-3">زيارات الطوارئ السابقة ({patientEMR.length})</h5>
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                        {patientEMR.map(record => (
                            <li key={record.id} className="p-3 bg-white rounded-lg border">
                                <p className="font-semibold text-sm">التشخيص: {record.diagnosis || 'غير متوفر'}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2"><Edit size={24}/> التشخيص والعلاج</h3>
                    <div className="bg-white p-6 rounded-xl border">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">سبب القدوم الأساسي</label>
                            <p className="p-3 bg-gray-50 rounded-lg border text-gray-800 font-semibold">{caseData.chiefComplaint}</p>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="diagnosis" className="block text-sm font-medium text-gray-700 mb-1">التشخيص الحالي (Diagnosis)</label>
                            <textarea id="diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="w-full p-3 border rounded-lg" rows="2" disabled={!canEdit} />
                        </div>
                        <div className="mb-6">
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">ملاحظات الطبيب المعاين</label>
                            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 border rounded-lg" rows="2" disabled={!canEdit} />
                        </div>

                        <h4 className="text-lg font-bold mb-3 text-red-600 flex items-center gap-2"><Pill size={20}/> طلبات الأدوية والعقاقير</h4>
                        {drugs.map((drug, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <input type="text" value={drug.name} onChange={(e) => handleDrugChange(index, 'name', e.target.value)} className="w-2/3 p-2 border rounded-lg" placeholder="اسم الدواء..." disabled={!canEdit} />
                                <input type="text" value={drug.dosage} onChange={(e) => handleDrugChange(index, 'dosage', e.target.value)} className="w-1/3 p-2 border rounded-lg" placeholder="الجرعة..." disabled={!canEdit} />
                            </div>
                        ))}

                        <h4 className="text-lg font-bold mb-3 mt-6 text-red-600 flex items-center gap-2"><TestTube size={20}/> طلبات التحاليل والأشعة</h4>
                        {labRequests.map((request, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <input type="text" value={request} onChange={(e) => handleLabChange(index, e.target.value)} className="w-full p-2 border rounded-lg" placeholder="اسم التحليل..." disabled={!canEdit} />
                            </div>
                        ))}

                        {canEdit && (
                            <div className="mt-8 flex justify-end">
                                <button onClick={saveTreatmentAndRequests} disabled={isSaving} className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md">حفظ طلبات العلاج والتشخيص</button>
                            </div>
                        )}

                        {permissions.canClose && isAssignedToMe && (
                            <div className="mt-8 pt-4 border-t flex justify-start">
                                <button onClick={closeCase} disabled={isSaving || !diagnosis} className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md">إنهاء الزيارة الحالية وتحرير السرير</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2"><Users size={24}/> الحزم الطبية قيد المتابعة</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {renderProcesses('pharmacy', <Pill size={20} />, 'pharmacy')}
                        {renderProcesses('lab', <TestTube size={20} />, 'lab')}
                        {renderProcesses('nursing', <User size={20} />, 'nursing')}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TriageForm = ({ userId, users, onClose, beds }) => {
    const [patientName, setPatientName] = useState('');
    const [chiefComplaint, setChiefComplaint] = useState('');
    const [patientId, setPatientId] = useState('');
    const [priority, setPriority] = useState('أخضر');
    const [allergies, setAllergies] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bed, setBed] = useState(null);
    const [assignedDoctor, setAssignedDoctor] = useState(null);
    const [searchResult, setSearchResult] = useState(null);

    const availableBeds = useMemo(() => beds.filter(b => !b.isOccupied).sort((a, b) => a.bedNumber - b.bedNumber), [beds]);
    const doctorsList = useMemo(() => users.filter(u => u.role === 'طبيب'), [users]);
    const availableDoctors = useMemo(() => doctorsList.filter(d => d.status === 'Available' && d.isClockedIn), [doctorsList]);

    useEffect(() => {
        if (availableBeds.length > 0) setBed(availableBeds[0].bedNumber);
        if (availableDoctors.length > 0) setAssignedDoctor(availableDoctors[0].id);
    }, [availableBeds, availableDoctors]);

    const handleSearch = async () => {
        if (!patientId) return;
        try {
            const patientEMRQuery = query(collection(db, `artifacts/${appId}/public/data/closed_cases`), where('patientId', '==', patientId));
            const snapshot = await getDocs(patientEMRQuery);
            if (snapshot.docs.length > 0) {
                const latestRecord = snapshot.docs[0].data();
                setSearchResult({ name: latestRecord.patientName, allergies: latestRecord.allergies || 'لا توجد', exists: true });
                setPatientName(latestRecord.patientName);
                setAllergies(latestRecord.allergies || '');
            } else {
                setSearchResult({ name: '', allergies: '', exists: false });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleArchiveCase = async () => {
        const finalPatientId = patientId || generatePatientId();
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, `artifacts/${appId}/public/data/archived_cases`), {
                patientId: finalPatientId, patientName, chiefComplaint, priority, allergies, timestamp: serverTimestamp()
            });
            alert("تم نقل الحالة إلى الأرشيف لعدم توفر طبيب.");
            onClose();
        } catch (error) {
            alert("حدث خطأ أثناء الأرشفة.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting || !bed || !assignedDoctor || !patientName || !chiefComplaint) return;
        setIsSubmitting(true);
        const finalPatientId = patientId || generatePatientId();

        try {
            const newCaseData = {
                patientId: finalPatientId,
                patientName,
                chiefComplaint,
                priority,
                allergies,
                bedNumber: bed,
                assignedToId: assignedDoctor,
                assignedToName: users.find(u => u.id === assignedDoctor)?.name || 'طبيب',
                status: 'Triage',
                timestamp: serverTimestamp(),
                processes: {
                    pharmacy: { status: 'Not Requested', items: [] },
                    lab: { status: 'Not Requested', items: [] },
                    nursing: { status: 'Not Requested', items: [] },
                }
            };

            const caseRef = await addDoc(collection(db, `artifacts/${appId}/public/data/cases`), newCaseData);
            await updateDoc(doc(db, `artifacts/${appId}/public/data/beds`, `bed_${bed}`), { isOccupied: true, currentCaseId: caseRef.id });
            await updateDoc(doc(db, `artifacts/${appId}/public/data/users`, assignedDoctor), { status: 'Busy' });

            alert(`تم تسجيل حالة المريض بنجاح وتعيين الموارد بنجاح.`);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl mx-auto my-10 rounded-xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b pb-4 mb-4">
                    <h2 className="text-3xl font-extrabold text-red-700 flex items-center gap-3"><Truck size={30} /> استقبال حالة جديدة</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200"><XCircle size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="p-4 bg-blue-50 rounded-lg border">
                        <h3 className="text-lg font-bold text-blue-800 mb-3 flex items-center gap-2"><Clipboard size={20}/> السجل الموحد (EMR)</h3>
                        <div className="flex gap-3">
                            <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} onBlur={handleSearch} className="w-2/3 p-3 border rounded-lg" placeholder="رقم ملف المريض الدولي..." />
                            <button type="button" onClick={handleSearch} className="w-1/3 py-3 bg-blue-600 text-white font-semibold rounded-lg">فحص السجل</button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم المريض</label>
                        <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="w-full p-3 border rounded-lg" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">سبب القدوم والشكوى الطبية الرئيسي</label>
                        <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className="w-full p-3 border rounded-lg" rows="2" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">تصنيف الحالة الأولوية</label>
                        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full p-3 border rounded-lg bg-white">
                            <option value="أحمر">أحمر (حرجة)</option>
                            <option value="أصفر">أصفر (متوسطة)</option>
                            <option value="أخضر">أخضر (بسيطة)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الحساسية</label>
                        <input value={allergies} onChange={(e) => setAllergies(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="أدوية معينة أو أطعمة..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الأسرة الشاغرة</label>
                        <select value={bed || ""} onChange={(e) => setBed(Number(e.target.value))} className="w-full p-3 border rounded-lg bg-white" required>
                            <option value="">اختر السرير</option>
                            {availableBeds.map(b => <option key={b.bedNumber} value={b.bedNumber}>السرير رقم {b.bedNumber}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الأطباء العاملين بالمناوبة</label>
                        <select value={assignedDoctor || ""} onChange={(e) => setAssignedDoctor(e.target.value)} className="w-full p-3 border rounded-lg bg-white" required>
                            <option value="">اختر الطبيب المناوب</option>
                            {doctorsList.map(doc => <option key={doc.id} value={doc.id}>{doc.name} — {doc.status === "Available" ? "🟢 متاح" : "🔴 مشغول"}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={isSubmitting || !bed || !assignedDoctor} className="w-full py-4 bg-red-600 text-white font-semibold rounded-lg shadow-md">تسجيل الحالة وتأكيد الموارد</button>
                    {availableDoctors.length === 0 && (
                        <button type="button" onClick={handleArchiveCase} className="w-full mt-4 py-4 bg-gray-700 text-white rounded-lg">لا يوجد طبيب متفرغ حالياً — أرشفة الحالة مؤقتاً</button>
                    )}
                </form>
            </div>
        </div>
    );
};

const ArchiveCaseDetail = ({ caseData, onClose, onRestore }) => {
    const [patientName] = useState(caseData.patientName);
    const [chiefComplaint] = useState(caseData.chiefComplaint);
    const [allergies] = useState(caseData.allergies);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-gray-800">تفاصيل الحالة المؤرشفة</h2>
                <div className="space-y-4">
                    <div><p className="text-sm font-bold text-gray-700">اسم المريض:</p> <p className="p-2 bg-gray-50 border rounded">{patientName}</p></div>
                    <div><p className="text-sm font-bold text-gray-700">سبب القدوم:</p> <p className="p-2 bg-gray-50 border rounded">{chiefComplaint}</p></div>
                    <div><p className="text-sm font-bold text-gray-700">الحساسية:</p> <p className="p-2 bg-gray-50 border rounded">{allergies || 'لا توجد'}</p></div>
                    <button onClick={() => onRestore(caseData)} className="w-full py-3 bg-green-600 text-white rounded-lg mt-4 font-bold">إعادة فتح وإرسال الحالة للأطباء</button>
                    <button onClick={onClose} className="w-full py-3 bg-gray-300 text-gray-700 rounded-lg mt-2">إغلاق التقرير</button>
                </div>
            </div>
        </div>
    );
};

const ArchiveView = ({ onSelectCase }) => {
    const [archivedCases, setArchivedCases] = useState([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const load = async () => {
            const q = await getDocs(collection(db, `artifacts/${appId}/public/data/archived_cases`));
            setArchivedCases(q.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        load();
    }, []);

    const filtered = archivedCases.filter(c => c.patientName?.includes(search) || c.patientId?.includes(search));

    const handleDelete = async (id) => {
        if (!window.confirm("هل تريد حذف الحالة نهائياً من الأرشيف؟")) return;
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/archived_cases`, id));
        setArchivedCases(prev => prev.filter(c => c.id !== id));
        alert("تم الحذف بنجاح.");
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold border-b pb-2 mb-4">📁 أرشيف الحالات غير المستلمة</h2>
            <input type="text" placeholder="ابحث باسم المريض أو رقم الملف..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full p-3 border rounded-lg mb-4 text-right" />
            {filtered.length === 0 ? <p className="text-center text-gray-500 py-10">لا توجد حالات بالأرشيف حالياً.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map((item) => (
                        <div key={item.id} className="p-4 bg-gray-50 rounded-lg shadow border flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{item.patientName}</h3>
                                <p className="text-gray-600 text-sm mt-1">{item.chiefComplaint}</p>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => onSelectCase(item)} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold">معاينة وإعادة فتح</button>
                                <button onClick={() => handleDelete(item.id)} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg font-semibold">حذف نهائي</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Dashboard = ({ user, userInfo, userRole, permissions, logout, db }) => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [selectedCase, setSelectedCase] = useState(null);
    const { cases, users, beds, isLoadingData } = useFirestoreCollections(user?.uid, permissions);
    const [selectedArchived, setSelectedArchived] = useState(null);

    const handleRestoreArchived = async (caseData) => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/archived_cases`, caseData.id));
            const newCase = {
                patientId: caseData.patientId,
                patientName: caseData.patientName,
                chiefComplaint: caseData.chiefComplaint,
                allergies: caseData.allergies,
                priority: caseData.priority,
                bedNumber: null,
                assignedToId: "",
                assignedToName: "غير محدد",
                triageBy: "Archive Restore",
                status: "Triage",
                timestamp: serverTimestamp(),
                processes: {
                    pharmacy: { status: "Not Requested", items: [] },
                    lab: { status: "Not Requested", items: [] },
                    nursing: { status: "Not Requested", items: [] }
                }
            };
            await addDoc(collection(db, `artifacts/${appId}/public/data/cases`), newCase);
            alert("تمت إعادة فتح الملف بنجاح! يمكن لمكتب الاستقبال الآن تنسيق وحجز السرير والطبيب المتفرغ له.");
            setSelectedArchived(null);
            setCurrentView("dashboard");
        } catch (err) {
            console.error(err);
        }
    };

    const availableDoctorsCount = users.filter(u => u.role === 'طبيب' && u.status === 'Available' && u.isClockedIn).length;
    const occupiedBedsCount = beds.filter(b => b.isOccupied).length;
    const totalBedsCount = beds.length;

    const handleTimeClockStatusUpdate = () => {
        setCurrentView('dashboard');
    };

    const HeaderCard = ({ title, value, icon, bgColor }) => (
        <div className={`p-5 rounded-xl shadow-lg border flex items-center justify-between ${bgColor} text-white`}>
            <div>
                <p className="text-sm font-medium opacity-80">{title}</p>
                <h3 className="text-3xl font-extrabold">{value}</h3>
            </div>
            {icon}
        </div>
    );

    const CaseListItem = ({ caseItem }) => {
        const assignedDoctor = caseItem.assignedToName || 'غير محدد';
        const isMyCase = caseItem.assignedToId === user.uid;
        const isReception = userInfo?.role === "استقبال/فرز";

        const isRelevant = isReception || permissions.canViewAll || isMyCase || permissions.pharmacy || permissions.nursing;
        if (!isRelevant) return null;

        return (
            <div 
                className={`p-4 rounded-lg shadow-md border-r-8 ${
                    caseItem.priority === 'أحمر' ? 'border-red-600 bg-red-50 hover:bg-red-100' :
                    caseItem.priority === 'أصفر' ? 'border-yellow-600 bg-yellow-50 hover:bg-yellow-100' :
                    'border-green-600 bg-green-50 hover:bg-green-100'
                } cursor-pointer transition`}
                onClick={() => setSelectedCase(caseItem)}
            >
                <div className="flex justify-between items-start mb-2">
                    <PriorityBadge level={caseItem.priority} />
                    {caseItem.timestamp && <p className="text-xs text-gray-500">منذ {((new Date() - caseItem.timestamp?.toDate()) / (1000 * 60)).toFixed(0)} دقيقة</p>}
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-1">{caseItem.patientName} (سرير {caseItem.bedNumber ? `#${caseItem.bedNumber}` : 'غير محدد'})</h4>
                <p className="text-sm text-gray-600 truncate">{caseItem.chiefComplaint}</p>
                <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
                    <span><User size={14}/> الطبيب: {assignedDoctor}</span>
                    <StatusBadge status={caseItem.status} className="text-xs" />
                </div>
            </div>
        );
    };

    const renderView = () => {
        if (isLoadingData) {
            return <div className="text-center p-10 text-gray-500 font-semibold"><Loader size={30} className="animate-spin inline-block" /> جارٍ تحميل بيانات النظام...</div>;
        }

        switch (currentView) {
            case 'timeclock':
                return <TimeClock userId={user?.uid} userInfo={userInfo} db={db} onStatusUpdate={handleTimeClockStatusUpdate} />;
            case 'archive':
                return <ArchiveView onSelectCase={(item) => setSelectedArchived(item)} />;
            case 'dashboard':
            default:
                return (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <HeaderCard title="الحالات النشطة" value={cases.length} icon={<Activity size={40} />} bgColor="bg-red-600" />
                            <HeaderCard title="حالات الأولوية الحمراء" value={cases.filter(c => c.priority === 'أحمر').length} icon={<AlertTriangle size={40} />} bgColor="bg-yellow-600" />
                            <HeaderCard title="الأطباء المتفرغون" value={`${availableDoctorsCount} / ${users.filter(u => u.role === 'طبيب').length}`} icon={<User size={40} />} bgColor="bg-green-600" />
                            <HeaderCard title="الأسرّة المتاحة" value={`${totalBedsCount - occupiedBedsCount} / ${totalBedsCount}`} icon={<Home size={40} />} bgColor="bg-blue-600" />
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">قائمة الحالات النشطة</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto">
                                {cases.length > 0 ? cases.map(caseItem => <CaseListItem key={caseItem.id} caseItem={caseItem} />) : (
                                    <div className="col-span-full text-center p-8 bg-gray-50 rounded-lg text-gray-600 font-semibold">لا توجد حالات طوارئ نشطة حالياً.</div>
                                )}
                            </div>
                        </div>

                        {permissions.canViewAll && (
                            <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
                                <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">تواجد الموظفين وحالتهم</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {users.map(u => (
                                        <div key={u.id} className="p-3 bg-gray-50 rounded-lg shadow-sm border flex flex-col">
                                            <span className="font-semibold text-gray-800 truncate">{u.name}</span>
                                            <span className="text-xs text-gray-500 mb-2">{RolePermissions[u.role]?.title || u.role}</span>
                                            <div className="flex justify-between items-center">
                                                <StatusBadge status={u.status} />
                                                <ProcessStatusBadge status={u.isClockedIn ? 'متواجد' : 'غير متواجد'} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <header className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-red-700">HEMS</h1>
                    <p className="text-gray-600 font-medium">{userInfo?.name} ({permissions.title})</p>
                    <StatusBadge status={userInfo?.status} className="hidden sm:inline-flex" />
                </div>
                <div className="flex items-center gap-4">
                    {permissions.canTriage && (
                        <button onClick={() => setCurrentView('triage')} className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow hover:bg-red-700"><Plus size={18}/> تسجيل حالة طوارئ</button>
                    )}
                    <button onClick={() => setCurrentView('timeclock')} className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow hover:bg-gray-300"><Clock size={18}/> ساعة الحضور</button>
                    <button onClick={() => setCurrentView('archive')} className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow hover:bg-gray-300"><FolderOpen size={18}/> الأرشيف</button>
                    <button onClick={logout} className="p-2 text-gray-500 hover:text-red-600"><LogOut size={24}/></button>
                </div>
            </header>

            <main className="p-6 flex-grow">{renderView()}</main>

            {currentView === 'triage' && permissions.canTriage && (
                <TriageForm userId={user.uid} users={users} beds={beds} onClose={() => setCurrentView('dashboard')} />
            )}
            {selectedCase && (
                <CaseDetail caseData={selectedCase} onClose={() => setSelectedCase(null)} users={users} userId={user.uid} permissions={permissions} />
            )}
            {selectedArchived && (
                <ArchiveCaseDetail caseData={selectedArchived} onClose={() => setSelectedArchived(null)} onRestore={handleRestoreArchived} />
            )}
        </div>
    );
};

const App = () => {
    const { user, userInfo, userRole, permissions, isLoading, login, logout, setupUser, isUserSetup } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader size={48} className="animate-spin text-red-600" />
                <p className="text-xl text-gray-600 mr-4">جارٍ التحميل...</p>
            </div>
        );
    }

    if (user && !isUserSetup) {
        return <UserProfileSetup user={user} setupUser={setupUser} isLoading={isLoading} />;
    }

    if (user && isUserSetup) {
        return <Dashboard user={user} userInfo={userInfo} userRole={userRole} permissions={permissions} logout={logout} db={db} />;
    }

    return <LoginScreen login={login} isLoading={isLoading} />;
};

export default App;
