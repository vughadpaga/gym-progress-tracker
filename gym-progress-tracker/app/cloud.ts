import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const listCloudDocuments = async <T>(_user: User, segments: string[]): Promise<T[]> => {
  const snapshot = await getDocs(collection(db, ...segments));
  return snapshot.docs.map((item) => item.data() as T);
};

export const saveCloudDocument = async (
  _user: User,
  segments: string[],
  data: Record<string, unknown>,
) => setDoc(doc(db, ...segments), data);

export const deleteCloudDocument = async (_user: User, segments: string[]) => deleteDoc(
  doc(db, ...segments),
);
