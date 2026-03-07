import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, ScrollView, Switch, Alert, Animated, Easing,
  StyleSheet, StatusBar, Platform, Clipboard, ToastAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════
// Firebase Config
// ═══════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCxkYBpw4IQ-2g4weXYPHtc26Q8jqKYKhw",
  authDomain: "battle-loop.firebaseapp.com",
  projectId: "battle-loop",
  storageBucket: "battle-loop.firebasestorage.app",
  messagingSenderId: "708677493822",
  appId: "1:708677493822:web:efa14981af32d06b025d6f"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ═══════════════════════════════════════
// Colors
// ═══════════════════════════════════════
const C = {
  bg: '#0F0E17',
  surface: '#1A1825',
  card: '#221F35',
  border: '#2E2A45',
  primary: '#7B5EA7',
  primaryLight: '#9B7DC7',
  high: '#E53935',
  medium: '#FF8C00',
  low: '#2ECC71',
  text: '#F0EFF4',
  textDim: '#8B8A9B',
  green: '#2ECC71',
  red: '#E53935',
  orange: '#FF8C00',
  white: '#FFFFFF',
};

// ═══════════════════════════════════════
// Storage Keys
// ═══════════════════════════════════════
const KEYS = {
  tasks: 'tasks_db_v2',
  notes: 'notes_db_v2',
  settings: 'app_settings_v1',
};

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════
const showToast = (msg) => {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
};

const priorityColor = (p) => p === 'عالية' ? C.high : p === 'متوسطة' ? C.medium : C.low;

const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
};

// ═══════════════════════════════════════
// Sync Indicator
// ═══════════════════════════════════════
function SyncDot({ status }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status === 'syncing') {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })).start();
    } else {
      spin.stopAnimation(); spin.setValue(0);
    }
  }, [status]);
  const rotate = spin.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] });
  const color = status === 'connected' ? C.green : status === 'syncing' ? C.orange : C.red;
  const icon = status === 'connected' ? '☁️' : status === 'syncing' ? '🔄' : '📵';
  return (
    <Animated.Text style={{ transform: status === 'syncing' ? [{ rotate }] : [], fontSize: 20 }}>
      {icon}
    </Animated.Text>
  );
}

// ═══════════════════════════════════════
// Main App
// ═══════════════════════════════════════
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [settings, setSettings] = useState({ syncEnabled: true, offlineMode: false, hideCompleted: false, lastSync: 0 });
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('disconnected');
  const [showTrash, setShowTrash] = useState(false);
  const [taskModal, setTaskModal] = useState({ visible: false, task: null, parentId: null });
  const [noteModal, setNoteModal] = useState({ visible: false, note: null });
  const [copyModal, setCopyModal] = useState({ visible: false, taskId: null, isSub: false });
  const drawerAnim = useRef(new Animated.Value(-320)).current;

  // Load data
  useEffect(() => {
    loadData();
    const unsubscribe = NetInfo.addEventListener(state => {
      setSyncStatus(state.isConnected ? 'connected' : 'disconnected');
    });
    return unsubscribe;
  }, []);

  const loadData = async () => {
    try {
      const t = await AsyncStorage.getItem(KEYS.tasks);
      const n = await AsyncStorage.getItem(KEYS.notes);
      const s = await AsyncStorage.getItem(KEYS.settings);
      if (t) setTasks(JSON.parse(t));
      if (n) setNotes(JSON.parse(n));
      if (s) setSettings(JSON.parse(s));
    } catch (e) {}
  };

  const saveTasks = async (list) => {
    setTasks(list);
    await AsyncStorage.setItem(KEYS.tasks, JSON.stringify(list));
  };

  const saveNotes = async (list) => {
    setNotes(list);
    await AsyncStorage.setItem(KEYS.notes, JSON.stringify(list));
  };

  const saveSettings = async (s) => {
    setSettings(s);
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s));
  };

  // Drawer animation
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: -320, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setDrawerOpen(false));
  };

  // Firebase sync
  const syncToFirebase = async () => {
    if (!settings.syncEnabled || settings.offlineMode || syncStatus === 'disconnected') return;
    setSyncStatus('syncing');
    try {
      const batch = writeBatch(db);
      tasks.forEach(t => batch.set(doc(db, 'tasks_db_v2', t.id), t));
      notes.forEach(n => batch.set(doc(db, 'notes_db_v2', n.id), n));
      await batch.commit();
      const newSettings = { ...settings, lastSync: Date.now() };
      await saveSettings(newSettings);
      showToast('✅ تمت المزامنة');
    } catch (e) {
      showToast('❌ فشلت المزامنة');
    }
    setSyncStatus('connected');
  };

  // Task operations
  const addTask = (title, details, priority, startDate, endDate, parentId = null) => {
    const newTask = { id: uuidv4(), title, details, detailsBold: false, priority, startDate, endDate, completed: false, parentId, deleted: false, deletedAt: null, createdAt: Date.now() };
    saveTasks([...tasks, newTask]);
  };

  const updateTask = (updated) => saveTasks(tasks.map(t => t.id === updated.id ? updated : t));

  const toggleComplete = (id) => saveTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));

  const toggleBold = (id) => saveTasks(tasks.map(t => t.id === id ? { ...t, detailsBold: !t.detailsBold } : t));

  const deleteTask = (id) => {
    const now = Date.now();
    saveTasks(tasks.map(t => (t.id === id || t.parentId === id) ? { ...t, deleted: true, deletedAt: now } : t));
  };

  const restoreTask = (id) => saveTasks(tasks.map(t => t.id === id ? { ...t, deleted: false, deletedAt: null } : t));

  const copyTaskText = (id, withSubs) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    let text = `✅ ${task.title}`;
    if (task.details) text += `\n${task.details}`;
    if (withSubs) {
      const subs = tasks.filter(t => t.parentId === id && !t.deleted);
      subs.forEach(s => { text += `\n  • ${s.title}`; if (s.details) text += `\n    ${s.details}`; });
    }
    Clipboard.setString(text);
    showToast('تم النسخ 📋');
  };

  const copySubText = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    Clipboard.setString(`• ${task.title}${task.details ? '\n' + task.details : ''}`);
    showToast('تم النسخ 📋');
  };

  // Note operations
  const addNote = (title, content, tags) => saveNotes([...notes, { id: uuidv4(), title, content, tags, deleted: false, deletedAt: null, createdAt: Date.now() }]);
  const updateNote = (updated) => saveNotes(notes.map(n => n.id === updated.id ? updated : n));
  const deleteNote = (id) => saveNotes(notes.map(n => n.id === id ? { ...n, deleted: true, deletedAt: Date.now() } : n));
  const restoreNote = (id) => saveNotes(notes.map(n => n.id === id ? { ...n, deleted: false, deletedAt: null } : n));

  // Factory reset
  const factoryReset = () => {
    Alert.alert('⚠️ ضبط المصنع', 'سيُحذف كل شيء نهائياً. هل أنت متأكد تماماً؟',
      [{ text: 'إلغاء', style: 'cancel' },
       { text: 'احذف كل شيء', style: 'destructive', onPress: async () => {
         await AsyncStorage.clear();
         setTasks([]); setNotes([]); setSettings({ syncEnabled: true, offlineMode: false, hideCompleted: false, lastSync: 0 });
         showToast('تم مسح كل شيء');
       }}]);
  };

  // Filtered lists
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const filteredTasks = tasks.filter(t => !t.deleted && !(settings.hideCompleted && t.completed) && t.parentId === null && (search === '' || t.title.includes(search) || t.details?.includes(search)));
  const filteredNotes = notes.filter(n => !n.deleted && (search === '' || n.title.includes(search) || n.content?.includes(search)));
  const trashedTasks = tasks.filter(t => t.deleted && t.deletedAt && (now - t.deletedAt < THIRTY_DAYS));
  const trashedNotes = notes.filter(n => n.deleted && n.deletedAt && (now - n.deletedAt < THIRTY_DAYS));

  if (showTrash) return <TrashScreen tasks={trashedTasks} notes={trashedNotes} onRestoreTask={restoreTask} onRestoreNote={restoreNote} onBack={() => setShowTrash(false)} />;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={openDrawer} style={s.menuBtn}>
          <Text style={s.menuIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>مهامي</Text>
        <SyncDot status={syncStatus} />
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          placeholder="بحث في المهام والملاحظات..."
          placeholderTextColor={C.textDim}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
        {search !== '' && <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}><Text style={{ color: C.textDim }}>✕</Text></TouchableOpacity>}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'tasks' && s.tabActive]} onPress={() => setTab('tasks')}>
          <Text style={[s.tabText, tab === 'tasks' && s.tabTextActive]}>✅ المهام</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'notes' && s.tabActive]} onPress={() => setTab('notes')}>
          <Text style={[s.tabText, tab === 'notes' && s.tabTextActive]}>📝 الملاحظات</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {tab === 'tasks' ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              subTasks={tasks.filter(t => t.parentId === item.id && !t.deleted)}
              onToggle={() => toggleComplete(item.id)}
              onBold={() => toggleBold(item.id)}
              onEdit={() => setTaskModal({ visible: true, task: item, parentId: null })}
              onDelete={() => deleteTask(item.id)}
              onAddSub={() => setTaskModal({ visible: true, task: null, parentId: item.id })}
              onCopy={() => setCopyModal({ visible: true, taskId: item.id, isSub: false })}
              onCopySub={copySubText}
              onToggleSub={toggleComplete}
              onBoldSub={toggleBold}
            />
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>📋</Text><Text style={s.emptyText}>لا توجد مهام</Text></View>}
        />
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <NoteCard note={item} onEdit={() => setNoteModal({ visible: true, note: item })} onDelete={() => deleteNote(item.id)} />
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>📝</Text><Text style={s.emptyText}>لا توجد ملاحظات</Text></View>}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => tab === 'tasks' ? setTaskModal({ visible: true, task: null, parentId: null }) : setNoteModal({ visible: true, note: null })}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Drawer */}
      {drawerOpen && (
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closeDrawer} />
      )}
      <Animated.View style={[s.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <Text style={s.drawerTitle}>⚙️ الإعدادات</Text>

        <DrawerItem label="المزامنة السحابية" value={settings.syncEnabled} onToggle={() => saveSettings({ ...settings, syncEnabled: !settings.syncEnabled })} icon="☁️" />
        <DrawerItem label="وضع عدم الاتصال" value={settings.offlineMode} onToggle={() => saveSettings({ ...settings, offlineMode: !settings.offlineMode })} icon="📵" />
        <DrawerItem label="إخفاء المكتملة" value={settings.hideCompleted} onToggle={() => saveSettings({ ...settings, hideCompleted: !settings.hideCompleted })} icon="👁️" />

        <TouchableOpacity style={s.drawerBtn} onPress={syncToFirebase}>
          <Text style={s.drawerBtnText}>🔄 مزامنة يدوية</Text>
        </TouchableOpacity>

        <View style={s.drawerDivider} />

        <TouchableOpacity style={s.drawerBtn} onPress={() => { closeDrawer(); setShowTrash(true); }}>
          <Text style={s.drawerBtnText}>🗑️ المهملات</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.drawerBtn, { borderColor: C.red }]} onPress={() => { closeDrawer(); factoryReset(); }}>
          <Text style={[s.drawerBtnText, { color: C.red }]}>⚠️ ضبط المصنع</Text>
        </TouchableOpacity>

        {settings.lastSync > 0 && (
          <Text style={s.lastSync}>آخر مزامنة: {formatDate(settings.lastSync)}</Text>
        )}
      </Animated.View>

      {/* Task Modal */}
      <TaskModal
        visible={taskModal.visible}
        task={taskModal.task}
        parentId={taskModal.parentId}
        onSave={(title, details, priority, startDate, endDate) => {
          if (taskModal.task) updateTask({ ...taskModal.task, title, details, priority, startDate, endDate });
          else addTask(title, details, priority, startDate, endDate, taskModal.parentId);
          setTaskModal({ visible: false, task: null, parentId: null });
        }}
        onClose={() => setTaskModal({ visible: false, task: null, parentId: null })}
      />

      {/* Note Modal */}
      <NoteModal
        visible={noteModal.visible}
        note={noteModal.note}
        onSave={(title, content, tags) => {
          if (noteModal.note) updateNote({ ...noteModal.note, title, content, tags });
          else addNote(title, content, tags);
          setNoteModal({ visible: false, note: null });
        }}
        onClose={() => setNoteModal({ visible: false, note: null })}
      />

      {/* Copy Modal */}
      <Modal visible={copyModal.visible} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} onPress={() => setCopyModal({ visible: false, taskId: null, isSub: false })} />
        <View style={s.copyBox}>
          <Text style={s.copyTitle}>نسخ المهمة</Text>
          <TouchableOpacity style={s.copyBtn} onPress={() => { copyTaskText(copyModal.taskId, false); setCopyModal({ visible: false }); }}>
            <Text style={s.copyBtnText}>نسخ الرئيسية فقط</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.copyBtn} onPress={() => { copyTaskText(copyModal.taskId, true); setCopyModal({ visible: false }); }}>
            <Text style={s.copyBtnText}>نسخ مع الفرعية</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCopyModal({ visible: false })}><Text style={{ color: C.textDim, textAlign: 'center', marginTop: 8 }}>إلغاء</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════
// TaskCard
// ═══════════════════════════════════════
function TaskCard({ task, subTasks, onToggle, onBold, onEdit, onDelete, onAddSub, onCopy, onCopySub, onToggleSub, onBoldSub }) {
  const [showSubs, setShowSubs] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const pc = priorityColor(task.priority);

  return (
    <View style={[s.card, { borderLeftColor: pc, borderLeftWidth: 3 }]}>
      <View style={s.cardRow}>
        <TouchableOpacity onPress={onToggle} style={s.checkbox}>
          <Text style={{ fontSize: 18 }}>{task.completed ? '✅' : '⬜'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.taskTitle, task.completed && s.strikethrough]}>{task.title}</Text>
          {task.details !== '' && (
            <Text style={[s.taskDetails, task.detailsBold && { fontWeight: 'bold', fontSize: 14 }]}>{task.details}</Text>
          )}
          {task.endDate && <Text style={s.dateText}>📅 {formatDate(task.endDate)}</Text>}
        </View>
        <TouchableOpacity onPress={onBold} style={s.boldBtn}>
          <Text style={{ color: task.detailsBold ? C.primary : C.textDim, fontWeight: 'bold' }}>B</Text>
        </TouchableOpacity>
        <View style={[s.badge, { backgroundColor: pc + '33' }]}>
          <Text style={[s.badgeText, { color: pc }]}>{task.priority}</Text>
        </View>
        <TouchableOpacity onPress={() => setMenuOpen(!menuOpen)} style={s.moreBtn}>
          <Text style={{ color: C.textDim, fontSize: 18 }}>⋮</Text>
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={s.menu}>
          {[
            { label: '✏️ تعديل', action: () => { setMenuOpen(false); onEdit(); } },
            { label: '➕ إضافة فرعية', action: () => { setMenuOpen(false); onAddSub(); } },
            { label: '📋 نسخ', action: () => { setMenuOpen(false); onCopy(); } },
            { label: '🗑️ حذف', action: () => { setMenuOpen(false); onDelete(); }, danger: true },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={s.menuItem} onPress={item.action}>
              <Text style={[s.menuItemText, item.danger && { color: C.red }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {subTasks.length > 0 && (
        <TouchableOpacity onPress={() => setShowSubs(!showSubs)} style={s.subsToggle}>
          <Text style={s.subsToggleText}>{showSubs ? '▲' : '▼'} {subTasks.length} مهام فرعية</Text>
        </TouchableOpacity>
      )}

      {showSubs && subTasks.map(sub => (
        <SubTaskCard key={sub.id} task={sub} onToggle={() => onToggleSub(sub.id)} onBold={() => onBoldSub(sub.id)} onCopy={() => onCopySub(sub.id)} />
      ))}
    </View>
  );
}

function SubTaskCard({ task, onToggle, onBold, onCopy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={s.subCard}>
      <TouchableOpacity onPress={onToggle}>
        <Text style={{ fontSize: 16 }}>{task.completed ? '✅' : '⬜'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, marginHorizontal: 8 }}>
        <Text style={[s.taskTitle, { fontSize: 13 }, task.completed && s.strikethrough]}>{task.title}</Text>
        {task.details !== '' && <Text style={[s.taskDetails, task.detailsBold && { fontWeight: 'bold' }]}>{task.details}</Text>}
      </View>
      <TouchableOpacity onPress={onBold}><Text style={{ color: C.textDim, fontWeight: 'bold', fontSize: 12 }}>B</Text></TouchableOpacity>
      <TouchableOpacity onPress={onCopy} style={{ marginLeft: 8 }}><Text style={{ color: C.textDim, fontSize: 12 }}>📋</Text></TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════
// NoteCard
// ═══════════════════════════════════════
function NoteCard({ note, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={s.card}>
      <View style={s.cardRow}>
        <Text style={[s.taskTitle, { flex: 1 }]}>{note.title}</Text>
        <TouchableOpacity onPress={() => setMenuOpen(!menuOpen)}>
          <Text style={{ color: C.textDim, fontSize: 18 }}>⋮</Text>
        </TouchableOpacity>
      </View>
      {note.content !== '' && <Text style={s.taskDetails}>{note.content}</Text>}
      {note.tags?.length > 0 && (
        <View style={s.tagsRow}>
          {note.tags.map((tag, i) => (
            <View key={i} style={s.tag}><Text style={s.tagText}>#{tag}</Text></View>
          ))}
        </View>
      )}
      {menuOpen && (
        <View style={s.menu}>
          <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); onEdit(); }}>
            <Text style={s.menuItemText}>✏️ تعديل</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); onDelete(); }}>
            <Text style={[s.menuItemText, { color: C.red }]}>🗑️ حذف</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// TaskModal
// ═══════════════════════════════════════
function TaskModal({ visible, task, parentId, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState('متوسطة');
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    if (task) { setTitle(task.title); setDetails(task.details || ''); setPriority(task.priority); setEndDate(task.endDate); }
    else { setTitle(''); setDetails(''); setPriority('متوسطة'); setEndDate(null); }
  }, [task, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>{task ? 'تعديل المهمة' : parentId ? 'مهمة فرعية جديدة' : 'مهمة جديدة'}</Text>
          <TextInput style={s.input} placeholder="العنوان *" placeholderTextColor={C.textDim} value={title} onChangeText={setTitle} textAlign="right" />
          <TextInput style={[s.input, { minHeight: 70 }]} placeholder="التفاصيل" placeholderTextColor={C.textDim} value={details} onChangeText={setDetails} multiline textAlign="right" />
          <Text style={s.label}>الأولوية:</Text>
          <View style={s.priorityRow}>
            {['عالية', 'متوسطة', 'منخفضة'].map(p => (
              <TouchableOpacity key={p} style={[s.priorityChip, priority === p && { backgroundColor: priorityColor(p) + '44', borderColor: priorityColor(p) }]} onPress={() => setPriority(p)}>
                <Text style={[s.priorityChipText, priority === p && { color: priorityColor(p) }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>تاريخ النهاية: {endDate ? formatDate(endDate) : 'غير محدد'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TouchableOpacity style={s.dateBtn} onPress={() => setEndDate(Date.now() + 7*24*60*60*1000)}><Text style={s.dateBtnText}>+ أسبوع</Text></TouchableOpacity>
            <TouchableOpacity style={s.dateBtn} onPress={() => setEndDate(Date.now() + 30*24*60*60*1000)}><Text style={s.dateBtnText}>+ شهر</Text></TouchableOpacity>
            {endDate && <TouchableOpacity style={s.dateBtn} onPress={() => setEndDate(null)}><Text style={[s.dateBtnText, { color: C.red }]}>مسح</Text></TouchableOpacity>}
          </View>
          <View style={s.modalBtns}>
            <TouchableOpacity style={s.saveBtn} onPress={() => { if (!title.trim()) return showToast('العنوان مطلوب'); onSave(title.trim(), details.trim(), priority, Date.now(), endDate); }}>
              <Text style={s.saveBtnText}>حفظ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════
// NoteModal
// ═══════════════════════════════════════
function NoteModal({ visible, note, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);

  useEffect(() => {
    if (note) { setTitle(note.title); setContent(note.content || ''); setTags(note.tags || []); }
    else { setTitle(''); setContent(''); setTags([]); }
    setTagInput('');
  }, [note, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>{note ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}</Text>
          <TextInput style={s.input} placeholder="العنوان" placeholderTextColor={C.textDim} value={title} onChangeText={setTitle} textAlign="right" />
          <TextInput style={[s.input, { minHeight: 90 }]} placeholder="المحتوى" placeholderTextColor={C.textDim} value={content} onChangeText={setContent} multiline textAlign="right" />
          <View style={s.tagInputRow}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="وسم" placeholderTextColor={C.textDim} value={tagInput} onChangeText={setTagInput} textAlign="right" />
            <TouchableOpacity style={s.addTagBtn} onPress={() => { if (tagInput.trim() && !tags.includes(tagInput.trim())) { setTags([...tags, tagInput.trim()]); setTagInput(''); } }}>
              <Text style={{ color: C.white }}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={s.tagsRow}>
            {tags.map((tag, i) => (
              <TouchableOpacity key={i} style={s.tag} onPress={() => setTags(tags.filter((_, j) => j !== i))}>
                <Text style={s.tagText}>#{tag} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.modalBtns}>
            <TouchableOpacity style={s.saveBtn} onPress={() => { if (!title.trim()) return showToast('العنوان مطلوب'); onSave(title.trim(), content.trim(), tags); }}>
              <Text style={s.saveBtnText}>حفظ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════
// TrashScreen
// ═══════════════════════════════════════
function TrashScreen({ tasks, notes, onRestoreTask, onRestoreNote, onBack }) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.menuBtn}><Text style={s.menuIcon}>←</Text></TouchableOpacity>
        <Text style={s.headerTitle}>🗑️ المهملات</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {tasks.length === 0 && notes.length === 0 && (
          <View style={s.empty}><Text style={s.emptyIcon}>🗑️</Text><Text style={s.emptyText}>المهملات فارغة</Text><Text style={[s.emptyText, { fontSize: 12 }]}>تُحذف العناصر نهائياً بعد 30 يوم</Text></View>
        )}
        {tasks.length > 0 && <Text style={s.sectionTitle}>المهام المحذوفة</Text>}
        {tasks.map(t => (
          <View key={t.id} style={s.card}>
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{t.title}</Text>
                {t.details ? <Text style={s.taskDetails}>{t.details}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => onRestoreTask(t.id)} style={s.restoreBtn}>
                <Text style={s.restoreBtnText}>استعادة</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {notes.length > 0 && <Text style={s.sectionTitle}>الملاحظات المحذوفة</Text>}
        {notes.map(n => (
          <View key={n.id} style={s.card}>
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{n.title}</Text>
                {n.content ? <Text style={s.taskDetails}>{n.content}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => onRestoreNote(n.id)} style={s.restoreBtn}>
                <Text style={s.restoreBtnText}>استعادة</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════
// DrawerItem
// ═══════════════════════════════════════
function DrawerItem({ label, value, onToggle, icon }) {
  return (
    <View style={s.drawerItem}>
      <Text style={s.drawerItemIcon}>{icon}</Text>
      <Text style={s.drawerItemLabel}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.white} />
    </View>
  );
}

// ═══════════════════════════════════════
// Styles
// ═══════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: C.surface },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: C.text },
  menuBtn: { padding: 8 },
  menuIcon: { fontSize: 22, color: C.text },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, padding: 12, color: C.text, fontSize: 14 },
  clearBtn: { padding: 12 },
  tabs: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 4, backgroundColor: C.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.primary },
  tabText: { color: C.textDim, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: C.white },
  card: { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: { marginRight: 10, marginTop: 2 },
  taskTitle: { color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  taskDetails: { color: C.textDim, fontSize: 12, marginTop: 3, textAlign: 'right' },
  strikethrough: { textDecorationLine: 'line-through', color: C.textDim },
  dateText: { color: C.textDim, fontSize: 11, marginTop: 3, textAlign: 'right' },
  boldBtn: { padding: 6, marginHorizontal: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  moreBtn: { padding: 6 },
  menu: { backgroundColor: C.surface, borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: C.border },
  menuItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  menuItemText: { color: C.text, textAlign: 'right' },
  subsToggle: { paddingTop: 8 },
  subsToggleText: { color: C.primary, fontSize: 12, textAlign: 'right' },
  subCard: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingLeft: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: C.primary + '33', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { color: C.primaryLight, fontSize: 11 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { fontSize: 30, color: C.white, lineHeight: 34 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 290, backgroundColor: C.surface, zIndex: 20, padding: 24, paddingTop: 60, borderRightWidth: 1, borderRightColor: C.border },
  drawerTitle: { fontSize: 20, fontWeight: 'bold', color: C.text, marginBottom: 24, textAlign: 'right' },
  drawerItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  drawerItemIcon: { fontSize: 18, marginRight: 8 },
  drawerItemLabel: { flex: 1, color: C.text, textAlign: 'right' },
  drawerBtn: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  drawerBtnText: { color: C.text, textAlign: 'right', fontWeight: '600' },
  drawerDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  lastSync: { color: C.textDim, fontSize: 11, textAlign: 'right', marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 16 },
  input: { backgroundColor: C.card, borderRadius: 12, padding: 12, color: C.text, marginBottom: 12, borderWidth: 1, borderColor: C.border, fontSize: 14 },
  label: { color: C.textDim, fontSize: 13, textAlign: 'right', marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12, justifyContent: 'flex-end' },
  priorityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  priorityChipText: { color: C.textDim, fontSize: 13 },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  dateBtnText: { color: C.text, fontSize: 12 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: C.primary, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: C.white, fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { flex: 1, backgroundColor: C.card, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textDim, fontSize: 15 },
  tagInputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  addTagBtn: { backgroundColor: C.primary, padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', width: 44 },
  copyBox: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: C.surface, borderRadius: 20, padding: 20, zIndex: 30, borderWidth: 1, borderColor: C.border },
  copyTitle: { color: C.text, fontWeight: 'bold', fontSize: 16, textAlign: 'right', marginBottom: 12 },
  copyBtn: { backgroundColor: C.primary, padding: 14, borderRadius: 12, marginBottom: 8 },
  copyBtnText: { color: C.white, textAlign: 'center', fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: C.textDim, fontSize: 16 },
  sectionTitle: { color: C.textDim, fontSize: 13, fontWeight: 'bold', textAlign: 'right', marginBottom: 8, marginTop: 8 },
  restoreBtn: { backgroundColor: C.primary + '33', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  restoreBtnText: { color: C.primaryLight, fontSize: 12, fontWeight: '600' },
});
