import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
// تم تعديل الاستيراد ليتضمن doc و FieldValue و runTransaction
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, serverTimestamp, getDocs, runTransaction, FieldValue } from 'firebase/firestore'; 
import { Clock, User, LogOut, CheckCircle, AlertTriangle, XCircle, Home, Send, Activity, Users, Truck, Pill, TestTube, Edit, Plus, MessageSquare, Clipboard, MapPin, FolderOpen, Loader } from 'lucide-react';

// --- CONFIGURATION AND INITIALIZATION ---
// ⚠️⚠️⚠️ يجب استبدال هذا الكائن بمفاتيح مشروعك الحقيقية من Firebase Console ⚠️⚠️⚠️
const firebaseConfig = {
  apiKey: "AIzaSyD2thRhMrLmBL60ZJjd3quhhFVnF50X6aY",
  authDomain: "hems-project-3283b.firebaseapp.com",
  projectId: "hems-project-3283b",
  storageBucket: "hems-project-3283b.firebasestorage.app",
  messagingSenderId: "290561313018",
  appId: "1:290561313018:web:c008eca93fc7b61fcaa143"
};
// ⚠️⚠️⚠️ انتهى التعديل المطلوب هنا ⚠️⚠️⚠️

const appId = firebaseConfig.projectId;

// Initialization should happen outside the component logic flow for performance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Use a simple random ID for patients when creating a new record
const generatePatientId = () => `PID-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

// --- ROLE DEFINITIONS AND PERMISSIONS (صلاحيات الأدوار) ---

// Define what each role can do and what they see
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
    let text = level;
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
            {text}
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
    <div className="bg-red-500 text-white p-10 text-3xl">
  Test Tailwind
</div>


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
    const [isUserSetup, setIsUserSetup] = useState(false); // New state for setup status

    // Fetch user details from 'users' collection
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
                setIsUserSetup(true); // Profile exists, setup complete
            } else {
                console.warn("User profile not found. Redirecting to setup.");
                setUserInfo(null);
                setIsUserSetup(false); // Profile must be created
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
            console.error("Login failed:", error.code, error.message);
            throw new Error('خطأ في تسجيل الدخول. تأكد من الإيميل وكلمة المرور.');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Function to create user profile in Firestore after successful Firebase Auth login
    const setupUser = async (name, role) => {
        if (!user || isUserSetup) return;

        try {
            const userRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
            const userData = {
                id: user.uid,
                email: user.email,
                name: name,
                role: role,
                status: 'Unavailable', // Default status is unavailable until Clock In
                isClockedIn: false,
                createdAt: serverTimestamp(),
            };
            await setDoc(userRef, userData);
            setUserInfo(userData);
            setIsUserSetup(true);
        } catch (error) {
            console.error("Error setting up user profile:", error);
            throw new Error('خطأ في إعداد ملف المستخدم بعد تسجيل الدخول.');
        }
    };


    const logout = async () => {
        try {
            // Optional: Update user status to Unavailable upon logout
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

// --- CORE FIREBASE HOOKS ---

// ... (بقية الدالة useAuth)

const useFirestoreCollections = (userId, permissions) => {
    const [cases, setCases] = useState([]);
    const [users, setUsers] = useState([]);
    const [beds, setBeds] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // 1. Cases Collection (حالات الطوارئ)
    useEffect(() => {
        if (!userId || !permissions.title) return;

        setIsLoadingData(true);
        let casesQuery;

        // Manager sees all cases
        if (permissions.canViewAll) {
            casesQuery = collection(db, `artifacts/${appId}/public/data/cases`);
        } 
        // Doctors see their assigned cases OR cases not yet assigned
        else if (permissions.canTreat) {
            casesQuery = query(collection(db, `artifacts/${appId}/public/data/cases`), where('status', 'in', ['Triage', 'Active']));
        }
        // Other roles see cases relevant to their tasks (e.g., pharmacy/nursing)
        else {
            casesQuery = query(collection(db, `artifacts/${appId}/public/data/cases`), where('status', 'in', ['Active']));
        }

        const unsubscribe = onSnapshot(casesQuery, (snapshot) => {
            const fetchedCases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Client-side filtering for Doctors to only see their assigned cases
            let filteredCases = fetchedCases;
            if (permissions.canTreat && !permissions.canViewAll) {
                filteredCases = fetchedCases.filter(c => 
                    c.assignedToId === userId || !c.assignedToId
                );
            }

            // Sort by priority (Red, Yellow, Green) and then by time
            filteredCases.sort((a, b) => {
                const priorityOrder = { 'أحمر': 1, 'أصفر': 2, 'أخضر': 3 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                // Sort by time (latest first if priority is same)
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

    // 2. Users Collection (الموظفون)
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

    // 3. Beds Collection (الأسرّة) - تم تعديل منطق الإنشاء ليعمل بشكل صحيح
    useEffect(() => {
        const bedsQuery = collection(db, `artifacts/${appId}/public/data/beds`);
        const unsubscribe = onSnapshot(bedsQuery, async (snapshot) => {
            // Check if beds exist, if not, create mock beds (1-10)
            if (snapshot.empty) {
                console.log("No beds found, initializing 10 mock beds.");
                
                // يجب استخدام setDoc مع doc(db, path, id) لضمان ID ثابت
                for (let i = 1; i <= 10; i++) {
                    const bedId = `bed_${i}`;
                    const bedRef = doc(db, `artifacts/${appId}/public/data/beds`, bedId);
                    await setDoc(bedRef, { 
                        isOccupied: false, 
                        bedNumber: i, 
                        currentCaseId: null, 
                        id: bedId 
                    }).catch(err => console.error("Bed init error:", err));
                }
                
                // Fetch the newly created beds
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

// --- API FUNCTIONS ---

// Update a general item status (used by Pill/Nursing/Lab)
const updateProcessStatus = async (caseId, processType, newStatus) => {
    try {
        const caseRef = doc(db, `artifacts/${appId}/public/data/cases`, caseId);
        await updateDoc(caseRef, {
            [`processes.${processType}.status`]: newStatus,
            [`processes.${processType}.lastUpdated`]: serverTimestamp()
        });
        // alert(`${processType} status updated to ${newStatus}`);
    } catch (error) {
        console.error("Error updating process status:", error);
    }
};

// --- VIEWS ---

// User Profile Setup (شاشة إعداد الملف الشخصي)
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
            // Redirection happens automatically via useAuth
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
                            {roles.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
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

                {error && (
                    <div className="mt-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};


// Login Screen (شاشة تسجيل الدخول)
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

                {error && (
                    <div className="mt-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">
                        {error}
                    </div>
                )}
                
                {/* Important Security Note */}
                <div className="mt-8 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm text-center">
                    **ملاحظة الأمان:** لا يمكن إنشاء حسابات من هنا. يجب على الإدارة إنشاء الحسابات أولاً عبر لوحة تحكم Firebase (قسم Authentication).
                </div>
            </div>
        </div>
    );
};


// Time Clock (ساعة الحضور والانصراف)
const TimeClock = ({ userInfo, db, userId, onStatusUpdate }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState('');
    const [isClockedIn, setIsClockedIn] = useState(userInfo?.isClockedIn === true);

    // محاكاة الموقع أثناء التجربة
    const [isInsideHospital, setIsInsideHospital] = useState(true);

    useEffect(() => {
        setIsClockedIn(userInfo?.isClockedIn === true);
    }, [userInfo]);

    const handleClock = async (action) => {
        try {
            setIsProcessing(true);
            setMessage('');

            // ❗ استخدم userId القادم من الـ props فقط
            if (!userId) {
                setMessage('لا يوجد مستخدم مسجل دخول.');
                return;
            }

            // منع تسجيل الدخول خارج المستشفى
            if (action === 'in' && !isInsideHospital) {
                setMessage('لا يمكنك تسجيل الحضور وأنت خارج المستشفى.');
                return;
            }

            const timestamp = serverTimestamp();
            const location = isInsideHospital ? 'داخل المستشفى' : 'خارج المستشفى';

            const attendanceData = {
                userId,
                userName: userInfo?.name,
                action,
                timestamp,
                role: userInfo?.role,
                location,
                isSuccessful: true,
            };

            // 🔥 إصلاح المسار — إضافة appId باستخدام db + path الصحيح
            await addDoc(
                collection(db, `artifacts/${appId}/public/data/attendance`),
                attendanceData
            );

            // تحديث حالة المستخدم
            const userRef = doc(
                db,
                `artifacts/${appId}/public/data/users`,
                userId
            );

            const newIsClockedIn = action === 'in';

            const statusUpdate = {
                isClockedIn: newIsClockedIn,
                lastClockAction: newIsClockedIn ? 'Clocked In' : 'Clocked Out',
                status: newIsClockedIn ? 'Available' : 'Unavailable',
                lastClockUpdate: timestamp,
            };

            await setDoc(userRef, statusUpdate, { merge: true });
            userInfo.isClockedIn = newIsClockedIn;
            userInfo.status = statusUpdate.status;

            // تحدیث الواجهة
            onStatusUpdate(statusUpdate.status, newIsClockedIn);
            setIsClockedIn(newIsClockedIn);

            setMessage(
                newIsClockedIn
                    ? 'تم تسجيل الحضور بنجاح. أنت الآن متواجد.'
                    : 'تم تسجيل الانصراف بنجاح. أنت الآن غير متواجد.'
            );

        } catch (error) {
            console.error(`Error during Clock ${action}:`, error);
            setMessage('حدث خطأ أثناء العملية. يرجى مراجعة Firebase Rules.');
        } finally {
            setIsProcessing(false);
        }
    };

    const buttonStyle =
        "w-full py-4 text-xl font-bold rounded-lg shadow-lg transition duration-300 disabled:opacity-50 flex items-center justify-center gap-2";

    return (
        <div className="p-6 bg-white rounded-xl shadow-xl max-w-lg mx-auto my-10 border border-gray-200">
            <h2 className="text-3xl font-extrabold text-gray-800 border-b pb-3 mb-5 flex items-center gap-3">
                <Clock size={28} className="text-red-600" />
                ساعة الحضور والانصراف
            </h2>

            <div className="text-center mb-6">
                <p className="text-lg text-gray-600 mb-2">
                    حالياً أنت:
                    <strong className={isClockedIn ? "text-green-600" : "text-red-600"}>
                        {isClockedIn ? 'مسجل حضور' : 'غير مسجل حضور'}
                    </strong>
                </p>
                <p className="text-2xl font-mono text-red-700">
                    {new Date().toLocaleTimeString('ar-SA')}
                </p>
            </div>

            <div className="space-y-4">
                {/* محاكاة الموقع */}
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => setIsInsideHospital(prev => !prev)}
                        className={`text-sm px-3 py-1 rounded-full font-semibold transition ${
                            isInsideHospital ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                        }`}
                    >
                        {isInsideHospital ? 'محاكاة: داخل المستشفى' : 'محاكاة: خارج المستشفى'}
                    </button>
                </div>

                {!isClockedIn ? (
                    <button
                        className={`${buttonStyle} bg-green-600 text-white hover:bg-green-700`}
                        onClick={() => handleClock('in')}
                        disabled={isProcessing || !isInsideHospital}
                    >
                        {isProcessing ? (
                            <Loader size={24} className="animate-spin" />
                        ) : (
                            <MapPin size={24} />
                        )}
                        تسجيل دخول (بصمة الموقع)
                    </button>
                ) : (
                    <button
                        className={`${buttonStyle} bg-red-600 text-white hover:bg-red-700`}
                        onClick={() => handleClock('out')}
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <Loader size={24} className="animate-spin" />
                        ) : (
                            <LogOut size={24} />
                        )}
                        تسجيل انصراف (خروج)
                    </button>
                )}
            </div>

            {message && (
                <div
                    className={`mt-6 p-4 rounded-lg text-center font-medium ${
                        message.includes('خطأ')
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                    }`}
                >
                    {message}
                </div>
            )}
        </div>
    );
};


// Case Detail/Treatment View (تفاصيل الحالة والعلاج)
const CaseDetail = ({ caseData, onClose, users, userId, permissions }) => {
    const [diagnosis, setDiagnosis] = useState(caseData.diagnosis || '');
    const [notes, setNotes] = useState(caseData.notes || '');
    const [drugs, setDrugs] = useState(caseData.processes?.pharmacy?.items || [{ name: '', dosage: '' }]);
    const [labRequests, setLabRequests] = useState(caseData.processes?.lab?.items || ['']);
    const [isSaving, setIsSaving] = useState(false);
    const [patientEMR, setPatientEMR] = useState([]);


    const ArchiveView = ({ archivedCases, onSelect }) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">الأرشيف</h3>

            {archivedCases.length === 0 ? (
                <p className="text-center text-gray-500 py-10">لا توجد حالات مؤرشفة.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {archivedCases.map(item => (
                        <div 
                            key={item.id}
                            onClick={() => onSelect(item)}
                            className="p-4 bg-gray-50 rounded-lg shadow hover:bg-gray-100 cursor-pointer border"
                        >
                            <h4 className="text-lg font-bold text-gray-800">{item.patientName}</h4>
                            <p className="text-sm text-gray-600">{item.chiefComplaint}</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {item.timestamp?.toDate().toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


    // Fetch Unified EMR (السجل الطبي الموحد)
    useEffect(() => {
        const fetchEMR = async () => {
            if (!caseData.patientId) return;
            try {
                // Query all closed cases for this patient across all hospitals (appId in a real scenario)
                const patientCasesQuery = query(
                    collection(db, `artifacts/${appId}/public/data/closed_cases`),
                    where('patientId', '==', caseData.patientId)
                );
                const snapshot = await getDocs(patientCasesQuery);
                const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setPatientEMR(history);
            } catch (error) {
                console.error("Error fetching patient EMR:", error);
            }
        };
        fetchEMR();
    }, [caseData.patientId]);

    const handleDrugChange = (index, field, value) => {
        const newDrugs = [...drugs];
        newDrugs[index][field] = value;
        // Keep at least one empty row for new input
        if (index === newDrugs.length - 1 && (value.trim() !== '' || newDrugs[index].name.trim() !== '' || newDrugs[index].dosage.trim() !== '')) {
             setDrugs(newDrugs.filter(d => d.name || d.dosage).concat({ name: '', dosage: '' }));
        } else {
             setDrugs(newDrugs);
        }
    };

    const handleLabChange = (index, value) => {
        const newLabs = [...labRequests];
        newLabs[index] = value;
         // Keep at least one empty row for new input
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
            
            // Build processes data
            const pharmacyItems = drugs.filter(d => d.name && d.dosage);
            const labItems = labRequests.filter(l => l);

            const updates = {
                diagnosis: diagnosis,
                notes: notes,
                lastUpdatedBy: users.find(u => u.id === userId)?.name,
                lastUpdateTime: serverTimestamp(),
                // Update or create processes based on requests
                'processes.pharmacy.items': pharmacyItems,
                'processes.lab.items': labItems,
                'processes.nursing.items': caseData.processes?.nursing?.items || [], // Keep existing nursing
                // Set status only if not already active (e.g., first doctor update)
                status: caseData.status === 'Triage' ? 'Active' : caseData.status 
            };
            
            // Set initial status for newly created processes if items exist
            if (pharmacyItems.length > 0 && (!caseData.processes?.pharmacy?.status || caseData.processes.pharmacy.status === 'Not Requested')) {
                updates['processes.pharmacy.status'] = 'تم الاستلام';
            }
            if (labItems.length > 0 && (!caseData.processes?.lab?.status || caseData.processes.lab.status === 'Not Requested')) {
                updates['processes.lab.status'] = 'تم الاستلام';
            }
            if (caseData.processes?.nursing?.items.length > 0 && (!caseData.processes?.nursing?.status || caseData.processes.nursing.status === 'Not Requested')) {
                updates['processes.nursing.status'] = 'تم الاستلام';
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
        if (!permissions.canClose || !caseData.assignedToId) { // Only assigned doctor can close
            alert('ليس لديك صلاحية إنهاء هذه الحالة.');
            return;
        }

        if (!diagnosis) {
            alert('الرجاء إدخال التشخيص النهائي قبل إنهاء الحالة.');
            return;
        }

        const confirmClose = window.confirm('هل أنت متأكد من إنهاء الحالة؟ سيتم تحويلك إلى "متفرغ".');
        if (!confirmClose) return;

        setIsSaving(true);
        try {
            // 1. Add final record to the Closed Cases collection (Unified EMR)
            const finalCaseRecord = {
                ...caseData,
                diagnosis: diagnosis,
                notes: notes,
                finalDisposition: 'Treated and Released',
                closedBy: users.find(u => u.id === userId)?.name,
                closeTime: serverTimestamp(),
                status: 'Closed'
            };
            delete finalCaseRecord.id; // Remove the old ID before adding to the new collection
            await addDoc(collection(db, `artifacts/${appId}/public/data/closed_cases`), finalCaseRecord);

            // 2. Delete the active case record
            const caseRef = doc(db, `artifacts/${appId}/public/data/cases`, caseData.id);
            await deleteDoc(caseRef);

            // 3. Update Doctor status to Available
            const doctorRef = doc(db, `artifacts/${appId}/public/data/users`, userId);
            await updateDoc(doctorRef, { status: 'Available' });

            // 4. Free up the bed 
            if (caseData.bedNumber) {
                 const bedRef = doc(db, `artifacts/${appId}/public/data/beds`, caseData.bedNumber.toString());
                 await updateDoc(bedRef, { isOccupied: false, currentCaseId: null });
            }

            alert('تم إنهاء الحالة بنجاح. أنت الآن متفرغ لاستلام حالات جديدة.');
            onClose(); // Close the detail view
        } catch (error) {
            console.error("Error closing case:", error);
            alert('خطأ في إنهاء الحالة.');
        } finally {
            setIsSaving(false);
        }
    };

    const isAssignedToMe = caseData.assignedToId === userId;
    const canEdit = permissions.canTreat && isAssignedToMe;
    
    // --- Rendering Logic ---
    const renderEMR = () => (
        <div className="bg-gray-50 p-4 rounded-lg mt-4 border border-blue-200">
            <h4 className="text-xl font-bold text-blue-700 mb-3 flex items-center gap-2"><Clipboard size={20}/> السجل الطبي الموحد (EMR)</h4>
            <div className="space-y-3">
                <p className="font-medium">الاسم الكامل: <span className="text-gray-700">{caseData.patientName}</span></p>
                <p className="font-medium text-red-600">الحساسية: <span className="text-gray-700">{caseData.allergies || 'لا توجد'}</span></p>
            </div>
            <h5 className="text-lg font-semibold mt-4 mb-2 border-t pt-3">تاريخ زيارات الطوارئ السابقة ({patientEMR.length} سجلات)</h5>
            {patientEMR.length > 0 ? (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {patientEMR.map((record, index) => (
                        <li key={record.id} className="p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                            <p className="font-semibold text-sm text-gray-800">التشخيص: {record.diagnosis || 'غير متوفر'}</p>
                            <p className="text-xs text-gray-500">التاريخ: {record.closeTime?.toDate().toLocaleDateString('ar-SA')} - المستشفى: {record.appId || 'غير محدد'}</p>
                            <p className="text-xs text-gray-500">الأدوية الموصوفة: {record.processes?.pharmacy?.items?.length || 0}</p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-sm">لا يوجد سجل طبي موحد سابق لهذا المريض.</p>
            )}
        </div>
    );

    const renderProcesses = (type, icon, rolePermission) => {
        const process = caseData.processes?.[type];
        const items = process?.items || [];
        const status = process?.status || 'لم يتم الطلب';
        const canUpdate = permissions[rolePermission];
        const isProcessActive = items.length > 0;

        const handleUpdate = (newStatus) => {
            if (canUpdate && isProcessActive) {
                updateProcessStatus(caseData.id, type, newStatus);
            }
        };
        
        // Define button status based on current state
        const isDone = status === 'مكتمل';
        const isInProgress = status === 'قيد التنفيذ';

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
                ) : (
                    <p className="text-sm text-gray-500">لم يتم طلب أي شيء بعد.</p>
                )}

                {canUpdate && isProcessActive && (
                    <div className="mt-4 pt-3 border-t flex gap-2 justify-end">
                        <button
                            onClick={() => handleUpdate('مكتمل')}
                            className="text-xs px-3 py-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
                            disabled={isDone || isSaving}
                        >
                            تم الإكمال
                        </button>
                        <button
                            onClick={() => handleUpdate('قيد التنفيذ')}
                            className="text-xs px-3 py-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition"
                            disabled={isInProgress || isDone || isSaving}
                        >
                            قيد التنفيذ
                        </button>
                    </div>
                )}
            </div>
        );
    };


    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto" onClick={onClose}>
            <div className="bg-gray-50 w-full max-w-5xl mx-auto my-10 rounded-xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b pb-4 mb-4">
                    <h2 className="text-3xl font-extrabold text-red-700 flex items-center gap-3">
                        <Activity size={30} /> حالة طوارئ #{caseData.bedNumber}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200">
                        <XCircle size={24} />
                    </button>
                </div>

                {/* Case Info Bar */}
                <div className="flex flex-wrap gap-4 mb-6 text-sm font-medium">
                    <div className="flex items-center gap-1"><User size={18} className="text-red-500"/> المريض: <span className="font-bold text-gray-800">{caseData.patientName}</span></div>
                    <div className="flex items-center gap-1"><Home size={18} className="text-red-500"/> سرير: <span className="font-bold text-gray-800">{caseData.bedNumber}</span></div>
                    <div className="flex items-center gap-1"><Clock size={18} className="text-red-500"/> منذ: <span className="font-bold text-gray-800">{caseData.timestamp?.toDate().toLocaleTimeString('ar-SA')}</span></div>
                    <div className="flex items-center gap-1"><Activity size={18} className="text-red-500"/> الأولوية: <PriorityBadge level={caseData.priority} /></div>
                    <div className="flex items-center gap-1"><User size={18} className="text-red-500"/> المسؤول: <span className="font-bold text-gray-800">{users.find(u => u.id === caseData.assignedToId)?.name || 'غير محدد'}</span></div>
                </div>

                {renderEMR()}

                {/* Treatment/Diagnosis Section */}
                <div className="mt-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
                        <Edit size={24}/> التشخيص والعلاج (للطبيب)
                    </h3>
                    
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-red-100">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">سبب القدوم</label>
                            <p className="p-3 bg-gray-50 rounded-lg border text-gray-800 font-semibold">{caseData.chiefComplaint}</p>
                        </div>
                        
                        <div className="mb-4">
                            <label htmlFor="diagnosis" className="block text-sm font-medium text-gray-700 mb-1">التشخيص (Diagnosis)</label>
                            <textarea
                                id="diagnosis"
                                value={diagnosis}
                                onChange={(e) => setDiagnosis(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg"
                                rows="2"
                                placeholder="التشخيص الأولي للحالة..."
                                disabled={!canEdit}
                            />
                        </div>

                        <div className="mb-6">
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">ملاحظات الطبيب</label>
                            <textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg"
                                rows="2"
                                placeholder="ملاحظات حول الفحص السريري..."
                                disabled={!canEdit}
                            />
                        </div>
                        
                        {/* Drug Requests */}
                        <h4 className="text-lg font-bold mb-3 mt-6 text-red-600 flex items-center gap-2"><Pill size={20}/> طلبات الأدوية (Pharmacy)</h4>
                        {drugs.map((drug, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={drug.name}
                                    onChange={(e) => handleDrugChange(index, 'name', e.target.value)}
                                    className="w-2/3 p-2 border border-gray-300 rounded-lg"
                                    placeholder="اسم الدواء..."
                                    disabled={!canEdit}
                                />
                                <input
                                    type="text"
                                    value={drug.dosage}
                                    onChange={(e) => handleDrugChange(index, 'dosage', e.target.value)}
                                    className="w-1/3 p-2 border border-gray-300 rounded-lg"
                                    placeholder="الجرعة (Dosage)"
                                    disabled={!canEdit}
                                />
                            </div>
                        ))}
                        {canEdit && (
                            <button type="button" onClick={() => setDrugs([...drugs, { name: '', dosage: '' }])} className="text-sm text-blue-600 hover:text-blue-800 mt-2 flex items-center gap-1">
                                <Plus size={16}/> إضافة دواء
                            </button>
                        )}
                        
                        {/* Lab Requests */}
                        <h4 className="text-lg font-bold mb-3 mt-6 text-red-600 flex items-center gap-2"><TestTube size={20}/> طلبات المختبر (Lab)</h4>
                        {labRequests.map((request, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={request}
                                    onChange={(e) => handleLabChange(index, e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    placeholder="اسم التحليل..."
                                    disabled={!canEdit}
                                />
                            </div>
                        ))}
                        {canEdit && (
                            <button type="button" onClick={() => setLabRequests([...labRequests, ''])} className="text-sm text-blue-600 hover:text-blue-800 mt-2 flex items-center gap-1">
                                <Plus size={16}/> إضافة تحليل
                            </button>
                        )}

                        {canEdit && (
                            <div className="mt-8 pt-4 border-t flex justify-end gap-3">
                                <button
                                    onClick={saveTreatmentAndRequests}
                                    disabled={isSaving || !canEdit}
                                    className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition disabled:opacity-50"
                                >
                                    {isSaving ? <Loader size={24} className="animate-spin" /> : 'حفظ التشخيص وطلبات العلاج'}
                                </button>
                            </div>
                        )}

                        {/* Case Closure */}
                        {permissions.canClose && isAssignedToMe && (
                            <div className="mt-8 pt-4 border-t flex justify-start">
                                <button
                                    onClick={closeCase}
                                    disabled={isSaving || !diagnosis}
                                    className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition disabled:opacity-50"
                                >
                                    {isSaving ? <Loader size={24} className="animate-spin" /> : 'إنهاء الحالة والتحول لـ "متفرغ"'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Processes Status Section (for Pharmacist/Nurse/Lab) */}
                <div className="mt-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
                        <Users size={24}/> تتبع العمليات
                    </h3>
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

// Triage/Reception Form (نموذج الاستقبال والفرز)
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

    // 🛏️ قائمة الأسرة المتاحة (كل عنصر هو obj يحتوي على bedNumber)
    const availableBeds = useMemo(() => {
        return beds
            .filter(b => !b.isOccupied)
            .sort((a, b) => a.bedNumber - b.bedNumber);
    }, [beds]);

    // 🩺 قائمة جميع الأطباء
    const doctorsList = useMemo(() => {
        return users.filter(u => u.role === 'طبيب');
    }, [users]);

    // قائمة الأطباء المتفرغين (متاحة ومنسجلة دخول)
    const availableDoctors = useMemo(() => {
        return doctorsList.filter(d => d.status === 'Available' && d.isClockedIn);
    }, [doctorsList]);

    // ❗ عند التغيير في الأسرة أو الأطباء - نعيّن افتراضياً أول سرير وطبيب متفرغ إذا وُجد
    useEffect(() => {
        if (availableBeds.length > 0) {
            setBed(availableBeds[0].bedNumber);
        } else {
            setBed(null);
        }

        if (availableDoctors.length > 0) {
            setAssignedDoctor(availableDoctors[0].id);
        } else {
            setAssignedDoctor("");
        }
    }, [availableBeds, availableDoctors]);

    // 🔍 البحث عن المريض في EMR
    const handleSearch = async () => {
        if (!patientId) return;
        try {
            const patientEMRQuery = query(
                collection(db, `artifacts/${appId}/public/data/closed_cases`),
                where('patientId', '==', patientId)
            );
            const snapshot = await getDocs(patientEMRQuery);
            if (snapshot.docs.length > 0) {
                const latestRecord = snapshot.docs[0].data();
                setSearchResult({
                    name: latestRecord.patientName,
                    allergies: latestRecord.allergies || 'لا توجد',
                    exists: true
                });
                setPatientName(latestRecord.patientName);
                setAllergies(latestRecord.allergies || '');
            } else {
                setSearchResult({ name: '', allergies: '', exists: false });
            }
        } catch (error) {
            console.error("Error searching EMR:", error);
            setSearchResult({ name: '', allergies: 'خطأ في البحث', exists: false });
        }
    };


    const ArchiveCaseDetail = ({ caseData, onClose, onRestore }) => {
    const [patientName, setPatientName] = useState(caseData.patientName);
    const [chiefComplaint, setChiefComplaint] = useState(caseData.chiefComplaint);
    const [allergies, setAllergies] = useState(caseData.allergies);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                
                <h2 className="text-2xl font-bold mb-4 text-gray-800">تفاصيل الحالة المؤرشفة</h2>

                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-700">اسم المريض</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={patientName}
                            onChange={e => setPatientName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-700">سبب القدوم</label>
                        <textarea
                            className="w-full border p-2 rounded"
                            rows="2"
                            value={chiefComplaint}
                            onChange={e => setChiefComplaint(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-700">الحساسية</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={allergies}
                            onChange={e => setAllergies(e.target.value)}
                        />
                    </div>
                    <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
        تحديد الأولوية (Triage)
    </label>
    <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="w-full p-3 border border-gray-300 rounded-lg bg-white"
    >
        <option value="أحمر">أحمر (حرجة)</option>
        <option value="أصفر">أصفر (متوسطة)</option>
        <option value="أخضر">أخضر (بسيطة)</option>
    </select>
</div>


                    <button
                        onClick={() => onRestore({ ...caseData, patientName, chiefComplaint, allergies })}
                        className="w-full py-3 bg-green-600 text-white rounded-lg mt-4 hover:bg-green-700"
                    >
                        إعادة إرسال الحالة للطبيب
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-gray-300 text-gray-700 rounded-lg mt-2 hover:bg-gray-400"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
};


    // 🗂️ حفظ كـ "أرشيف حالة”
    const handleArchiveCase = async () => {
        const finalPatientId = patientId || generatePatientId();
        setIsSubmitting(true);

        try {
            await addDoc(collection(db, `artifacts/${appId}/public/data/archived_cases`), {
                patientId: finalPatientId,
                patientName,
                chiefComplaint,
                priority,
                allergies,
                timestamp: serverTimestamp(),
                archivedBy: users.find(u => u.id === userId)?.name || 'نظام'
            });

            alert("تم نقل الحالة إلى الأرشيف بسبب عدم توفر طبيب.");
            onClose();

        } catch (error) {
            console.error("Error archiving:", error);
            alert("حدث خطأ أثناء حفظ الحالة بالأرشيف.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ▶️ الدالة الأساسية لحفظ الحالة (تُنفّذ قبل return)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting || !bed || !assignedDoctor || !patientName || !chiefComplaint) return;

        setIsSubmitting(true);
        const finalPatientId = patientId || generatePatientId(); // Generate new ID if not searched/provided

        try {
            // 1. Create the new Case record
            const newCaseData = {
                patientId: finalPatientId,
                patientName: patientName,
                chiefComplaint: chiefComplaint,
                priority: priority,
                allergies: allergies,
                bedNumber: bed,
                assignedToId: assignedDoctor,
                assignedToName: users.find(u => u.id === assignedDoctor)?.name || 'غير محدد',
                triageBy: users.find(u => u.id === userId)?.name || 'مستخدم',
                status: 'Triage', // Initial status
                timestamp: serverTimestamp(),
                processes: {
                    pharmacy: { status: 'Not Requested', items: [] },
                    lab: { status: 'Not Requested', items: [] },
                    nursing: { status: 'Not Requested', items: [] },
                }
            };

            const caseRef = await addDoc(collection(db, `artifacts/${appId}/public/data/cases`), newCaseData);

            // 2. Update Bed status
            const bedRef = doc(db, `artifacts/${appId}/public/data/beds`, bed.toString());
            await updateDoc(bedRef, { isOccupied: true, currentCaseId: caseRef.id });

            // 3. Update Doctor status to Busy
            const doctorRef = doc(db, `artifacts/${appId}/public/data/users`, assignedDoctor);
            await updateDoc(doctorRef, { status: 'Busy' });

            // 4. Update doctor's assigned cases count (optional optimization)
            const doctor = availableDoctors.find(d => d.id === assignedDoctor);
            if (doctor) {
                await updateDoc(doctorRef, { casesAssigned: (doctor.casesAssigned || 0) + 1 });
            }

            alert(`تم تسجيل الحالة بنجاح. السرير: ${bed}. الطبيب: ${newCaseData.assignedToName}`);
            onClose();

        } catch (error) {
            console.error("Error submitting triage form:", error);
            alert('حدث خطأ أثناء تسجيل الحالة.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ======== JSX (الـ return) ========
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl mx-auto my-10 rounded-xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                {/* عنوان */}
                <div className="flex justify-between items-start border-b pb-4 mb-4">
                    <h2 className="text-3xl font-extrabold text-red-700 flex items-center gap-3">
                        <Truck size={30} /> استقبال حالة طوارئ (فرز)
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200">
                        <XCircle size={24} />
                    </button>
                </div>

                {/* فورم */}
                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* البحث بالـEMR */}
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h3 className="text-lg font-bold text-blue-800 mb-3 flex items-center gap-2">
                            <Clipboard size={20}/> البحث عن ملف المريض (EMR)
                        </h3>

                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={patientId}
                                onChange={(e) => setPatientId(e.target.value)}
                                onBlur={handleSearch}
                                className="w-2/3 p-3 border border-gray-300 rounded-lg"
                                placeholder="أدخل رقم الملف / EMR ID"
                            />

                            <button
                                type="button"
                                onClick={handleSearch}
                                className="w-1/3 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
                            >
                                بحث
                            </button>
                        </div>

                        {searchResult && (
                            <div className={`mt-3 p-2 rounded-lg text-sm ${searchResult.exists ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {searchResult.exists ? `تم العثور على سجل سابق للمريض: ${searchResult.name}` : 'لا يوجد سجل سابق. سيتم إنشاء ملف جديد.'}
                            </div>
                        )}
                    </div>

                    {/* بيانات المريض */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم المريض</label>
                        <input
                            value={patientName}
                            onChange={(e) => setPatientName(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">سبب القدوم</label>
                        <textarea
                            value={chiefComplaint}
                            onChange={(e) => setChiefComplaint(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                            rows="2"
                            required
                        />
                    </div>

                    {/* الأسرة */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اختيار السرير</label>

                        <select
                            value={bed || ""}
                            onChange={(e) => setBed(Number(e.target.value))}
                            className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                            required
                        >
                            <option value="">اختر السرير</option>
                            {availableBeds.map(b => (
                                <option key={b.bedNumber} value={b.bedNumber}>
                                    السرير رقم {b.bedNumber}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* الأطباء */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الطبيب المسؤول</label>

                        <select
                            value={assignedDoctor || ""}
                            onChange={(e) => setAssignedDoctor(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                            required
                        >
                            <option value="">اختر الطبيب</option>

                            {doctorsList.map(doc => (
                                <option key={doc.id} value={doc.id}>
                                    {doc.name} — {doc.status === "Available" ? "🟢 متاح" : "🔴 مشغول"}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* زر حفظ الحالة */}
                    <button
                        type="submit"
                        disabled={isSubmitting || !bed || !assignedDoctor}
                        className="w-full py-4 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader size={24} className="animate-spin" /> : "تسجيل الحالة"}
                    </button>

                    {/* ❗ زر الأرشفة عند عدم وجود طبيب متاح */}
                    {availableDoctors.length === 0 && (
                        <button
                            type="button"
                            onClick={handleArchiveCase}
                            className="w-full mt-4 py-4 bg-gray-700 text-white rounded-lg shadow hover:bg-gray-800"
                        >
                            لا يوجد طبيب متاح — حفظ الحالة بالأرشيف
                        </button>
                    )}

                </form>
            </div>
        </div>
    );
};



// Dashboard (لوحة القيادة الرئيسية)
const Dashboard = ({ user, userInfo, userRole, permissions, logout, db }) => {
    const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'triage', 'timeclock'
    const [selectedCase, setSelectedCase] = useState(null);
    const { cases, users, beds, isLoadingData } = useFirestoreCollections(user?.uid, permissions);
    const [isStatusSaving, setIsStatusSaving] = useState(false);

    const [selectedArchived, setSelectedArchived] = useState(null);

const { archivedCases } = useFirestoreCollections(user.uid, permissions);

const handleRestoreArchived = async (caseData) => {
    try {

        // 1 — حذف الحالة من الأرشيف
        await deleteDoc(
            doc(db, `artifacts/${appId}/public/data/archived_cases`, caseData.id)
        );

        // 2 — إضافتها كحالة جديدة تمامًا (تظهر للاستقبال + للطبيب)
        const newCase = {
            patientId: caseData.patientId,
            patientName: caseData.patientName,
            chiefComplaint: caseData.chiefComplaint,
            allergies: caseData.allergies,
            priority: caseData.priority,

            bedNumber: null,                   // الاستقبال يختار سرير جديد
            assignedToId: "",                  // الطبيب غير محدد
            assignedToName: "غير محدد",        // مهم جداً

            triageBy: "Archive Restore",
            status: "Triage",                  // يظهر للاستقبال والطبيب
            timestamp: serverTimestamp(),

            processes: {
                pharmacy: { status: "Not Requested", items: [] },
                lab: { status: "Not Requested", items: [] },
                nursing: { status: "Not Requested", items: [] }
            }
        };

        await addDoc(
            collection(db, `artifacts/${appId}/public/data/cases`),
            newCase
        );

        alert("تمت إعادة فتح الحالة بنجاح!");
        setSelectedArchived(null);
        setCurrentView("dashboard");

    } catch (err) {
        console.error(err);
        alert("حدث خطأ أثناء إعادة فتح الحالة.");
    }
};




    {selectedArchived && (
    <ArchiveCaseDetail
        caseData={selectedArchived}
        onClose={() => setSelectedArchived(null)}
        onRestore={handleRestoreArchived}
    />
)}


// ============================
//  📁 Archive View – Full Version
// ============================
const ArchiveView = () => {
    const [archivedCases, setArchivedCases] = useState([]);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        const load = async () => {
            const q = await getDocs(
                collection(db, `artifacts/${appId}/public/data/archived_cases`)
            );
            setArchivedCases(q.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        load();
    }, []);

    // البحث بالاسم أو رقم الملف
    const filtered = archivedCases.filter(
        (c) =>
            c.patientName?.includes(search) ||
            c.patientId?.includes(search)
    );

    const handleDelete = async (id) => {
        if (!window.confirm("هل تريد حذف الحالة نهائياً؟")) return;

        await deleteDoc(
            doc(db, `artifacts/${appId}/public/data/archived_cases`, id)
        );

        setArchivedCases(prev => prev.filter(c => c.id !== id));
        alert("تم حذف الحالة.");
    };

    const handleRestore = async (caseData) => {
        const { id, ...rest } = caseData;

        // 1) حذف من الأرشيف
        await deleteDoc(
            doc(db, `artifacts/${appId}/public/data/archived_cases`, id)
        );

        // 2) إعادة إنشائها كحالة جديدة
        await addDoc(
            collection(db, `artifacts/${appId}/public/data/cases`),
            {
                ...rest,
                status: "Triage",
                timestamp: serverTimestamp(),
            }
        );

        alert("تم إعادة إرسال الحالة للطبيب.");
        setSelected(null);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold border-b pb-2 mb-4">📁 الأرشيف</h2>

            {/* 🔍 مربع البحث */}
            <input
                type="text"
                placeholder="ابحث باسم المريض أو رقم الملف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-3 border rounded-lg mb-4"
            />

            {filtered.length === 0 ? (
                <p className="text-center text-gray-500 py-10">
                    لا توجد نتائج مطابقة.
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className="p-4 bg-gray-50 rounded-lg shadow hover:bg-gray-100 cursor-pointer border"
                        >
                            <h3 className="font-bold text-lg text-gray-800">
                                {item.patientName}
                            </h3>
                            <p className="text-gray-600">{item.chiefComplaint}</p>

                            <p className="text-sm text-gray-500 mt-2">
                                رقم الملف: {item.patientId}
                            </p>

                            <div className="flex gap-2 mt-3">
                                {/* فتح */}
                                <button
                                    onClick={() => setSelected(item)}
                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    فتح
                                </button>

                                {/* حذف */}
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                    حذف
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* نافذة عرض التفاصيل */}
            {selected && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-2xl font-bold mb-4">
                            📝 تفاصيل الحالة المؤرشفة
                        </h2>

                        <div className="space-y-3">
                            <div>
                                <label className="text-sm">اسم المريض</label>
                                <input
                                    className="w-full border p-2 rounded"
                                    value={selected.patientName}
                                    onChange={(e) =>
                                        setSelected({
                                            ...selected,
                                            patientName: e.target.value,
                                        })
                                    }
                                />
                            </div>

                            <div>
                                <label className="text-sm">سبب القدوم</label>
                                <textarea
                                    className="w-full border p-2 rounded"
                                    rows="2"
                                    value={selected.chiefComplaint}
                                    onChange={(e) =>
                                        setSelected({
                                            ...selected,
                                            chiefComplaint: e.target.value,
                                        })
                                    }
                                ></textarea>
                            </div>

                            <div>
                                <label className="text-sm">الحساسية</label>
                                <input
                                    className="w-full border p-2 rounded"
                                    value={selected.allergies}
                                    onChange={(e) =>
                                        setSelected({
                                            ...selected,
                                            allergies: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        <button
                            className="w-full py-3 bg-green-600 text-white rounded-lg mt-4 hover:bg-green-700"
                            onClick={() => handleRestore(selected)}
                        >
                            إعادة إرسال الحالة للطبيب
                        </button>

                        <button
                            className="w-full py-3 bg-gray-600 text-white rounded-lg mt-2 hover:bg-gray-700"
                            onClick={() => setSelected(null)}
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};



    // Filter available doctors for the dashboard count
    const availableDoctorsCount = users.filter(u => u.role === 'طبيب' && u.status === 'Available' && u.isClockedIn).length;
    const occupiedBedsCount = beds.filter(b => b.isOccupied).length;
    const totalBedsCount = beds.length;

    // Status update handler from TimeClock component
    const handleTimeClockStatusUpdate = (newStatus, isClockedIn) => {
        // This is called when clocking in or out, and already updates Firebase
        // We just need to navigate back to the dashboard view
        setCurrentView('dashboard');
    };


    const HeaderCard = ({ title, value, icon, bgColor, textColor }) => (
        <div className={`p-5 rounded-xl shadow-lg border border-gray-200 flex items-center justify-between ${bgColor} text-white`}>
            <div>
                <p className="text-sm font-medium opacity-80">{title}</p>
                <h3 className="text-3xl font-extrabold">{value}</h3>
            </div>
            {icon}
        </div>
    );


    const CaseListItem = ({ caseItem }) => {
        const assignedDoctor = users.find(u => u.id === caseItem.assignedToId)?.name || 'غير محدد';
        const isMyCase = caseItem.assignedToId === user.uid;
        
        // Show only relevant cases unless Manager
        const isRelevant =
    permissions.canViewAll ||
    permissions.canTriage ||
    isMyCase ||
    permissions.pharmacy ||
    permissions.nursing;

if (!assignedDoctor || assignedDoctor === "") {
    alert("يجب تحديد طبيب مسؤول");
    setIsSubmitting(false);
    return;
}

        if (userRole === "استقبال") return;

        return (
            <div 
                className={`p-4 rounded-lg shadow-md border-r-8 ${
                    caseItem.priority === 'أحمر' ? 'border-red-600 bg-red-50 hover:bg-red-100' :
                    caseItem.priority === 'أصفر' ? 'border-yellow-600 bg-yellow-50 hover:bg-yellow-100' :
                    'border-green-600 bg-green-50 hover:bg-green-100'
                } cursor-pointer transition duration-150 ease-in-out`}
                onClick={() => setSelectedCase(caseItem)}
            >
                <div className="flex justify-between items-start mb-2">
                    <PriorityBadge level={caseItem.priority} />
                    {caseItem.timestamp && <p className="text-xs text-gray-500">منذ {((new Date() - caseItem.timestamp?.toDate()) / (1000 * 60)).toFixed(0)} دقيقة</p>}
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-1">{caseItem.patientName} (سرير #{caseItem.bedNumber})</h4>
                <p className="text-sm text-gray-600 truncate">{caseItem.chiefComplaint}</p>
                <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
                    <span><User size={14}/> المسؤول: {assignedDoctor}</span>
                    <StatusBadge status={caseItem.status} className="text-xs" />
                </div>
            </div>
        );
    };

const renderView = () => {
    if (isLoadingData) {
        return (
            <div className="text-center p-10 text-gray-500 font-semibold">
                <Loader size={30} className="animate-spin inline-block mr-2" />
                جارٍ تحميل بيانات النظام...
            </div>
        );
    }

    switch (currentView) {
        case 'timeclock':
            return (
                <TimeClock
                    userId={user?.uid}
                    userInfo={userInfo}
                    db={db}
                    onStatusUpdate={handleTimeClockStatusUpdate}
                />
            );

        case 'archive':
            return <ArchiveView />;   // 👈 فقط هذا، فقط فقط

        case 'dashboard':
    default:
        return (
            <div className="space-y-8">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <HeaderCard 
                                title="الحالات النشطة" 
                                value={cases.length} 
                                icon={<Activity size={40} />} 
                                bgColor="bg-red-600" 
                                textColor="text-white"
                            />
                            <HeaderCard 
                                title="حالات الأولوية الحمراء" 
                                value={cases.filter(c => c.priority === 'أحمر').length} 
                                icon={<AlertTriangle size={40} />} 
                                bgColor="bg-yellow-600" 
                                textColor="text-white"
                            />
                            <HeaderCard 
                                title="الأطباء المتفرغون" 
                                value={`${availableDoctorsCount} / ${users.filter(u => u.role === 'طبيب').length}`} 
                                icon={<User size={40} />} 
                                bgColor="bg-green-600" 
                                textColor="text-white"
                            />
                            <HeaderCard 
                                title="الأسرّة المتاحة" 
                                value={`${totalBedsCount - occupiedBedsCount} / ${totalBedsCount}`} 
                                icon={<Home size={40} />} 
                                bgColor="bg-blue-600" 
                                textColor="text-white"
                            />
                        </div>

                        {/* Cases List */}
                        <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">قائمة الحالات النشطة</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto">
                                {cases.length > 0 ? (
                                    cases.map(caseItem => <CaseListItem key={caseItem.id} caseItem={caseItem} />)
                                ) : (
                                    <div className="col-span-full text-center p-8 bg-gray-50 rounded-lg text-gray-600 font-semibold">
                                        لا توجد حالات طوارئ نشطة حالياً.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Staff Presence/Status (Visible only to Manager) */}
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
            {/* Navigation Bar */}
            <header className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-red-700">HEMS</h1>
                    <p className="text-gray-600 font-medium">{userInfo?.name} ({permissions.title})</p>
                    <StatusBadge status={userInfo?.status} className="hidden sm:inline-flex" />
                </div>
                <div className="flex items-center gap-4">
                    {permissions.canTriage && (
                        <button 
                            onClick={() => setCurrentView('triage')}
                            className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition"
                        >
                            <Plus size={18}/> تسجيل حالة طوارئ
                        </button>
                    )}
                    <button 
                        onClick={() => setCurrentView('timeclock')}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-300 transition"
                    >
                        <Clock size={18}/> ساعة الحضور
                    </button>
                    <button 
    onClick={() => setCurrentView('archive')}
    className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-300 transition"
>
    <FolderOpen size={18}/> الأرشيف
</button>

                    <button 
                        onClick={logout}
                        className="p-2 text-gray-500 hover:text-red-600 transition"
                    >
                        <LogOut size={24}/>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-6 flex-grow">
                {renderView()}
            </main>

            {/* Modals/Forms */}
            {currentView === 'triage' && permissions.canTriage && (
                <TriageForm userId={user.uid} users={users} beds={beds} onClose={() => setCurrentView('dashboard')} />
            )}
            {selectedCase && (
                <CaseDetail 
                    caseData={selectedCase} 
                    onClose={() => setSelectedCase(null)} 
                    users={users} 
                    userId={user.uid} 
                    permissions={permissions} 
                />
            )}
        </div>
    );
};


// App Component (The Main Router)
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

    // 1. User is logged in but profile is not set up (first-time login)
    if (user && !isUserSetup) {
        return <UserProfileSetup user={user} setupUser={setupUser} isLoading={isLoading} />;
    }

    // 2. User is logged in and profile is set up
    if (user && isUserSetup) {
return (
  <Dashboard
    user={user}
    userInfo={userInfo}
    userRole={userRole}
    permissions={permissions}
    logout={logout}
    db={db}   // ←← الحل هنا
  />
);
    }

    // 3. User is not logged in
    return <LoginScreen login={login} isLoading={isLoading} />;
};

export default App;
