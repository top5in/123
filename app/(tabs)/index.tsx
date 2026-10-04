import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { buildCalendarDays, dateKey, isPastDateTime, isTaskExpired, pad, parseDateKey, removeTaskById } from "@/lib/planner";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PlannerTask = {
  id: string;
  title: string;
  date: string;
  time: string;
  done: boolean;
  reminder: boolean;
  notificationId?: string;
};

const TASKS_STORAGE_KEY = "daily-planner-tasks-v1";
const WEEK_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const ACCENT = "#E36B4E";
const GREEN = "#26856B";

function formatMonth(date: Date) {
  const label = date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatSelectedDate(key: string) {
  const label = parseDateKey(key).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function configureNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("planner-alarm-reminders", {
      name: "Будильник ежедневника",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: ACCENT,
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

async function scheduleReminder(task: PlannerTask) {
  if (Platform.OS === "web" || !task.reminder) return undefined;
  const [hour, minute] = task.time.split(":").map(Number);
  const triggerDate = parseDateKey(task.date);
  triggerDate.setHours(hour, minute, 0, 0);
  if (triggerDate.getTime() <= Date.now()) return undefined;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Время дела",
        body: task.title,
        data: { taskId: task.id },
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: "planner-alarm-reminders",
      },
    });
  } catch {
    return undefined;
  }
}

export default function HomeScreen() {
  const colors = useColors();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [visibleMonth, setVisibleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [actionTask, setActionTask] = useState<PlannerTask | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinutes, setPickerMinutes] = useState("00");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [reminder, setReminder] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(TASKS_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const savedTasks = JSON.parse(stored) as PlannerTask[];
          const normalizedTasks = savedTasks.map((task) => ({
            ...task,
            done: task.done || isTaskExpired(task.date, task.time),
          }));
          setTasks(normalizedTasks);
          if (JSON.stringify(normalizedTasks) !== JSON.stringify(savedTasks)) {
            void AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(normalizedTasks));
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));

    if (Platform.OS !== "web") {
      configureNotifications().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (isLoading || tasks.length === 0) return;
    const timer = setInterval(() => {
      setTasks((currentTasks) => {
        const normalizedTasks = currentTasks.map((task) => ({
          ...task,
          done: task.done || isTaskExpired(task.date, task.time),
        }));
        if (normalizedTasks.some((task, index) => task.done !== currentTasks[index].done)) {
          void AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(normalizedTasks));
        }
        return normalizedTasks;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, [isLoading, tasks.length]);

  const persistTasks = async (nextTasks: PlannerTask[]) => {
    setTasks(nextTasks);
    await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks));
  };

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, todayKey),
    [visibleMonth, todayKey],
  );

  const selectedTasks = useMemo(
    () => tasks.filter((task) => task.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [selectedDate, tasks],
  );

  const monthTaskCount = useMemo(
    () => tasks.filter((task) => task.date.startsWith(`${visibleMonth.getFullYear()}-${pad(visibleMonth.getMonth() + 1)}`)).length,
    [tasks, visibleMonth],
  );

  const openComposer = (task?: PlannerTask) => {
    setEditingTaskId(task?.id ?? null);
    setTitle(task?.title ?? "");
    setTime(task?.time ?? "09:00");
    setReminder(task?.reminder ?? true);
    setShowComposer(true);
  };

  const openTimePicker = () => {
    const [hour, minute] = time.split(":").map(Number);
    setPickerHour(Number.isFinite(hour) ? hour : 9);
    setPickerMinutes(Number.isFinite(minute) ? pad(minute) : "00");
    setShowComposer(false);
    setShowTimePicker(true);
  };

  const applyTime = () => {
    const minutes = pickerMinutes.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
    if (!/^([0-5]\d)$/.test(minutes)) {
      Alert.alert("Проверьте минуты", "Введите значение от 00 до 59.");
      return;
    }
    setTime(`${pad(pickerHour)}:${minutes}`);
    setShowTimePicker(false);
    setShowComposer(true);
  };

  const closeTimePicker = () => {
    setShowTimePicker(false);
    setShowComposer(true);
  };

  const saveTask = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert("Добавьте название", "Напишите, что нужно сделать.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert("Проверьте время", "Используйте формат ЧЧ:ММ, например 18:30.");
      return;
    }
    if (isPastDateTime(selectedDate, time)) {
      Alert.alert("Это время уже прошло", "Выберите время позже текущего или будущую дату.");
      return;
    }

    const nextTask: PlannerTask = {
      id: editingTaskId ?? `${Date.now()}`,
      title: cleanTitle,
      date: selectedDate,
      time,
      done: false,
      reminder,
    };

    const previousTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : undefined;
    if (previousTask?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(previousTask.notificationId).catch(() => undefined);
    }
    if (reminder && Platform.OS !== "web") {
      const allowed = await configureNotifications();
      if (allowed) nextTask.notificationId = await scheduleReminder(nextTask);
    }

    const nextTasks = editingTaskId
      ? tasks.map((task) => task.id === editingTaskId ? { ...nextTask, done: task.done } : task)
      : [...tasks, nextTask];
    await persistTasks(nextTasks);
    setShowComposer(false);
    setEditingTaskId(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const toggleTask = async (task: PlannerTask) => {
    const nextDone = !task.done;
    if (nextDone && task.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(task.notificationId).catch(() => undefined);
    }
    const nextTasks = tasks.map((item) => item.id === task.id ? { ...item, done: nextDone } : item);
    await persistTasks(nextTasks);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const deleteTask = async (task: PlannerTask) => {
    if (task.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(task.notificationId).catch(() => undefined);
    }
    await persistTasks(removeTaskById(tasks, task.id));
    setActionTask(null);
  };

  const removeTask = (task: PlannerTask) => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || window.confirm(`Удалить дело «${task.title}»?`)) {
        void deleteTask(task);
      }
      return;
    }
    Alert.alert("Удалить дело?", task.title, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => { void deleteTask(task); } },
    ]);
  };

  const editSelectedTask = () => {
    const task = actionTask;
    setActionTask(null);
    if (task) openComposer(task);
  };

  const deleteSelectedTask = () => {
    const task = actionTask;
    setActionTask(null);
    if (task) removeTask(task);
  };

  const moveMonth = (delta: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(dateKey(nextMonth));
  };

  const moveTaskToTomorrow = async (task: PlannerTask) => {
    if (task.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(task.notificationId).catch(() => undefined);
    }
    const tomorrow = parseDateKey(task.date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const movedTask: PlannerTask = { ...task, date: dateKey(tomorrow), done: false, notificationId: undefined };
    if (Platform.OS !== "web" && !isPastDateTime(movedTask.date, movedTask.time)) {
      const allowed = await configureNotifications();
      if (allowed) movedTask.notificationId = await scheduleReminder(movedTask);
    }
    await persistTasks(tasks.map((item) => item.id === task.id ? movedTask : item));
    setActionTask(null);
  };

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <View>
          </View>
          <Pressable
            accessibilityLabel="Добавить дело"
            onPress={() => openComposer()}
            style={({ pressed }) => [styles.addHeaderButton, { backgroundColor: ACCENT }, pressed && styles.pressed]}
          >
            <MaterialIcons name="add" size={25} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={[styles.monthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.monthHeader}>
            <Pressable onPress={() => moveMonth(-1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <MaterialIcons name="chevron-left" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>{formatMonth(visibleMonth)}</Text>
            <Pressable onPress={() => moveMonth(1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <MaterialIcons name="chevron-right" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEK_LABELS.map((label) => <Text key={label} style={[styles.weekLabel, { color: colors.muted }]}>{label}</Text>)}
          </View>
          <FlatList
            data={calendarDays}
            numColumns={7}
            scrollEnabled={false}
            keyExtractor={(item) => item.date}
            columnWrapperStyle={styles.calendarRow}
            renderItem={({ item }) => {
              const selected = item.date === selectedDate;
              const dayHasTasks = tasks.some((task) => task.date === item.date && !task.done);
              return (
                <Pressable
                  onPress={() => setSelectedDate(item.date)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    selected && { backgroundColor: ACCENT },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[
                    styles.dayText,
                    { color: item.currentMonth ? colors.foreground : colors.muted },
                    selected && styles.selectedDayText,
                    item.isToday && !selected && { color: ACCENT, fontWeight: "800" },
                  ]}>{item.day}</Text>
                  {dayHasTasks && <View style={[styles.taskDot, { backgroundColor: selected ? "#FFFFFF" : ACCENT }]} />}
                </Pressable>
              );
            }}
          />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{formatSelectedDate(selectedDate)}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Выберите день и добавьте дела</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: "#FCE8E1" }]}>
            <Text style={[styles.countText, { color: ACCENT }]}>{monthTaskCount} в месяце</Text>
          </View>
        </View>

        {selectedTasks.length > 0 && (
          <Pressable onPress={() => openComposer()} style={({ pressed }) => [styles.addAnotherButton, { borderColor: ACCENT }, pressed && styles.pressed]}>
            <MaterialIcons name="add" size={18} color={ACCENT} />
            <Text style={[styles.addAnotherText, { color: ACCENT }]}>Добавить ещё дело</Text>
          </Pressable>
        )}

        {isLoading ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Загружаем ваш план…</Text>
          </View>
        ) : (
          <FlatList
            data={selectedTasks}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={selectedTasks.length === 0 ? styles.emptyList : undefined}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: "#FCE8E1" }]}>
                  <MaterialIcons name="event-note" size={28} color={ACCENT} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>День пока свободен</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Добавьте дело, чтобы день стал понятнее.</Text>
                <Pressable onPress={() => openComposer()} style={({ pressed }) => [styles.emptyButton, { borderColor: ACCENT }, pressed && styles.pressed]}>
                  <Text style={[styles.emptyButtonText, { color: ACCENT }]}>Добавить дело</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => removeTask(item)}
                style={({ pressed }) => [styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Pressable onPress={() => toggleTask(item)} style={styles.checkButton}>
                  <View style={[styles.checkbox, { borderColor: item.done ? GREEN : colors.border }, item.done && { backgroundColor: GREEN }]}>
                    {item.done && <MaterialIcons name="check" size={15} color="#FFFFFF" />}
                  </View>
                </Pressable>
                <View style={styles.taskMain}>
                  <Text style={[styles.taskTime, { color: ACCENT }]}>{item.time}</Text>
                  <Text style={[styles.taskTitle, { color: colors.foreground }, item.done && styles.doneText]}>{item.title}</Text>
                  {item.reminder && !item.done && <View style={styles.reminderLine}><MaterialIcons name="notifications-none" size={14} color={colors.muted} /><Text style={[styles.reminderText, { color: colors.muted }]}>Будильник включён</Text></View>}
                </View>
                <Pressable onPress={() => setActionTask(item)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <MaterialIcons name="more-horiz" size={22} color={colors.muted} />
                </Pressable>
              </Pressable>
            )}
          />
        )}

        <View style={[styles.tipCard, { backgroundColor: "#E9F3EE" }]}>
          <View style={[styles.tipIcon, { backgroundColor: "#D1E9DE" }]}><MaterialIcons name="lightbulb-outline" size={20} color={GREEN} /></View>
          <View style={styles.tipCopy}>
            <Text style={[styles.tipTitle, { color: GREEN }]}>Маленький шаг — тоже план</Text>
            <Text style={[styles.tipText, { color: "#4C7565" }]}>Разбейте большие дела на конкретные действия с временем.</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={actionTask !== null} transparent animationType="fade" onRequestClose={() => setActionTask(null)}>
        <View style={styles.actionBackdrop}>
          <View style={[styles.actionMenu, { backgroundColor: colors.background }]}> 
            <View style={styles.actionMenuTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionMenuEyebrow, { color: ACCENT }]}>ДЕЙСТВИЯ</Text>
                <Text style={[styles.actionMenuTitle, { color: colors.foreground }]} numberOfLines={1}>{actionTask?.title}</Text>
              </View>
              <Pressable onPress={() => setActionTask(null)} style={styles.closeButton}>
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable
              onPress={editSelectedTask}
              accessibilityRole="button"
              accessibilityLabel="Изменить данные дела"
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#FCE8E1" }]}><MaterialIcons name="edit" size={20} color={ACCENT} /></View>
              <View><Text style={[styles.actionTitle, { color: colors.foreground }]}>Изменить данные</Text><Text style={[styles.actionSubtitle, { color: colors.muted }]}>Название, время или напоминание</Text></View>
            </Pressable>
            <Pressable
              onPress={() => {
                if (actionTask) moveTaskToTomorrow(actionTask);
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#E9F3EE" }]}><MaterialIcons name="event-repeat" size={20} color={GREEN} /></View>
              <View><Text style={[styles.actionTitle, { color: colors.foreground }]}>Перенести на завтра</Text><Text style={[styles.actionSubtitle, { color: colors.muted }]}>Сохранить дело и напоминание</Text></View>
            </Pressable>
            <Pressable
              onPress={deleteSelectedTask}
              accessibilityRole="button"
              accessibilityLabel="Удалить дело"
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#FBE8E6" }]}><MaterialIcons name="delete-outline" size={20} color="#C9584C" /></View>
              <View><Text style={[styles.actionTitle, { color: "#C9584C" }]}>Удалить дело</Text><Text style={[styles.actionSubtitle, { color: colors.muted }]}>Это действие нельзя отменить</Text></View>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={closeTimePicker}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={closeTimePicker} />
          <View style={[styles.timeSheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: ACCENT }]}>ВРЕМЯ ДЕЛА</Text>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Выберите час</Text>
              </View>
              <Pressable onPress={closeTimePicker} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <View style={styles.hourGrid}>
              {Array.from({ length: 24 }, (_, hour) => (
                <Pressable key={hour} onPress={() => setPickerHour(hour)} style={({ pressed }) => [styles.hourCell, { backgroundColor: pickerHour === hour ? ACCENT : colors.surface, borderColor: pickerHour === hour ? ACCENT : colors.border }, pressed && styles.pressed]}>
                  <Text style={[styles.hourText, { color: pickerHour === hour ? "#FFFFFF" : colors.foreground }]}>{pad(hour)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.minuteRow}>
              <View style={styles.minuteCopy}>
                <MaterialIcons name="more-time" size={21} color={ACCENT} />
                <View><Text style={[styles.reminderTitle, { color: colors.foreground }]}>Минуты</Text><Text style={[styles.reminderSubtext, { color: colors.muted }]}>Введите вручную</Text></View>
              </View>
              <TextInput value={pickerMinutes} onChangeText={setPickerMinutes} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={colors.muted} style={[styles.minuteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            </View>
            <Pressable onPress={applyTime} style={({ pressed }) => [styles.saveButton, { backgroundColor: ACCENT }, pressed && styles.pressed]}>
              <MaterialIcons name="check" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Выбрать {pad(pickerHour)}:{pickerMinutes || "00"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showComposer} transparent animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowComposer(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: ACCENT }]}>{editingTaskId ? "РЕДАКТИРОВАНИЕ" : "НОВОЕ ДЕЛО"}</Text>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{editingTaskId ? "Изменить дело" : "Что запланировать?"}</Text>
              </View>
              <Pressable onPress={() => setShowComposer(false)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>ДЕЛО</Text>
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                placeholder="Например, позвонить клиенту"
                placeholderTextColor={colors.muted}
                style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                returnKeyType="done"
              />
              <View style={styles.formRow}>
                <View style={styles.timeField}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>ВРЕМЯ</Text>
                  <Pressable onPress={openTimePicker} style={({ pressed }) => [styles.timeInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
                    <MaterialIcons name="schedule" size={19} color={ACCENT} />
                    <Text style={[styles.timeInput, { color: colors.foreground }]}>{time}</Text>
                    <MaterialIcons name="keyboard-arrow-down" size={19} color={colors.muted} />
                  </Pressable>
                </View>
                <View style={styles.dateField}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>ДАТА</Text>
                  <View style={[styles.datePill, { backgroundColor: "#FCE8E1" }]}>
                    <MaterialIcons name="event" size={17} color={ACCENT} />
                    <Text style={[styles.datePillText, { color: ACCENT }]}>{parseDateKey(selectedDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.reminderToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.reminderCopy}>
                  <View style={[styles.reminderIcon, { backgroundColor: "#FCE8E1" }]}><MaterialIcons name="notifications-none" size={21} color={ACCENT} /></View>
                  <View><Text style={[styles.reminderTitle, { color: colors.foreground }]}>Будильник в это время</Text><Text style={[styles.reminderSubtext, { color: colors.muted }]}>Звук и вибрация на телефоне</Text></View>
                </View>
                <Switch value={reminder} onValueChange={setReminder} trackColor={{ false: colors.border, true: "#F4B29F" }} thumbColor={reminder ? ACCENT : "#F4F5F5"} />
              </View>
                <Pressable onPress={saveTask} style={({ pressed }) => [styles.saveButton, { backgroundColor: ACCENT }, pressed && styles.pressed]}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>{editingTaskId ? "Сохранить изменения" : "Сохранить дело"}</Text>
              </Pressable>
              {Platform.OS === "web" && <Text style={[styles.webNote, { color: colors.muted }]}>В веб-просмотре напоминания не показываются, но в мобильной версии они будут работать.</Text>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingTop: 18, paddingBottom: 34 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 31, lineHeight: 38, fontWeight: "800", letterSpacing: -0.7 },
  addHeaderButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  monthCard: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 13, marginBottom: 26 },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  monthTitle: { fontSize: 17, fontWeight: "800" },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  weekRow: { flexDirection: "row", marginBottom: 7 },
  weekLabel: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700" },
  calendarRow: { justifyContent: "space-around" },
  dayCell: { width: "14.28%", height: 39, alignItems: "center", justifyContent: "center", borderRadius: 13, position: "relative" },
  dayText: { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  selectedDayText: { color: "#FFFFFF", fontWeight: "800" },
  taskDot: { width: 4, height: 4, borderRadius: 2, position: "absolute", bottom: 5 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 3 },
  sectionSubtitle: { fontSize: 12, lineHeight: 17 },
  countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  countText: { fontSize: 11, fontWeight: "800" },
  addAnotherButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  addAnotherText: { fontSize: 12, fontWeight: "800" },
  emptyList: { minHeight: 220 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 30 },
  emptyIcon: { width: 62, height: 62, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "800", marginBottom: 5 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 16 },
  emptyButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  emptyButtonText: { fontSize: 13, fontWeight: "800" },
  taskCard: { minHeight: 76, borderRadius: 18, borderWidth: 1, marginBottom: 10, padding: 13, flexDirection: "row", alignItems: "center" },
  checkButton: { paddingRight: 12, paddingVertical: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  taskMain: { flex: 1 },
  taskTime: { fontSize: 11, fontWeight: "800", marginBottom: 3 },
  taskTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  doneText: { textDecorationLine: "line-through", opacity: 0.5 },
  reminderLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  reminderText: { fontSize: 11 },
  deleteButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  tipCard: { marginTop: 19, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center" },
  tipIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 11 },
  tipCopy: { flex: 1 },
  tipTitle: { fontSize: 13, fontWeight: "800", marginBottom: 3 },
  tipText: { fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(25, 25, 25, 0.42)" },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 21, paddingTop: 10, paddingBottom: 24, maxHeight: "82%" },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 3, backgroundColor: "#D4D6D6", marginBottom: 18 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  sheetEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 4 },
  sheetTitle: { fontSize: 24, lineHeight: 30, fontWeight: "800" },
  closeButton: { width: 36, height: 36, borderRadius: 13, backgroundColor: "#F1F2F2", alignItems: "center", justifyContent: "center" },
  inputLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8 },
  textInput: { height: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 15, marginBottom: 18 },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  timeField: { flex: 1 },
  dateField: { flex: 1 },
  timeInputWrap: { height: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center" },
  timeInput: { flex: 1, fontSize: 15, fontWeight: "700", marginLeft: 8 },
  timeSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 21, paddingTop: 10, paddingBottom: 24 },
  hourGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  hourCell: { width: "22.5%", height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hourText: { fontSize: 15, lineHeight: 20, fontWeight: "900", textAlign: "center" },
  minuteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  minuteCopy: { flexDirection: "row", alignItems: "center", gap: 9 },
  minuteInput: { width: 64, height: 48, borderWidth: 1, borderRadius: 14, textAlign: "center", fontSize: 18, fontWeight: "800" },
  datePill: { height: 52, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 },
  datePillText: { fontSize: 13, fontWeight: "800" },
  reminderToggle: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 19 },
  reminderCopy: { flexDirection: "row", alignItems: "center", flex: 1 },
  reminderIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 10 },
  reminderTitle: { fontSize: 13, fontWeight: "800", marginBottom: 3 },
  reminderSubtext: { fontSize: 11 },
  saveButton: { height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginBottom: 12 },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  webNote: { fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 14 },
  actionBackdrop: { flex: 1, backgroundColor: "rgba(25, 25, 25, 0.42)", justifyContent: "flex-end" },
  actionMenu: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 21, paddingTop: 18, paddingBottom: 25 },
  actionMenuTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 17 },
  actionMenuEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginBottom: 4 },
  actionMenuTitle: { fontSize: 19, fontWeight: "800" },
  actionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 12 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 3 },
  actionSubtitle: { fontSize: 11 },
});
