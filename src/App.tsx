import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Circle, 
  Bell, 
  RefreshCw, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  Coffee,
  Briefcase,
  LogIn,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfWeek, addDays, isSameDay, addHours, startOfDay, intervalToDuration } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast, { Toaster } from 'react-hot-toast';
import { cn } from './lib/utils';

// Firebase Imports
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, loginWithGoogle, logout as firebaseLogout } from './lib/firebase';

// Types
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface ScheduleEntry {
  id: string;
  title: string;
  startTime: string; // ISO String
  endTime: string;   // ISO String
  type: 'study' | 'work' | 'personal' | 'other';
  notes?: string;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 10 PM

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  
  // States for Modals
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<ScheduleEntry>>({
    type: 'study',
    startTime: new Date().toISOString(),
    endTime: addHours(new Date(), 1).toISOString()
  });

  // Auth & Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        console.error("Firestore Test Detail:", error);
        if(error.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
      if (u) {
        toast.success(`Chào mừng ${u.displayName || 'bạn'}!`);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Firestore Sync - Tasks
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const q = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => unsubscribe();
  }, [user]);

  // Firestore Sync - Schedule
  useEffect(() => {
    if (!user) {
      setSchedule([]);
      return;
    }

    const q = query(collection(db, 'schedule'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduleEntry));
      setSchedule(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedule');
    });

    return () => unsubscribe();
  }, [user]);

  // Auth Handlers
  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      console.error("Firebase Login Error:", e);
      if (e.code === 'auth/popup-blocked') {
        toast.error("Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup.");
      } else if (e.code === 'auth/unauthorized-domain') {
        toast.error("Tên miền này chưa được ủy quyền trong Firebase Auth.");
      } else {
        toast.error("Đăng nhập thất bại. Kiểm tra Console (F12) để biết chi tiết.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseLogout();
      toast.success("Đã đăng xuất.");
    } catch (e) {
      toast.error("Lỗi khi đăng xuất.");
    }
  };

  // Task Handlers
  const addTask = async () => {
    if (!newTaskText.trim() || !user) return;
    const taskData = {
      text: newTaskText,
      completed: false,
      createdAt: Date.now(),
      userId: user.uid
    };
    
    try {
      await addDoc(collection(db, 'tasks'), taskData);
      setNewTaskText('');
      setShowTaskInput(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tasks');
    }
  };

  const toggleTask = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'tasks', task.id), { completed: !task.completed });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${task.id}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
    }
  };

  // Schedule Handlers
  const addScheduleEntry = async () => {
    if (!newEntry.title || !user) return;
    const entryData = {
      ...newEntry,
      userId: user.uid
    };
    
    try {
      await addDoc(collection(db, 'schedule'), entryData);
      setShowScheduleForm(false);
      toast.success("Đã thêm lịch!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'schedule');
    }
  };

  const startOfWeekDate = startOfWeek(currentDate, { weekStartsOn: 1 });

  // Reminder Logic
  useEffect(() => {
    const notifiedIds = new Set<string>();
    
    const checkReminders = () => {
      const now = new Date();
      schedule.forEach(event => {
        const startTime = new Date(event.startTime);
        const diffInMinutes = (startTime.getTime() - now.getTime()) / (1000 * 60);
        
        // Notify 5 minutes before
        if (diffInMinutes > 0 && diffInMinutes <= 10 && !notifiedIds.has(event.id)) {
          toast(`Sắp đến lúc: ${event.title} (${format(startTime, 'HH:mm')})`, {
            icon: '⏰',
            duration: 6000
          });
          notifiedIds.add(event.id);
          
          // Basic sound notification if allowed
          if (Notification.permission === "granted") {
            new Notification("Lịch nhắc nhở", {
              body: `Sắp đến: ${event.title} lúc ${format(startTime, 'HH:mm')}`,
              icon: '/favicon.ico'
            });
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000); // Check every 30s
    
    // Request permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => clearInterval(interval);
  }, [schedule]);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden text-slate-800">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between glass-card m-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Lịch Cá Nhân</h1>
            <p className="text-xs text-slate-500 font-medium">{format(new Date(), "'Ngày' d 'tháng' M, yyyy", { locale: vi })}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-400">Đã đồng bộ</p>
                <p className="text-sm font-semibold">{user.displayName || 'Thành viên'}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Đăng xuất"
              >
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
            >
              <LogIn size={16} /> Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* Main Layout */}
      {!user && !isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md p-10 glass-card flex flex-col items-center gap-6"
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Cloud size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Lưu trữ đám mây</h2>
                <p className="text-slate-500 mt-2">Đăng nhập bằng Google để đồng bộ lịch và danh sách công việc của bạn trên mọi thiết bị.</p>
              </div>
              <button 
                onClick={handleLogin}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3"
              >
                <LogIn size={20} /> Tiếp tục với Google
              </button>
            </motion.div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden px-4 pb-4 gap-4">
        
        {/* Sidebar - To-Do List */}
        <aside className="w-80 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 glass-card flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-blue-600" />
                Việc cần làm
              </h2>
              <button 
                onClick={() => setShowTaskInput(true)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
              <AnimatePresence>
                {showTaskInput && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-3 bg-blue-50 rounded-xl border border-blue-100"
                  >
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Nội dung công việc..."
                      className="w-full bg-transparent outline-none text-sm"
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setShowTaskInput(false)} className="text-[10px] text-slate-500 uppercase font-bold">Hủy</button>
                      <button onClick={addTask} className="text-[10px] text-blue-600 uppercase font-bold">Thêm</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {tasks.length === 0 && !showTaskInput && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-10 opacity-60">
                   <CheckCircle2 size={40} strokeWidth={1} />
                   <p className="text-sm">Chưa có việc nào!</p>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {tasks.map(task => (
                  <motion.div 
                    layout
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white hover:border-blue-200 transition-all cursor-pointer"
                    onClick={() => toggleTask(task)}
                  >
                    {task.completed ? (
                      <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                    ) : (
                      <Circle size={20} className="text-slate-300 shrink-0" />
                    )}
                    <span 
                      className={cn(
                        "flex-1 text-sm transition-all",
                        task.completed && "text-slate-400 line-through"
                      )}
                    >
                      {task.text}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          
          {/* Quick Reminder Status */}
          <div className="glass-card p-4 flex items-center gap-3">
             <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 shrink-0">
               <Bell size={20} />
             </div>
             <div className="flex-1">
               <p className="text-xs font-bold text-slate-400 uppercase">Sắp đến</p>
               <p className="text-sm font-semibold truncate leading-tight">
                 {schedule.filter(s => new Date(s.startTime) > new Date()).length > 0 
                  ? "Bạn có " + schedule.filter(s => new Date(s.startTime) > new Date()).length + " sự kiện sắp tới"
                  : "Không có sự kiện nào gần đây"}
               </p>
             </div>
          </div>
        </aside>

        {/* Schedule Grid */}
        <main className="flex-1 glass-card flex flex-col overflow-hidden">
          {/* Calendar Controls */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="font-bold flex items-center gap-2">
                <CalendarIcon size={18} className="text-blue-600" />
                Thời gian biểu
              </h2>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setCurrentDate(prev => addDays(prev, -7))}
                  className="p-1 hover:bg-white rounded-md shadow-sm transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-xs font-bold min-w-32 text-center uppercase tracking-wider">
                  {format(startOfWeekDate, "d MMM", { locale: vi })} - {format(addDays(startOfWeekDate, 6), "d MMM", { locale: vi })}
                </span>
                <button 
                  onClick={() => setCurrentDate(prev => addDays(prev, 7))}
                  className="p-1 hover:bg-white rounded-md shadow-sm transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => setShowScheduleForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-100"
            >
              <Plus size={16} /> Thêm lịch học/làm
            </button>
          </div>

          {/* Grid Content */}
          <div className="flex-1 overflow-auto custom-scrollbar relative">
            <div className="flex min-w-[800px]">
              {/* Time Column */}
              <div className="w-20 shrink-0 sticky left-0 bg-white/95 backdrop-blur-sm z-20 pt-12 border-right border-slate-100">
                {HOURS.map(hour => (
                  <div key={hour} className="h-20 flex flex-col justify-start items-center">
                    <span className="text-[10px] font-bold text-slate-400 mt-[-7px]">{hour}:00</span>
                    <div className="flex-1 w-px bg-slate-100" />
                  </div>
                ))}
              </div>

              {/* Days Columns */}
              {[0, 1, 2, 3, 4, 5, 6].map(dayOffset => {
                const day = addDays(startOfWeekDate, dayOffset);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div key={dayOffset} className="flex-1 border-l border-slate-100 min-h-full">
                    {/* Day Header */}
                    <div className={cn(
                      "sticky top-0 h-12 flex flex-col items-center justify-center bg-white z-10 border-b border-slate-100",
                      isToday && "text-blue-600"
                    )}>
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                        {format(day, "EEEE", { locale: vi })}
                      </span>
                      <span className={cn(
                        "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                        isToday && "bg-blue-600 text-white ring-4 ring-blue-50"
                      )}>
                        {format(day, "d")}
                      </span>
                    </div>

                    {/* Hour Slots */}
                    <div className="relative h-[1280px]"> {/* 16 hours * 80px */}
                       {HOURS.map(hour => (
                         <div key={hour} className="h-20 border-b border-slate-50/50" />
                       ))}

                       {/* Event Blocks */}
                       {schedule
                         .filter(event => isSameDay(new Date(event.startTime), day))
                         .map(event => {
                           const start = new Date(event.startTime);
                           const end = new Date(event.endTime);
                           const startHour = start.getHours() + start.getMinutes() / 60;
                           const endHour = end.getHours() + end.getMinutes() / 60;
                           const top = (startHour - 6) * 80;
                           const height = (endHour - startHour) * 80;

                           const variants = {
                             study: "bg-blue-50 border-blue-400 text-blue-700",
                             work: "bg-amber-50 border-amber-400 text-amber-700",
                             personal: "bg-emerald-50 border-emerald-400 text-emerald-700",
                             other: "bg-slate-50 border-slate-400 text-slate-700"
                           };

                           const icons = {
                             study: <BookOpen size={12} />,
                             work: <Briefcase size={12} />,
                             personal: <Coffee size={12} />,
                             other: <Clock size={12} />
                           };

                           return (
                             <motion.div 
                               initial={{ opacity: 0, scale: 0.9 }}
                               animate={{ opacity: 1, scale: 1 }}
                               key={event.id}
                               style={{ top, height }}
                               className={cn(
                                 "schedule-block left-1 right-1 overflow-hidden",
                                 variants[event.type]
                               )}
                             >
                               <div className="flex items-center gap-1 mb-1">
                                 {icons[event.type]}
                                 <span className="font-bold truncate">{event.title}</span>
                               </div>
                               <div className="opacity-70 text-[10px]">
                                 {format(start, "HH:mm")} - {format(end, "HH:mm")}
                               </div>
                             </motion.div>
                           )
                         })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
      )}

      {/* Modal - Schedule Form */}
      <AnimatePresence>
        {showScheduleForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowScheduleForm(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                 <CalendarIcon className="text-blue-600" />
                 Thêm sự kiện mới
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400 ml-1">Tiêu đề</label>
                  <input 
                    type="text" 
                    placeholder="VD: Học Toán 1..." 
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-blue-300 transition-all font-medium"
                    value={newEntry.title || ''}
                    onChange={e => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 ml-1">Bắt đầu</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-blue-300 transition-all text-sm"
                      onChange={e => setNewEntry(prev => ({ ...prev, startTime: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 ml-1">Kết thúc</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-blue-300 transition-all text-sm"
                      onChange={e => setNewEntry(prev => ({ ...prev, endTime: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                </div>

                <div>
                   <label className="text-xs font-bold uppercase text-slate-400 ml-1">Loại công việc</label>
                   <div className="flex gap-2 mt-1">
                      {(['study', 'work', 'personal', 'other'] as const).map(type => (
                        <button 
                          key={type}
                          onClick={() => setNewEntry(prev => ({ ...prev, type }))}
                          className={cn(
                            "flex-1 p-2 rounded-lg text-[10px] font-bold uppercase transition-all border",
                            newEntry.type === type 
                              ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100" 
                              : "bg-white text-slate-500 border-slate-100 hover:border-blue-200"
                          )}
                        >
                          {type === 'study' && "Học"}
                          {type === 'work' && "Làm"}
                          {type === 'personal' && "Cá nhân"}
                          {type === 'other' && "Khác"}
                        </button>
                      ))}
                   </div>
                </div>

                <button 
                  onClick={addScheduleEntry}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold mt-4 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                >
                  Xác nhận thêm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
