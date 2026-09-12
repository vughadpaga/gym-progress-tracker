"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { deleteCloudDocument, listCloudDocuments, saveCloudDocument } from "./cloud";
import { auth, googleProvider } from "./firebase";

type Entry = {
  id: string;
  date: string;
  week?: string;
  workoutDate?: string;
  exercise: string;
  weight: string;
  reps: string;
  notes: string;
  setNumber?: number;
  locationId?: string;
};

type GymLocation = {
  id: string;
  name: string;
  order?: number;
};

type ExerciseItem = {
  name: string;
  order?: number;
  locationId?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  title: string;
};

type AppSettings = {
  initialized?: boolean;
  locationsInitialized?: boolean;
  activeLocationId?: string;
};

type ProgressView = "all" | "set1" | "set2";

const starterExercises = [
  "Peck Deck", "Incline Chest Press Machine", "Wide Grip Lat Pulldown",
  "Upper Back Row", "Preacher Bicep Curl", "Reverse Curls",
  "Single Arm Tricep Pushdowns", "Dip Machine", "Lateral Raises",
  "Shoulder Press", "V Squat", "Quad Extensions", "Hamstring Curls",
  "Back Extensions", "Calf Raises", "Ab Crunches", "Adductors",
  "Wrist Curls", "Wrist Extensions", "Rear Delt Flys",
];

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const makeLocationId = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gym"}-${Date.now().toString(36)}`;
const exerciseId = (name: string) => encodeURIComponent(name.toLowerCase().replaceAll("/", "-"));
const locationExerciseId = (locationId: string, name: string) => `${locationId}--${exerciseId(name)}`;
const dateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const entryDate = (entry: Entry) => entry.workoutDate || dateKey(new Date(entry.date));
const prettyDate = (value: string, long = false) => new Intl.DateTimeFormat("en-CA", long
  ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  : { weekday: "short", month: "short", day: "numeric" }
).format(new Date(`${value}T12:00:00`));
const compactDate = (value: string) => new Intl.DateTimeFormat("en-CA", {
  month: "numeric",
  day: "numeric",
}).format(new Date(`${value}T12:00:00`));

const normalizeSetNumbers = (items: Entry[]) => {
  const groups = new Map<string, Entry[]>();
  items.forEach((entry) => {
    const key = `${entry.locationId ?? "default"}\u0000${entry.exercise}\u0000${entryDate(entry)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  const numberById = new Map<string, number>();
  groups.forEach((group) => {
    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set(ordered
      .map((entry) => entry.setNumber)
      .filter((value): value is number => Number.isInteger(value) && Number(value) > 0));

    ordered.forEach((entry, index) => {
      if (entry.setNumber && entry.setNumber > 0) {
        numberById.set(entry.id, entry.setNumber);
        return;
      }
      let candidate = index + 1;
      while (used.has(candidate)) candidate += 1;
      used.add(candidate);
      numberById.set(entry.id, candidate);
    });
  });

  return items.map((entry) => ({ ...entry, setNumber: numberById.get(entry.id) ?? entry.setNumber ?? 1 }));
};

const nextSetNumberFor = (items: Entry[], name: string, workoutDate: string, locationId: string) => {
  const setNumbers = items
    .filter((entry) => entry.exercise === name && entryDate(entry) === workoutDate && entry.locationId === locationId)
    .map((entry) => entry.setNumber ?? 1);
  return setNumbers.length ? Math.max(...setNumbers) + 1 : 1;
};

const previousWorkoutForSet = (items: Entry[], name: string, workoutDate: string, setNumber: number, locationId: string) => {
  const earlierDates = [...new Set(items
    .filter((entry) => entry.exercise === name && entryDate(entry) < workoutDate && entry.locationId === locationId)
    .map(entryDate))]
    .sort((a, b) => b.localeCompare(a));
  const date = earlierDates[0];
  if (!date) return undefined;
  return {
    date,
    entry: items.find((entry) => entry.exercise === name
      && entryDate(entry) === date
      && (entry.setNumber ?? 1) === setNumber
      && entry.locationId === locationId),
  };
};

const seriesColor = (setNumber: number) => setNumber === 1
  ? "#bff4d0"
  : setNumber === 2 ? "#ffb36b" : "#94a8bd";

function ProgressLineChart({ entries }: { entries: Entry[] }) {
  const validEntries = entries.filter((entry) => Number.isFinite(Number(entry.weight)));
  const dates = [...new Set(validEntries.map(entryDate))].sort().slice(-8);
  const chartEntries = validEntries.filter((entry) => dates.includes(entryDate(entry)));

  if (!chartEntries.length) {
    return <div className="chart-empty">Log sets for this exercise to see a trend.</div>;
  }

  const width = 360;
  const height = 220;
  const left = 36;
  const right = 10;
  const top = 18;
  const bottom = 43;
  const weights = chartEntries.map((entry) => Number(entry.weight));
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const rangePadding = rawMax === rawMin ? Math.max(2.5, rawMax * .08) : (rawMax - rawMin) * .15;
  const minWeight = Math.max(0, rawMin - rangePadding);
  const maxWeight = rawMax + rangePadding;
  const xFor = (date: string) => {
    const index = dates.indexOf(date);
    return dates.length === 1
      ? left + (width - left - right) / 2
      : left + (index / (dates.length - 1)) * (width - left - right);
  };
  const yFor = (weight: number) => top + ((maxWeight - weight) / Math.max(1, maxWeight - minWeight)) * (height - top - bottom);
  const setNumbers = [...new Set(chartEntries.map((entry) => entry.setNumber ?? 1))].sort((a, b) => a - b);
  const gridValues = [maxWeight, (maxWeight + minWeight) / 2, minWeight];

  return <>
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weight by workout date and set number">
      {gridValues.map((value) => {
        const y = yFor(value);
        return <g key={value}>
          <line x1={left} x2={width - right} y1={y} y2={y} className="chart-grid-line" />
          <text x={left - 6} y={y + 3} className="chart-axis-label" textAnchor="end">{Math.round(value)}</text>
        </g>;
      })}
      {setNumbers.map((setNumber) => {
        const points = chartEntries
          .filter((entry) => (entry.setNumber ?? 1) === setNumber)
          .sort((a, b) => entryDate(a).localeCompare(entryDate(b)));
        const coordinates = points.map((entry) => `${xFor(entryDate(entry))},${yFor(Number(entry.weight))}`).join(" ");
        return <g key={setNumber}>
          {points.length > 1 && <polyline points={coordinates} fill="none" stroke={seriesColor(setNumber)} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {points.map((entry) => <circle key={entry.id} cx={xFor(entryDate(entry))} cy={yFor(Number(entry.weight))} r="4.5" fill={seriesColor(setNumber)} stroke="#15221c" strokeWidth="2">
            <title>{`Set ${setNumber}: ${entry.weight} lb on ${prettyDate(entryDate(entry))}`}</title>
          </circle>)}
        </g>;
      })}
      {dates.map((date) => <text key={date} x={xFor(date)} y={height - 13} className="chart-date-label" textAnchor="middle">{compactDate(date)}</text>)}
      <text x="4" y="12" className="chart-unit-label">lb</text>
    </svg>
    <div className="chart-legend">
      {setNumbers.filter((value, index) => value < 3 || index === setNumbers.findIndex((number) => number >= 3)).map((setNumber) => <span key={setNumber}><i style={{ background: seriesColor(setNumber) }} />{setNumber >= 3 ? "Set 3+" : `Set ${setNumber}`}</span>)}
    </div>
  </>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"log" | "calendar" | "exercises" | "progress">("log");
  const [locations, setLocations] = useState<GymLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [exerciseItems, setExerciseItems] = useState<ExerciseItem[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [exercise, setExercise] = useState(starterExercises[0]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [workoutDate, setWorkoutDate] = useState(() => dateKey(new Date()));
  const [notes, setNotes] = useState("");
  const [newExercise, setNewExercise] = useState("");
  const [exerciseFeedback, setExerciseFeedback] = useState("");
  const [addingExercise, setAddingExercise] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const [locationFeedback, setLocationFeedback] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [savingLocationName, setSavingLocationName] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState(false);
  const [deleteLocationArmed, setDeleteLocationArmed] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [transferHistory, setTransferHistory] = useState(true);
  const [transferringExercises, setTransferringExercises] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState("");
  const [progressExercise, setProgressExercise] = useState(starterExercises[0]);
  const [saved, setSaved] = useState(false);
  const [savingSet, setSavingSet] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey(new Date()));
  const [scheduleDate, setScheduleDate] = useState(() => dateKey(new Date()));
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [progressView, setProgressView] = useState<ProgressView>("all");
  const exercises = useMemo(() => exerciseItems
    .filter((item) => item.locationId === activeLocationId)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((item) => item.name), [exerciseItems, activeLocationId]);
  const progressExercises = useMemo(() => [...new Set([
    ...exercises,
    ...entries.filter((entry) => entry.locationId === activeLocationId).map((entry) => entry.exercise),
  ])], [exercises, entries, activeLocationId]);
  const activeLocation = locations.find((location) => location.id === activeLocationId);
  const transferDestinations = locations.filter((location) => location.id !== activeLocationId);

  useEffect(() => {
    const stopAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setError("");

      if (!currentUser) {
        setEntries([]);
        setLocations([]);
        setActiveLocationId("");
        setExerciseItems([]);
        setSchedule([]);
        setSelectedExercises([]);
        setTransferDestinationId("");
        setLocationName("");
        setAuthLoading(false);
        return;
      }

      setCloudLoading(true);
      try {
        const [loadedLocations, loadedExercises, loadedEntries, loadedSchedule, cloudSettings] = await Promise.all([
          listCloudDocuments<GymLocation>(currentUser, ["users", currentUser.uid, "locations"]),
          listCloudDocuments<ExerciseItem>(currentUser, ["users", currentUser.uid, "exercises"]),
          listCloudDocuments<Entry>(currentUser, ["users", currentUser.uid, "entries"]),
          listCloudDocuments<ScheduleItem>(currentUser, ["users", currentUser.uid, "schedule"]),
          listCloudDocuments<AppSettings>(currentUser, ["users", currentUser.uid, "settings"]),
        ]);
        let cloudLocations = loadedLocations;
        let cloudExercises = loadedExercises;
        let cloudEntries = loadedEntries;
        let cloudSchedule = loadedSchedule;

        const storedExercises = localStorage.getItem("gym-progress-exercises");
        const storedEntries = localStorage.getItem("gym-progress-entries");
        const alreadyMigratedTo = localStorage.getItem("gym-progress-migrated");
        const mayMigrateThisBrowser = !alreadyMigratedTo;
        const cloudInitialized = cloudSettings.some((item) => item.initialized);
        const appSettings = cloudSettings.find((item) => item.initialized) ?? {};
        const localExercises: string[] = storedExercises ? JSON.parse(storedExercises) : [];
        const localEntries: Entry[] = storedEntries ? JSON.parse(storedEntries) : [];

        if (!cloudLocations.length) {
          const defaultLocation: GymLocation = { id: "ymca", name: "YMCA", order: 0 };
          cloudLocations = [defaultLocation];
          await saveCloudDocument(currentUser, ["users", currentUser.uid, "locations", defaultLocation.id], {
            ...defaultLocation,
            createdAt: new Date().toISOString(),
          });
        }
        cloudLocations = cloudLocations.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        const defaultLocationId = cloudLocations[0].id;
        const chosenLocationId = appSettings.activeLocationId
          && cloudLocations.some((location) => location.id === appSettings.activeLocationId)
          ? appSettings.activeLocationId
          : defaultLocationId;

        if (!cloudExercises.length && !cloudInitialized) {
          const initialExercises = mayMigrateThisBrowser && localExercises.length ? localExercises : starterExercises;
          cloudExercises = initialExercises.map((name, order) => ({ name, order, locationId: defaultLocationId }));
          await Promise.all(cloudExercises.map(({ name, order, locationId }) => saveCloudDocument(
            currentUser,
            ["users", currentUser.uid, "exercises", locationExerciseId(locationId!, name)],
            { name, order, locationId, createdAt: new Date().toISOString() },
          )));
        }

        const legacyExercises = cloudExercises.filter((item) => !item.locationId);
        if (legacyExercises.length) {
          await Promise.all(legacyExercises.map((item) => saveCloudDocument(
              currentUser,
              ["users", currentUser.uid, "exercises", locationExerciseId(defaultLocationId, item.name)],
              { ...item, locationId: defaultLocationId, migratedAt: new Date().toISOString() },
            )));
          await Promise.all(legacyExercises.map((item) => deleteCloudDocument(
            currentUser,
            ["users", currentUser.uid, "exercises", exerciseId(item.name)],
          )));
          cloudExercises = cloudExercises.map((item) => ({ ...item, locationId: item.locationId ?? defaultLocationId }));
        }

        if (!cloudInitialized || !appSettings.locationsInitialized || appSettings.activeLocationId !== chosenLocationId) {
          await saveCloudDocument(currentUser, ["users", currentUser.uid, "settings", "app"], {
            initialized: true,
            locationsInitialized: true,
            activeLocationId: chosenLocationId,
            updatedAt: new Date().toISOString(),
          });
        }

        if (!cloudEntries.length && localEntries.length && mayMigrateThisBrowser) {
          cloudEntries = localEntries.slice(0, 450);
          await Promise.all(cloudEntries.map((entry) => saveCloudDocument(
            currentUser,
            ["users", currentUser.uid, "entries", entry.id],
            entry as unknown as Record<string, unknown>,
          )));
        }

        const originalEntries = cloudEntries;
        const locatedEntries = cloudEntries.map((entry) => ({ ...entry, locationId: entry.locationId ?? defaultLocationId }));
        const numberedEntries = normalizeSetNumbers(locatedEntries);
        const entriesNeedingMigration = numberedEntries.filter((entry) => {
          const original = originalEntries.find((cloudEntry) => cloudEntry.id === entry.id);
          return !original?.setNumber || !original.locationId;
        });
        for (let index = 0; index < entriesNeedingMigration.length; index += 50) {
          await Promise.all(entriesNeedingMigration.slice(index, index + 50).map((entry) => saveCloudDocument(
            currentUser,
            ["users", currentUser.uid, "entries", entry.id],
            entry as unknown as Record<string, unknown>,
          )));
        }
        cloudEntries = numberedEntries;

        if (!alreadyMigratedTo) localStorage.setItem("gym-progress-migrated", currentUser.uid);

        const nextExerciseItems = cloudExercises.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        const activeExerciseNames = nextExerciseItems
          .filter((item) => item.locationId === chosenLocationId)
          .map((item) => item.name);
        const nextEntries = cloudEntries.sort((a, b) => b.date.localeCompare(a.date));
        cloudSchedule = cloudSchedule.sort((a, b) => a.date.localeCompare(b.date));
        setLocations(cloudLocations);
        setActiveLocationId(chosenLocationId);
        setLocationName(cloudLocations.find((location) => location.id === chosenLocationId)?.name ?? "");
        setTransferDestinationId(cloudLocations.find((location) => location.id !== chosenLocationId)?.id ?? "");
        setExerciseItems(nextExerciseItems);
        setEntries(nextEntries);
        setSchedule(cloudSchedule);
        if (activeExerciseNames.length) {
          setExercise((current) => activeExerciseNames.includes(current) ? current : activeExerciseNames[0]);
          setProgressExercise((current) => activeExerciseNames.includes(current) ? current : activeExerciseNames[0]);
        } else {
          setExercise("");
          setProgressExercise("");
        }
        localStorage.setItem("gym-progress-exercises", JSON.stringify(activeExerciseNames));
        localStorage.setItem("gym-progress-entries", JSON.stringify(nextEntries));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not connect to cloud storage.");
      } finally {
        setCloudLoading(false);
        setAuthLoading(false);
      }
    });

    return () => {
      stopAuth();
    };
  }, []);

  const signIn = async () => {
    setError("");
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google sign-in did not finish.");
      setAuthLoading(false);
    }
  };

  const changeLocation = async (locationId: string) => {
    const nextExercises = exerciseItems
      .filter((item) => item.locationId === locationId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((item) => item.name);
    const nextProgressExercises = [...new Set([
      ...nextExercises,
      ...entries.filter((entry) => entry.locationId === locationId).map((entry) => entry.exercise),
    ])];
    const nextExercise = nextExercises[0] ?? "";
    setActiveLocationId(locationId);
    setExercise(nextExercise);
    setProgressExercise((current) => nextProgressExercises.includes(current) ? current : nextProgressExercises[0] ?? "");
    setLocationName(locations.find((location) => location.id === locationId)?.name ?? "");
    setTransferDestinationId(locations.find((location) => location.id !== locationId)?.id ?? "");
    setSelectedExercises([]);
    setTransferFeedback("");
    setDeleteLocationArmed(false);
    setExerciseFeedback("");
    setSetFeedback("");
    localStorage.setItem("gym-progress-exercises", JSON.stringify(nextExercises));

    if (nextExercise) {
      const setNumber = nextSetNumberFor(entries, nextExercise, workoutDate, locationId);
      const comparison = previousWorkoutForSet(entries, nextExercise, workoutDate, setNumber, locationId)?.entry;
      setWeight(comparison?.weight ?? "");
      setReps(comparison?.reps ?? "");
    } else {
      setWeight("");
      setReps("");
    }

    if (user) {
      try {
        await saveCloudDocument(user, ["users", user.uid, "settings", "app"], {
          initialized: true,
          locationsInitialized: true,
          activeLocationId: locationId,
          updatedAt: new Date().toISOString(),
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The selected gym could not be saved.");
      }
    }
  };

  const addLocation = async () => {
    if (!user || addingLocation) return;
    const clean = newLocation.trim();
    if (!clean) {
      setLocationFeedback("Type a gym name first.");
      return;
    }
    if (locations.some((location) => location.name.toLowerCase() === clean.toLowerCase())) {
      setLocationFeedback("That gym location already exists.");
      return;
    }

    const location: GymLocation = { id: makeLocationId(clean), name: clean, order: locations.length };
    setAddingLocation(true);
    setLocationFeedback("");
    try {
      await saveCloudDocument(user, ["users", user.uid, "locations", location.id], {
        ...location,
        createdAt: new Date().toISOString(),
      });
      setLocations((current) => [...current, location]);
      setNewLocation("");
      setLocationFeedback(`${clean} created. Add its exercises below.`);
      await changeLocation(location.id);
      setLocationName(clean);
    } catch (caught) {
      setLocationFeedback(caught instanceof Error ? `Could not create it: ${caught.message}` : "The gym location could not be created.");
    } finally {
      setAddingLocation(false);
    }
  };

  const renameActiveLocation = async () => {
    if (!user || !activeLocation || savingLocationName) return;
    const clean = locationName.trim();
    if (!clean) {
      setLocationFeedback("A gym location needs a name.");
      return;
    }
    if (locations.some((location) => location.id !== activeLocation.id && location.name.toLowerCase() === clean.toLowerCase())) {
      setLocationFeedback("Another gym location already uses that name.");
      return;
    }
    if (clean === activeLocation.name) {
      setLocationFeedback("The location name is already up to date.");
      return;
    }

    setSavingLocationName(true);
    setLocationFeedback("");
    try {
      await saveCloudDocument(user, ["users", user.uid, "locations", activeLocation.id], {
        ...activeLocation,
        name: clean,
        updatedAt: new Date().toISOString(),
      });
      setLocations((current) => current.map((location) => location.id === activeLocation.id ? { ...location, name: clean } : location));
      setLocationFeedback(`${activeLocation.name} renamed to ${clean}.`);
    } catch (caught) {
      setLocationFeedback(caught instanceof Error ? `Could not rename it: ${caught.message}` : "The gym location could not be renamed.");
    } finally {
      setSavingLocationName(false);
    }
  };

  const deleteActiveLocation = async () => {
    if (!user || !activeLocation || deletingLocation) return;
    if (locations.length === 1) {
      setLocationFeedback("Keep at least one gym location in your account.");
      setDeleteLocationArmed(false);
      return;
    }
    const exerciseCount = exerciseItems.filter((item) => item.locationId === activeLocation.id).length;
    const historyCount = entries.filter((entry) => entry.locationId === activeLocation.id).length;
    if (exerciseCount || historyCount) {
      setLocationFeedback(`Move or remove this gym's ${exerciseCount ? `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}` : "exercise library"}${historyCount ? ` and ${historyCount} saved set${historyCount === 1 ? "" : "s"}` : ""} before deleting it.`);
      setDeleteLocationArmed(false);
      return;
    }
    if (!deleteLocationArmed) {
      setDeleteLocationArmed(true);
      setLocationFeedback(`Tap delete again to permanently remove ${activeLocation.name}.`);
      return;
    }

    const remainingLocations = locations.filter((location) => location.id !== activeLocation.id);
    const nextLocation = remainingLocations[0];
    setDeletingLocation(true);
    try {
      await deleteCloudDocument(user, ["users", user.uid, "locations", activeLocation.id]);
      setLocations((current) => current.filter((location) => location.id !== activeLocation.id));
      await changeLocation(nextLocation.id);
      setLocationName(nextLocation.name);
      setTransferDestinationId(remainingLocations.find((location) => location.id !== nextLocation.id)?.id ?? "");
      setLocationFeedback(`${activeLocation.name} deleted.`);
    } catch (caught) {
      setLocationFeedback(caught instanceof Error ? `Could not delete it: ${caught.message}` : "The gym location could not be deleted.");
    } finally {
      setDeletingLocation(false);
      setDeleteLocationArmed(false);
    }
  };

  const toggleExerciseSelection = (name: string) => {
    setSelectedExercises((current) => current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name]);
    setTransferFeedback("");
  };

  const transferSelectedExercises = async () => {
    if (!user || transferringExercises) return;
    const names = selectedExercises.filter((name) => exercises.includes(name));
    const destination = locations.find((location) => location.id === transferDestinationId);
    if (!names.length) {
      setTransferFeedback("Select at least one exercise to move.");
      return;
    }
    if (!destination || destination.id === activeLocationId) {
      setTransferFeedback("Choose a different destination gym.");
      return;
    }

    const destinationItems = exerciseItems.filter((item) => item.locationId === destination.id);
    const destinationNameBySource = new Map<string, string>();
    const newDestinationItems: ExerciseItem[] = [];
    names.forEach((name, index) => {
      const existing = destinationItems.find((item) => item.name.toLowerCase() === name.toLowerCase());
      destinationNameBySource.set(name, existing?.name ?? name);
      if (!existing) newDestinationItems.push({
        name,
        locationId: destination.id,
        order: destinationItems.length + index,
      });
    });

    setTransferringExercises(true);
    setTransferFeedback("");
    try {
      await Promise.all(newDestinationItems.map((item) => saveCloudDocument(
        user,
        ["users", user.uid, "exercises", locationExerciseId(destination.id, item.name)],
        { ...item, transferredAt: new Date().toISOString() },
      )));

      let nextEntries = entries;
      if (transferHistory) {
        const selectedSet = new Set(names);
        const movingEntries = entries
          .filter((entry) => entry.locationId === activeLocationId && selectedSet.has(entry.exercise))
          .sort((a, b) => entryDate(a).localeCompare(entryDate(b)) || a.date.localeCompare(b.date));
        const maxSetByWorkout = new Map<string, number>();
        entries.filter((entry) => entry.locationId === destination.id).forEach((entry) => {
          const key = `${entry.exercise.toLowerCase()}\u0000${entryDate(entry)}`;
          maxSetByWorkout.set(key, Math.max(maxSetByWorkout.get(key) ?? 0, entry.setNumber ?? 1));
        });
        const movedEntries = movingEntries.map((entry) => {
          const destinationName = destinationNameBySource.get(entry.exercise) ?? entry.exercise;
          const key = `${destinationName.toLowerCase()}\u0000${entryDate(entry)}`;
          const currentMax = maxSetByWorkout.get(key);
          const setNumber = currentMax ? currentMax + 1 : entry.setNumber ?? 1;
          maxSetByWorkout.set(key, Math.max(currentMax ?? 0, setNumber));
          return { ...entry, exercise: destinationName, locationId: destination.id, setNumber };
        });
        for (let index = 0; index < movedEntries.length; index += 50) {
          await Promise.all(movedEntries.slice(index, index + 50).map((entry) => saveCloudDocument(
            user,
            ["users", user.uid, "entries", entry.id],
            entry as unknown as Record<string, unknown>,
          )));
        }
        const movedById = new Map(movedEntries.map((entry) => [entry.id, entry]));
        nextEntries = entries.map((entry) => movedById.get(entry.id) ?? entry);
      }

      await Promise.all(names.map((name) => deleteCloudDocument(
        user,
        ["users", user.uid, "exercises", locationExerciseId(activeLocationId, name)],
      )));

      const selectedSet = new Set(names);
      const remainingExercises = exercises.filter((name) => !selectedSet.has(name));
      setExerciseItems((current) => [
        ...current.filter((item) => !(item.locationId === activeLocationId && selectedSet.has(item.name))),
        ...newDestinationItems,
      ]);
      setEntries(nextEntries);
      localStorage.setItem("gym-progress-exercises", JSON.stringify(remainingExercises));
      localStorage.setItem("gym-progress-entries", JSON.stringify(nextEntries));
      if (selectedSet.has(exercise)) {
        setExercise(remainingExercises[0] ?? "");
        setWeight("");
        setReps("");
      }
      const remainingProgressExercises = [...new Set([
        ...remainingExercises,
        ...nextEntries.filter((entry) => entry.locationId === activeLocationId).map((entry) => entry.exercise),
      ])];
      if (!remainingProgressExercises.includes(progressExercise)) setProgressExercise(remainingProgressExercises[0] ?? "");
      setSelectedExercises([]);
      setTransferFeedback(`Moved ${names.length} exercise${names.length === 1 ? "" : "s"} to ${destination.name}${transferHistory ? " with workout history" : "; workout history stayed here"}.`);
    } catch (caught) {
      setTransferFeedback(caught instanceof Error ? `Could not finish the move: ${caught.message}` : "The selected exercises could not be moved.");
    } finally {
      setTransferringExercises(false);
    }
  };

  const latestFor = (name: string) => {
    const found = entries.find((entry) => entry.exercise === name && entry.locationId === activeLocationId);
    return found ? { weight: found.weight, reps: found.reps } : undefined;
  };

  const selectExercise = (name: string) => {
    setExercise(name);
    const setNumber = nextSetNumberFor(entries, name, workoutDate, activeLocationId);
    const comparison = previousWorkoutForSet(entries, name, workoutDate, setNumber, activeLocationId)?.entry;
    setWeight(comparison?.weight ?? "");
    setReps(comparison?.reps ?? "");
  };

  const changeWorkoutDate = (date: string) => {
    setWorkoutDate(date);
    const setNumber = nextSetNumberFor(entries, exercise, date, activeLocationId);
    const comparison = previousWorkoutForSet(entries, exercise, date, setNumber, activeLocationId)?.entry;
    setWeight(comparison?.weight ?? "");
    setReps(comparison?.reps ?? "");
  };

  const saveSet = async () => {
    if (!user || savingSet) return;
    if (!exercise) {
      setSetFeedback("Choose an exercise first.");
      return;
    }
    if (!weight || !reps) {
      setSetFeedback("Enter both the weight and number of reps.");
      return;
    }
    const setNumber = nextSetNumberFor(entries, exercise, workoutDate, activeLocationId);
    const entry: Entry = { id: makeId(), date: new Date().toISOString(), workoutDate, exercise, weight, reps, notes, setNumber, locationId: activeLocationId };
    setError("");
    setSetFeedback("");
    setSavingSet(true);
    try {
      await saveCloudDocument(user, ["users", user.uid, "entries", entry.id], entry as unknown as Record<string, unknown>);
      setEntries((current) => [entry, ...current]);
      localStorage.setItem("gym-progress-entries", JSON.stringify([entry, ...entries]));
      setNotes("");
      setSaved(true);
      setSetFeedback(`Set ${setNumber} saved to your account.`);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (caught) {
      setSetFeedback(caught instanceof Error ? `Could not save: ${caught.message}` : "The set could not be saved.");
    } finally {
      setSavingSet(false);
    }
  };

  const removeSet = async (entryId: string) => {
    if (!user) return;
    await deleteCloudDocument(user, ["users", user.uid, "entries", entryId]);
    const nextEntries = entries.filter((entry) => entry.id !== entryId);
    setEntries(nextEntries);
    localStorage.setItem("gym-progress-entries", JSON.stringify(nextEntries));
  };

  const addExercise = async () => {
    if (!user || addingExercise) return;
    const clean = newExercise.trim();
    if (!clean) {
      setExerciseFeedback("Type an exercise name first.");
      return;
    }
    if (exercises.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      setExerciseFeedback("That exercise is already in your list.");
      return;
    }
    setError("");
    setExerciseFeedback("");
    setAddingExercise(true);
    const previousExerciseItems = exerciseItems;
    const item: ExerciseItem = { name: clean, order: exercises.length, locationId: activeLocationId };
    setExerciseItems([...exerciseItems, item]);
    try {
      await saveCloudDocument(user, ["users", user.uid, "exercises", locationExerciseId(activeLocationId, clean)], {
        ...item, createdAt: new Date().toISOString(),
      });
      localStorage.setItem("gym-progress-exercises", JSON.stringify([...exercises, clean]));
      setNewExercise("");
      setExerciseFeedback(`${clean} added.`);
      setExercise(clean);
      setProgressExercise(clean);
      setWeight("");
      setReps("");
    } catch (caught) {
      setExerciseItems(previousExerciseItems);
      setExerciseFeedback(caught instanceof Error ? `Could not add it: ${caught.message}` : "The exercise could not be added.");
    } finally {
      setAddingExercise(false);
    }
  };

  const deleteExercise = async (name: string) => {
    if (!user) return;
    setExerciseFeedback("");
    try {
      await deleteCloudDocument(user, ["users", user.uid, "exercises", locationExerciseId(activeLocationId, name)]);
      const nextExercises = exercises.filter((item) => item !== name);
      setExerciseItems((current) => current.filter((item) => !(item.name === name && item.locationId === activeLocationId)));
      setSelectedExercises((current) => current.filter((item) => item !== name));
      localStorage.setItem("gym-progress-exercises", JSON.stringify(nextExercises));
      if (exercise === name) setExercise(nextExercises[0] ?? "");
      if (progressExercise === name && !entries.some((entry) => entry.locationId === activeLocationId && entry.exercise === name)) setProgressExercise(nextExercises[0] ?? "");
      setExerciseFeedback(`${name} removed.`);
    } catch (caught) {
      setExerciseFeedback(caught instanceof Error ? `Could not remove it: ${caught.message}` : "The exercise could not be removed.");
    }
  };

  const addScheduleItem = async () => {
    if (!user || !scheduleTitle.trim() || !scheduleDate) return;
    const item: ScheduleItem = { id: makeId(), date: scheduleDate, title: scheduleTitle.trim() };
    try {
      await saveCloudDocument(user, ["users", user.uid, "schedule", item.id], item as unknown as Record<string, unknown>);
      setSchedule((current) => [...current, item].sort((a, b) => a.date.localeCompare(b.date)));
      setScheduleTitle("");
      setSelectedCalendarDate(scheduleDate);
      setCalendarCursor(new Date(`${scheduleDate.slice(0, 7)}-01T12:00:00`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The scheduled workout could not be saved.");
    }
  };

  const removeScheduleItem = async (itemId: string) => {
    if (!user) return;
    await deleteCloudDocument(user, ["users", user.uid, "schedule", itemId]);
    setSchedule((current) => current.filter((item) => item.id !== itemId));
  };

  const todayKey = dateKey(new Date());
  const todayEntries = useMemo(() => entries.filter((entry) => entryDate(entry) === todayKey), [entries, todayKey]);

  const selectedDateEntries = entries.filter((entry) => entryDate(entry) === workoutDate && entry.locationId === activeLocationId);
  const currentExerciseSets = selectedDateEntries
    .filter((entry) => entry.exercise === exercise)
    .sort((a, b) => (a.setNumber ?? 1) - (b.setNumber ?? 1));
  const currentSetNumber = nextSetNumberFor(entries, exercise, workoutDate, activeLocationId);
  const previousWorkoutComparison = previousWorkoutForSet(entries, exercise, workoutDate, currentSetNumber, activeLocationId);
  const progressEntries = entries
    .filter((entry) => entry.exercise === progressExercise && entry.locationId === activeLocationId)
    .sort((a, b) => entryDate(a).localeCompare(entryDate(b))
      || (a.setNumber ?? 1) - (b.setNumber ?? 1)
      || a.date.localeCompare(b.date));
  const visibleProgressEntries = progressEntries.filter((entry) => progressView === "all"
    || (progressView === "set1" && (entry.setNumber ?? 1) === 1)
    || (progressView === "set2" && entry.setNumber === 2));
  const maxWeight = visibleProgressEntries.length ? Math.max(...visibleProgressEntries.map((entry) => Number(entry.weight))) : 0;
  const maxVolume = visibleProgressEntries.length ? Math.max(...visibleProgressEntries.map((entry) => Number(entry.weight) * Number(entry.reps))) : 0;
  const initials = user?.displayName?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GP";
  const completedByDate = entries.reduce<Record<string, number>>((result, entry) => {
    const key = entryDate(entry);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  const scheduleByDate = schedule.reduce<Record<string, ScheduleItem[]>>((result, item) => {
    (result[item.date] ??= []).push(item);
    return result;
  }, {});
  const monthYear = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(calendarCursor);
  const firstWeekday = calendarCursor.getDay();
  const daysInMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const selectedDaySchedule = scheduleByDate[selectedCalendarDate] ?? [];
  const selectedDaySets = completedByDate[selectedCalendarDate] ?? 0;

  if (authLoading && !user) {
    return <main className="app-shell auth-shell"><div className="auth-card"><div className="loader" /><h1>Opening your tracker…</h1><p>Checking for a saved Google account.</p></div></main>;
  }

  if (!user) {
    return <main className="app-shell auth-shell">
      <div className="auth-brand"><div className="avatar">GP</div><p className="eyebrow">GYM PROGRESS</p></div>
      <section className="auth-card">
        <span className="auth-icon">↗</span>
        <h1>Your workouts, everywhere.</h1>
        <p>Sign in to keep your exercises, sets, and progress private and synced across your phone and browser.</p>
        <button className="google-button" onClick={signIn}><span>G</span>Continue with Google</button>
        {error && <p className="error-message">{error}</p>}
        <small>Each Google account gets its own private workout history.</small>
      </section>
    </main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">GYM PROGRESS</p><h1>Build your numbers.</h1></div>
        <div className="avatar" title={user.email ?? "Signed in"}>{initials}</div>
      </header>

      <section className="account-row"><div><strong>{user.displayName || "Google account"}</strong><span>{cloudLoading ? "Syncing…" : "Cloud synced"}</span></div><button onClick={() => signOut(auth)}>Sign out</button></section>
      {error && <p className="error-banner">{error}</p>}

      <section className="summary-card">
        <div><span>Gym</span><strong title={activeLocation?.name}>{activeLocation?.name ?? "—"}</strong></div><div className="divider" />
        <div><span>Today</span><strong>{todayEntries.length} sets</strong></div><div className="divider" />
        <div><span>Next plan</span><strong>{schedule.find((item) => item.date >= todayKey)?.date ? prettyDate(schedule.find((item) => item.date >= todayKey)!.date) : "None"}</strong></div>
      </section>

      <nav className="tabs" aria-label="Tracker views">
        <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>Log</button>
        <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>Calendar</button>
        <button className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}>Exercises</button>
        <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>Progress</button>
      </nav>

      {tab === "log" && <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">{prettyDate(workoutDate).toUpperCase()}</p><h2>Log a set</h2></div><span>Set {currentSetNumber}</span></div>
        <label>Gym location<select value={activeLocationId} onChange={(event) => { void changeLocation(event.target.value); }}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
        <label>Workout date<input className="date-input" type="date" value={workoutDate} onChange={(event) => changeWorkoutDate(event.target.value)} /></label>
        <label>Exercise<select disabled={!exercises.length} value={exercise} onChange={(event) => selectExercise(event.target.value)}>{exercises.length ? exercises.map((item) => <option key={item}>{item}</option>) : <option>No exercises at this gym</option>}</select></label>
        {!exercises.length && <button className="empty-library-link" onClick={() => setTab("exercises")}>Add exercises to {activeLocation?.name ?? "this gym"}</button>}
        {previousWorkoutComparison && <div className="last-row"><div><span>LAST WORKOUT · SET {currentSetNumber}</span>{previousWorkoutComparison.entry ? <><strong>{previousWorkoutComparison.entry.weight} lb × {previousWorkoutComparison.entry.reps}</strong><small>{prettyDate(previousWorkoutComparison.date)}</small></> : <><strong>No Set {currentSetNumber} logged</strong><small>{prettyDate(previousWorkoutComparison.date)}</small></>}</div>{previousWorkoutComparison.entry && <button onClick={() => { setWeight(previousWorkoutComparison.entry!.weight); setReps(previousWorkoutComparison.entry!.reps); }}>Use this</button>}</div>}
        <div className="number-grid"><label>Weight <small>lb</small><input aria-label="Weight in pounds" inputMode="decimal" value={weight} onChange={(event) => { setWeight(event.target.value); setSetFeedback(""); }} /></label><label>Reps<input aria-label="Repetitions" inputMode="decimal" value={reps} onChange={(event) => { setReps(event.target.value); setSetFeedback(""); }} /></label></div>
        <div className="quick-buttons"><span>Quick adjust</span><button onClick={() => setWeight(String(Math.max(0, Number(weight || 0) - 5)))}>−5</button><button onClick={() => setWeight(String(Number(weight || 0) + 2.5))}>+2.5</button><button onClick={() => setWeight(String(Number(weight || 0) + 5))}>+5</button></div>
        <label>Notes <small>optional</small><textarea placeholder="Form, seat position, how it felt…" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="save-button" disabled={savingSet || !exercise} onClick={saveSet}>{savingSet ? "Saving…" : saved ? `Set ${currentSetNumber - 1} saved ✓` : `Save Set ${currentSetNumber}`}</button>
        {setFeedback && <p className={`exercise-feedback ${setFeedback.includes("saved to") ? "success" : ""}`} role="status">{setFeedback}</p>}
        {currentExerciseSets.length > 0 && <div className="set-list"><div className="subheading"><strong>{prettyDate(workoutDate)} · {exercise}</strong><span>{currentExerciseSets.length} sets</span></div>{currentExerciseSets.map((entry) => <article key={entry.id}><span>Set {entry.setNumber ?? 1}</span><b>{entry.weight} <small>lb</small> × {entry.reps}</b><button aria-label={`Delete set ${entry.setNumber ?? 1}`} onClick={() => removeSet(entry.id)}>×</button></article>)}</div>}
      </section>}

      {tab === "calendar" && <section className="panel calendar-panel">
        <div className="section-heading"><div><p className="eyebrow">TRAINING CALENDAR</p><h2>{monthYear}</h2></div><span>{Object.keys(completedByDate).length}</span></div>
        <div className="calendar-nav"><button aria-label="Previous month" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1))}>‹</button><button onClick={() => setCalendarCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button aria-label="Next month" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1))}>›</button></div>
        <div className="calendar-grid calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <div className="calendar-grid">{calendarCells.map((day, index) => {
          if (!day) return <span className="calendar-blank" key={`blank-${index}`} />;
          const key = `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const done = completedByDate[key];
          const planned = scheduleByDate[key]?.length;
          return <button key={key} className={`calendar-day ${key === todayKey ? "today" : ""} ${key === selectedCalendarDate ? "selected" : ""}`} onClick={() => { setSelectedCalendarDate(key); setScheduleDate(key); }}><span>{day}</span><i>{done ? <b className="done-dot" /> : null}{planned ? <b className="plan-dot" /> : null}</i></button>;
        })}</div>
        <div className="calendar-legend"><span><i className="done-dot" />Worked out</span><span><i className="plan-dot" />Scheduled</span></div>

        <div className="selected-day-card"><div><p className="eyebrow">SELECTED DAY</p><strong>{prettyDate(selectedCalendarDate, true)}</strong><span>{selectedDaySets ? `${selectedDaySets} completed sets` : "No sets logged"}</span></div><button onClick={() => { setWorkoutDate(selectedCalendarDate); setTab("log"); }}>Log workout</button></div>
        {selectedDaySchedule.length > 0 && <div className="schedule-list"><div className="subheading"><strong>Plans for this day</strong><span>{selectedDaySchedule.length}</span></div>{selectedDaySchedule.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>{prettyDate(item.date)}</span></div><button aria-label={`Remove ${item.title}`} onClick={() => removeScheduleItem(item.id)}>×</button></article>)}</div>}

        <div className="schedule-form"><div className="subheading"><strong>Add to schedule</strong><span>optional</span></div><label>Date<input className="date-input" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label><label>Workout plan<input placeholder="e.g. Upper Body or Leg Day" value={scheduleTitle} onChange={(event) => setScheduleTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addScheduleItem(); }} /></label><button className="save-button" onClick={addScheduleItem}>Add to schedule</button></div>
      </section>}

      {tab === "exercises" && <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">YOUR LIBRARIES</p><h2>Gym locations</h2></div><span>{locations.length}</span></div>
        <div className="location-card">
          <label>Viewing exercises for<select value={activeLocationId} onChange={(event) => { void changeLocation(event.target.value); }}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
          <form className="add-row compact-add-row" onSubmit={(event) => { event.preventDefault(); void renameActiveLocation(); }}><label>Location name<input value={locationName} onChange={(event) => { setLocationName(event.target.value); setLocationFeedback(""); setDeleteLocationArmed(false); }} /></label><button type="submit" disabled={savingLocationName}>{savingLocationName ? "Saving…" : "Save name"}</button></form>
          <button type="button" className={`danger-button ${deleteLocationArmed ? "armed" : ""}`} disabled={deletingLocation} onClick={() => { void deleteActiveLocation(); }}>{deletingLocation ? "Deleting…" : deleteLocationArmed ? `Delete ${activeLocation?.name} now` : "Delete this location"}</button>
          <div className="location-divider"><span>Add another gym</span></div>
          <form className="add-row compact-add-row" onSubmit={(event) => { event.preventDefault(); void addLocation(); }}><label>New gym location<input placeholder="e.g. University Gym" value={newLocation} onChange={(event) => { setNewLocation(event.target.value); setLocationFeedback(""); }} /></label><button type="submit" disabled={addingLocation}>{addingLocation ? "Creating…" : "Create"}</button></form>
          {locationFeedback && <p className={`exercise-feedback ${/(created|renamed|deleted|up to date)/.test(locationFeedback) ? "success" : ""}`} role="status">{locationFeedback}</p>}
        </div>
        <div className="library-title"><div><p className="eyebrow">EXERCISE LIBRARY</p><h2>{activeLocation?.name ?? "Gym"}</h2></div><span>{exercises.length} exercises</span></div>
        <form className="add-row" onSubmit={(event) => { event.preventDefault(); void addExercise(); }}><label>New exercise<input placeholder="e.g. Hack Squat" value={newExercise} onChange={(event) => { setNewExercise(event.target.value); setExerciseFeedback(""); }} /></label><button type="submit" disabled={addingExercise}>{addingExercise ? "Adding…" : "Add"}</button></form>
        {exerciseFeedback && <p className={`exercise-feedback ${exerciseFeedback.includes("added.") ? "success" : ""}`} role="status">{exerciseFeedback}</p>}
        <p className="helper">Add machines or movements whenever your routine changes. Removing one does not erase its old history.</p>
        {exercises.length > 0 && <div className="selection-bar"><span>{selectedExercises.length ? `${selectedExercises.length} selected` : "Select exercises to move"}</span><button onClick={() => setSelectedExercises(selectedExercises.length === exercises.length ? [] : [...exercises])}>{selectedExercises.length === exercises.length ? "Clear" : "Select all"}</button></div>}
        <div className="exercise-list">{exercises.map((name) => { const recent = latestFor(name); const selected = selectedExercises.includes(name); return <article className={selected ? "selected" : ""} key={name}><label className="exercise-select"><input type="checkbox" checked={selected} onChange={() => toggleExerciseSelection(name)} /><i aria-hidden="true">✓</i><div><strong>{name}</strong><span>{recent ? `Last: ${recent.weight} lb × ${recent.reps}` : "No sets yet"}</span></div></label><button aria-label={`Remove ${name}`} onClick={() => deleteExercise(name)}>Remove</button></article>; })}</div>
        {selectedExercises.length > 0 && <div className="transfer-card">
          <div className="subheading"><strong>Move selected exercises</strong><span>{selectedExercises.length}</span></div>
          {transferDestinations.length ? <>
            <label>Destination gym<select value={transferDestinationId} onChange={(event) => setTransferDestinationId(event.target.value)}>{transferDestinations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
            <label className="history-toggle"><input type="checkbox" checked={transferHistory} onChange={(event) => setTransferHistory(event.target.checked)} /><span><strong>Move workout history too</strong><small>{transferHistory ? "Past sets and progress will move with each exercise." : `Past sets will stay under ${activeLocation?.name}.`}</small></span></label>
            <button className="save-button" disabled={transferringExercises} onClick={() => { void transferSelectedExercises(); }}>{transferringExercises ? "Moving…" : `Move ${selectedExercises.length} exercise${selectedExercises.length === 1 ? "" : "s"}`}</button>
          </> : <p className="helper">Create another gym location before moving exercises.</p>}
          {transferFeedback && <p className={`exercise-feedback ${transferFeedback.startsWith("Moved") ? "success" : ""}`} role="status">{transferFeedback}</p>}
        </div>}
        {!selectedExercises.length && transferFeedback && <p className={`exercise-feedback ${transferFeedback.startsWith("Moved") ? "success" : ""}`} role="status">{transferFeedback}</p>}
      </section>}

      {tab === "progress" && <section className="panel progress-panel">
        <div className="section-heading"><div><p className="eyebrow">OVERVIEW</p><h2>Your progress</h2></div><span>{progressEntries.length}</span></div>
        <label>Gym location<select value={activeLocationId} onChange={(event) => { void changeLocation(event.target.value); }}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
        <label>Exercise<select disabled={!progressExercises.length} value={progressExercise} onChange={(event) => setProgressExercise(event.target.value)}>{progressExercises.length ? progressExercises.map((item) => <option key={item}>{item}</option>) : <option>No exercise history at this gym</option>}</select></label>
        <div className="progress-filters" aria-label="Progress set view"><button className={progressView === "all" ? "active" : ""} onClick={() => setProgressView("all")}>All sets</button><button className={progressView === "set1" ? "active set-one" : "set-one"} onClick={() => setProgressView("set1")}>Set 1</button><button className={progressView === "set2" ? "active set-two" : "set-two"} onClick={() => setProgressView("set2")}>Set 2</button></div>
        <div className="metric-grid"><div><span>BEST WEIGHT</span><strong>{maxWeight || "—"}</strong><small>{maxWeight ? "lb" : "Log a set"}</small></div><div><span>BEST VOLUME</span><strong>{maxVolume || "—"}</strong><small>{maxVolume ? "lb × reps" : "Log a set"}</small></div><div><span>SETS SHOWN</span><strong>{visibleProgressEntries.length}</strong><small>recorded</small></div></div>
        <div className="chart-card"><div className="subheading"><strong>Weight over time</strong><span>Last 8 workout dates</span></div><ProgressLineChart entries={visibleProgressEntries} /></div>
        <div className="history-list"><div className="subheading"><strong>History</strong><span>{visibleProgressEntries.length} sets</span></div>{visibleProgressEntries.length ? [...visibleProgressEntries].reverse().map((entry) => <article key={entry.id}><div><strong>Set {entry.setNumber ?? 1} · {entry.weight} lb × {entry.reps}</strong><span>{prettyDate(entryDate(entry))}</span></div>{entry.notes && <p>{entry.notes}</p>}</article>) : <div className="chart-empty">Nothing recorded in this view yet.</div>}</div>
      </section>}

      <footer>Signed in with Google · Your data is private and cloud synced.</footer>
    </main>
  );
}
