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
    <div className="flex flex-col h-screen max-h-screen overflow-hidden text-rose-700 font-sans">
      <Toaster position="top-right" />
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20 -z-10">
        <div className="absolute top-10 left-10 text-4xl animate-float" style={{ animationDelay: '0s' }}>🌸</div>
        <div className="absolute top-40 right-20 text-3xl animate-float" style={{ animationDelay: '1s' }}>⭐</div>
        <div className="absolute bottom-20 left-1/4 text-4xl animate-float" style={{ animationDelay: '2.5s' }}>🎀</div>
        <div className="absolute bottom-40 right-10 text-5xl animate-float" style={{ animationDelay: '1.5s' }}>🍭</div>
      </div>
      
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between glass-card m-4 shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-200 animate-float">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none text-rose-600">Lịch của bé Ngọc Hà 🌸</h1>
            <p className="text-xs text-rose-400 font-bold">{format(new Date(), "'Ngày' d 'tháng' M, yyyy", { locale: vi })}</p>
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
              className="px-4 py-2 bg-primary text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-rose-600 transition-all shadow-md shadow-pink-100"
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
              <div className="w-20 h-20 bg-pink-50 text-rose-500 rounded-3xl flex items-center justify-center animate-beat">
                <Cloud size={40} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-rose-600">Góc nhỏ của Ngọc Hà ✨</h2>
                <p className="text-rose-400 mt-2 font-medium">Đăng nhập để xem lịch học và vui chơi của bé đã được lưu trên mây nhé!</p>
              </div>
              <button 
                onClick={handleLogin}
                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:bg-rose-600 transition-all shadow-xl shadow-pink-100 flex items-center justify-center gap-3"
              >
                <LogIn size={20} /> Bắt đầu thôi nào! 🎀
              </button>
            </motion.div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden px-4 pb-4 gap-4">
        
        {/* Sidebar - To-Do List */}
        <aside className="w-80 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 glass-card flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2 text-rose-600">
                <CheckCircle2 size={18} className="text-rose-500" />
                Việc bé cần làm
              </h2>
              <button 
                onClick={() => setShowTaskInput(true)}
                className="w-8 h-8 rounded-full bg-pink-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-all shadow-sm"
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
                    className="p-3 bg-pink-50 rounded-xl border border-pink-100"
                  >
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Ngọc Hà muốn làm gì nè? ✨"
                      className="w-full bg-transparent outline-none text-sm font-bold text-rose-600 placeholder:text-rose-300"
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setShowTaskInput(false)} className="text-[10px] text-rose-400 uppercase font-bold">Thôi ạ</button>
                      <button onClick={addTask} className="text-[10px] text-rose-600 uppercase font-bold">Thêm luôn! 🌸</button>
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
                    className="group flex items-center gap-3 p-3 bg-white border border-pink-50 rounded-2xl hover:border-pink-200 transition-all cursor-pointer shadow-sm hover:shadow-md"
                    onClick={() => toggleTask(task)}
                  >
                    {task.completed ? (
                      <CheckCircle2 size={20} className="text-rose-500 shrink-0" />
                    ) : (
                      <Circle size={20} className="text-pink-200 shrink-0" />
                    )}
                    <span 
                      className={cn(
                        "flex-1 text-sm font-bold transition-all",
                        task.completed ? "text-pink-200 line-through" : "text-rose-700"
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
          <div className="glass-card p-4 flex items-center gap-3 border-pink-100 bg-gradient-to-r from-pink-50 to-white">
             <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
               <Bell size={20} className="animate-bounce" />
             </div>
             <div className="flex-1">
               <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Tin nhắn cho bé</p>
               <p className="text-sm font-bold text-rose-700 truncate leading-tight">
                 {schedule.filter(s => new Date(s.startTime) > new Date()).length > 0 
                  ? "Bé có " + schedule.filter(s => new Date(s.startTime) > new Date()).length + " lịch sắp tới kìa!"
                  : "Hôm nay bé hãy vui chơi thật ngoan nhé!"}
               </p>
             </div>
          </div>
        </aside>

        {/* Schedule Grid */}
        <main className="flex-1 glass-card flex flex-col overflow-hidden">
          {/* Calendar Controls */}
          <div className="p-4 border-b border-pink-50 flex items-center justify-between bg-white/50">
            <div className="flex items-center gap-4">
              <h2 className="font-bold flex items-center gap-2 text-rose-600">
                <CalendarIcon size={18} className="text-rose-500" />
                Thời gian biểu của Hà
              </h2>
              <div className="flex items-center gap-1 bg-pink-50 p-1 rounded-xl">
                <button 
                  onClick={() => setCurrentDate(prev => addDays(prev, -7))}
                  className="p-1 hover:bg-white rounded-lg shadow-sm transition-all text-rose-400"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-[10px] font-bold min-w-32 text-center uppercase tracking-widest text-rose-500">
                  {format(startOfWeekDate, "d MMM", { locale: vi })} - {format(addDays(startOfWeekDate, 6), "d MMM", { locale: vi })}
                </span>
                <button 
                  onClick={() => setCurrentDate(prev => addDays(prev, 7))}
                  className="p-1 hover:bg-white rounded-lg shadow-sm transition-all text-rose-400"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => setShowScheduleForm(true)}
              className="px-4 py-2 bg-primary text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-rose-600 active:scale-95 transition-all shadow-md shadow-pink-100"
            >
              <Plus size={16} /> Thêm lịch cho bé 🩰
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
                      "sticky top-0 h-12 flex flex-col items-center justify-center bg-white z-10 border-b border-pink-50",
                      isToday && "text-primary"
                    )}>
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                        {format(day, "EEEE", { locale: vi })}
                      </span>
                      <span className={cn(
                        "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-white ring-4 ring-pink-50"
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
                             study: "bg-sky-50 border-sky-300 text-sky-700 shadow-sky-100",
                             work: "bg-lavender/30 border-lavender/60 text-purple-700 shadow-purple-100",
                             personal: "bg-pink-50 border-primary text-rose-700 shadow-pink-100",
                             other: "bg-accent/20 border-accent/60 text-amber-700 shadow-amber-100"
                           };

                           const icons = {
                             study: <BookOpen size={12} className="text-sky-500" />,
                             work: <Briefcase size={12} className="text-purple-500" />,
                             personal: <Coffee size={12} className="text-pink-500" />,
                             other: <Clock size={12} className="text-amber-500" />
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
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-rose-600">
                 <CalendarIcon className="text-primary" />
                 Thêm lịch cho bé mới nè
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-rose-300 ml-1">Bé làm gì?</label>
                  <input 
                    type="text" 
                    placeholder="VD: Bé đi học múa..." 
                    className="w-full p-3 bg-pink-50/50 border border-pink-100 rounded-2xl outline-none focus:border-primary transition-all font-bold text-rose-700 placeholder:text-rose-200"
                    value={newEntry.title || ''}
                    onChange={e => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-rose-300 ml-1">Lúc nào?</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 bg-pink-50/50 border border-pink-100 rounded-2xl outline-none focus:border-primary transition-all text-xs font-bold text-rose-600"
                      onChange={e => setNewEntry(prev => ({ ...prev, startTime: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-rose-300 ml-1">Xong lúc?</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 bg-pink-50/50 border border-pink-100 rounded-2xl outline-none focus:border-primary transition-all text-xs font-bold text-rose-600"
                      onChange={e => setNewEntry(prev => ({ ...prev, endTime: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                </div>

                <div>
                   <label className="text-[10px] font-bold uppercase text-rose-300 ml-1">Loại lịch nè</label>
                   <div className="flex gap-2 mt-1">
                      {(['study', 'work', 'personal', 'other'] as const).map(type => (
                        <button 
                          key={type}
                          onClick={() => setNewEntry(prev => ({ ...prev, type }))}
                          className={cn(
                            "flex-1 p-2 rounded-xl text-[10px] font-bold uppercase transition-all border-2",
                            newEntry.type === type 
                              ? "bg-primary text-white border-primary shadow-lg shadow-pink-100" 
                              : "bg-white text-rose-300 border-pink-50 hover:border-pink-200"
                          )}
                        >
                          {type === 'study' && "Học tập"}
                          {type === 'work' && "Việc nhà"}
                          {type === 'personal' && "Vui chơi"}
                          {type === 'other' && "Khác"}
                        </button>
                      ))}
                   </div>
                </div>

                <button 
                  onClick={addScheduleEntry}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold mt-4 hover:bg-rose-600 transition-all shadow-xl shadow-pink-100 active:scale-95"
                >
                  Xong rồi ạ! ✨
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
