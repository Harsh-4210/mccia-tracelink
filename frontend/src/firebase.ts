import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBuCyMKb5YV4hSJemQK51KXqV6sqfW4Mno",
  authDomain: "tracelink-793ba.firebaseapp.com",
  projectId: "tracelink-793ba",
  storageBucket: "tracelink-793ba.firebasestorage.app",
  messagingSenderId: "221096703792",
  appId: "1:221096703792:web:51cff77ca62f51a8aebaf5",
  measurementId: "G-ED6D05CQK3",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
